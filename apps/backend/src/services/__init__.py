"""Services module."""
from .bilibili import bilibili_service, BilibiliService
from .storage import storage, Storage

__all__ = ["bilibili_service", "BilibiliService", "storage", "Storage"]