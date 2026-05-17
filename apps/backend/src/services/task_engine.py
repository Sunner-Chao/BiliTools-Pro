"""Scheduled Bilibili award task engine with visible logs."""
import asyncio
import hashlib
import time
import uuid
from datetime import datetime
from typing import Any

import httpx

from .bilibili import bilibili_service
from .game_config import game_config_service


class TaskEngine:
    """Runs selected resource tasks at a target time and records UI-readable logs."""

    def __init__(self) -> None:
        self._tasks: dict[str, dict[str, Any]] = {}
        self._running: dict[str, asyncio.Task[None]] = {}

    def _log(self, task_id: str, level: str, message: str) -> None:
        task = self._tasks.get(task_id)
        if not task:
            return
        task.setdefault("logs", []).append(
            {
                "time": datetime.now().strftime("%H:%M:%S"),
                "level": level,
                "message": message,
            }
        )
        task["logs"] = task["logs"][-400:]

    async def create(self, config: dict[str, Any]) -> dict[str, Any]:
        task_id = f"task_{uuid.uuid4().hex[:8]}"
        selected = config.get("selectedTasks") or []
        if not selected and config.get("game"):
            selected = game_config_service.list_tasks(config["game"])
        task = {
            "id": task_id,
            "config": {**config, "selectedTasks": selected},
            "status": "pending",
            "targetTime": config.get("targetTime"),
            "countdownSeconds": 0,
            "progress": 0,
            "results": [],
            "logs": [],
            "createdAt": datetime.now().isoformat(timespec="seconds"),
            "startedAt": None,
            "completedAt": None,
        }
        self._tasks[task_id] = task
        self._log(task_id, "info", f"已创建抢码任务，资源数量 {len(selected)}")
        return {"success": True, "task": task}

    async def start(self, task_id: str) -> dict[str, Any]:
        task = self._tasks.get(task_id)
        if not task:
            return {"success": False, "error": "Task not found"}
        if task_id in self._running:
            return {"success": False, "error": "Task already running"}
        task["status"] = "waiting" if self._is_future_target(task.get("targetTime")) else "running"
        task["countdownSeconds"] = max(0, self._seconds_until(task.get("targetTime")))
        task["startedAt"] = datetime.now().isoformat(timespec="seconds")
        self._running[task_id] = asyncio.create_task(self._run(task_id))
        self._log(task_id, "warning", "抢码任务已启动")
        return {"success": True}

    async def stop(self, task_id: str) -> dict[str, Any]:
        task = self._tasks.get(task_id)
        if not task:
            return {"success": False, "error": "Task not found"}
        running = self._running.pop(task_id, None)
        if running:
            running.cancel()
        task["status"] = "stopped"
        task["countdownSeconds"] = 0
        task["completedAt"] = datetime.now().isoformat(timespec="seconds")
        self._log(task_id, "warning", "抢码任务已停止")
        return {"success": True}

    async def delete(self, task_id: str) -> dict[str, Any]:
        running = self._running.pop(task_id, None)
        if running:
            running.cancel()
        if task_id not in self._tasks:
            return {"success": False, "error": "Task not found"}
        del self._tasks[task_id]
        return {"success": True}

    def list(self) -> list[dict[str, Any]]:
        return list(self._tasks.values())

    def get(self, task_id: str) -> dict[str, Any] | None:
        return self._tasks.get(task_id)

    async def _run(self, task_id: str) -> None:
        task = self._tasks[task_id]
        config = task["config"]
        selected = config.get("selectedTasks") or []
        interval = float(config.get("interval") or 0.3)
        holdtime = float(config.get("holdtime") or 30)
        target_time = config.get("targetTime")

        try:
            if target_time:
                await self._wait_until(task_id, target_time)

            if not await bilibili_service.is_logged_in():
                raise RuntimeError("请先登录 B 站账号")

            task["status"] = "running"
            task["countdownSeconds"] = 0
            deadline = time.monotonic() + holdtime
            completed: set[str] = set()
            self._log(task_id, "info", f"开始循环抢兑，间隔 {interval}s，自动停止 {holdtime}s")

            while time.monotonic() < deadline and len(completed) < len(selected):
                for item in selected:
                    item_id = str(item.get("id", ""))
                    if not item_id or item_id in completed:
                        continue
                    result = await self._receive(config, item)
                    task["results"].append(result)
                    self._log(task_id, result["level"], f"{result['name']}: {result['message']}")
                    if result["done"]:
                        completed.add(item_id)
                    task["progress"] = int(len(completed) / max(len(selected), 1) * 100)
                await asyncio.sleep(max(interval, 0.05))

            task["status"] = "completed" if completed else "failed"
            task["countdownSeconds"] = 0
            task["completedAt"] = datetime.now().isoformat(timespec="seconds")
            self._log(task_id, "warning", f"抢码结束，完成 {len(completed)}/{len(selected)}")
        except asyncio.CancelledError:
            self._log(task_id, "warning", "任务被取消")
        except Exception as exc:
            task["status"] = "failed"
            task["countdownSeconds"] = 0
            task["error"] = str(exc)
            task["completedAt"] = datetime.now().isoformat(timespec="seconds")
            self._log(task_id, "error", f"任务失败: {exc}")
        finally:
            self._running.pop(task_id, None)

    async def _wait_until(self, task_id: str, target_time: str) -> None:
        target = datetime.fromisoformat(target_time.replace("Z", "+00:00")).replace(tzinfo=None)
        task = self._tasks[task_id]
        task["status"] = "waiting"
        self._log(task_id, "info", f"等待目标时间 {target.strftime('%Y-%m-%d %H:%M:%S')}")
        while True:
            seconds = (target - datetime.now()).total_seconds()
            if seconds <= 0:
                task["countdownSeconds"] = 0
                self._log(task_id, "warning", "到达目标时间，开始执行")
                return
            task["countdownSeconds"] = int(seconds)
            await asyncio.sleep(min(seconds, 1))

    @staticmethod
    def _seconds_until(target_time: Any) -> int:
        if not target_time:
            return 0
        try:
            target = datetime.fromisoformat(str(target_time).replace("Z", "+00:00")).replace(tzinfo=None)
            return max(0, int((target - datetime.now()).total_seconds()))
        except ValueError:
            return 0

    @classmethod
    def _is_future_target(cls, target_time: Any) -> bool:
        return cls._seconds_until(target_time) > 0

    async def _receive(self, config: dict[str, Any], item: dict[str, Any]) -> dict[str, Any]:
        item = await self._enrich_task_item(item, config)
        cookie = bilibili_service.cookie_string
        csrf = bilibili_service.csrf_token
        name = item.get("name") or item.get("taskName") or item.get("id")
        activity_id = item.get("activityId") or item.get("activity_id")
        if not activity_id:
            reason = item.get("queryError") or item.get("queryMessage") or "mission/info 未返回 activity_id，已跳过领取"
            return {
                "taskId": item.get("id"),
                "name": name,
                "code": item.get("queryCode"),
                "message": reason,
                "done": False,
                "level": "error",
                "activityId": None,
                "awardName": item.get("awardName") or item.get("award_name"),
            }
        wts, w_rid = self._generate_wbi_signature()
        payload = {
            "csrf": csrf,
            "task_id": item.get("id"),
            "activity_id": activity_id,
            "activity_name": item.get("activityName") or item.get("activity_name") or "",
            "task_name": item.get("taskName") or item.get("name", ""),
            "reward_name": item.get("awardName") or item.get("award_name") or item.get("name", ""),
            "gaia_vtoken": "",
            "receive_from": "missionPage",
        }
        headers = {
            "Cookie": cookie,
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": bilibili_service.user_agent,
            "Referer": f"https://www.bilibili.com/blackboard/new-award-exchange.html?task_id={item.get('id')}",
            "Origin": "https://www.bilibili.com",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://api.bilibili.com/x/activity_components/mission/receive",
                params={"w_rid": w_rid, "wts": wts},
                data=payload,
                headers=headers,
            )
        data = response.json()
        code = data.get("code")
        message = data.get("message") or data.get("msg") or str(data)
        done = code in (0, 202031)
        level = "success" if done else ("warning" if code in (202120, 75255) else "error")
        cdkey = None
        if done and (item.get("awardName") or item.get("award_name")) and (item.get("activityId") or item.get("activity_id")):
            cdkey = await self._query_cdkey(item, config)
            if cdkey:
                message = f"{message}，兑换码: {cdkey}"
        return {
            "taskId": item.get("id"),
            "name": name,
            "code": code,
            "message": message,
            "done": done,
            "level": level,
            "cdkey": cdkey,
            "activityId": item.get("activityId") or item.get("activity_id"),
            "awardName": item.get("awardName") or item.get("award_name"),
        }

    async def _enrich_task_item(self, item: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
        """Query mission/info to fill activity_id, activity_name, award_name and stock."""
        if item.get("activityId") and item.get("awardName"):
            return item
        task_id = item.get("id")
        if not task_id:
            return item
        web_location = config.get("webLocation") or 888.81821
        wts, w_rid = self._generate_wbi_signature(task_id=task_id, web_location=web_location)
        params = {"task_id": task_id, "web_location": web_location, "w_rid": w_rid, "wts": wts}
        headers = {
            "Cookie": bilibili_service.cookie_string,
            "User-Agent": bilibili_service.user_agent,
            "Referer": f"https://www.bilibili.com/blackboard/era/award-exchange.html?task_id={task_id}",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                data = (await client.get(
                    "https://api.bilibili.com/x/activity_components/mission/info",
                    params=params,
                    headers=headers,
                )).json()
            if data.get("code") != 0:
                return {**item, "queryCode": data.get("code"), "queryMessage": data.get("message") or data.get("msg")}
            task_data = data.get("data", {})
            reward_info = task_data.get("reward_info", {}) or {}
            stock_info = task_data.get("stock_info", {}) or {}
            return {
                **item,
                "activityId": task_data.get("act_id"),
                "activityName": task_data.get("act_name"),
                "taskName": task_data.get("task_name"),
                "awardName": reward_info.get("award_name") or item.get("awardName"),
                "dayStock": stock_info.get("day_stock"),
                "totalStock": stock_info.get("total_stock"),
                "taskStatus": task_data.get("status"),
                "wts": wts,
                "wRid": w_rid,
            }
        except Exception as exc:
            return {**item, "queryError": str(exc)}

    async def _query_cdkey(self, item: dict[str, Any], config: dict[str, Any]) -> str | None:
        activity_id = item.get("activityId") or item.get("activity_id")
        award_name = item.get("awardName") or item.get("award_name")
        if not activity_id or not award_name:
            return None
        web_location = config.get("webLocation") or 888.81821
        wts, w_rid = self._generate_wbi_signature(activity_id=activity_id, web_location=web_location)
        params = {"activity_id": activity_id, "web_location": web_location, "w_rid": w_rid, "wts": wts}
        headers = {
            "Cookie": bilibili_service.cookie_string,
            "User-Agent": bilibili_service.user_agent,
            "Referer": "https://www.bilibili.com/blackboard/era/award-exchange.html",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                data = (await client.get(
                    "https://api.bilibili.com/x/activity_components/mission/mylist",
                    params=params,
                    headers=headers,
                )).json()
            if data.get("code") != 0:
                return None
            for record in data.get("data", {}).get("list", []) or []:
                if record.get("award_name") == award_name:
                    return (record.get("extra_info") or {}).get("cdkey_content")
        except Exception:
            return None
        return None

    @staticmethod
    def _generate_wbi_signature(**kwargs: Any) -> tuple[int, str]:
        wts = int(time.time())
        params = {**kwargs, "wts": wts}
        query_string = "&".join(f"{key}={params[key]}" for key in sorted(params.keys()))
        salt = "ea1db124af3c7062474693fa704f4ff8"
        return wts, hashlib.md5((query_string + salt).encode("utf-8")).hexdigest()


task_engine = TaskEngine()
