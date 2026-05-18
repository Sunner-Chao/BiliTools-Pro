"""Daily live task routes migrated from the original Tk daily-task popup."""
import asyncio
import base64
import io
import os
import random
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict
from urllib.parse import parse_qs, urlencode, urlparse

import httpx
from src.services.http_client import create_client
import qrcode

from ..ipc_server import IPCServer
from src.services.bilibili import bilibili_service
from src.services.game_config import PRO_ROOT


SLOT_COUNT = 4
LIVE_DANMAKU = ["打卡", "路过支持一下", "(⌒▽⌒).", "（￣▽￣）.", "(=・ω・=).", "(｀・ω・´).", "(･∀･).", "(°∀°)ﾉ."]
BATTERY_RECHARGE_SOURCE_URL = os.getenv(
    "BILITOOLS_BATTERY_RECHARGE_SOURCE_URL",
    "https://live.bilibili.com/25528268/?live_from=86001&spm_id_from=333.1387.0.0",
)
BATTERY_RECHARGE_FALLBACK_URL = os.getenv("BILITOOLS_BATTERY_RECHARGE_URL", "https://pay.bilibili.com/bb_balance.html")


class DailyTaskState:
    def __init__(self) -> None:
        self.logs: list[dict[str, Any]] = []
        self.live_entries: dict[int, dict[str, Any]] = {}
        self.qr_sessions: dict[str, dict[str, Any]] = {}
        self.wallet_cache: dict[int, dict[str, Any]] = {}
        self.recharge_cache: dict[str, Any] = {}
        self.entry_tasks: dict[int, asyncio.Task] = {}

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
            wallet = await _wallet_cached(slot, cookie) if user else None
            slots.append({
                "slot": slot,
                "hasCookie": bool(cookie),
                "isValid": bool(user),
                "name": user.get("name") if user else "",
                "mid": user.get("mid") if user else None,
                "wallet": wallet,
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
        async with create_client(timeout=20.0) as client:
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
        daily_state.qr_sessions[qr_key] = {"slot": slot, "createdAt": time.time(), "status": "pending"}
        daily_state.log("info", f"观众 {slot} 扫码登录二维码已生成")
        return {"success": True, "qrKey": qr_key, "qrUrl": _qr_data_url(qr_url), "expiresIn": 180}

    async def check_audience_qr_status(qr_key: str) -> Dict[str, Any]:
        session = daily_state.qr_sessions.get(qr_key)
        if not session:
            return {"status": "expired", "message": "二维码会话不存在或已过期"}
        slot = int(session["slot"])
        if time.time() - float(session["createdAt"]) > 180:
            session["status"] = "expired"
            return {"status": "expired", "message": "二维码已过期"}
        async with create_client(timeout=20.0) as client:
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

    async def wallet(slot: int) -> Dict[str, Any]:
        user = await _require_audience(slot)
        wallet_info = await _wallet_cached(slot, daily_state.read_cookie(slot), force=True)
        daily_state.log("info", f"观众 {slot} {user['name']} 钱包余额 {wallet_info.get('goldText', '-')}")
        return {"success": not wallet_info.get("error"), "wallet": wallet_info, "user": user}

    async def recharge_qr(slot: int | None = None) -> Dict[str, Any]:
        if slot is not None:
            await _require_audience(slot)
        recharge = await _discover_battery_recharge()
        url = recharge["url"]
        return {
            "success": True,
            "url": url,
            "qrUrl": _qr_data_url(url),
            "title": "B站电池充值",
            "source": recharge.get("source"),
            "scriptSource": recharge.get("scriptSource"),
            "componentUrl": recharge.get("componentUrl"),
            "trigger": recharge.get("trigger"),
            "anchor": recharge.get("anchor"),
            "fallback": recharge.get("fallback", False),
        }

    async def recharge_panel(slot: int, room_id: str = "") -> Dict[str, Any]:
        user = await _require_audience(slot)
        cookie = daily_state.read_cookie(slot)
        room = await _live_room_info(cookie, room_id) if room_id else {}
        panel = await _fetch_recharge_panel(cookie, room)
        recharge = await _discover_battery_recharge()
        daily_state.log(
            "success" if panel.get("success") else "error",
            f"观众 {slot} {user['name']} 充值面板: 钱包 code={panel.get('wallet', {}).get('code')} 面板 code={panel.get('panel', {}).get('code')}",
        )
        return {
            "success": bool(panel.get("success")),
            "slot": slot,
            "user": user,
            "room": room,
            "panel": panel,
            "url": recharge.get("url"),
            "qrUrl": _qr_data_url(recharge.get("url", BATTERY_RECHARGE_FALLBACK_URL)),
            "componentUrl": recharge.get("componentUrl"),
            "endpointSpec": _recharge_endpoint_spec(),
        }

    async def create_recharge_order(slot: int, room_id: str, option: dict[str, Any], confirm: bool = False) -> Dict[str, Any]:
        if not confirm:
            raise RuntimeError("创建充值订单需要用户二次确认")
        user = await _require_audience(slot)
        cookie = daily_state.read_cookie(slot)
        room = await _live_room_info(cookie, room_id)
        if room.get("code") != 0:
            return {"success": False, "error": room.get("message") or "直播间信息获取失败", "room": room}
        panel = await _fetch_recharge_panel(cookie, room)
        goods = _build_recharge_goods(panel, option)
        if not goods:
            return {"success": False, "error": "充值金额无效，请刷新充值面板后重试", "panel": panel}
        order = await _create_recharge_qr_order(cookie, room, goods)
        ok = order.get("code") == 0 and bool(order.get("orderId"))
        daily_state.log(
            "success" if ok else "error",
            f"观众 {slot} {user['name']} 创建充值订单 {goods.get('priceText')}: code={order.get('code')} order={order.get('orderId') or '-'}",
        )
        return {"success": ok, "user": user, "room": room, "goods": goods, "order": order}

    async def query_recharge_order(slot: int, order_id: str) -> Dict[str, Any]:
        user = await _require_audience(slot)
        cookie = daily_state.read_cookie(slot)
        result = await _query_recharge_order(cookie, order_id)
        daily_state.log("info", f"观众 {slot} {user['name']} 查询充值订单 {order_id}: {result.get('statusText')}")
        return {"success": result.get("code") == 0, "user": user, "order": result}

    async def enter_live_room(slot: int, room_id: str, duration_minutes: int = 16) -> Dict[str, Any]:
        user = await _require_audience(slot)
        cookie = daily_state.read_cookie(slot)
        room = await _live_room_info(cookie, room_id)
        if room.get("code") != 0:
            daily_state.log("error", f"观众 {slot} 进入直播间失败: code={room.get('code')} message={room.get('message')}")
            return {"success": False, "response": room.get("response"), "actions": []}
        actions = await _enter_live_room_actions(cookie, room.get("roomId") or room_id)
        ok_actions = [item for item in actions if item.get("ok")]
        if not ok_actions:
            daily_state.log("error", f"观众 {slot} 进房动作未确认成功: {_summarize_actions(actions)}")
            return {"success": False, "response": room.get("response"), "actions": actions}
        expires_at = datetime.now() + timedelta(minutes=max(duration_minutes, 1))
        old_task = daily_state.entry_tasks.pop(slot, None)
        if old_task and not old_task.done():
            old_task.cancel()
        daily_state.entry_tasks[slot] = asyncio.create_task(
            _keep_live_room_active(slot, user["name"], cookie, room.get("roomId") or room_id, max(duration_minutes, 1))
        )
        daily_state.live_entries[slot] = {
            "roomId": room.get("roomId") or room_id,
            "shortId": room.get("shortId"),
            "title": room.get("title"),
            "anchor": room.get("anchor"),
            "name": user["name"],
            "expiresAt": expires_at.isoformat(timespec="seconds"),
            "actions": actions,
        }
        daily_state.log("success", f"观众 {slot} {user['name']} 已进入直播间 {room.get('roomId') or room_id}，保活 {duration_minutes} 分钟")
        return {"success": True, "response": room.get("response"), "actions": actions, "entry": daily_state.live_entries[slot]}

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
        async with create_client(timeout=12.0) as client:
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
        async with create_client(timeout=12.0) as client:
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
    ipc.register_handler("daily:wallet", wallet)
    ipc.register_handler("daily:rechargeQR", recharge_qr)
    ipc.register_handler("daily:rechargePanel", recharge_panel)
    ipc.register_handler("daily:createRechargeOrder", create_recharge_order)
    ipc.register_handler("daily:queryRechargeOrder", query_recharge_order)
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
        async with create_client(timeout=10.0) as client:
            data = (await client.get("https://api.bilibili.com/x/web-interface/nav", headers=_headers(cookie))).json()
        if data.get("code") == 0 and data.get("data", {}).get("isLogin"):
            node = data["data"]
            return {"mid": node.get("mid"), "name": node.get("uname"), "avatar": node.get("face", "")}
    except Exception:
        return None
    return None


async def _wallet(cookie: str) -> dict[str, Any]:
    try:
        async with create_client(timeout=10.0) as client:
            data = (await client.get(
                "https://api.live.bilibili.com/xlive/revenue/v1/wallet/myGoldWallet",
                params={"need_bp": "1", "need_metal": "1", "platform": "pc", "bp_with_decimal": "0", "ios_bp_afford_party": "0"},
                headers=_headers(cookie, "https://live.bilibili.com/"),
            )).json()
        if data.get("code") != 0:
            async with create_client(timeout=10.0) as client:
                data = (await client.get(
                    "https://api.live.bilibili.com/xlive/revenue/v1/wallet/myWallet",
                    params={"need_bp": "0", "need_metal": "0", "platform": "pc", "bp_with_decimal": "0", "ios_bp_afford_party": "0"},
                    headers=_headers(cookie, "https://live.bilibili.com/"),
                )).json()
        wallet = data.get("data", {}) if isinstance(data.get("data"), dict) else {}
        gold = _first_number(wallet, ("gold", "gold_balance", "goldBalance", "bp", "bp_num"))
        return {"gold": gold, "goldText": f"{float(gold or 0) / 100:.2f} 电池", "response": data}
    except Exception as exc:
        return {"error": str(exc)}


async def _wallet_cached(slot: int, cookie: str, force: bool = False) -> dict[str, Any]:
    cached = daily_state.wallet_cache.get(slot)
    if cached and not force and time.time() - float(cached.get("fetchedAtTs", 0)) < 30:
        return cached
    wallet = await _wallet(cookie)
    wallet["fetchedAt"] = datetime.now().isoformat(timespec="seconds")
    wallet["fetchedAtTs"] = time.time()
    daily_state.wallet_cache[slot] = wallet
    return wallet


async def _live_room_info(cookie: str, room_id: str) -> dict[str, Any]:
    try:
        async with create_client(timeout=12.0) as client:
            payload = (await client.get(
                "https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom",
                params={"room_id": room_id},
                headers=_headers(cookie, f"https://live.bilibili.com/{room_id}"),
            )).json()
        data = payload.get("data", {}) if isinstance(payload.get("data"), dict) else {}
        room_info = data.get("room_info", {}) if isinstance(data.get("room_info"), dict) else {}
        anchor_info = data.get("anchor_info", {}) if isinstance(data.get("anchor_info"), dict) else {}
        base_info = anchor_info.get("base_info", {}) if isinstance(anchor_info.get("base_info"), dict) else {}
        anchor_mid = base_info.get("mid") or base_info.get("uid") or anchor_info.get("uid") or room_info.get("uid")
        return {
            "code": payload.get("code"),
            "message": payload.get("message") or payload.get("msg"),
            "roomId": str(room_info.get("room_id") or room_id),
            "shortId": room_info.get("short_id"),
            "title": room_info.get("title") or "",
            "anchor": {"mid": anchor_mid, "name": base_info.get("uname"), "face": base_info.get("face")},
            "response": payload,
        }
    except Exception as exc:
        return {"code": -1, "message": str(exc), "roomId": room_id, "response": {"error": str(exc)}}


async def _enter_live_room_actions(cookie: str, room_id: str) -> list[dict[str, Any]]:
    csrf = _csrf(cookie)
    referer = f"https://live.bilibili.com/{room_id}"
    actions: list[dict[str, Any]] = []
    async with create_client(timeout=12.0) as client:
        actions.append(await _request_action(
            client,
            "弹幕服务器信息",
            "GET",
            "https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo",
            headers=_headers(cookie, referer),
            params={"id": room_id, "type": "0"},
        ))
        entry_data = {"room_id": room_id, "platform": "pc", "csrf_token": csrf, "csrf": csrf, "visit_id": ""}
        actions.append(await _request_action(
            client,
            "web-room 进房动作",
            "POST",
            "https://api.live.bilibili.com/xlive/web-room/v1/index/roomEntryAction",
            headers=_headers(cookie, referer),
            data=entry_data,
        ))
        actions.append(await _request_action(
            client,
            "Room 进房动作",
            "POST",
            "https://api.live.bilibili.com/room/v1/Room/room_entry_action",
            headers=_headers(cookie, referer),
            data=entry_data,
        ))
    return actions


async def _keep_live_room_active(slot: int, name: str, cookie: str, room_id: str, duration_minutes: int) -> None:
    end_ts = time.time() + duration_minutes * 60
    try:
        while time.time() < end_ts:
            await asyncio.sleep(min(55, max(1, end_ts - time.time())))
            if time.time() >= end_ts:
                break
            room = await _live_room_info(cookie, room_id)
            actions = await _enter_live_room_actions(cookie, room_id)
            ok = room.get("code") == 0 and any(item.get("ok") for item in actions)
            daily_state.log("success" if ok else "error", f"观众 {slot} {name} 直播间保活: {_summarize_actions(actions)}")
        entry = daily_state.live_entries.get(slot)
        if entry and str(entry.get("roomId")) == str(room_id):
            entry["expired"] = True
        daily_state.log("info", f"观众 {slot} {name} 直播间 {room_id} 保活结束")
    except asyncio.CancelledError:
        daily_state.log("info", f"观众 {slot} {name} 直播间 {room_id} 保活已替换")


async def _request_action(client: httpx.AsyncClient, name: str, method: str, url: str, **kwargs: Any) -> dict[str, Any]:
    try:
        response = await client.request(method, url, **kwargs)
        payload = response.json()
        return {
            "name": name,
            "ok": payload.get("code") == 0,
            "code": payload.get("code"),
            "message": payload.get("message") or payload.get("msg"),
            "httpStatus": response.status_code,
            "response": payload,
        }
    except Exception as exc:
        return {"name": name, "ok": False, "code": -1, "message": str(exc)}


def _summarize_actions(actions: list[dict[str, Any]]) -> str:
    return "；".join(f"{item.get('name')} code={item.get('code')} {item.get('message') or ''}".strip() for item in actions)


async def _fetch_recharge_panel(cookie: str, room: dict[str, Any]) -> dict[str, Any]:
    room_id = str(room.get("roomId") or "")
    anchor_mid = str((room.get("anchor") or {}).get("mid") or "")
    referer = f"https://live.bilibili.com/{room_id}" if room_id else "https://live.bilibili.com/"
    timestamp = str(int(time.time() * 1000))
    result: dict[str, Any] = {"success": False, "fetchedAt": datetime.now().isoformat(timespec="seconds")}
    async with create_client(timeout=15.0) as client:
        result["wallet"] = await _safe_get_json(
            client,
            "https://api.live.bilibili.com/xlive/revenue/v1/wallet/myGoldWallet",
            params={"need_bp": "1", "need_metal": "1", "platform": "pc", "bp_with_decimal": "0", "ios_bp_afford_party": "0"},
            headers=_headers(cookie, referer),
        )
        result["panel"] = await _safe_get_json(
            client,
            "https://api.live.bilibili.com/xlive/revenue/v2/order/rechargePanel",
            params={"context_type": "1", "build": "0", "platform": "pc", "need_hamster": "1", "t": timestamp},
            headers=_headers(cookie, referer),
        )
        result["announcement"] = await _safe_get_json(
            client,
            "https://api.live.bilibili.com/xlive/revenue/v2/general/rechargeAnnouncement",
            headers=_headers(cookie, referer),
        )
        result["clientResource"] = await _safe_get_json(
            client,
            "https://api.live.bilibili.com/xlive/open-interface/v1/fetch_client_resource",
            params={"business": "live_revenue_business_test:0"},
            headers=_headers(cookie, referer),
        )
        if anchor_mid:
            result["relation"] = await _safe_get_json(
                client,
                "https://api.bilibili.com/x/relation",
                params={"fid": anchor_mid},
                headers=_headers(cookie, "https://www.bilibili.com/"),
            )
    result["walletText"] = _wallet_text_from_response(result.get("wallet", {}))
    result["payOptions"] = _extract_pay_options(result.get("panel", {}))
    result["success"] = result.get("wallet", {}).get("code") == 0 and result.get("panel", {}).get("code") == 0
    return result


async def _safe_get_json(client: httpx.AsyncClient, url: str, **kwargs: Any) -> dict[str, Any]:
    try:
        response = await client.get(url, **kwargs)
        payload = response.json()
        if isinstance(payload, dict):
            payload.setdefault("httpStatus", response.status_code)
            return payload
        return {"code": -1, "message": "响应不是 JSON 对象", "httpStatus": response.status_code, "data": payload}
    except Exception as exc:
        return {"code": -1, "message": str(exc)}


def _wallet_text_from_response(response: dict[str, Any]) -> str:
    data = response.get("data", {}) if isinstance(response.get("data"), dict) else {}
    gold = _first_number(data, ("gold", "gold_balance", "goldBalance", "bp", "bp_num"))
    return f"{float(gold or 0) / 100:.2f} 电池"


def _extract_pay_options(response: dict[str, Any]) -> list[dict[str, Any]]:
    data = response.get("data", {})
    options: list[dict[str, Any]] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            keys = set(node)
            if {"bp_num", "pay_bp"} & keys or {"price", "money", "amount"} & keys:
                price = node.get("price") or node.get("money") or node.get("amount") or 0
                options.append({
                    "title": node.get("title") or node.get("name") or node.get("desc") or node.get("display_name") or "充值档位",
                    "id": node.get("id"),
                    "index": node.get("index"),
                    "bpNum": node.get("bp_num") or node.get("bpNum") or node.get("recharge_bp"),
                    "payBp": node.get("pay_bp") or node.get("payBp"),
                    "price": price,
                    "priceText": f"{float(price or 0) / 100:.2f} 电池",
                    "raw": node,
                })
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(data)
    unique: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in options:
        marker = f"{item.get('title')}|{item.get('bpNum')}|{item.get('payBp')}|{item.get('price')}"
        if marker not in seen:
            unique.append(item)
            seen.add(marker)
    return unique[:12]


def _build_recharge_goods(panel: dict[str, Any], option: dict[str, Any]) -> dict[str, Any] | None:
    if option.get("custom"):
        price = _custom_recharge_price(option)
        if price <= 0:
            return None
        return {
            "id": 1,
            "index": 0,
            "name": "gold",
            "price": price,
            "goodsNum": _recharge_goods_num(price),
            "priceText": f"{float(price) / 100:.2f} 电池",
            "custom": True,
            "raw": {"price": price, "name": "gold", "custom": True},
        }
    response = panel.get("panel", {}) if isinstance(panel.get("panel"), dict) else {}
    data = response.get("data", {}) if isinstance(response.get("data"), dict) else {}
    goods_list = data.get("goods", []) if isinstance(data.get("goods"), list) else []
    selected_price = _to_int(option.get("price") or option.get("payCash") or option.get("raw", {}).get("price"))
    selected_index = _to_int(option.get("index") or option.get("raw", {}).get("index"))
    selected_id = _to_int(option.get("id") or option.get("raw", {}).get("id"))
    for item in goods_list:
        if not isinstance(item, dict):
            continue
        price = _to_int(item.get("price"))
        index = _to_int(item.get("index"))
        goods_id = _to_int(item.get("id"))
        if price == selected_price and (not selected_index or index == selected_index) and (not selected_id or goods_id == selected_id):
            return {
                "id": goods_id or 1,
                "index": index,
                "name": item.get("name") or "gold",
                "price": price,
                "goodsNum": _recharge_goods_num(price),
                "priceText": f"{float(price or 0) / 100:.2f} 电池",
                "raw": item,
            }
    return None


def _custom_recharge_price(option: dict[str, Any]) -> int:
    # B 站充值组件内部金额单位：60 电池 => 6000，goods_num => 6。
    amount = option.get("amount")
    if amount is None:
        amount = option.get("batteryAmount")
    try:
        value = float(amount)
    except (TypeError, ValueError):
        return 0
    if value < 10 or value > 100000:
        return 0
    return int(round(value * 100))


def _recharge_goods_num(price: int) -> str:
    value = float(price or 0) / 1000
    return str(int(value)) if value.is_integer() else f"{value:.2f}".rstrip("0").rstrip(".")


async def _create_recharge_qr_order(cookie: str, room: dict[str, Any], goods: dict[str, Any]) -> dict[str, Any]:
    csrf = _csrf(cookie)
    room_id = str(room.get("roomId") or "")
    room_data = room.get("response", {}).get("data", {}) if isinstance(room.get("response"), dict) else {}
    room_info = room_data.get("room_info", {}) if isinstance(room_data.get("room_info"), dict) else {}
    anchor_mid = (room.get("anchor") or {}).get("mid") or room_info.get("uid") or ""
    data = {
        "goods_id": goods.get("id") or 1,
        "goods_num": goods.get("goodsNum") or _recharge_goods_num(_to_int(goods.get("price"))),
        "pay_cash": goods.get("price") or "",
        "pay_bp": "",
        "ruid": anchor_mid,
        "parent_area_id": room_info.get("parent_area_id") or "",
        "area_id": room_info.get("area_id") or "",
        "biz_extra": "",
        "is_contract": 0,
        "context_type": 1,
        "context_id": room_id,
        "build": 0,
        "platform": "pc",
        "ios_bp": 0,
        "common_bp": 0,
        "csrf": csrf,
        "csrf_token": csrf,
        "live_statistics": _json_dumps({
            "pc_client": "pcWeb",
            "jumpfrom": "-99998",
            "room_category": str(room_info.get("parent_area_id") or "-99998"),
            "official_channel": {"program_room_id": "-99998", "program_up_id": "-99998"},
        }),
        "statistics": _json_dumps({"platform": 5, "pc_client": "pcWeb", "appId": 100}),
    }
    try:
        async with create_client(timeout=20.0) as client:
            response = await client.post(
                "https://api.live.bilibili.com/xlive/revenue/v1/order/createQrCodeOrder",
                data=data,
                headers={**_headers(cookie, f"https://live.bilibili.com/{room_id}"), "Content-Type": "application/x-www-form-urlencoded"},
            )
        payload = response.json()
        order_data = payload.get("data", {}) if isinstance(payload.get("data"), dict) else {}
        code_url = order_data.get("code_url") or order_data.get("qrcode_url") or ""
        expire = order_data.get("expire") or 0
        return {
            "code": payload.get("code"),
            "message": payload.get("message") or payload.get("msg"),
            "orderId": order_data.get("order_id") or order_data.get("orderId") or "",
            "codeUrl": code_url,
            "qrUrl": _qr_data_url(code_url) if code_url else "",
            "expire": expire,
            "expireSeconds": expire,
            "response": payload,
        }
    except Exception as exc:
        return {"code": -1, "message": str(exc), "orderId": "", "response": {"error": str(exc)}}


async def _query_recharge_order(cookie: str, order_id: str) -> dict[str, Any]:
    csrf = _csrf(cookie)
    try:
        async with create_client(timeout=12.0) as client:
            response = await client.post(
                "https://api.live.bilibili.com/xlive/revenue/v1/order/queryOrderStatus",
                data={"order_id": order_id, "csrf": csrf, "csrf_token": csrf},
                headers={**_headers(cookie, "https://live.bilibili.com/"), "Content-Type": "application/x-www-form-urlencoded"},
            )
        payload = response.json()
        if payload.get("code") in (1300001, -504):
            return {"code": 0, "status": "pending", "statusText": "待支付", "response": payload}
        data = payload.get("data", {}) if isinstance(payload.get("data"), dict) else {}
        status = _payment_status(data.get("status"))
        return {
            "code": payload.get("code"),
            "message": payload.get("message") or payload.get("msg"),
            "status": status,
            "statusText": {"pending": "待支付", "success": "已支付", "fail": "支付失败"}.get(status, "未知"),
            "response": payload,
        }
    except Exception as exc:
        return {"code": -1, "message": str(exc), "status": "fail", "statusText": "查询失败", "response": {"error": str(exc)}}


def _payment_status(value: Any) -> str:
    try:
        status = int(value)
    except (TypeError, ValueError):
        return "fail"
    if status == 1:
        return "pending"
    if status == 3:
        return "fail"
    return "success"


def _to_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _json_dumps(value: Any) -> str:
    import json

    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _first_number(data: dict[str, Any], keys: tuple[str, ...]) -> float:
    for key in keys:
        value = data.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                pass
    return 0.0


def _recharge_endpoint_spec() -> list[dict[str, str]]:
    return [
        {"name": "myGoldWallet", "role": "查询电池/金瓜子/金属等钱包余额", "method": "GET"},
        {"name": "rechargePanel", "role": "查询直播场景充值面板、档位和支付配置", "method": "GET"},
        {"name": "rechargeAnnouncement", "role": "查询充值公告/风控提示", "method": "GET"},
        {"name": "fetch_client_resource", "role": "查询直播营收业务实验/资源配置", "method": "GET"},
        {"name": "x/relation", "role": "查询当前观众与主播关系，通常用于面板上下文", "method": "GET"},
        {"name": "createQrCodeOrder", "role": "创建支付二维码订单，必须由用户明确选择金额后触发", "method": "POST"},
        {"name": "queryOrderStatus", "role": "轮询已创建订单支付状态", "method": "GET/POST"},
    ]


async def _discover_battery_recharge(force: bool = False) -> dict[str, Any]:
    cached = daily_state.recharge_cache
    if cached and not force and time.time() - float(cached.get("fetchedAtTs", 0)) < 3600:
        return cached

    try:
        async with create_client(timeout=20.0, follow_redirects=True) as client:
            html = (await client.get(BATTERY_RECHARGE_SOURCE_URL, headers=_headers("", BATTERY_RECHARGE_SOURCE_URL))).text
            script_url = _extract_charge_script_url(html)
            script_text = ""
            if script_url:
                script_text = (await client.get(script_url, headers=_headers("", BATTERY_RECHARGE_SOURCE_URL))).text
        base_url = _extract_charge_base_url(script_text) or _extract_charge_base_url(html)
        anchor = _extract_live_anchor(html)
        room_id = anchor.get("roomId") or _first_group(BATTERY_RECHARGE_SOURCE_URL, r"live\.bilibili\.com/(\d+)")
        live_url = _build_live_room_url(room_id)
        component_url = _build_recharge_url(base_url, anchor) if base_url else ""
        result = {
            "url": live_url,
            "componentUrl": component_url,
            "source": BATTERY_RECHARGE_SOURCE_URL,
            "scriptSource": script_url,
            "anchor": anchor,
            "trigger": {
                "selector": "span[data-v-f20d4832]",
                "text": "0 充值",
                "component": 'OpenRechargeStores({ type: "goldSeedStore", contextType: 1, contextId: roomId })',
            },
            "fallback": False,
            "fetchedAt": datetime.now().isoformat(timespec="seconds"),
            "fetchedAtTs": time.time(),
        }
    except Exception as exc:
        result = {
            "url": BATTERY_RECHARGE_FALLBACK_URL,
            "source": BATTERY_RECHARGE_SOURCE_URL,
            "error": str(exc),
            "fallback": True,
            "fetchedAt": datetime.now().isoformat(timespec="seconds"),
            "fetchedAtTs": time.time(),
        }
    daily_state.recharge_cache = result
    return result


def _build_live_room_url(room_id: str | None) -> str:
    parsed = urlparse(BATTERY_RECHARGE_SOURCE_URL)
    if room_id:
        return f"https://live.bilibili.com/{room_id}"
    return f"{parsed.scheme or 'https'}://{parsed.netloc}{parsed.path}".rstrip("/")


def _extract_charge_script_url(html: str) -> str:
    match = re.search(r"loadScript\([\"'](?P<src>[^\"']*pay-charge/level-charge\.umd\.js)[\"']\)", html)
    if not match:
        match = re.search(r"(?P<src>(?://|https?://)[^\"'<>]*pay-charge/level-charge\.umd\.js)", html)
    if not match:
        return ""
    return _absolute_url(match.group("src"))


def _extract_charge_base_url(text: str) -> str:
    match = re.search(r"(?:(?:https?:)?//)?member\.bilibili\.com/mall/upower-pay", text)
    return _absolute_url(match.group(0)) if match else ""


def _extract_live_anchor(html: str) -> dict[str, Any]:
    room_id = _first_group(html, r'"room_id"\s*:\s*(\d+)') or _first_group(BATTERY_RECHARGE_SOURCE_URL, r"live\.bilibili\.com/(\d+)")
    uid = _first_group(html, r'"roomInitRes".{0,300}?"uid"\s*:\s*(\d+)') or _first_group(html, r'"news_info"\s*:\s*\{\s*"uid"\s*:\s*(\d+)')
    uname = _decode_json_text(_first_group(html, r'"uname"\s*:\s*"([^"]*)"'))
    face = _decode_json_text(_first_group(html, r'"face"\s*:\s*"([^"]*)"'))
    return {"roomId": room_id, "mid": uid, "name": uname, "avatar": face}


def _build_recharge_url(base_url: str, anchor: dict[str, Any]) -> str:
    parsed = urlparse(base_url)
    existing = {key: values[-1] for key, values in parse_qs(parsed.query).items()}
    params = {
        **existing,
        "type": "goldSeedStore",
        "contextType": "1",
        "contextId": anchor.get("roomId") or "",
        "from": "live_room",
        "prePage": "live_room",
        "spmid": "444.8",
    }
    query = urlencode({key: value for key, value in params.items() if value})
    return f"{parsed.scheme or 'https'}://{parsed.netloc}{parsed.path}?{query}" if query else f"{parsed.scheme or 'https'}://{parsed.netloc}{parsed.path}"


def _absolute_url(url: str) -> str:
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return "https://" + url.lstrip("/")


def _first_group(text: str, pattern: str) -> str:
    match = re.search(pattern, text, re.S)
    return match.group(1) if match else ""


def _decode_json_text(value: str) -> str:
    return value.replace("\\u002F", "/").replace("\\/", "/")


def _qr_data_url(value: str) -> str:
    qr = qrcode.QRCode(version=1, box_size=8, border=3)
    qr.add_data(value)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    qr_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{qr_base64}"


def _headers(cookie: str, referer: str = "https://www.bilibili.com") -> dict[str, str]:
    origin = "https://live.bilibili.com" if "live.bilibili.com" in referer else "https://www.bilibili.com"
    return {"Cookie": cookie, "User-Agent": bilibili_service.user_agent, "Referer": referer, "Origin": origin}


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
