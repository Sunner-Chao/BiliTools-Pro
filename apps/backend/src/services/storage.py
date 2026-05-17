"""Storage service for persisting data."""
import json
import shutil
from pathlib import Path
from typing import Any

from ..core.config import config
from ..core.logging import get_logger

logger = get_logger("storage")


class Storage:
    """Simple JSON-based storage."""

    def __init__(self, data_dir: str | None = None) -> None:
        self.data_dir = Path(data_dir or config.data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)

    def save(self, filename: str, data: dict[str, Any]) -> None:
        """Save data to a JSON file."""
        try:
            filepath = self.data_dir / filename
            filepath.parent.mkdir(parents=True, exist_ok=True)
            filepath.write_text(json.dumps(data, indent=2, ensure_ascii=False))
            logger.debug(f"Saved {filename}")
        except Exception as e:
            logger.error(f"Failed to save {filename}: {e}")

    def load(self, filename: str) -> dict[str, Any]:
        """Load data from a JSON file."""
        try:
            filepath = self.data_dir / filename
            if filepath.exists():
                return json.loads(filepath.read_text())
            return {}
        except Exception as e:
            logger.error(f"Failed to load {filename}: {e}")
            return {}

    def delete(self, filename: str) -> None:
        """Delete a file."""
        try:
            filepath = self.data_dir / filename
            if filepath.exists():
                filepath.unlink()
                logger.debug(f"Deleted {filename}")
        except Exception as e:
            logger.error(f"Failed to delete {filename}: {e}")

    def clear(self) -> None:
        """Clear all data files."""
        try:
            shutil.rmtree(self.data_dir)
            self.data_dir.mkdir(parents=True, exist_ok=True)
            logger.info("Cleared all data")
        except Exception as e:
            logger.error(f"Failed to clear data: {e}")


storage = Storage()