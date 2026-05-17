"""Real runtime analytics routes."""
from datetime import datetime
from typing import Any, Dict

from ..ipc_server import IPCServer
from src.api.routes.daily import SLOT_COUNT, daily_state, _fetch_user
from src.services.bilibili import bilibili_service
from src.services.game_config import game_config_service
from src.services.streaming_engine import streaming_engine
from src.services.task_engine import task_engine


async def register(ipc: IPCServer) -> None:
    async def summary() -> Dict[str, Any]:
        tasks = task_engine.list()
        total = len(tasks)
        completed = len([item for item in tasks if item.get("status") == "completed"])
        failed = len([item for item in tasks if item.get("status") == "failed"])
        running = len([item for item in tasks if item.get("status") in ("running", "waiting")])
        stopped = len([item for item in tasks if item.get("status") == "stopped"])
        pending = len([item for item in tasks if item.get("status") == "pending"])
        results = [result for item in tasks for result in item.get("results", [])]
        successful_results = [result for result in results if result.get("done") or result.get("level") == "success"]
        cdkeys = [result.get("cdkey") for result in results if result.get("cdkey")]
        logs = [log for item in tasks for log in item.get("logs", [])]
        games = []
        for game in game_config_service.list_games():
            game_tasks = [item for item in tasks if item.get("config", {}).get("game") == game["id"]]
            game_completed = len([item for item in game_tasks if item.get("status") == "completed"])
            game_failed = len([item for item in game_tasks if item.get("status") == "failed"])
            game_running = len([item for item in game_tasks if item.get("status") in ("running", "waiting")])
            games.append({
                "id": game["id"],
                "game": game["name"],
                "tasks": len(game_tasks),
                "configuredTasks": game["taskCount"],
                "completed": game_completed,
                "failed": game_failed,
                "running": game_running,
                "rate": round(game_completed / max(len(game_tasks), 1) * 100),
                "areaV2": game.get("areaV2"),
                "loaded": game.get("loaded"),
            })
        recent = []
        for item in sorted(tasks, key=lambda task: task.get("createdAt") or "", reverse=True)[:20]:
            recent.append({
                "time": item.get("completedAt") or item.get("startedAt") or item.get("createdAt"),
                "action": item.get("config", {}).get("name") or item.get("id"),
                "game": item.get("config", {}).get("game"),
                "status": item.get("status"),
                "progress": item.get("progress", 0),
                "resultCount": len(item.get("results", [])),
                "logCount": len(item.get("logs", [])),
            })
        stream = streaming_engine.status()
        user = await bilibili_service.get_user_info() if await bilibili_service.is_logged_in() else None
        audience_slots = []
        for slot in range(SLOT_COUNT):
            cookie = daily_state.read_cookie(slot)
            audience = await _fetch_user(cookie) if cookie else None
            audience_slots.append({
                "slot": slot,
                "hasCookie": bool(cookie),
                "isValid": bool(audience),
                "name": audience.get("name") if audience else "",
                "mid": audience.get("mid") if audience else None,
                "liveEntry": daily_state.live_entries.get(slot),
            })
        return {
            "updatedAt": datetime.now().isoformat(timespec="seconds"),
            "totalTasks": total,
            "completedTasks": completed,
            "failedTasks": failed,
            "runningTasks": running,
            "pendingTasks": pending,
            "stoppedTasks": stopped,
            "successRate": round(completed / max(total, 1) * 100, 1),
            "resultCount": len(results),
            "successfulResultCount": len(successful_results),
            "cdkeyCount": len(cdkeys),
            "logCount": len(logs),
            "games": games,
            "recent": recent,
            "streaming": stream,
            "credential": bilibili_service.credential_meta(),
            "audienceSlots": audience_slots,
            "dailyLogCount": len(daily_state.logs),
            "user": user,
        }

    ipc.register_handler("analytics:summary", summary)
