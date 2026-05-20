"""Streaming routes."""
from typing import Any, Dict

from ..ipc_server import IPCServer
from src.core.response import ErrorCode, fail, ok
from src.services.streaming_engine import streaming_engine
from src.services.workflow_scheduler import WorkflowScheduler


async def register(ipc: IPCServer) -> None:
    """Register streaming routes."""

    async def execute_workflow(workflow: dict[str, Any], manual: bool = False) -> list[dict[str, Any]]:
        config = dict(workflow.get("streamConfig") or {})
        config["targetTime"] = ""
        result = await streaming_engine.start(config)
        return [{"action": "startStreaming", "ok": bool(result.get("ok", True)), "response": result, "manual": manual}]

    scheduler = WorkflowScheduler("streaming", execute_workflow, streaming_engine._log)
    scheduler.schedule_all()

    async def start_streaming(config: Dict[str, Any]) -> Dict[str, Any]:
        return await streaming_engine.start(config)

    async def stop_streaming() -> Dict[str, Any]:
        return await streaming_engine.stop()

    async def get_stream_status() -> Dict[str, Any]:
        return ok({**streaming_engine.status(), "workflows": scheduler.list()})

    async def save_workflow(config: Dict[str, Any]) -> Dict[str, Any]:
        stream_config = dict(config.get("streamConfig") or {})
        if not stream_config.get("roomId"):
            return fail("请输入直播间号", ErrorCode.VALIDATION_ERROR)
        workflow = scheduler.upsert({
            "id": config.get("id"),
            "name": config.get("name") or "推流自动化工作流",
            "enabled": config.get("enabled", True),
            "repeat": config.get("repeat") or "once",
            "targetTime": config.get("targetTime") or "",
            "streamConfig": stream_config,
        })
        streaming_engine._log("success", f"已保存推流工作流 {workflow['name']}，下次触发 {workflow.get('nextRunAt') or '-'}")
        return ok({"workflow": workflow, "workflows": scheduler.list()})

    async def delete_workflow(workflow_id: str) -> Dict[str, Any]:
        if not scheduler.delete(workflow_id):
            return fail("工作流不存在", ErrorCode.NOT_FOUND)
        return ok({"workflows": scheduler.list()})

    async def run_workflow(workflow_id: str) -> Dict[str, Any]:
        result = await scheduler.run_now(workflow_id)
        return ok({"result": result, "workflows": scheduler.list()})

    ipc.register_handler("streaming:start", start_streaming)
    ipc.register_handler("streaming:stop", stop_streaming)
    ipc.register_handler("streaming:getStatus", get_stream_status)
    ipc.register_handler("streaming:saveWorkflow", save_workflow)
    ipc.register_handler("streaming:deleteWorkflow", delete_workflow)
    ipc.register_handler("streaming:runWorkflow", run_workflow)
