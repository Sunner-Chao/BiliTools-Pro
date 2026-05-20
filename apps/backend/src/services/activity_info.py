"""Activity overview helpers migrated from the original tool."""
import asyncio
import logging
import os
import re
import time
from datetime import datetime
from typing import Any

import httpx
from .http_client import create_client

logger = logging.getLogger(__name__)

from .bilibili import bilibili_service
from .game_config import game_config_service


class ActivityInfoService:
    """Fetch live days, submit count and page-level activity hints for the UI."""

    async def fetch_overview(self, game: str, source_url: str | None = None) -> dict[str, Any]:
        config = game_config_service.get_config(game)
        logger.info(f"fetch_overview game={game}, live_task_ids={config.get('live_task_ids')}, watch_task_ids={config.get('watch_task_ids')}")
        user = await bilibili_service.get_user_info()
        cookie = bilibili_service.cookie_string
        headers = {
            "User-Agent": bilibili_service.user_agent,
            "Cookie": cookie,
            "Referer": source_url or config.get("source_url") or "https://www.bilibili.com",
        }
        live_days, watch_days = await asyncio.gather(
            self._fetch_live_days(config, headers, cookie),
            self._fetch_watch_days(config, headers, cookie),
        )
        submit_count = await self._fetch_submit_count(user.get("mid") or user.get("uid"), cookie)
        page_info = await self._fetch_page_info(source_url or config.get("source_url"), headers)
        return {
            "success": True,
            "game": game,
            "activityTitle": page_info.get("title") or config.get("area_name") or game,
            "sourceUrl": source_url or config.get("source_url", ""),
            "activityId": config.get("activity_id", ""),
            "liveDays": live_days,
            "watchDays": watch_days,
            "submitCount": submit_count,
            "countdownSeconds": page_info.get("countdownSeconds"),
            "endTime": page_info.get("endTime"),
            "fetchedAt": datetime.now().isoformat(timespec="seconds"),
        }

    async def _fetch_live_days(self, config: dict[str, Any], headers: dict[str, str], cookie: str) -> int | None:
        """获取直播完成天数，参考原版 Bili_MoblieGames_Auto_Tool_v0_5_2_Async.py fetch_days_info"""
        task_ids = str(config.get("live_task_ids") or "").strip()
        if not task_ids:
            logger.warning("live_task_ids is empty, skipping live days fetch")
            return None
        try:
            async with create_client(timeout=12.0) as client:
                data = (await client.get(
                    "https://api.bilibili.com/x/task/totalv2",
                    params={
                        "task_ids": task_ids,
                        "web_location": self._task_web_location(config),
                        "csrf": bilibili_service.csrf_token,
                    },
                    headers=headers,
                )).json()
            logger.info(f"live_days API response (task_ids={task_ids}): code={data.get('code')}, accumulative_count={data.get('data', {}).get('list', [{}])[0].get('accumulative_count') if data.get('data', {}).get('list') else 'no_list'}")
            if data.get("code") != 0:
                return None
            task_list = data.get("data", {}).get("list", [])
            if isinstance(task_list, list) and len(task_list) > 0:
                first_item = task_list[0]
                if isinstance(first_item, dict):
                    count = first_item.get("accumulative_count")
                    if isinstance(count, (int, float)):
                        return int(count)
                    for key in ("count", "num", "total", "current"):
                        count = first_item.get(key)
                        if isinstance(count, (int, float)):
                            return int(count)
        except Exception as e:
            logger.error(f"live_days fetch error: {e}")
            return None
        return None

    async def _fetch_watch_days(self, config: dict[str, Any], headers: dict[str, str], cookie: str) -> int | None:
        """获取看播完成天数，与 _fetch_live_days 结构完全一致"""
        task_ids = str(config.get("watch_task_ids") or "").strip()
        if not task_ids:
            logger.warning("watch_task_ids is empty, skipping watch days fetch")
            return None
        try:
            async with create_client(timeout=12.0) as client:
                data = (await client.get(
                    "https://api.bilibili.com/x/task/totalv2",
                    params={
                        "task_ids": task_ids,
                        "web_location": self._task_web_location(config),
                        "csrf": bilibili_service.csrf_token,
                    },
                    headers=headers,
                )).json()
            logger.info(f"watch_days API response (task_ids={task_ids}): code={data.get('code')}, accumulative_count={data.get('data', {}).get('list', [{}])[0].get('accumulative_count') if data.get('data', {}).get('list') else 'no_list'}")
            if data.get("code") != 0:
                return None
            task_list = data.get("data", {}).get("list", [])
            if isinstance(task_list, list) and len(task_list) > 0:
                first_item = task_list[0]
                if isinstance(first_item, dict):
                    count = first_item.get("accumulative_count")
                    if isinstance(count, (int, float)):
                        return int(count)
                    for key in ("count", "num", "total", "current"):
                        count = first_item.get(key)
                        if isinstance(count, (int, float)):
                            return int(count)
        except Exception as e:
            logger.error(f"watch_days fetch error: {e}")
            return None
        return None

    async def _fetch_submit_count(self, mid: Any, cookie: str) -> int | None:
        """获取投稿稿件总数，参考原版 get_submit_info 函数"""
        if not mid:
            return None
        try:
            # 原版使用的 API: app.bilibili.com/x/v2/space/archive/cursor
            async with create_client(timeout=15.0) as client:
                data = (await client.get(
                    "https://app.bilibili.com/x/v2/space/archive/cursor",
                    params={"vmid": mid, "ps": 20},
                    headers={
                        "User-Agent": "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Mobile Safari/537.36",
                        "Referer": "https://www.bilibili.com/",
                    },
                )).json()
            if data.get("code") != 0:
                return None
            # 原版逻辑: data.get("count") 或 page.get("count")
            data_node = data.get("data", {})
            count = data_node.get("count")
            if isinstance(count, int):
                return count
            page = data_node.get("page") or {}
            if isinstance(page.get("count"), int):
                return int(page["count"])
            # 备选: 返回列表长度
            items = data_node.get("item") or data_node.get("list") or []
            if isinstance(items, list):
                return len(items)
            return None
        except Exception:
            return None

    async def _fetch_page_info(self, source_url: str | None, headers: dict[str, str]) -> dict[str, Any]:
        if not source_url:
            return {}
        try:
            async with create_client(timeout=20.0, follow_redirects=True) as client:
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

    @staticmethod
    def _task_web_location(config: dict[str, Any]) -> str:
        value = os.getenv("BILITOOLS_TASK_WEB_LOCATION") or config.get("task_web_location")
        return str(value or "888.145296")


activity_info_service = ActivityInfoService()
