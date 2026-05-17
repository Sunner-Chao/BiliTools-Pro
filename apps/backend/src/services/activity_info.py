"""Activity overview helpers migrated from the original tool."""
import re
import time
from datetime import datetime
from typing import Any

import httpx

from .bilibili import bilibili_service
from .game_config import game_config_service


class ActivityInfoService:
    """Fetch live days, submit count and page-level activity hints for the UI."""

    async def fetch_overview(self, game: str, source_url: str | None = None) -> dict[str, Any]:
        config = game_config_service.get_config(game)
        user = await bilibili_service.get_user_info()
        cookie = bilibili_service.cookie_string
        headers = {
            "User-Agent": bilibili_service.user_agent,
            "Cookie": cookie,
            "Referer": source_url or config.get("source_url") or "https://www.bilibili.com",
        }
        live_days = await self._fetch_live_days(config, headers)
        submit_count = await self._fetch_submit_count(user.get("mid") or user.get("uid"), headers)
        page_info = await self._fetch_page_info(source_url or config.get("source_url"), headers)
        return {
            "success": True,
            "game": game,
            "activityTitle": page_info.get("title") or config.get("area_name") or game,
            "sourceUrl": source_url or config.get("source_url", ""),
            "activityId": config.get("activity_id", ""),
            "liveDays": live_days,
            "submitCount": submit_count,
            "countdownSeconds": page_info.get("countdownSeconds"),
            "endTime": page_info.get("endTime"),
            "fetchedAt": datetime.now().isoformat(timespec="seconds"),
        }

    async def _fetch_live_days(self, config: dict[str, Any], headers: dict[str, str]) -> int | None:
        task_ids = str(config.get("live_task_ids") or "").strip()
        if not task_ids:
            return None
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                data = (await client.get(
                    "https://api.bilibili.com/x/task/totalv2",
                    params={"task_ids": task_ids},
                    headers=headers,
                )).json()
            if data.get("code") != 0:
                return None
            payload = data.get("data", {})
            if isinstance(payload, dict):
                for value in payload.values():
                    if isinstance(value, dict):
                        for key in ("counter", "count", "num", "progress", "total"):
                            if isinstance(value.get(key), (int, float)):
                                return int(value[key])
                    if isinstance(value, (int, float)):
                        return int(value)
        except Exception:
            return None
        return None

    async def _fetch_submit_count(self, mid: Any, headers: dict[str, str]) -> int | None:
        if not mid:
            return None
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                data = (await client.get(
                    "https://app.bilibili.com/x/v2/space/archive/cursor",
                    params={"vmid": mid, "ps": 20},
                    headers=headers,
                )).json()
            if data.get("code") != 0:
                return None
            data_node = data.get("data", {})
            page = data_node.get("page") or {}
            if isinstance(page.get("count"), int):
                return int(page["count"])
            if isinstance(data_node.get("count"), int):
                return int(data_node["count"])
            return len(data_node.get("item") or data_node.get("list") or [])
        except Exception:
            return None

    async def _fetch_page_info(self, source_url: str | None, headers: dict[str, str]) -> dict[str, Any]:
        if not source_url:
            return {}
        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                html = (await client.get(source_url, headers=headers)).text
        except Exception:
            return {}

        title = self._first_match(html, r"<title>(.*?)</title>") or self._first_match(html, r'"title"\s*:\s*"([^"]+)"')
        timestamps = sorted({
            int(match)
            for match in re.findall(r'(?<!\d)(1[6-9]\d{8}|2\d{9})(?!\d)', html)
            if int(match) > int(time.time())
        })
        end_time = timestamps[-1] if timestamps else None
        return {
            "title": re.sub(r"\s+", " ", title).strip() if title else "",
            "endTime": datetime.fromtimestamp(end_time).isoformat(timespec="seconds") if end_time else None,
            "countdownSeconds": max(0, end_time - int(time.time())) if end_time else None,
        }

    @staticmethod
    def _first_match(text: str, pattern: str) -> str:
        match = re.search(pattern, text, re.S)
        return match.group(1) if match else ""


activity_info_service = ActivityInfoService()
