"""PyInstaller entrypoint for the Pro backend."""
from __future__ import annotations

import asyncio

from src.main import main


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
