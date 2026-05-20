"""Logging configuration using Loguru."""
import sys
from pathlib import Path
from loguru import logger

from .config import config


def setup_logging() -> None:
    """Configure Loguru logger."""
    logger.remove()

    log_format = (
        "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
        "<level>{message}</level>"
    )

    logger.add(
        sys.stderr,
        format=log_format,
        level=config.log_level,
        colorize=True,
    )

    log_dir = Path(config.data_dir) / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    logger.add(
        log_dir / "bilitools_{time:YYYY-MM-DD}.log",
        format=log_format,
        level=config.log_level,
        rotation="00:00",
        retention="30 days",
        compression="zip",
    )


def get_logger(name: str) -> logger:
    """Get a logger instance with the given name."""
    return logger.bind(name=name)
