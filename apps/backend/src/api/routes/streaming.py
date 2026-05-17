"""Streaming routes."""
from typing import Any, Dict

from ..ipc_server import IPCServer
from src.services.streaming_engine import streaming_engine


async def register(ipc: IPCServer) -> None:
    """Register streaming routes."""

    async def start_streaming(config: Dict[str, Any]) -> Dict[str, Any]:
        return await streaming_engine.start(config)

    async def stop_streaming() -> Dict[str, Any]:
        return await streaming_engine.stop()

    async def get_stream_status() -> Dict[str, Any]:
        return streaming_engine.status()

    ipc.register_handler("streaming:start", start_streaming)
    ipc.register_handler("streaming:stop", stop_streaming)
    ipc.register_handler("streaming:getStatus", get_stream_status)
