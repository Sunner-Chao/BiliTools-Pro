"""IPC server for Electron communication."""
import asyncio
import json
from typing import Any, Callable, Coroutine, Dict, List, Optional, Union
from typing_extensions import TypeAlias
from loguru import logger

from ..core.config import config
from ..core.response import ErrorCode, fail, wrap


IPC_HOST = config.ipc_host
IPC_PORT = config.ipc_port


IPCHandler: TypeAlias = Callable[..., Coroutine[Any, Any, Dict[str, Any]]]
EventCallback: TypeAlias = Callable[..., Coroutine[Any, Any, None]]


class IPCServer:
    """IPC server for handling requests from Electron renderer."""

    def __init__(self) -> None:
        self._handlers: Dict[str, IPCHandler] = {}
        self._event_listeners: Dict[str, List[EventCallback]] = {}
        self._writers: List[asyncio.StreamWriter] = []
        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._running = False

    def register_handler(self, method: str, handler: IPCHandler) -> None:
        """Register an IPC handler."""
        self._handlers[method] = handler
        logger.debug(f"Registered IPC handler: {method}")

    def on(self, event: str, callback: EventCallback) -> None:
        """Register an event listener."""
        if event not in self._event_listeners:
            self._event_listeners[event] = []
        self._event_listeners[event].append(callback)
        logger.debug(f"Registered event listener: {event}")

    async def emit(self, event: str, data: Optional[Dict[str, Any]] = None) -> None:
        """Emit an event to all listeners."""
        payload = {"event": event, "data": data or {}}
        stale_writers: List[asyncio.StreamWriter] = []
        for writer in self._writers:
            try:
                writer.write((json.dumps(payload, ensure_ascii=False) + "\n").encode())
                await writer.drain()
            except Exception as e:
                logger.error(f"IPC event write error for {event}: {e}")
                stale_writers.append(writer)
        for writer in stale_writers:
            if writer in self._writers:
                self._writers.remove(writer)

        if event in self._event_listeners:
            for callback in self._event_listeners[event]:
                try:
                    await callback(data or {})
                except Exception as e:
                    logger.error(f"Event callback error for {event}: {e}")

    async def start(self) -> None:
        """Start the IPC server."""
        server = await asyncio.start_server(
            self._handle_client,
            IPC_HOST,
            IPC_PORT,
        )
        self._running = True
        logger.info(f"IPC server started on {IPC_HOST}:{IPC_PORT}")
        async with server:
            await server.serve_forever()

    async def stop(self) -> None:
        """Stop the IPC server."""
        self._running = False
        if self._writer:
            self._writer.close()
            await self._writer.wait_closed()
        logger.info("IPC server stopped")

    async def _handle_client(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        """Handle an incoming client connection."""
        addr = writer.get_extra_info("peername")
        logger.debug(f"IPC client connected: {addr}")
        self._writers.append(writer)
        try:
            while self._running:
                data = await reader.readline()
                if not data:
                    break
                message = json.loads(data.decode())
                response = await self._dispatch(message)
                writer.write((json.dumps(response) + "\n").encode())
                await writer.drain()
        except Exception as e:
            logger.error(f"IPC client error: {e}")
        finally:
            if writer in self._writers:
                self._writers.remove(writer)
            writer.close()
            await writer.wait_closed()
            logger.debug(f"IPC client disconnected: {addr}")

    @staticmethod
    def _to_snake_case(key: str) -> str:
        """Convert camelCase key to snake_case."""
        result = []
        for ch in key:
            if ch.isupper():
                result.append('_')
                result.append(ch.lower())
            else:
                result.append(ch)
        return ''.join(result)

    async def _dispatch(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Dispatch an IPC message to the appropriate handler.

        Every response is wrapped in the standard envelope::

            {"id": ..., "result": {"ok": bool, "data": ..., "error": ..., "code": int}}
        """
        method = message.get("method")
        params = message.get("params", {})
        msg_id = message.get("id")

        if method not in self._handlers:
            envelope = fail(f"Unknown method: {method}", ErrorCode.NOT_FOUND)
            return {"id": msg_id, "result": envelope}

        try:
            snake_params = {self._to_snake_case(k): v for k, v in params.items()}
            result = await self._handlers[method](**snake_params)
            return {"id": msg_id, "result": wrap(result)}
        except ValueError as e:
            logger.warning(f"IPC validation error for {method}: {e}")
            envelope = fail(str(e), ErrorCode.VALIDATION_ERROR)
            return {"id": msg_id, "result": envelope}
        except RuntimeError as e:
            msg = str(e)
            code = ErrorCode.CONFLICT if "already" in msg.lower() else ErrorCode.BAD_REQUEST
            if "confirm" in msg.lower():
                code = ErrorCode.REQUIRES_CONFIRM
            logger.warning(f"IPC runtime error for {method}: {e}")
            envelope = fail(msg, code)
            return {"id": msg_id, "result": envelope}
        except Exception as e:
            logger.error(f"IPC handler error for {method}: {e}")
            envelope = fail(str(e), ErrorCode.INTERNAL_ERROR)
            return {"id": msg_id, "result": envelope}


ipc_server = IPCServer()
