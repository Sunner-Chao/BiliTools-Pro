"""Backend application entry point."""
import asyncio
import signal
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.core import setup_logging, get_logger
from src.api import ipc_server
from src.services import bilibili_service

logger = get_logger("main")


async def register_handlers() -> None:
    """Register all IPC handlers."""
    from src.api.routes import analytics, auth, daily, settings, tasks, streaming

    await auth.register(ipc_server)
    await tasks.register(ipc_server)
    await streaming.register(ipc_server)
    await daily.register(ipc_server)
    await analytics.register(ipc_server)
    await settings.register(ipc_server)
    logger.info("All IPC handlers registered")


async def main() -> None:
    """Main application entry point."""
    setup_logging()
    logger.info("BiliTools-Pro Backend starting...")

    await register_handlers()
    await bilibili_service.load_cookies()

    try:
        await ipc_server.start()
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    finally:
        await ipc_server.stop()
        logger.info("BiliTools-Pro Backend stopped")


if __name__ == "__main__":
    asyncio.run(main())
