"""Dashboard assistant package."""

from .local_chat_assistant import (
    AssistantConfig,
    AssistantUnavailable,
    DashboardChatAssistant,
)
from .provider import NVIDIAOpenAIProvider, ProviderConfig, ProviderError

__all__ = [
    "AssistantConfig",
    "AssistantUnavailable",
    "DashboardChatAssistant",
    "NVIDIAOpenAIProvider",
    "ProviderConfig",
    "ProviderError",
]
