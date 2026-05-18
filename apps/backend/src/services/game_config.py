"""Game activity config loader shared by task and live features."""
import json
import os
import re
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs

import httpx
from .http_client import create_client


PROJECT_ROOT = Path(__file__).resolve().parents[5]
PRO_ROOT = Path(os.environ.get("BILITOOLS_PRO_ROOT", PROJECT_ROOT / "BiliTools-Pro")).resolve()
CONFIG_DIRS = [
    PRO_ROOT / "config",
    PROJECT_ROOT / "src" / "config",
    PROJECT_ROOT / "client" / "config",
]
EXECUTE_DIRS = [
    PRO_ROOT / "execute",
    PROJECT_ROOT / "client" / "execute",
    PROJECT_ROOT / "src" / "execute",
]


GAME_FILES = {
    "genshin": "bili_config_genshin.json",
    "starrail": "bili_config_starrail.json",
    "zzz": "bili_config_zzz.json",
    "wutheringwaves": "bili_config_wutheringwaves.json",
}

GAME_SOURCE_URLS = {
    "genshin": "https://www.bilibili.com/blackboard/era/n2drQa9NUK5Xruku.html?spm_id_from=333.337.0.0",
}


class GameConfigService:
    """Loads the original JSON task configuration without changing its shape."""

    def __init__(self) -> None:
        self._configs: dict[str, dict[str, Any]] = {}
        self.config_dir = PRO_ROOT / "config"
        self.cookies_dir = PRO_ROOT / "cookies"
        self.execute_dir = PRO_ROOT / "execute"
        self.ensure_resource_dirs()
        self.reload()

    def ensure_resource_dirs(self) -> dict[str, str]:
        """Ensure Pro owns the runtime resource directories."""
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.cookies_dir.mkdir(parents=True, exist_ok=True)
        self.execute_dir.mkdir(parents=True, exist_ok=True)
        return {
            "config": str(self.config_dir),
            "cookies": str(self.cookies_dir),
            "execute": str(self.execute_dir),
        }

    def reload(self) -> None:
        self._configs = {}
        for game, filename in GAME_FILES.items():
            for config_dir in CONFIG_DIRS:
                path = config_dir / filename
                if path.exists():
                    self._configs[game] = json.loads(path.read_text(encoding="utf-8"))
                    break

    def list_games(self) -> list[dict[str, Any]]:
        games = []
        for game, filename in GAME_FILES.items():
            data = self._configs.get(game, {})
            games.append(
                {
                    "id": game,
                    "name": data.get("area_name", game),
                    "areaV2": data.get("area_v2"),
                    "taskCount": len(self.list_tasks(game)),
                    "loaded": bool(data),
                    "configFile": filename,
                    "sourceUrl": data.get("source_url") or GAME_SOURCE_URLS.get(game, ""),
                }
            )
        return games

    def list_executables(self) -> list[dict[str, Any]]:
        executables: dict[str, dict[str, Any]] = {}
        for directory in EXECUTE_DIRS:
            if not directory.exists():
                continue
            for path in directory.iterdir():
                if path.is_file():
                    executables.setdefault(
                        path.name,
                        {
                            "name": path.name,
                            "path": str(path),
                            "size": path.stat().st_size,
                            "source": "pro" if directory == self.execute_dir else "legacy",
                        },
                    )
        return sorted(executables.values(), key=lambda item: item["name"])

    def get_config(self, game: str) -> dict[str, Any]:
        return self._configs.get(game, {})

    def get_area_v2(self, game: str) -> str:
        value = self.get_config(game).get("area_v2", "")
        return str(value) if value is not None else ""

    def list_tasks(self, game: str) -> list[dict[str, Any]]:
        tasks_by_id: dict[str, dict[str, Any]] = {}
        for group in self.get_config(game).get("TASKS", []):
            for name, task_info in group.items():
                task_id = str(task_info.get("id", ""))
                if task_id:
                    if self._looks_like_non_exchange_milestone(name, task_info):
                        continue
                    task = {
                        "id": task_id,
                        "name": name,
                        "description": task_info.get("description", ""),
                        "awardName": task_info.get("awardName") or task_info.get("description", ""),
                        "activityId": task_info.get("activityId", ""),
                        "activityName": task_info.get("activityName", ""),
                        "taskName": task_info.get("taskName", name),
                        "url": task_info.get("url") or f"https://www.bilibili.com/blackboard/era/award-exchange.html?task_id={task_id}",
                    }
                    previous = tasks_by_id.get(task_id)
                    if not previous or self._task_label_score(name) > self._task_label_score(previous["name"]):
                        tasks_by_id[task_id] = task
        return list(tasks_by_id.values())

    async def refresh_from_url(self, game: str, url: str | None = None) -> dict[str, Any]:
        """Refresh game task config from a Bilibili blackboard/era page."""
        if game not in GAME_FILES:
            return {"success": False, "error": f"未知游戏: {game}"}
        source_url = url or GAME_SOURCE_URLS.get(game)
        if not source_url:
            return {"success": False, "error": "缺少活动页面 URL"}

        async with create_client(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(source_url, headers={"User-Agent": "Mozilla/5.0"})
        response.raise_for_status()

        old_config = self.get_config(game)
        refreshed = self._parse_blackboard_page(response.text, old_config)
        refreshed["source_url"] = source_url
        refreshed["area_name"] = old_config.get("area_name", refreshed.get("area_name", game))
        refreshed["area_v2"] = old_config.get("area_v2", refreshed.get("area_v2", 0))
        refreshed["submit_task_ids"] = old_config.get("submit_task_ids", refreshed.get("submit_task_ids", ""))

        path = self.config_dir / GAME_FILES[game]
        path.write_text(json.dumps(refreshed, ensure_ascii=False, indent=4), encoding="utf-8")
        self.reload()
        return {
            "success": True,
            "game": game,
            "configFile": str(path),
            "taskCount": len(self.list_tasks(game)),
            "sourceUrl": source_url,
        }

    def _parse_blackboard_page(self, html: str, fallback: dict[str, Any]) -> dict[str, Any]:
        activity_id = self._find_first_text(html, r'"activity_id"\s*:\s*"([^"]+)"')
        page_data = self._extract_eva_page_data(html)
        task_items: list[dict[str, Any]] = []
        self._collect_task_items(page_data, task_items)
        totalv2_task_ids = self._extract_totalv2_task_ids(html)

        tasks: dict[str, dict[str, str]] = {}
        live_task_id = fallback.get("live_task_ids", "")
        watch_task_id = fallback.get("watch_task_ids", "")
        submit_task_id = fallback.get("submit_task_ids", "")
        if totalv2_task_ids:
            live_task_id = totalv2_task_ids[0]
            if len(totalv2_task_ids) > 1:
                watch_task_id = totalv2_task_ids[1]
        for item in task_items:
            task_name = str(item.get("taskName") or item.get("name") or "").strip()
            task_id = str(item.get("taskId") or "").strip()
            award_name = str(item.get("awardName") or "").strip()
            checkpoints = item.get("checkpoints") or []
            has_exchange_checkpoints = any(
                str(checkpoint.get("ztasksid") or "").strip()
                and str(checkpoint.get("ztasksid") or "").strip() != task_id
                for checkpoint in checkpoints
            )
            if task_name and task_id and not has_exchange_checkpoints:
                label = f"{task_name}({award_name})" if award_name and award_name not in task_name else task_name
                tasks[label] = {
                    "id": task_id,
                    "description": award_name or task_name,
                    "awardName": award_name,
                    "taskName": task_name,
                    "url": f"https://www.bilibili.com/blackboard/era/award-exchange.html?task_id={task_id}",
                }
                if not live_task_id and "开播" in task_name:
                    live_task_id = task_id
                if not watch_task_id and "看播" in task_name:
                    watch_task_id = task_id
            for checkpoint in checkpoints:
                checkpoint_task_id = str(checkpoint.get("ztasksid") or "").strip()
                checkpoint_award = str(checkpoint.get("awardname") or "").strip()
                checkpoint_alias = str(checkpoint.get("alias") or "").strip()
                if checkpoint_task_id and checkpoint_award and checkpoint_task_id != task_id:
                    label_parts = [part for part in (task_name, checkpoint_alias) if part]
                    label = "-".join(label_parts) if label_parts else checkpoint_award
                    if checkpoint_award not in label:
                        label = f"{label}({checkpoint_award})"
                    tasks[label] = {
                        "id": checkpoint_task_id,
                        "description": checkpoint_award,
                        "awardName": checkpoint_award,
                        "alias": checkpoint_alias,
                        "taskName": task_name,
                        "url": f"https://www.bilibili.com/blackboard/era/award-exchange.html?task_id={checkpoint_task_id}",
                    }

        if not tasks:
            return fallback

        return {
            "TASKS": [tasks],
            "area_name": fallback.get("area_name", ""),
            "live_task_ids": live_task_id,
            "watch_task_ids": watch_task_id,
            "submit_task_ids": submit_task_id,
            "area_v2": fallback.get("area_v2", 0),
            "activity_id": activity_id,
            "task_web_location": fallback.get("task_web_location", "888.145296"),
        }

    @staticmethod
    def _find_first_text(text: str, pattern: str) -> str:
        match = re.search(pattern, text)
        return match.group(1) if match else ""

    @staticmethod
    def _extract_eva_page_data(html: str) -> dict[str, Any]:
        marker = "window.__BILIACT_EVAPAGEDATA__ = "
        if marker not in html:
            return {}
        start = html.index(marker) + len(marker)
        level = 0
        in_string = False
        escaped = False
        end = start
        for index, ch in enumerate(html[start:], start):
            if in_string:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == '"':
                    in_string = False
            else:
                if ch == '"':
                    in_string = True
                elif ch == "{":
                    level += 1
                elif ch == "}":
                    level -= 1
                    if level == 0:
                        end = index + 1
                        break
        try:
            return json.loads(html[start:end])
        except json.JSONDecodeError:
            return {}

    @staticmethod
    def _extract_totalv2_task_ids(html: str) -> list[str]:
        normalized = html.replace("\\u0026", "&").replace("&amp;", "&")
        task_ids: list[str] = []
        for match in re.finditer(
            r"https://api\.bilibili\.com/x/task/totalv2\?([^\"'<>\\\s]+)",
            normalized,
        ):
            values = parse_qs(match.group(1)).get("task_ids") or []
            task_id = values[0].strip() if values else ""
            if task_id and task_id not in task_ids:
                task_ids.append(task_id)

        if len(task_ids) < 2:
            for match in re.finditer(
                r"totalv2[^\"'<>\\\s]{0,300}?task_ids=([A-Za-z0-9_-]+)",
                normalized,
            ):
                task_id = match.group(1).strip()
                if task_id and task_id not in task_ids:
                    task_ids.append(task_id)
        return task_ids

    def _collect_task_items(self, value: Any, found: list[dict[str, Any]]) -> None:
        if isinstance(value, dict):
            task_item = value.get("taskItem")
            if isinstance(task_item, dict) and task_item.get("taskId"):
                found.append(task_item)
            for child in value.values():
                self._collect_task_items(child, found)
        elif isinstance(value, list):
            for item in value:
                self._collect_task_items(item, found)

    @staticmethod
    def _task_label_score(name: str) -> int:
        score = 0
        if "任务" in name:
            score += 4
        if "里程碑" in name:
            score += 2
        if re.search(r"\d+$", name):
            score -= 1
        return score

    @staticmethod
    def _looks_like_non_exchange_milestone(name: str, task_info: dict[str, Any]) -> bool:
        return "里程碑" in name and "-" not in name and not task_info.get("url") and not task_info.get("activityId")


game_config_service = GameConfigService()
