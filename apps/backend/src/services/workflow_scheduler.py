"""Small persistent scheduler for saved automation workflows."""
from __future__ import annotations
import asyncio
import json
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Awaitable, Callable

from src.services.game_config import PRO_ROOT


WorkflowExecutor = Callable[[dict[str, Any], bool], Awaitable[list[dict[str, Any]]]]
WorkflowLogger = Callable[[str, str], None]


class WorkflowScheduler:
    def __init__(self, namespace: str, executor: WorkflowExecutor, logger: WorkflowLogger | None = None) -> None:
        self.namespace = namespace
        self.executor = executor
        self.logger = logger
        self.workflows: list[dict[str, Any]] = []
        self.tasks: dict[str, asyncio.Task[None]] = {}
        self._loaded = False

    @property
    def path(self) -> Path:
        return PRO_ROOT / "runtime" / f"{self.namespace}_workflows.json"

    def load(self) -> list[dict[str, Any]]:
        if self._loaded:
            return self.workflows
        self._loaded = True
        if not self.path.exists():
            self.workflows = []
            return self.workflows
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            self.workflows = data if isinstance(data, list) else []
        except Exception as exc:
            self.workflows = []
            self._log("error", f"工作流加载失败: {exc}")
        return self.workflows

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.workflows, ensure_ascii=False, indent=2), encoding="utf-8")

    def list(self) -> list[dict[str, Any]]:
        return self.load()

    def find(self, workflow_id: str) -> dict[str, Any] | None:
        for workflow in self.load():
            if workflow.get("id") == workflow_id:
                return workflow
        return None

    def upsert(self, config: dict[str, Any]) -> dict[str, Any]:
        self.load()
        workflow_id = str(config.get("id") or uuid.uuid4())
        existing = self.find(workflow_id) or {}
        now_text = datetime.now().isoformat(timespec="seconds")
        workflow = {
            **existing,
            **config,
            "id": workflow_id,
            "name": str(config.get("name") or existing.get("name") or "自动化工作流").strip(),
            "enabled": bool(config.get("enabled", existing.get("enabled", True))),
            "repeat": str(config.get("repeat") or existing.get("repeat") or "once"),
            "targetTime": str(config.get("targetTime") or existing.get("targetTime") or ""),
            "createdAt": existing.get("createdAt") or now_text,
            "updatedAt": now_text,
            "lastRunAt": existing.get("lastRunAt"),
            "lastStatus": existing.get("lastStatus", "idle"),
            "lastError": existing.get("lastError", ""),
        }
        workflow["nextRunAt"] = self.next_run_at(workflow)
        self.workflows = [item for item in self.workflows if item.get("id") != workflow_id]
        self.workflows.insert(0, workflow)
        self.save()
        self.schedule(workflow)
        return workflow

    def delete(self, workflow_id: str) -> bool:
        self.load()
        task = self.tasks.pop(workflow_id, None)
        if task and not task.done():
            task.cancel()
        before = len(self.workflows)
        self.workflows = [item for item in self.workflows if item.get("id") != workflow_id]
        self.save()
        return len(self.workflows) != before

    def schedule_all(self) -> None:
        for workflow in self.load():
            self.schedule(workflow)

    def schedule(self, workflow: dict[str, Any]) -> None:
        workflow_id = str(workflow.get("id") or "")
        if not workflow_id:
            return
        task = self.tasks.pop(workflow_id, None)
        if task and not task.done():
            task.cancel()
        if not workflow.get("enabled"):
            return
        seconds = self.seconds_until(workflow.get("nextRunAt"))
        if seconds <= 0:
            workflow["nextRunAt"] = self.next_run_at(workflow)
            seconds = self.seconds_until(workflow.get("nextRunAt"))
            self.save()
        if seconds > 0:
            self.tasks[workflow_id] = asyncio.create_task(self._run_later(workflow_id, seconds))

    async def run_now(self, workflow_id: str) -> list[dict[str, Any]]:
        workflow = self.find(workflow_id)
        if not workflow:
            raise ValueError("工作流不存在")
        return await self._execute(workflow, manual=True)

    async def _run_later(self, workflow_id: str, seconds: int) -> None:
        try:
            await asyncio.sleep(seconds)
            workflow = self.find(workflow_id)
            if workflow and workflow.get("enabled"):
                await self._execute(workflow, manual=False)
        except asyncio.CancelledError:
            pass

    async def _execute(self, workflow: dict[str, Any], manual: bool) -> list[dict[str, Any]]:
        workflow["lastRunAt"] = datetime.now().isoformat(timespec="seconds")
        workflow["lastStatus"] = "running"
        workflow["lastError"] = ""
        self.save()
        try:
            result = await self.executor(workflow, manual)
            failed = next((item for item in result if not item.get("ok", True)), None)
            if failed:
                raise RuntimeError(failed.get("error") or "工作流执行失败")
            workflow["lastStatus"] = "success"
            return result
        except Exception as exc:
            workflow["lastStatus"] = "error"
            workflow["lastError"] = str(exc)
            self._log("error", f"{workflow.get('name')} 执行失败: {exc}")
            return [{"ok": False, "error": str(exc)}]
        finally:
            if workflow.get("repeat") == "once" and not manual:
                workflow["enabled"] = False
            workflow["nextRunAt"] = self.next_run_at(workflow) if workflow.get("enabled") else ""
            self.save()
            self.schedule(workflow)

    def next_run_at(self, workflow: dict[str, Any]) -> str:
        target_time = workflow.get("targetTime")
        if not target_time or not workflow.get("enabled", True):
            return ""
        try:
            target = self.parse_time(target_time)
        except (TypeError, ValueError):
            return ""
        now = datetime.now(target.tzinfo) if target.tzinfo else datetime.now()
        if workflow.get("repeat") == "daily":
            while target <= now:
                target += timedelta(days=1)
        elif target <= now:
            return ""
        return target.isoformat(timespec="seconds")

    @staticmethod
    def parse_time(value: Any) -> datetime:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))

    @classmethod
    def seconds_until(cls, value: Any) -> int:
        if not value:
            return 0
        try:
            target = cls.parse_time(value)
            now = datetime.now(target.tzinfo) if target.tzinfo else datetime.now()
            return max(0, int((target - now).total_seconds()))
        except (TypeError, ValueError):
            return 0

    def _log(self, level: str, message: str) -> None:
        if self.logger:
            self.logger(level, message)
