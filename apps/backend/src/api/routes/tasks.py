"""Task management routes."""
from typing import Any, Dict

from ..ipc_server import IPCServer
from src.services.activity_info import activity_info_service
from src.services.game_config import game_config_service
from src.services.task_engine import task_engine


async def register(ipc: IPCServer) -> None:
    """Register task routes."""

    async def create_task(config: Dict[str, Any]) -> Dict[str, Any]:
        return await task_engine.create(config)

    async def start_task(task_id: str) -> Dict[str, Any]:
        return await task_engine.start(task_id)

    async def stop_task(task_id: str) -> Dict[str, Any]:
        return await task_engine.stop(task_id)

    async def delete_task(task_id: str) -> Dict[str, Any]:
        return await task_engine.delete(task_id)

    async def list_tasks() -> Dict[str, Any]:
        return {"tasks": task_engine.list()}

    async def get_task(task_id: str) -> Dict[str, Any]:
        task = task_engine.get(task_id)
        if not task:
            return {"success": False, "error": "Task not found"}
        return {"success": True, "task": task}

    async def list_games() -> Dict[str, Any]:
        return {"games": game_config_service.list_games()}

    async def list_game_tasks(game: str) -> Dict[str, Any]:
        return {"tasks": game_config_service.list_tasks(game)}

    async def refresh_game_config(game: str, url: str | None = None) -> Dict[str, Any]:
        return await game_config_service.refresh_from_url(game, url)

    async def list_resources() -> Dict[str, Any]:
        return {
            "paths": game_config_service.ensure_resource_dirs(),
            "games": game_config_service.list_games(),
            "executables": game_config_service.list_executables(),
        }

    async def get_overview(game: str, source_url: str | None = None) -> Dict[str, Any]:
        return await activity_info_service.fetch_overview(game, source_url)

    async def query_stocks(
        game: str,
        task_ids: list[str] | None = None,
        web_location: Any = None,
    ) -> Dict[str, Any]:
        return await task_engine.query_stocks(game, task_ids, web_location)

    ipc.register_handler("tasks:create", create_task)
    ipc.register_handler("tasks:start", start_task)
    ipc.register_handler("tasks:stop", stop_task)
    ipc.register_handler("tasks:delete", delete_task)
    ipc.register_handler("tasks:list", list_tasks)
    ipc.register_handler("tasks:get", get_task)
    ipc.register_handler("tasks:games", list_games)
    ipc.register_handler("tasks:gameTasks", list_game_tasks)
    ipc.register_handler("tasks:refreshGameConfig", refresh_game_config)
    ipc.register_handler("tasks:resources", list_resources)
    ipc.register_handler("tasks:overview", get_overview)
    ipc.register_handler("tasks:stocks", query_stocks)
