"""Tests for scheduled task timing."""
from datetime import datetime, timedelta, timezone

from src.services.task_engine import TaskEngine


def test_seconds_until_accepts_local_future_time():
    target = (datetime.now() + timedelta(seconds=60)).replace(microsecond=0).isoformat()

    seconds = TaskEngine._seconds_until(target)

    assert 0 < seconds <= 60


def test_seconds_until_accepts_utc_future_time():
    target = (datetime.now(timezone.utc) + timedelta(seconds=60)).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    seconds = TaskEngine._seconds_until(target)

    assert 0 < seconds <= 60


def test_seconds_until_returns_zero_for_past_time():
    target = (datetime.now() - timedelta(seconds=60)).replace(microsecond=0).isoformat()

    assert TaskEngine._seconds_until(target) == 0
