"""Tests for IPC server."""
import pytest
import asyncio
from src.api.ipc_server import IPCServer


@pytest.fixture
def ipc():
    return IPCServer()


@pytest.mark.asyncio
async def test_register_handler(ipc):
    """Test handler registration."""
    async def dummy_handler(**params):
        return {"result": "ok"}

    ipc.register_handler("test:method", dummy_handler)
    assert "test:method" in ipc._handlers


@pytest.mark.asyncio
async def test_register_event_listener(ipc):
    """Test event listener registration."""
    async def dummy_callback(data):
        pass

    ipc.on("test:event", dummy_callback)
    assert "test:event" in ipc._event_listeners
    assert len(ipc._event_listeners["test:event"]) == 1


@pytest.mark.asyncio
async def test_emit_calls_listeners(ipc):
    """Test emit calls all registered listeners."""
    results = []

    async def callback1(data):
        results.append(1)

    async def callback2(data):
        results.append(2)

    ipc.on("test:event", callback1)
    ipc.on("test:event", callback2)
    await ipc.emit("test:event", {"value": "test"})

    assert results == [1, 2]