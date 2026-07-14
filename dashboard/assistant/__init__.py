"""Dashboard assistant package."""

from .local_chat_assistant import (
    AssistantConfig,
    AssistantUnavailable,
    DashboardChatAssistant,
)
from .nano_buddy import BuddyRequestError, NanoBuddyAssistant
from .provider import NVIDIAOpenAIProvider, ProviderConfig, ProviderError

__all__ = [
    "AssistantConfig",
    "AssistantUnavailable",
    "BuddyRequestError",
    "DashboardChatAssistant",
    "NanoBuddyAssistant",
    "NVIDIAOpenAIProvider",
    "ProviderConfig",
    "ProviderError",
]
