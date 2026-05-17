"""Tests for Bilibili service."""
import pytest
from src.services.bilibili import BilibiliService


@pytest.fixture
def service():
    return BilibiliService()


def test_service_initialization(service):
    """Test service initializes with empty cookies."""
    assert service._cookies == {}


@pytest.mark.asyncio
async def test_is_logged_in_false_when_no_cookies(service):
    """Test is_logged_in returns False when not logged in."""
    result = await service.is_logged_in()
    assert result is False


@pytest.mark.asyncio
async def test_logout_clears_cookies(service):
    """Test logout clears stored cookies."""
    service._cookies = {"cookie": "test"}
    await service.logout()
    assert service._cookies == {}