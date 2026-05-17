"""Daily live task routes migrated from the original Tk daily-task popup."""
import base64
import io
import random
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict

import httpx
import qrcode

from ..ipc_server import IPCServer
from src.services.bilibili import bilibili_service
from src.services.game_config import PRO_ROOT


SLOT_COUNT = 4
LIVE_DANMAKU = ["打卡", "路过支持一下", "(⌒▽⌒).", "（￣▽￣）.", "(=・ω・=).", "(｀・ω・´).", "(･∀･).", "(°∀°)ﾉ."]


class DailyTaskState:
    def __init__(self) -> None:
        self.logs: list[dict[str, Any]] = []
        self.live_entries: dict[int, dict[str, Any]] = {}
        self.qr_sessions: dict[str, dict[str, Any]] = {}

    def log(self, level: str, message: str) -> None:
        self.logs.append({"time": datetime.now().strftime("%H:%M:%S"), "level": level, "message": message})
        self.logs = self.logs[-400:]

    def slot_path(self, slot: int) -> Path:
        return PRO_ROOT / "cookies" / f"bili_cookies_sub{slot}" / f"bili_cookies_audience{slot}.txt"

    def read_cookie(self, slot: int) -> str:
        path = self.slot_path(slot)
        return path.read_text(encoding="utf-8").strip() if path.exists() else ""

    def write_cookie(self, slot: int, cookie: str) -> None:
        path = self.slot_path(slot)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(cookie.strip(), encoding="utf-8")


daily_state = DailyTaskState()


async def register(ipc: IPCServer) -> None:
    """Register daily task handlers."""

    async def status() -> Dict[str, Any]:
        slots = []
        for slot in range(SLOT_COUNT):
            cookie = daily_state.read_cookie(slot)
            user = await _fetch_user(cookie) if cookie else None
            slots.append({
                "slot": slot,
                "hasCookie": bool(cookie),
                "isValid": bool(user),
                "name": user.get("name") if user else "",
                "mid": user.get("mid") if user else None,
                "liveEntry": daily_state.live_entries.get(slot),
            })
        return {"slots": slots, "logs": daily_state.logs}

    async def save_audience_cookie(slot: int, cookie: str) -> Dict[str, Any]:
        _check_slot(slot)
        daily_state.write_cookie(slot, cookie)
        user = await _fetch_user(cookie)
        if not user:
            daily_state.log("error", f"观众 {slot} 身份验证失败")
            return {"success": False, "error": "Cookie 无效"}
        daily_state.log("success", f"观众 {slot} {user['name']} 身份已保存")
        return {"success": True, "user": user}

    async def generate_audience_qr(slot: int) -> Dict[str, Any]:
        _check_slot(slot)
        async with httpx.AsyncClient(timeout=20.0) as client:
            payload = (await client.get(
                "https://passport.bilibili.com/x/passport-login/web/qrcode/generate",
                params={"source": "main-fe-header", "_": str(int(time.time() * 1000))},
                headers={"User-Agent": bilibili_service.user_agent},
            )).json()
        if payload.get("code") != 0:
            return {"success": False, "error": payload.get("message") or "二维码生成失败", "response": payload}
        data = payload.get("data", {})
        qr_key = data.get("qrcode_key", "")
        qr_url = data.get("url", "")
        qr = qrcode.QRCode(version=1, box_size=8, border=3)
        qr.add_data(qr_url)
        qr.make(fit=True)
        image = qr.make_image(fill_color="black", back_color="white")
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        qr_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
        daily_state.qr_sessions[qr_key] = {"slot": slot, "createdAt": time.time(), "status": "pending"}
        daily_state.log("info", f"观众 {slot} 扫码登录二维码已生成")
        return {"success": True, "qrKey": qr_key, "qrUrl": f"data:image/png;base64,{qr_base64}", "expiresIn": 180}

    async def check_audience_qr_status(qr_key: str) -> Dict[str, Any]:
        session = daily_state.qr_sessions.get(qr_key)
        if not session:
            return {"status": "expired", "message": "二维码会话不存在或已过期"}
        slot = int(session["slot"])
        if time.time() - float(session["createdAt"]) > 180:
            session["status"] = "expired"
            return {"status": "expired", "message": "二维码已过期"}
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                "https://passport.bilibili.com/x/passport-login/web/qrcode/poll",
                params={"qrcode_key": qr_key, "source": "main-fe-header", "_": str(int(time.time() * 1000))},
                headers={"User-Agent": bilibili_service.user_agent},
            )
        payload = response.json()
        code = payload.get("data", {}).get("code", -1)
        if code == 0:
            cookies = _cookies_from_login_response(response, payload)
            if not cookies:
                return {"status": "error", "message": "登录成功但未获得 Cookie", "response": payload}
            daily_state.write_cookie(slot, cookies)
            user = await _fetch_user(cookies)
            if not user:
                return {"status": "error", "message": "Cookie 保存后验证失败", "response": payload}
            session["status"] = "confirmed"
            daily_state.log("success", f"观众 {slot} {user['name']} 扫码身份已保存")
            return {"status": "success", "success": True, "slot": slot, "user": user, "response": payload}
        if code == 86101:
            return {"status": "pending", "message": "请使用哔哩哔哩 APP 扫码"}
        if code in (86090, 86091):
            return {"status": "scanned", "message": "已扫码，请在手机端确认"}
        if code == 86038:
            return {"status": "expired", "message": "二维码已过期"}
        return {"status": "failed", "message": payload.get("message") or payload.get("data", {}).get("message") or "扫码失败", "response": payload}

    async def validate_audience(slot: int) -> Dict[str, Any]:
        user = await _require_audience(slot)
        daily_state.log("success", f"观众 {slot} {user['name']} 已就位")
        return {"success": True, "user": user}

    async def enter_live_room(slot: int, room_id: str, duration_minutes: int = 16) -> Dict[str, Any]:
        user = await _require_audience(slot)
        headers = _headers(daily_state.read_cookie(slot), f"https://live.bilibili.com/{room_id}")
        async with httpx.AsyncClient(timeout=12.0) as client:
            payload = (await client.get(
                "https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom",
                params={"room_id": room_id},
                headers=headers,
            )).json()
        if payload.get("code") != 0:
            daily_state.log("error", f"观众 {slot} 进入直播间失败: code={payload.get('code')} message={payload.get('message') or payload.get('msg')}")
            return {"success": False, "response": payload}
        expires_at = datetime.now() + timedelta(minutes=max(duration_minutes, 1))
        daily_state.live_entries[slot] = {
            "roomId": room_id,
            "name": user["name"],
            "expiresAt": expires_at.isoformat(timespec="seconds"),
        }
        daily_state.log("success", f"观众 {slot} {user['name']} 进入直播间 {room_id}，{duration_minutes} 分钟后视为退出")
        return {"success": True, "response": payload, "entry": daily_state.live_entries[slot]}

    async def send_danmaku(slot: int, room_id: str, message: str = "") -> Dict[str, Any]:
        user = await _require_audience(slot)
        cookie = daily_state.read_cookie(slot)
        csrf = _csrf(cookie)
        text = message or random.choice(LIVE_DANMAKU)
        data = {
            "color": 16777215,
            "fontsize": random.randint(18, 28),
            "mode": 1,
            "msg": text,
            "rnd": int(time.time()),
            "roomid": room_id,
            "bubble": 0,
            "csrf_token": csrf,
            "csrf": csrf,
        }
        async with httpx.AsyncClient(timeout=12.0) as client:
            payload = (await client.post("https://api.live.bilibili.com/msg/send", data=data, headers=_headers(cookie, f"https://live.bilibili.com/{room_id}"))).json()
        ok = payload.get("code") == 0
        daily_state.log("success" if ok else "error", f"观众 {slot} {user['name']} 发送弹幕: code={payload.get('code')} message={payload.get('message') or payload.get('msg') or text}")
        return {"success": ok, "response": payload}

    async def send_gift(slot: int, room_id: str) -> Dict[str, Any]:
        user = await _require_audience(slot)
        owner = await bilibili_service.get_user_info()
        cookie = daily_state.read_cookie(slot)
        csrf = _csrf(cookie)
        data = {
            "uid": user["mid"],
            "gift_id": "31039",
            "ruid": owner.get("mid") or owner.get("uid"),
            "send_ruid": "0",
            "gift_num": 1,
            "coin_type": "gold",
            "bag_id": 0,
            "platform": "pc",
            "biz_code": "Live",
            "biz_id": room_id,
            "storm_beat_id": 0,
            "metadata": "",
            "price": 100,
            "receive_users": "",
            "csrf_token": csrf,
            "csrf": csrf,
            "visit_id": "",
        }
        async with httpx.AsyncClient(timeout=12.0) as client:
            payload = (await client.post("https://api.live.bilibili.com/xlive/revenue/v1/gift/sendGold", data=data, headers=_headers(cookie, f"https://live.bilibili.com/{room_id}"))).json()
        wallet = await _wallet(cookie)
        ok = payload.get("code") == 0
        daily_state.log("success" if ok else "error", f"观众 {slot} {user['name']} 赠送牛蛙: code={payload.get('code')} message={payload.get('message') or payload.get('msg')}; 钱包余额 {wallet.get('goldText', '-')}")
        return {"success": ok, "response": payload, "wallet": wallet}

    ipc.register_handler("daily:status", status)
    ipc.register_handler("daily:audienceQR", generate_audience_qr)
    ipc.register_handler("daily:checkAudienceQRStatus", check_audience_qr_status)
    ipc.register_handler("daily:saveAudienceCookie", save_audience_cookie)
    ipc.register_handler("daily:validateAudience", validate_audience)
    ipc.register_handler("daily:enterLiveRoom", enter_live_room)
    ipc.register_handler("daily:sendDanmaku", send_danmaku)
    ipc.register_handler("daily:sendGift", send_gift)


def _check_slot(slot: int) -> None:
    if slot < 0 or slot >= SLOT_COUNT:
        raise ValueError("观众槽位无效")


async def _require_audience(slot: int) -> dict[str, Any]:
    _check_slot(slot)
    cookie = daily_state.read_cookie(slot)
    if not cookie:
        raise RuntimeError(f"观众 {slot} 尚未保存 Cookie")
    user = await _fetch_user(cookie)
    if not user:
        raise RuntimeError(f"观众 {slot} 身份已过期，请重新验证")
    return user


async def _fetch_user(cookie: str) -> dict[str, Any] | None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            data = (await client.get("https://api.bilibili.com/x/web-interface/nav", headers=_headers(cookie))).json()
        if data.get("code") == 0 and data.get("data", {}).get("isLogin"):
            node = data["data"]
            return {"mid": node.get("mid"), "name": node.get("uname"), "avatar": node.get("face", "")}
    except Exception:
        return None
    return None


async def _wallet(cookie: str) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            data = (await client.get(
                "https://api.live.bilibili.com/xlive/revenue/v1/wallet/myWallet",
                params={"need_bp": "0", "need_metal": "0", "platform": "pc", "bp_with_decimal": "0", "ios_bp_afford_party": "0"},
                headers=_headers(cookie),
            )).json()
        gold = data.get("data", {}).get("gold")
        return {"gold": gold, "goldText": f"{float(gold or 0) / 100:.2f} 电池", "response": data}
    except Exception as exc:
        return {"error": str(exc)}


def _headers(cookie: str, referer: str = "https://www.bilibili.com") -> dict[str, str]:
    return {"Cookie": cookie, "User-Agent": bilibili_service.user_agent, "Referer": referer, "Origin": "https://www.bilibili.com"}


def _csrf(cookie: str) -> str:
    for part in cookie.split(";"):
        name, _, value = part.strip().partition("=")
        if name == "bili_jct":
            return value
    return ""


def _cookies_from_login_response(response: httpx.Response, payload: dict[str, Any]) -> str:
    parts = []
    for header in response.headers.get_list("set-cookie"):
        first = header.split(";", 1)[0].strip()
        if "=" in first:
            parts.append(first)
    if not parts:
        cookies = payload.get("data", {}).get("cookie_info", {}).get("cookies", [])
        parts = [f"{item['name']}={item['value']}" for item in cookies if item.get("name") and item.get("value")]
    if not parts:
        parts = [f"{name}={value}" for name, value in response.cookies.items()]
    return "; ".join(parts)
