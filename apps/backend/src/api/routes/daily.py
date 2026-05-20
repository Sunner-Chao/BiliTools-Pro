"""Daily live task routes migrated from the original Tk daily-task popup."""
import asyncio
import base64
import hmac
import io
import json
import os
import random
import re
import secrets
import shutil
import socket
import subprocess
import sys
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import urlopen

import httpx
from src.services.http_client import create_client
import qrcode

from ..ipc_server import IPCServer
from src.core.response import ErrorCode, fail, ok
from src.services.bilibili import bilibili_service
from src.services.game_config import PRO_ROOT
from src.services.app_settings import app_settings_service


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
        self.api_watch_tasks: dict[int, asyncio.Task] = {}
        self.browser_tasks: dict[int, asyncio.Task] = {}
        self.browser_processes: dict[int, subprocess.Popen] = {}
        self.browser_profiles: dict[int, Path] = {}
        self.workflows: list[dict[str, Any]] = []
        self.workflow_tasks: dict[str, asyncio.Task] = {}
        self._workflows_loaded = False

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

    @property
    def workflow_path(self) -> Path:
        return PRO_ROOT / "runtime" / "daily_workflows.json"

    def load_workflows(self) -> None:
        if self._workflows_loaded:
            return
        self._workflows_loaded = True
        path = self.workflow_path
        if not path.exists():
            self.workflows = []
            return
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            self.workflows = data if isinstance(data, list) else []
        except Exception as exc:
            self.workflows = []
            self.log("error", f"每日自动化工作流加载失败: {exc}")

    def save_workflows(self) -> None:
        path = self.workflow_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.workflows, ensure_ascii=False, indent=2), encoding="utf-8")

    def find_workflow(self, workflow_id: str) -> dict[str, Any] | None:
        self.load_workflows()
        for workflow in self.workflows:
            if workflow.get("id") == workflow_id:
                return workflow
        return None


daily_state = DailyTaskState()


async def register(ipc: IPCServer) -> None:
    """Register daily task handlers."""

    async def status() -> Dict[str, Any]:
        daily_state.load_workflows()
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
        return ok({"slots": slots, "logs": daily_state.logs, "workflows": daily_state.workflows})

    async def save_audience_cookie(slot: int, cookie: str) -> Dict[str, Any]:
        _check_slot(slot)
        if not cookie or not cookie.strip():
            return fail("请输入 Cookie", ErrorCode.VALIDATION_ERROR, error_field="cookie")
        daily_state.write_cookie(slot, cookie)
        user = await _fetch_user(cookie)
        if not user:
            daily_state.log("error", f"观众 {slot} 身份验证失败")
            return fail("Cookie 无效，请检查是否过期", ErrorCode.UNAUTHORIZED, error_field="cookie")
        daily_state.log("success", f"观众 {slot} {user['name']} 身份已保存")
        return ok({"user": user})

    async def generate_audience_qr(slot: int) -> Dict[str, Any]:
        _check_slot(slot)
        async with create_client(timeout=20.0) as client:
            payload = (await client.get(
                "https://passport.bilibili.com/x/passport-login/web/qrcode/generate",
                params={"source": "main-fe-header", "_": str(int(time.time() * 1000))},
                headers={"User-Agent": bilibili_service.user_agent},
            )).json()
        if payload.get("code") != 0:
            return fail(payload.get("message") or "二维码生成失败", ErrorCode.UPSTREAM_ERROR, data={"response": payload})
        data = payload.get("data", {})
        qr_key = data.get("qrcode_key", "")
        qr_url = data.get("url", "")
        daily_state.qr_sessions[qr_key] = {"slot": slot, "createdAt": time.time(), "status": "pending"}
        daily_state.log("info", f"观众 {slot} 扫码登录二维码已生成")
        return ok({"qrKey": qr_key, "qrUrl": _qr_data_url(qr_url), "expiresIn": 180})

    async def check_audience_qr_status(qr_key: str) -> Dict[str, Any]:
        session = daily_state.qr_sessions.get(qr_key)
        if not session:
            return fail("二维码会话不存在或已过期", ErrorCode.NOT_FOUND, data={"status": "expired"})
        slot = int(session["slot"])
        if time.time() - float(session["createdAt"]) > 180:
            session["status"] = "expired"
            return fail("二维码已过期", ErrorCode.GONE, data={"status": "expired"})
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
                return fail("登录成功但未获得 Cookie", ErrorCode.INTERNAL_ERROR, data={"status": "error", "response": payload})
            daily_state.write_cookie(slot, cookies)
            user = await _fetch_user(cookies)
            if not user:
                return fail("Cookie 保存后验证失败", ErrorCode.INTERNAL_ERROR, data={"status": "error", "response": payload})
            session["status"] = "confirmed"
            daily_state.log("success", f"观众 {slot} {user['name']} 扫码身份已保存")
            return ok({"status": "success", "slot": slot, "user": user, "response": payload})
        if code == 86101:
            return ok({"status": "pending", "message": "请使用哔哩哔哩 APP 扫码"})
        if code in (86090, 86091):
            return ok({"status": "scanned", "message": "已扫码，请在手机端确认"})
        if code == 86038:
            return fail("二维码已过期", ErrorCode.GONE, data={"status": "expired"})
        return fail(payload.get("message") or payload.get("data", {}).get("message") or "扫码失败", ErrorCode.UPSTREAM_ERROR, data={"status": "failed", "response": payload})

    async def validate_audience(slot: int) -> Dict[str, Any]:
        user = await _require_audience(slot)
        daily_state.log("success", f"观众 {slot} {user['name']} 已就位")
        return ok({"user": user})

    async def wallet(slot: int) -> Dict[str, Any]:
        user = await _require_audience(slot)
        wallet_info = await _wallet_cached(slot, daily_state.read_cookie(slot), force=True)
        daily_state.log("info", f"观众 {slot} {user['name']} 钱包余额 {wallet_info.get('goldText', '-')}")
        if wallet_info.get("error"):
            return fail(wallet_info["error"], ErrorCode.UPSTREAM_ERROR)
        return ok({"wallet": wallet_info, "user": user})

    async def recharge_qr(slot: int | None = None) -> Dict[str, Any]:
        if slot is not None:
            await _require_audience(slot)
        recharge = await _discover_battery_recharge()
        url = recharge["url"]
        return ok({
            "url": url,
            "qrUrl": _qr_data_url(url),
            "title": "B站电池充值",
            "source": recharge.get("source"),
            "scriptSource": recharge.get("scriptSource"),
            "componentUrl": recharge.get("componentUrl"),
            "trigger": recharge.get("trigger"),
            "anchor": recharge.get("anchor"),
            "fallback": recharge.get("fallback", False),
        })

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
        if not panel.get("success"):
            return fail("充值面板加载失败", ErrorCode.UPSTREAM_ERROR)
        return ok({
            "slot": slot,
            "user": user,
            "room": room,
            "panel": panel,
            "url": recharge.get("url"),
            "qrUrl": _qr_data_url(recharge.get("url", BATTERY_RECHARGE_FALLBACK_URL)),
            "componentUrl": recharge.get("componentUrl"),
            "endpointSpec": _recharge_endpoint_spec(),
        })

    async def create_recharge_order(slot: int, room_id: str, option: dict[str, Any], confirm: bool = False) -> Dict[str, Any]:
        if not confirm:
            raise RuntimeError("创建充值订单需要用户二次确认")
        user = await _require_audience(slot)
        cookie = await _refresh_cookie_via_homepage(daily_state.read_cookie(slot))
        room = await _live_room_info(cookie, room_id)
        if room.get("code") != 0:
            return fail(room.get("message") or "直播间信息获取失败", ErrorCode.UPSTREAM_ERROR, data={"room": room})
        panel = await _fetch_recharge_panel(cookie, room)
        goods = _build_recharge_goods(panel, option)
        if not goods:
            return fail("充值金额无效，请刷新充值面板后重试", ErrorCode.VALIDATION_ERROR, data={"panel": panel})
        order = await _create_recharge_qr_order(cookie, room, goods)
        success = order.get("code") == 0 and bool(order.get("orderId"))
        daily_state.log(
            "success" if success else "error",
            f"观众 {slot} {user['name']} 创建充值订单 {goods.get('priceText')}: code={order.get('code')} order={order.get('orderId') or '-'}",
        )
        if not success:
            return fail(order.get("message") or "创建充值订单失败", ErrorCode.UPSTREAM_ERROR, data={"order": order})
        return ok({"user": user, "room": room, "goods": goods, "order": order})

    async def query_recharge_order(slot: int, order_id: str) -> Dict[str, Any]:
        user = await _require_audience(slot)
        cookie = daily_state.read_cookie(slot)
        result = await _query_recharge_order(cookie, order_id)
        daily_state.log("info", f"观众 {slot} {user['name']} 查询充值订单 {order_id}: {result.get('statusText')}")
        if result.get("code") != 0:
            return fail(result.get("message") or "查询充值订单失败", ErrorCode.UPSTREAM_ERROR, data={"order": result})
        return ok({"user": user, "order": result})

    async def enter_live_room(slot: int, room_id: str, duration_minutes: int = 16, mode: str = "api") -> Dict[str, Any]:
        user = await _require_audience(slot)
        cookie = daily_state.read_cookie(slot)
        room = await _live_room_info(cookie, room_id)
        if room.get("code") != 0:
            daily_state.log("error", f"观众 {slot} 进入直播间失败: code={room.get('code')} message={room.get('message')}")
            return fail(room.get("message") or "进入直播间失败", ErrorCode.UPSTREAM_ERROR, data={"response": room.get("response"), "actions": []})
        actions = await _enter_live_room_actions(cookie, room.get("roomId") or room_id)
        ok_actions = [item for item in actions if item.get("ok")]
        if not ok_actions:
            daily_state.log("error", f"观众 {slot} 进房动作未确认成功: {_summarize_actions(actions)}")
            return fail("进房动作未确认成功", ErrorCode.UPSTREAM_ERROR, data={"response": room.get("response"), "actions": actions})
        expires_at = datetime.now() + timedelta(minutes=max(duration_minutes, 1))
        old_task = daily_state.entry_tasks.pop(slot, None)
        if old_task and not old_task.done():
            old_task.cancel()
        daily_state.entry_tasks[slot] = asyncio.create_task(
            _keep_live_room_active(slot, user["name"], cookie, room.get("roomId") or room_id, max(duration_minutes, 1))
        )
        api_watch = await _start_live_watch_api(slot, user["name"], cookie, room.get("roomId") or room_id, max(duration_minutes, 1))
        browser = None
        if mode in ("browser", "headless"):
            browser = await _open_live_room_browser(slot, user["name"], cookie, room.get("roomId") or room_id, max(duration_minutes, 1), headless=mode == "headless")
            if not browser.get("success"):
                daily_state.log("error", f"观众 {slot} 浏览器进房失败: {browser.get('error')}")
                return fail(browser.get("error") or "浏览器进房失败", ErrorCode.INTERNAL_ERROR, data={"response": room.get("response"), "actions": actions, "apiWatch": api_watch, "browser": browser})
        daily_state.live_entries[slot] = {
            "roomId": room.get("roomId") or room_id,
            "shortId": room.get("shortId"),
            "title": room.get("title"),
            "anchor": room.get("anchor"),
            "name": user["name"],
            "expiresAt": expires_at.isoformat(timespec="seconds"),
            "mode": mode,
            "actions": actions,
            "apiWatch": api_watch,
            "browser": browser,
        }
        if browser:
            daily_state.log("info", f"观众 {slot} 浏览器进房顺序: 打开 B站首页 -> 注入 Cookie -> 刷新登录态 -> 跳转直播间")
        daily_state.log("success", f"观众 {slot} {user['name']} 已进入直播间 {room.get('roomId') or room_id}，模式 {mode}，保活 {duration_minutes} 分钟")
        return ok({"response": room.get("response"), "actions": actions, "apiWatch": api_watch, "browser": browser, "entry": daily_state.live_entries[slot]})

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
        success = payload.get("code") == 0
        daily_state.log("success" if success else "error", f"观众 {slot} {user['name']} 发送弹幕: code={payload.get('code')} message={payload.get('message') or payload.get('msg') or text}")
        if not success:
            return fail(payload.get("message") or payload.get("msg") or "发送弹幕失败", ErrorCode.UPSTREAM_ERROR, data={"response": payload})
        return ok({"response": payload})

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
        success = payload.get("code") == 0
        daily_state.log("success" if success else "error", f"观众 {slot} {user['name']} 赠送牛蛙: code={payload.get('code')} message={payload.get('message') or payload.get('msg')}; 钱包余额 {wallet.get('goldText', '-')}")
        if not success:
            return fail(payload.get("message") or payload.get("msg") or "赠送礼物失败", ErrorCode.UPSTREAM_ERROR, data={"response": payload, "wallet": wallet})
        return ok({"response": payload, "wallet": wallet})

    def _normalize_workflow(config: dict[str, Any]) -> dict[str, Any]:
        daily_state.load_workflows()
        workflow_id = str(config.get("id") or uuid.uuid4())
        now_text = datetime.now().isoformat(timespec="seconds")
        existing = daily_state.find_workflow(workflow_id) or {}
        actions = config.get("actions") if isinstance(config.get("actions"), list) else []
        workflow = {
            **existing,
            "id": workflow_id,
            "name": str(config.get("name") or existing.get("name") or "每日自动化工作流").strip(),
            "enabled": bool(config.get("enabled", existing.get("enabled", True))),
            "slot": int(config.get("slot", existing.get("slot", 0))),
            "roomId": str(config.get("roomId") or existing.get("roomId") or "").strip(),
            "durationMinutes": int(config.get("durationMinutes") or existing.get("durationMinutes") or 16),
            "danmakuCount": max(1, int(config.get("danmakuCount") or existing.get("danmakuCount") or 1)),
            "giftCount": max(1, int(config.get("giftCount") or existing.get("giftCount") or 1)),
            "entryMode": str(config.get("entryMode") or existing.get("entryMode") or "browser"),
            "message": str(config.get("message") or existing.get("message") or ""),
            "actions": actions or existing.get("actions") or ["validate", "wallet", "enterLiveRoom"],
            "targetTime": str(config.get("targetTime") or existing.get("targetTime") or ""),
            "repeat": str(config.get("repeat") or existing.get("repeat") or "daily"),
            "updatedAt": now_text,
            "createdAt": existing.get("createdAt") or now_text,
            "lastRunAt": existing.get("lastRunAt"),
            "lastStatus": existing.get("lastStatus", "idle"),
            "lastError": existing.get("lastError", ""),
            "nextRunAt": "",
        }
        _check_slot(workflow["slot"])
        if not workflow["roomId"]:
            raise ValueError("请输入直播间号")
        if not workflow["targetTime"]:
            raise ValueError("请选择定时触发时间")
        workflow["nextRunAt"] = _workflow_next_run_at(workflow)
        return workflow

    async def save_workflow(config: dict[str, Any]) -> Dict[str, Any]:
        workflow = _normalize_workflow(config)
        daily_state.workflows = [item for item in daily_state.workflows if item.get("id") != workflow["id"]]
        daily_state.workflows.insert(0, workflow)
        daily_state.save_workflows()
        _schedule_workflow(workflow)
        daily_state.log("success", f"已保存每日自动化工作流 {workflow['name']}，下次触发 {workflow.get('nextRunAt') or '-'}")
        return ok({"workflow": workflow, "workflows": daily_state.workflows})

    async def delete_workflow(workflow_id: str) -> Dict[str, Any]:
        daily_state.load_workflows()
        task = daily_state.workflow_tasks.pop(workflow_id, None)
        if task and not task.done():
            task.cancel()
        before = len(daily_state.workflows)
        daily_state.workflows = [item for item in daily_state.workflows if item.get("id") != workflow_id]
        daily_state.save_workflows()
        if len(daily_state.workflows) == before:
            return fail("工作流不存在", ErrorCode.NOT_FOUND)
        daily_state.log("warning", f"已删除每日自动化工作流 {workflow_id}")
        return ok({"workflows": daily_state.workflows})

    async def run_workflow(workflow_id: str) -> Dict[str, Any]:
        workflow = daily_state.find_workflow(workflow_id)
        if not workflow:
            return fail("工作流不存在", ErrorCode.NOT_FOUND)
        result = await _execute_workflow(workflow, manual=True)
        return ok({"workflow": workflow, "result": result})

    def _schedule_workflow(workflow: dict[str, Any]) -> None:
        workflow_id = str(workflow.get("id") or "")
        if not workflow_id:
            return
        task = daily_state.workflow_tasks.pop(workflow_id, None)
        if task and not task.done():
            task.cancel()
        if not workflow.get("enabled"):
            return
        seconds = _workflow_seconds_until(workflow.get("nextRunAt"))
        if seconds <= 0:
            workflow["nextRunAt"] = _workflow_next_run_at(workflow)
            seconds = _workflow_seconds_until(workflow.get("nextRunAt"))
        if seconds <= 0:
            return
        daily_state.workflow_tasks[workflow_id] = asyncio.create_task(_run_workflow_later(workflow_id, seconds))

    async def _run_workflow_later(workflow_id: str, seconds: int) -> None:
        try:
            await asyncio.sleep(seconds)
            workflow = daily_state.find_workflow(workflow_id)
            if workflow and workflow.get("enabled"):
                await _execute_workflow(workflow, manual=False)
        except asyncio.CancelledError:
            pass

    async def _execute_workflow(workflow: dict[str, Any], manual: bool = False) -> list[dict[str, Any]]:
        workflow["lastRunAt"] = datetime.now().isoformat(timespec="seconds")
        workflow["lastStatus"] = "running"
        workflow["lastError"] = ""
        daily_state.save_workflows()
        daily_state.log("warning", f"开始执行每日自动化工作流 {workflow.get('name')} ({'手动' if manual else '定时'})")
        results: list[dict[str, Any]] = []
        try:
            for action in workflow.get("actions", []):
                result = await _execute_workflow_action(workflow, str(action))
                results.append(result)
                if not result.get("ok"):
                    raise RuntimeError(result.get("error") or f"{action} 执行失败")
                await asyncio.sleep(0.8)
            workflow["lastStatus"] = "success"
            daily_state.log("success", f"每日自动化工作流 {workflow.get('name')} 执行完成")
        except Exception as exc:
            workflow["lastStatus"] = "error"
            workflow["lastError"] = str(exc)
            daily_state.log("error", f"每日自动化工作流 {workflow.get('name')} 执行失败: {exc}")
        finally:
            if workflow.get("repeat") == "once" and not manual:
                workflow["enabled"] = False
            workflow["nextRunAt"] = _workflow_next_run_at(workflow) if workflow.get("enabled") else ""
            daily_state.save_workflows()
            _schedule_workflow(workflow)
        return results

    async def _execute_workflow_action(workflow: dict[str, Any], action: str) -> dict[str, Any]:
        slot = int(workflow.get("slot", 0))
        room_id = str(workflow.get("roomId") or "")
        try:
            if action == "validate":
                response = await validate_audience(slot)
            elif action == "wallet":
                response = await wallet(slot)
            elif action == "enterLiveRoom":
                response = await enter_live_room(slot, room_id, int(workflow.get("durationMinutes") or 16), str(workflow.get("entryMode") or "browser"))
            elif action == "sendDanmaku":
                responses = []
                for _ in range(max(1, int(workflow.get("danmakuCount") or 1))):
                    responses.append(await send_danmaku(slot, room_id, str(workflow.get("message") or "")))
                    await asyncio.sleep(0.8)
                response = ok({"responses": responses})
            elif action == "sendGift":
                responses = []
                for _ in range(max(1, int(workflow.get("giftCount") or 1))):
                    responses.append(await send_gift(slot, room_id))
                    await asyncio.sleep(0.8)
                response = ok({"responses": responses})
            else:
                return {"action": action, "ok": False, "error": "未知动作"}
            return {"action": action, "ok": bool(response.get("ok", True)), "response": response}
        except Exception as exc:
            return {"action": action, "ok": False, "error": str(exc)}

    daily_state.load_workflows()
    for workflow_item in daily_state.workflows:
        _schedule_workflow(workflow_item)

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
    ipc.register_handler("daily:saveWorkflow", save_workflow)
    ipc.register_handler("daily:deleteWorkflow", delete_workflow)
    ipc.register_handler("daily:runWorkflow", run_workflow)


def _parse_workflow_time(value: Any) -> datetime:
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _workflow_seconds_until(value: Any) -> int:
    if not value:
        return 0
    try:
        target = _parse_workflow_time(value)
        now = datetime.now(target.tzinfo) if target.tzinfo else datetime.now()
        return max(0, int((target - now).total_seconds()))
    except (TypeError, ValueError):
        return 0


def _workflow_next_run_at(workflow: dict[str, Any]) -> str:
    target_time = workflow.get("targetTime")
    if not target_time or not workflow.get("enabled", True):
        return ""
    try:
        target = _parse_workflow_time(target_time)
    except (TypeError, ValueError):
        return ""
    now = datetime.now(target.tzinfo) if target.tzinfo else datetime.now()
    if workflow.get("repeat") == "daily":
        while target <= now:
            target += timedelta(days=1)
    elif target <= now:
        return ""
    return target.isoformat(timespec="seconds")


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


async def _refresh_cookie_via_homepage(cookie: str) -> str:
    try:
        async with create_client(timeout=12.0, follow_redirects=True) as client:
            response = await client.get("https://www.bilibili.com/", headers=_headers(cookie, "https://www.bilibili.com/"))
        updates = [header.split(";", 1)[0].strip() for header in response.headers.get_list("set-cookie") if "=" in header.split(";", 1)[0]]
        return _merge_cookie_string(cookie, "; ".join(updates)) if updates else cookie
    except Exception:
        return cookie


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
            alive_ok = room.get("code") == 0 and any(item.get("ok") for item in actions)
            daily_state.log("success" if alive_ok else "error", f"观众 {slot} {name} 直播间保活: {_summarize_actions(actions)}")
        entry = daily_state.live_entries.get(slot)
        if entry and str(entry.get("roomId")) == str(room_id):
            entry["expired"] = True
        daily_state.log("info", f"观众 {slot} {name} 直播间 {room_id} 保活结束")
    except asyncio.CancelledError:
        daily_state.log("info", f"观众 {slot} {name} 直播间 {room_id} 保活已替换")


async def _start_live_watch_api(slot: int, name: str, cookie: str, room_id: str, duration_minutes: int) -> dict[str, Any]:
    old_task = daily_state.api_watch_tasks.pop(slot, None)
    if old_task and not old_task.done():
        old_task.cancel()
    result = await _live_watch_api_enter(cookie, room_id)
    if not result.get("ok"):
        error_msg = (result.get("error") if isinstance(result.get("error"), str) else None) or "API 观看心跳启动失败"
        daily_state.log("error", f"观众 {slot} {name} {error_msg}")
        return result
    context = result.get("data") or {}
    daily_state.api_watch_tasks[slot] = asyncio.create_task(_live_watch_api_loop(slot, name, cookie, context, duration_minutes))
    daily_state.log("success", f"观众 {slot} {name} API 观看心跳已启动: interval={context.get('heartbeatInterval')}s")
    return context


async def _live_watch_api_enter(cookie: str, room_id: str) -> dict[str, Any]:
    try:
        async with create_client(timeout=15.0) as client:
            base = (await client.get(
                "https://api.live.bilibili.com/xlive/web-room/v1/index/getRoomBaseInfo",
                params={"room_ids": room_id, "req_biz": "web_heartbeat"},
                headers=_headers(cookie, f"https://live.bilibili.com/{room_id}"),
            )).json()
            room_map = base.get("data", {}).get("by_room_ids", {}) if isinstance(base.get("data"), dict) else {}
            room_info = room_map.get(str(room_id)) or next(iter(room_map.values()), {})
            if base.get("code") != 0 or not room_info:
                return fail(base.get("message") or "房间心跳基础信息获取失败", ErrorCode.UPSTREAM_ERROR, data={"response": base})
            buvid = _cookie_value(cookie, "LIVE_BUVID") or _cookie_value(cookie, "buvid3") or str(uuid.uuid4())
            context = {
                "roomId": str(room_info.get("room_id") or room_id),
                "parentAreaId": room_info.get("parent_area_id"),
                "areaId": room_info.get("area_id"),
                "ruid": room_info.get("uid"),
                "buvid": buvid,
                "deviceId": str(uuid.uuid4()),
                "seq": 0,
                "ua": bilibili_service.user_agent,
                "trackid": "-999998",
            }
            csrf = _csrf(cookie)
            enter = (await client.post(
                "https://live-trace.bilibili.com/xlive/data-interface/v1/x25Kn/E",
                data={**_live_watch_enter_payload(context), "csrf_token": csrf, "csrf": csrf, "visit_id": "", "web_location": "444.8"},
                headers={**_headers(cookie, f"https://live.bilibili.com/{room_id}"), "Content-Type": "application/x-www-form-urlencoded"},
            )).json()
        if enter.get("code") != 0:
            fallback = await _live_watch_web_heartbeat(cookie, room_id, 60)
            if fallback.get("code") == 0:
                context.update({
                    "mode": "api-watch-web-fallback",
                    "heartbeatInterval": int(fallback.get("nextInterval") or 60),
                    "enterResponse": enter,
                    "webHeartbeat": fallback,
                })
                return ok(context)
            return fail(enter.get("message") or enter.get("msg") or "观看进入心跳失败", ErrorCode.UPSTREAM_ERROR, data={**context, "response": enter, "webHeartbeat": fallback})
        data = enter.get("data", {}) if isinstance(enter.get("data"), dict) else {}
        web_heartbeat = await _live_watch_web_heartbeat(cookie, context["roomId"], int(data.get("heartbeat_interval") or 60))
        context.update({
            "mode": "api-watch",
            "timestamp": data.get("timestamp"),
            "heartbeatInterval": int(data.get("heartbeat_interval") or 60),
            "secretKey": data.get("secret_key"),
            "secretRule": data.get("secret_rule"),
            "enterResponse": enter,
            "webHeartbeat": web_heartbeat,
        })
        return ok(context)
    except Exception as exc:
        return fail(str(exc))


async def _live_watch_api_loop(slot: int, name: str, cookie: str, context: dict[str, Any], duration_minutes: int) -> None:
    end_ts = time.time() + duration_minutes * 60
    interval = int(context.get("heartbeatInterval") or 60)
    try:
        while time.time() + 3 < end_ts:
            await asyncio.sleep(min(interval, max(1, end_ts - time.time())))
            if time.time() >= end_ts:
                break
            if context.get("mode") == "api-watch-web-fallback":
                result = await _live_watch_web_heartbeat(cookie, str(context.get("roomId")), interval)
                heartbeat_ok = result.get("code") == 0
                daily_state.log("success" if heartbeat_ok else "error", f"观众 {slot} {name} Web 观看心跳: code={result.get('code')} {result.get('message') or ''}".strip())
            else:
                result = await _live_watch_api_heartbeat(cookie, context, interval)
                web_result = await _live_watch_web_heartbeat(cookie, str(context.get("roomId")), int(context.get("heartbeatInterval") or interval))
                heartbeat_ok = result.get("code") == 0 or web_result.get("code") == 0
                daily_state.log("success" if heartbeat_ok else "error", f"观众 {slot} {name} API 观看心跳: x25={result.get('code')} web={web_result.get('code')} {result.get('message') or web_result.get('message') or ''}".strip())
        daily_state.log("info", f"观众 {slot} {name} API 观看心跳结束")
    except asyncio.CancelledError:
        daily_state.log("info", f"观众 {slot} {name} API 观看心跳已替换")


async def _live_watch_api_heartbeat(cookie: str, context: dict[str, Any], watch_time: int) -> dict[str, Any]:
    context["seq"] = int(context.get("seq") or 0) + 1
    context["watchTime"] = watch_time
    payload = _live_watch_heartbeat_payload(context)
    try:
        csrf = _csrf(cookie)
        async with create_client(timeout=15.0) as client:
            response = (await client.post(
                "https://live-trace.bilibili.com/xlive/data-interface/v1/x25Kn/X",
                data={**payload, "csrf_token": csrf, "csrf": csrf, "visit_id": "", "web_location": "444.8"},
                headers={**_headers(cookie, f"https://live.bilibili.com/{context.get('roomId')}"), "Content-Type": "application/x-www-form-urlencoded"},
            )).json()
        data = response.get("data", {}) if isinstance(response.get("data"), dict) else {}
        if data.get("heartbeat_interval"):
            context["heartbeatInterval"] = int(data.get("heartbeat_interval") or context.get("heartbeatInterval") or 60)
        if data.get("timestamp"):
            context["timestamp"] = data.get("timestamp")
        if data.get("secret_key"):
            context["secretKey"] = data.get("secret_key")
        if data.get("secret_rule"):
            context["secretRule"] = data.get("secret_rule")
        return {"code": response.get("code"), "message": response.get("message") or response.get("msg"), "response": response}
    except Exception as exc:
        return {"code": -1, "message": str(exc)}


def _live_watch_enter_payload(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": _json_dumps([context.get("parentAreaId"), context.get("areaId"), context.get("seq"), int(context.get("roomId"))]),
        "device": _json_dumps([str(context.get("buvid") or ""), str(context.get("deviceId") or "")]),
        "ruid": context.get("ruid"),
        "ts": int(time.time() * 1000),
        "is_patch": 0,
        "heart_beat": "[]",
        "ua": context.get("ua") or bilibili_service.user_agent,
    }


def _live_watch_heartbeat_payload(context: dict[str, Any]) -> dict[str, Any]:
    data = {
        "id": _json_dumps([context.get("parentAreaId"), context.get("areaId"), context.get("seq"), int(context.get("roomId"))]),
        "device": _json_dumps([str(context.get("buvid") or ""), str(context.get("deviceId") or "")]),
        "ruid": context.get("ruid"),
        "ets": context.get("timestamp"),
        "benchmark": context.get("secretKey"),
        "time": context.get("watchTime") or context.get("heartbeatInterval") or 60,
        "ts": int(time.time() * 1000),
        "ua": context.get("ua") or bilibili_service.user_agent,
        "trackid": context.get("trackid") or "-999998",
    }
    return {"s": _live_watch_sign(data, context.get("secretRule")), **data}


def _live_watch_sign(data: dict[str, Any], secret_rule: Any) -> str:
    parent_id, area_id, seq_id, room_id = json.loads(str(data["id"]))
    buvid, device_id = json.loads(str(data["device"]))
    value = _json_dumps({
        "platform": "web",
        "parent_id": parent_id,
        "area_id": area_id,
        "seq_id": seq_id,
        "room_id": room_id,
        "buvid": buvid,
        "uuid": device_id,
        "ets": data.get("ets"),
        "time": data.get("time"),
        "ts": data.get("ts"),
    })
    key = str(data.get("benchmark") or "").encode("utf-8")
    digest_map = {
        0: "md5",
        1: "sha1",
        2: "sha256",
        3: "sha224",
        4: "sha512",
        5: "sha384",
    }
    if isinstance(secret_rule, str):
        try:
            secret_rule = json.loads(secret_rule)
        except ValueError:
            secret_rule = []
    rules = secret_rule if isinstance(secret_rule, list) else []
    for item in rules:
        digest = digest_map.get(_to_int(item))
        if digest:
            value = hmac.new(key, value.encode("utf-8"), digestmod=digest).hexdigest()
    return value


async def _live_watch_web_heartbeat(cookie: str, room_id: str, interval: int) -> dict[str, Any]:
    heartbeat = f"{max(int(interval or 60), 1)}|{room_id}|1|0"
    hb = base64.b64encode(heartbeat.encode("utf-8")).decode("ascii")
    try:
        async with create_client(timeout=12.0) as client:
            response = await client.get(
                "https://live-trace.bilibili.com/xlive/rdata-interface/v1/heartbeat/webHeartBeat",
                params={"hb": hb, "pf": "web"},
                headers=_headers(cookie, f"https://live.bilibili.com/{room_id}"),
            )
        payload = response.json()
        data = payload.get("data", {}) if isinstance(payload.get("data"), dict) else {}
        return {
            "code": payload.get("code"),
            "message": payload.get("message") or payload.get("msg"),
            "nextInterval": data.get("next_interval") or interval,
            "response": payload,
        }
    except Exception as exc:
        return {"code": -1, "message": str(exc), "nextInterval": interval}


async def _open_live_room_browser(slot: int, name: str, cookie: str, room_id: str, duration_minutes: int, headless: bool = False) -> dict[str, Any]:
    browser_path = _find_browser_executable()
    if not browser_path:
        return {"success": False, "error": "未找到 Chrome/Edge 浏览器，可在 BILITOOLS_BROWSER_PATH 指定路径"}
    close_task = daily_state.browser_tasks.pop(slot, None)
    if close_task and not close_task.done():
        close_task.cancel()
    _close_live_browser(slot)
    profile_dir = PRO_ROOT / "runtime" / "live_browser" / f"slot{slot}-{int(time.time())}"
    profile_dir.mkdir(parents=True, exist_ok=True)
    cookies = _browser_cookie_items(cookie)
    if not cookies:
        return {"success": False, "error": "观众 Cookie 为空，无法注入浏览器"}
    base_url = "https://www.bilibili.com/"
    live_url = f"https://live.bilibili.com/{room_id}?live_from=86001&spm_id_from=444.8.real_browser.0"
    args = [
        browser_path,
        f"--user-data-dir={profile_dir}",
        "--remote-debugging-port=0",
        "--no-first-run",
        "--no-default-browser-check",
        "--autoplay-policy=no-user-gesture-required",
        "--mute-audio",
        "--new-window",
        base_url,
    ]
    if headless:
        args.insert(1, "--headless=new")
        args.insert(2, "--disable-gpu")
    if sys.platform.startswith("linux"):
        args.insert(1, "--no-sandbox")
    try:
        process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as exc:
        shutil.rmtree(profile_dir, ignore_errors=True)
        return {"success": False, "error": str(exc), "browserPath": browser_path}
    control = await asyncio.to_thread(_drive_browser_with_cdp, profile_dir, cookies, base_url, live_url)
    if not control.get("success"):
        process.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)
        return {**control, "pid": process.pid, "browserPath": browser_path}
    daily_state.browser_processes[slot] = process
    daily_state.browser_profiles[slot] = profile_dir
    daily_state.browser_tasks[slot] = asyncio.create_task(_close_live_browser_later(slot, name, room_id, duration_minutes))
    return {
        "success": True,
        "mode": "real-browser",
        "browserPath": browser_path,
        "pid": process.pid,
        "profile": str(profile_dir),
        "baseUrl": base_url,
        "url": live_url,
        "cookieCount": len(cookies),
        "sequence": "open-bilibili-refresh-then-live-room",
        "control": control,
    }


async def _close_live_browser_later(slot: int, name: str, room_id: str, duration_minutes: int) -> None:
    try:
        await asyncio.sleep(duration_minutes * 60)
        _close_live_browser(slot)
        daily_state.log("info", f"观众 {slot} {name} 真实浏览器直播间 {room_id} 已按时关闭")
    except asyncio.CancelledError:
        pass


def _drive_browser_with_cdp(profile_dir: Path, cookies: list[dict[str, str]], base_url: str, live_url: str) -> dict[str, Any]:
    try:
        ws_url = _wait_for_page_ws(profile_dir)
        cdp = _MiniCDP(ws_url)
        cdp.call("Network.enable")
        cdp.call("Page.enable")
        expires = int(time.time()) + 3600 * 24 * 30
        cdp.call("Network.setCookies", {"cookies": [
            {"name": item["name"], "value": item["value"], "domain": ".bilibili.com", "path": "/", "secure": True, "httpOnly": item["name"] in {"SESSDATA"}, "expires": expires}
            for item in cookies
        ]})
        cdp.call("Page.navigate", {"url": base_url})
        time.sleep(2)
        cdp.call("Page.reload", {"ignoreCache": True})
        time.sleep(2)
        nav = cdp.call("Runtime.evaluate", {"expression": "document.cookie.includes('DedeUserID') || document.cookie.includes('SESSDATA')", "returnByValue": True})
        cdp.call("Page.navigate", {"url": live_url})
        time.sleep(1)
        current = cdp.call("Runtime.evaluate", {"expression": "location.href", "returnByValue": True})
        cdp.close()
        return {
            "success": True,
            "method": "cdp",
            "homepageRefreshed": True,
            "loginCookieVisible": nav.get("result", {}).get("result", {}).get("value"),
            "currentUrl": current.get("result", {}).get("result", {}).get("value"),
        }
    except Exception as exc:
        return {"success": False, "error": f"CDP 控制浏览器失败: {exc}"}


def _wait_for_page_ws(profile_dir: Path) -> str:
    port_file = profile_dir / "DevToolsActivePort"
    deadline = time.time() + 12
    port = ""
    while time.time() < deadline:
        if port_file.exists():
            lines = port_file.read_text(encoding="utf-8", errors="ignore").splitlines()
            if lines:
                port = lines[0].strip()
                break
        time.sleep(0.1)
    if not port:
        raise RuntimeError("未获取到 Chrome DevTools 端口")
    deadline = time.time() + 8
    while time.time() < deadline:
        try:
            with urlopen(f"http://127.0.0.1:{port}/json/list", timeout=2) as response:
                pages = json.loads(response.read().decode("utf-8"))
            for page in pages:
                if page.get("type") == "page" and page.get("webSocketDebuggerUrl"):
                    return page["webSocketDebuggerUrl"]
        except Exception:
            pass
        time.sleep(0.2)
    raise RuntimeError("未获取到可控制的浏览器页面")


class _MiniCDP:
    def __init__(self, ws_url: str) -> None:
        parsed = urlparse(ws_url)
        self.sock = socket.create_connection((parsed.hostname or "127.0.0.1", parsed.port or 80), timeout=8)
        key = base64.b64encode(secrets.token_bytes(16)).decode("ascii")
        path = parsed.path + (f"?{parsed.query}" if parsed.query else "")
        request = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {parsed.hostname}:{parsed.port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(request.encode("ascii"))
        response = self.sock.recv(4096)
        if b" 101 " not in response.split(b"\r\n", 1)[0]:
            raise RuntimeError("WebSocket 握手失败")
        self.next_id = 1

    def call(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        msg_id = self.next_id
        self.next_id += 1
        self._send_json({"id": msg_id, "method": method, "params": params or {}})
        deadline = time.time() + 10
        while time.time() < deadline:
            message = self._recv_json()
            if message.get("id") == msg_id:
                if message.get("error"):
                    raise RuntimeError(f"{method}: {message['error']}")
                return message
        raise RuntimeError(f"{method}: 等待响应超时")

    def close(self) -> None:
        try:
            self.sock.close()
        except Exception:
            pass

    def _send_json(self, payload: dict[str, Any]) -> None:
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        header = bytearray([0x81])
        if len(data) < 126:
            header.append(0x80 | len(data))
        elif len(data) < 65536:
            header.extend([0x80 | 126, (len(data) >> 8) & 255, len(data) & 255])
        else:
            header.append(0x80 | 127)
            header.extend(len(data).to_bytes(8, "big"))
        mask = secrets.token_bytes(4)
        masked = bytes(byte ^ mask[i % 4] for i, byte in enumerate(data))
        self.sock.sendall(bytes(header) + mask + masked)

    def _recv_json(self) -> dict[str, Any]:
        first = self._recv_exact(2)
        opcode = first[0] & 0x0F
        length = first[1] & 0x7F
        if length == 126:
            length = int.from_bytes(self._recv_exact(2), "big")
        elif length == 127:
            length = int.from_bytes(self._recv_exact(8), "big")
        if first[1] & 0x80:
            mask = self._recv_exact(4)
            payload = bytes(byte ^ mask[i % 4] for i, byte in enumerate(self._recv_exact(length)))
        else:
            payload = self._recv_exact(length)
        if opcode == 8:
            raise RuntimeError("WebSocket 已关闭")
        return json.loads(payload.decode("utf-8"))

    def _recv_exact(self, size: int) -> bytes:
        chunks = bytearray()
        while len(chunks) < size:
            chunk = self.sock.recv(size - len(chunks))
            if not chunk:
                raise RuntimeError("WebSocket 连接中断")
            chunks.extend(chunk)
        return bytes(chunks)


def _close_live_browser(slot: int) -> None:
    process = daily_state.browser_processes.pop(slot, None)
    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
    profile = daily_state.browser_profiles.pop(slot, None)
    if profile:
        shutil.rmtree(profile, ignore_errors=True)


def _find_browser_executable() -> str:
    settings = app_settings_service.get()
    configured = os.getenv("BILITOOLS_BROWSER_PATH") or settings.get("dailyBrowserPath") or settings.get("browserPath") or ""
    if configured and Path(configured).exists():
        return configured
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "msedge", "chrome"):
        path = shutil.which(name)
        if path:
            return path
    if sys.platform.startswith("win"):
        candidates = [
            Path(os.environ.get("PROGRAMFILES", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
            Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
            Path(os.environ.get("LOCALAPPDATA", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
            Path(os.environ.get("PROGRAMFILES", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
            Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        ]
        for candidate in candidates:
            if candidate.exists():
                return str(candidate)
    return ""


def _browser_cookie_items(cookie: str) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for part in cookie.split(";"):
        name, _, value = part.strip().partition("=")
        if name and value:
            items.append({"name": name, "value": value})
    return items


def _write_cookie_loader_extension(extension_dir: Path, cookies: list[dict[str, str]], base_url: str, live_url: str) -> None:
    manifest = {
        "manifest_version": 3,
        "name": "BiliTools Live Cookie Loader",
        "version": "1.0.0",
        "permissions": ["cookies", "tabs"],
        "host_permissions": ["https://*.bilibili.com/*", "https://*.hdslb.com/*"],
        "background": {"service_worker": "background.js"},
    }
    background = f"""
const COOKIES = {json.dumps(cookies, ensure_ascii=False)};
const BASE_URL = {json.dumps(base_url, ensure_ascii=False)};
const LIVE_URL = {json.dumps(live_url, ensure_ascii=False)};
const EXPIRATION = Math.floor(Date.now() / 1000) + 3600 * 24 * 30;

function setCookie(item) {{
  return new Promise((resolve) => {{
    chrome.cookies.set({{
      url: "https://www.bilibili.com/",
      domain: ".bilibili.com",
      path: "/",
      name: item.name,
      value: item.value,
      secure: true,
      expirationDate: EXPIRATION
    }}, () => resolve(chrome.runtime.lastError ? chrome.runtime.lastError.message : "ok"));
  }});
}}

async function run() {{
  for (const item of COOKIES) {{
    await setCookie(item);
  }}
  const tabs = await chrome.tabs.query({{}});
  const first = tabs.find((tab) => tab.url === "about:blank" || (tab.url || "").startsWith("https://www.bilibili.com")) || tabs[0];
  if (first && first.id) {{
    await chrome.tabs.update(first.id, {{ url: BASE_URL, active: true }});
    setTimeout(() => chrome.tabs.reload(first.id), 1200);
    setTimeout(() => chrome.tabs.update(first.id, {{ url: LIVE_URL, active: true }}), 3600);
  }} else {{
    const tab = await chrome.tabs.create({{ url: BASE_URL, active: true }});
    setTimeout(() => chrome.tabs.reload(tab.id), 1200);
    setTimeout(() => chrome.tabs.update(tab.id, {{ url: LIVE_URL, active: true }}), 3600);
  }}
}}

chrome.runtime.onInstalled.addListener(run);
chrome.runtime.onStartup.addListener(run);
run();
"""
    (extension_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (extension_dir / "background.js").write_text(background, encoding="utf-8")


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


def _cookie_value(cookie: str, target: str) -> str:
    for part in cookie.split(";"):
        name, _, value = part.strip().partition("=")
        if name == target:
            return value
    return ""


def _merge_cookie_string(base_cookie: str, extra_cookie: str) -> str:
    values: dict[str, str] = {}
    for source in (base_cookie, extra_cookie):
        for part in source.split(";"):
            name, _, value = part.strip().partition("=")
            if name and value:
                values[name] = value
    return "; ".join(f"{name}={value}" for name, value in values.items())


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
