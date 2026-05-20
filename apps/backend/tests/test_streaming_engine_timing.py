"""Tests for scheduled streaming timing."""
from datetime import datetime, timedelta, timezone

from src.services.streaming_engine import StreamingEngine


def test_seconds_until_accepts_local_future_time():
    target = (datetime.now() + timedelta(seconds=60)).replace(microsecond=0).isoformat()

    seconds = StreamingEngine._seconds_until(target)

    assert 0 < seconds <= 60


def test_seconds_until_accepts_utc_future_time():
    target = (datetime.now(timezone.utc) + timedelta(seconds=60)).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    seconds = StreamingEngine._seconds_until(target)

    assert 0 < seconds <= 60


def test_seconds_until_returns_zero_for_past_time():
    target = (datetime.now() - timedelta(seconds=60)).replace(microsecond=0).isoformat()

    assert StreamingEngine._seconds_until(target) == 0
