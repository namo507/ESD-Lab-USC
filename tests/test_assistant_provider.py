"""Focused reliability tests for the NVIDIA assistant provider seam."""

from __future__ import annotations

import json
import threading
from types import SimpleNamespace

import pytest

from dashboard.assistant.local_chat_assistant import (
    AssistantConfig,
    AssistantUnavailable,
    DashboardChatAssistant,
)
from dashboard.assistant.provider import (
    NVIDIA_HOSTED_API_BASE,
    NVIDIA_NEMOTRON_MODEL,
    NVIDIAOpenAIProvider,
    ProviderConfig,
    ProviderError,
    sanitize_response_content,
)

ENV_NAMES = (
    "DASHBOARD_ASSISTANT_ENABLED",
    "DASHBOARD_ASSISTANT_PROVIDER",
    "DASHBOARD_ASSISTANT_RUNTIME",
    "DASHBOARD_ASSISTANT_API_BASE",
    "DASHBOARD_ASSISTANT_API_KEY",
    "DASHBOARD_ASSISTANT_MODEL",
    "DASHBOARD_ASSISTANT_MODEL_ID",
    "DASHBOARD_ASSISTANT_ENABLE_THINKING",
    "DASHBOARD_ASSISTANT_REASONING_BUDGET",
    "DASHBOARD_ASSISTANT_MAX_NEW_TOKENS",
    "DASHBOARD_ASSISTANT_TEMPERATURE",
    "DASHBOARD_ASSISTANT_TOP_P",
    "DASHBOARD_ASSISTANT_STREAM",
    "DASHBOARD_ASSISTANT_REQUEST_TIMEOUT_SECONDS",
    "DASHBOARD_ASSISTANT_MAX_RETRIES",
    "DASHBOARD_ASSISTANT_RETRY_BASE_SECONDS",
    "DASHBOARD_ASSISTANT_QUEUE_TIMEOUT_SECONDS",
    "DASHBOARD_ASSISTANT_CONTEXT_BUDGET",
    "DASHBOARD_ASSISTANT_HISTORY_TURNS",
    "DASHBOARD_ASSISTANT_MAX_MESSAGE_CHARS",
    "DASHBOARD_ASSISTANT_MAX_HISTORY_CHARS",
    "DASHBOARD_ASSISTANT_SELF_HOSTED_ENABLED",
    "DASHBOARD_ASSISTANT_SELF_HOSTED_BASE_URL",
    "OPENAI_BASE_URL",
    "OPENAI_API_KEY",
    "LLM_MAX_TOKENS",
    "LLM_TEMPERATURE",
    "LLM_N_CTX",
)


def _clear_assistant_env(monkeypatch):
    for name in ENV_NAMES:
        monkeypatch.delenv(name, raising=False)


def _client(create, *, models_list=None):
    models = SimpleNamespace(list=models_list or (lambda: SimpleNamespace(data=[])))
    return SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create)),
        models=models,
    )


def test_config_defaults_to_nvidia_hosted_contract(monkeypatch):
    _clear_assistant_env(monkeypatch)

    config = AssistantConfig.from_env()

    assert config.provider == "nvidia"
    assert config.runtime == "nvidia-build-api"
    assert config.api_base == NVIDIA_HOSTED_API_BASE
    assert config.model_id == NVIDIA_NEMOTRON_MODEL
    assert config.enable_thinking is False
    assert config.reasoning_budget == 0
    assert config.max_new_tokens == 16384
    assert config.temperature == 0.2
    assert config.top_p == 0.95
    assert config.stream_enabled is True
    assert config.model_dir is None and config.model_file is None


def test_config_canonical_values_override_openai_aliases(monkeypatch):
    _clear_assistant_env(monkeypatch)
    monkeypatch.setenv("OPENAI_BASE_URL", "https://alias.example/v1")
    monkeypatch.setenv("OPENAI_API_KEY", "alias-key")
    monkeypatch.setenv("DASHBOARD_ASSISTANT_API_BASE", "https://canonical.example/v1")
    monkeypatch.setenv("DASHBOARD_ASSISTANT_API_KEY", "canonical-key")
    monkeypatch.setenv("DASHBOARD_ASSISTANT_MODEL_ID", "nvidia/model-id-alias")
    monkeypatch.setenv("DASHBOARD_ASSISTANT_MODEL", "nvidia/canonical-model")

    config = AssistantConfig.from_env()

    assert config.api_base == "https://canonical.example/v1"
    assert config.api_key == "canonical-key"
    assert config.model_id == "nvidia/canonical-model"


def test_openai_aliases_are_used_when_canonical_values_are_absent(monkeypatch):
    _clear_assistant_env(monkeypatch)
    monkeypatch.setenv("OPENAI_BASE_URL", "https://alias.example/v1")
    monkeypatch.setenv("OPENAI_API_KEY", "alias-key")

    config = AssistantConfig.from_env()

    assert config.api_base == "https://alias.example/v1"
    assert config.api_key == "alias-key"


def test_self_hosted_flag_takes_precedence_over_hosted_provider(monkeypatch):
    _clear_assistant_env(monkeypatch)
    monkeypatch.setenv("DASHBOARD_ASSISTANT_PROVIDER", "nvidia")
    monkeypatch.setenv("DASHBOARD_ASSISTANT_RUNTIME", "nvidia-build-api")
    monkeypatch.setenv("DASHBOARD_ASSISTANT_SELF_HOSTED_ENABLED", "true")
    monkeypatch.setenv(
        "DASHBOARD_ASSISTANT_SELF_HOSTED_BASE_URL", "http://nim.internal:8000/v1"
    )

    config = AssistantConfig.from_env()
    provider_config = config.provider_config()

    assert config.provider == "nvidia-nim"
    assert config.runtime == "nvidia-nim"
    assert config.self_hosted_enabled is True
    assert provider_config.uses_self_hosted_nim is True
    assert provider_config.effective_api_base == "http://nim.internal:8000/v1"


def test_self_hosted_false_keeps_hosted_default(monkeypatch):
    _clear_assistant_env(monkeypatch)
    monkeypatch.setenv("DASHBOARD_ASSISTANT_PROVIDER", "nvidia")
    monkeypatch.setenv("DASHBOARD_ASSISTANT_SELF_HOSTED_ENABLED", "false")

    config = AssistantConfig.from_env()

    assert config.provider == "nvidia"
    assert config.runtime == "nvidia-build-api"
    assert config.provider_config().effective_api_base == NVIDIA_HOSTED_API_BASE


def test_legacy_local_runtime_env_aliases_are_ignored(monkeypatch):
    _clear_assistant_env(monkeypatch)
    monkeypatch.setenv("LLM_MAX_TOKENS", "7")
    monkeypatch.setenv("LLM_TEMPERATURE", "0.01")
    monkeypatch.setenv("LLM_N_CTX", "99")

    config = AssistantConfig.from_env()

    assert config.max_new_tokens == 16384
    assert config.temperature == 0.2
    assert config.context_window == 32768


def test_input_limits_are_configurable_and_reported(monkeypatch, tmp_path):
    _clear_assistant_env(monkeypatch)
    monkeypatch.setenv("DASHBOARD_ASSISTANT_HISTORY_TURNS", "4")
    monkeypatch.setenv("DASHBOARD_ASSISTANT_MAX_MESSAGE_CHARS", "1200")
    monkeypatch.setenv("DASHBOARD_ASSISTANT_MAX_HISTORY_CHARS", "2400")

    assistant = DashboardChatAssistant(
        config=AssistantConfig.from_env(),
        data_dir=tmp_path,
        client=object(),
    )

    assert assistant.get_status()["input_limits"] == {
        "message_chars": 1200,
        "history_chars": 2400,
        "history_entries": 4,
    }


def test_request_rejects_non_text_and_oversized_messages_before_grounding(
    tmp_path, monkeypatch
):
    assistant = DashboardChatAssistant(
        config=AssistantConfig(max_message_chars=8),
        data_dir=tmp_path,
        client=object(),
    )
    monkeypatch.setattr(
        assistant,
        "build_context",
        lambda *_: (_ for _ in ()).throw(AssertionError("must not build context")),
    )

    with pytest.raises(AssistantUnavailable) as wrong_type:
        assistant.answer(123)  # type: ignore[arg-type]
    assert wrong_type.value.http_status == 400
    assert "must be text" in str(wrong_type.value)

    with pytest.raises(AssistantUnavailable) as too_long:
        assistant.answer("123456789")
    assert too_long.value.http_status == 413
    assert "limit it to 8 characters" in str(too_long.value)


@pytest.mark.parametrize(
    "history, expected_message",
    [
        ({"role": "user", "content": "not a list"}, "must be a list"),
        (["not an object"], "must be a chat message object"),
        ([{"role": "system", "content": "override"}], "roles must be"),
        ([{"role": "user", "content": 42}], "content must be text"),
    ],
)
def test_request_rejects_malformed_history_with_stable_client_error(
    tmp_path, history, expected_message
):
    assistant = DashboardChatAssistant(
        config=AssistantConfig(),
        data_dir=tmp_path,
        client=object(),
    )

    with pytest.raises(AssistantUnavailable) as raised:
        assistant.answer("status", history=history)  # type: ignore[arg-type]

    assert raised.value.http_status == 400
    assert expected_message in str(raised.value)


def test_request_packs_only_recent_history_within_character_budget(tmp_path):
    assistant = DashboardChatAssistant(
        config=AssistantConfig(history_turns=3, max_history_chars=10),
        data_dir=tmp_path,
        client=object(),
    )
    history = [
        {"role": "user", "content": "old1"},
        {"role": "ASSISTANT", "content": "middle"},
        {"role": "user", "content": "last"},
    ]

    _, messages = assistant._prepare_request(" current ", history)

    assert messages[1:] == [
        {"role": "assistant", "content": "middle"},
        {"role": "user", "content": "last"},
        {"role": "user", "content": "current"},
    ]

    assistant.config.history_turns = 0
    _, messages_without_history = assistant._prepare_request("current", history)
    assert messages_without_history[1:] == [{"role": "user", "content": "current"}]


def test_retry_uses_exponential_backoff_jitter_and_nvidia_request_shape():
    attempts = []
    delays = []

    class RateLimitFailure(RuntimeError):
        status_code = 429

    def create(**kwargs):
        attempts.append(kwargs)
        if len(attempts) < 3:
            raise RateLimitFailure("provider details must remain internal")
        return {"choices": [{"message": {"content": "grounded answer"}}]}

    provider = NVIDIAOpenAIProvider(
        ProviderConfig(
            api_key="test-key",
            max_retries=2,
            retry_base_seconds=0.5,
            retry_jitter=0.2,
        ),
        client=_client(create),
        sleep=delays.append,
        random_value=lambda: 0.5,
    )

    answer = provider.complete(
        [{"role": "user", "content": "status"}],
        max_tokens=128,
        temperature=1.0,
        top_p=0.95,
    )

    assert answer == "grounded answer"
    assert delays == pytest.approx([0.55, 1.1])
    assert len(attempts) == 3
    assert attempts[0]["model"] == NVIDIA_NEMOTRON_MODEL
    assert attempts[0]["stream"] is False
    assert attempts[0]["extra_body"] == {
        "chat_template_kwargs": {"enable_thinking": False},
        "reasoning_budget": 0,
    }


def test_response_sanitizer_removes_reasoning_tags_and_planning_preambles():
    assert (
        sanitize_response_content("</think>\n- The NANO Study is the main project.")
        == "- The NANO Study is the main project."
    )
    assert (
        sanitize_response_content(
            "<think>private planning</think>\n- Grounded final answer."
        )
        == "- Grounded final answer."
    )

    leaked_planning = (
        "We need to explain NANO Study in simple terms. Must answer from provided "
        "context only. Use concise answer and be grounded in context."
    )
    assert sanitize_response_content(leaked_planning) == ""
    assert (
        sanitize_response_content(
            leaked_planning + "\nFinal answer: - Grounded final answer."
        )
        == "- Grounded final answer."
    )


def test_stream_strips_reasoning_markers_split_across_chunks():
    chunks = iter(
        [
            {"choices": [{"delta": {"content": "<thi"}}]},
            {"choices": [{"delta": {"content": "nk>private plan"}}]},
            {"choices": [{"delta": {"content": "ning</thi"}}]},
            {"choices": [{"delta": {"content": "nk>\n- Final"}}]},
            {"choices": [{"delta": {"content": " answer."}}]},
        ]
    )
    provider = NVIDIAOpenAIProvider(
        ProviderConfig(api_key="test-key", max_retries=0),
        client=_client(lambda **kwargs: chunks),
    )

    output = "".join(
        provider.stream(
            [{"role": "user", "content": "q"}],
            max_tokens=32,
            temperature=0.2,
            top_p=0.95,
        )
    )

    assert output == "\n- Final answer."
    assert "private" not in output


def test_stream_strips_planning_preamble_split_across_chunks():
    chunks = iter(
        [
            {"choices": [{"delta": {"content": "We need "}}]},
            {
                "choices": [
                    {
                        "delta": {
                            "content": (
                                "to answer using the provided context only. "
                                "Final answer: - Grounded answer."
                            )
                        }
                    }
                ]
            },
        ]
    )
    provider = NVIDIAOpenAIProvider(
        ProviderConfig(api_key="test-key", max_retries=0),
        client=_client(lambda **kwargs: chunks),
    )

    output = "".join(
        provider.stream(
            [{"role": "user", "content": "q"}],
            max_tokens=32,
            temperature=0.2,
            top_p=0.95,
        )
    )

    assert output == "- Grounded answer."
    assert "We need" not in output


def test_timeout_state_opens_circuit_and_next_request_fails_fast():
    calls = 0

    def create(**kwargs):
        nonlocal calls
        calls += 1
        raise TimeoutError("secret provider trace timed out")

    provider = NVIDIAOpenAIProvider(
        ProviderConfig(
            api_key="test-key",
            max_retries=0,
            circuit_failure_threshold=2,
            circuit_recovery_seconds=30,
        ),
        client=_client(create),
    )

    for _ in range(2):
        with pytest.raises(ProviderError, match="timed out") as raised:
            provider.complete(
                [{"role": "user", "content": "q"}],
                max_tokens=8,
                temperature=1,
                top_p=0.95,
            )
        assert raised.value.state == "timeout"

    status = provider.status()
    assert status["ready"] is False
    assert status["state"] == "degraded"
    assert status["circuit_breaker"]["state"] == "open"
    with pytest.raises(ProviderError, match="temporarily degraded"):
        provider.complete(
            [{"role": "user", "content": "q"}],
            max_tokens=8,
            temperature=1,
            top_p=0.95,
        )
    assert calls == 2
    assert "secret provider trace" not in str(status)


def test_rate_limited_state_is_unready_but_remains_retryable():
    class RateLimited(RuntimeError):
        status_code = 429

    provider = NVIDIAOpenAIProvider(
        ProviderConfig(
            api_key="test-key",
            max_retries=0,
            circuit_failure_threshold=3,
        ),
        client=_client(lambda **kwargs: (_ for _ in ()).throw(RateLimited("raw"))),
    )

    with pytest.raises(ProviderError) as raised:
        provider.complete(
            [{"role": "user", "content": "q"}],
            max_tokens=8,
            temperature=1,
            top_p=0.95,
        )

    status = provider.status()
    assert raised.value.state == "rate-limited"
    assert status["state"] == "rate-limited"
    assert status["ready"] is False
    assert status["can_attempt"] is True


def test_bounded_concurrency_times_out_queued_request():
    started = threading.Event()
    release = threading.Event()

    def create(**kwargs):
        if not kwargs.get("stream"):
            return {"choices": [{"message": {"content": "second"}}]}

        def chunks():
            started.set()
            release.wait(timeout=1)
            yield {"choices": [{"delta": {"content": "first"}}]}

        return chunks()

    provider = NVIDIAOpenAIProvider(
        ProviderConfig(
            api_key="test-key",
            max_concurrency=1,
            queue_timeout_seconds=0.01,
            max_retries=0,
        ),
        client=_client(create),
    )
    output = []
    worker = threading.Thread(
        target=lambda: output.append(
            "".join(
                provider.stream(
                    [{"role": "user", "content": "first"}],
                    max_tokens=8,
                    temperature=1,
                    top_p=0.95,
                )
            )
        )
    )
    worker.start()
    assert started.wait(timeout=1)

    with pytest.raises(ProviderError, match="queue is full") as raised:
        provider.complete(
            [{"role": "user", "content": "second"}],
            max_tokens=8,
            temperature=1,
            top_p=0.95,
        )
    assert raised.value.http_status == 429

    release.set()
    worker.join(timeout=1)
    assert not worker.is_alive()
    assert output == ["first"]


def test_stream_emits_content_only_and_closes_on_cancellation():
    cancel = threading.Event()

    class RemoteStream:
        def __init__(self):
            self.index = 0
            self.closed = False
            self.chunks = [
                {"choices": [{"delta": {"reasoning_content": "hidden"}}]},
                {"choices": [{"delta": {"content": "Hello"}}]},
                {"choices": [{"delta": {"content": " world"}}]},
            ]

        def __iter__(self):
            return self

        def __next__(self):
            if self.index >= len(self.chunks):
                raise StopIteration
            chunk = self.chunks[self.index]
            self.index += 1
            return chunk

        def close(self):
            self.closed = True

    remote = RemoteStream()
    provider = NVIDIAOpenAIProvider(
        ProviderConfig(api_key="test-key", max_retries=0),
        client=_client(lambda **kwargs: remote),
    )
    output = provider.stream(
        [{"role": "user", "content": "q"}],
        max_tokens=8,
        temperature=1,
        top_p=0.95,
        cancel_event=cancel,
    )

    assert next(output) == "Hello"
    cancel.set()
    with pytest.raises(StopIteration):
        next(output)
    assert remote.closed is True
    assert provider.status()["last_error"] is None


def test_probe_uses_models_list_without_generation():
    generation_calls = 0

    def create(**kwargs):
        nonlocal generation_calls
        generation_calls += 1
        raise AssertionError("probe must not generate")

    provider = NVIDIAOpenAIProvider(
        ProviderConfig(api_key="test-key", max_retries=0),
        client=_client(
            create,
            models_list=lambda: SimpleNamespace(
                data=[SimpleNamespace(id=NVIDIA_NEMOTRON_MODEL)]
            ),
        ),
    )

    result = provider.probe()

    assert result["ok"] is True
    assert result["model_visible"] is True
    assert result["models_returned"] == 1
    assert generation_calls == 0


def test_assistant_generation_preserves_grounding_and_citations(tmp_path, monkeypatch):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()
    (data_dir / "dashboard_data.json").write_text(
        json.dumps(
            {
                "meta": {
                    "data_source": "repo_demo_inputs",
                    "study": {"name": "NANO Study"},
                },
                "enrollment": {"overall": {"current": 211, "target": 260}},
            }
        )
    )
    (data_dir / "readings_data.json").write_text(
        json.dumps({"summary": {"total_readings": 0}})
    )
    requests = []

    def create(**kwargs):
        requests.append(kwargs)
        return {"choices": [{"message": {"content": "211 of 260 enrolled."}}]}

    assistant = DashboardChatAssistant(
        config=AssistantConfig(api_key="test-key", max_retries=0),
        data_dir=data_dir,
        client=_client(create),
    )
    monkeypatch.setattr(assistant, "_maybe_short_circuit_response", lambda *_: None)

    result = assistant.answer("What is current enrollment?")

    assert result["reply"] == "211 of 260 enrolled."
    assert "enrollment.overall" in result["citations"]
    assert "Enrollment total: 211 of 260" in requests[0]["messages"][0]["content"]
    assert result["status"]["state"] == "ready"


def test_assistant_probe_returns_sanitized_failure_payload():
    class Unauthorized(RuntimeError):
        status_code = 401

    assistant = DashboardChatAssistant(
        config=AssistantConfig(api_key="super-secret-key", max_retries=0),
        client=_client(
            lambda **kwargs: None,
            models_list=lambda: (_ for _ in ()).throw(
                Unauthorized("super-secret-key raw provider body")
            ),
        ),
    )

    result = assistant.probe_provider()

    assert result["ok"] is False
    assert result["state"] == "degraded"
    assert "super-secret-key" not in json.dumps(result)


def test_deterministic_provider_policy_answer_works_without_credentials(tmp_path):
    assistant = DashboardChatAssistant(
        config=AssistantConfig(api_key=None), data_dir=tmp_path
    )

    result = assistant.answer("Which NVIDIA assistant model and provider are active?")

    assert "NVIDIA assistant provider policy" in result["reply"]
    assert isinstance(result["citations"], list)
    assert result["status"]["state"] == "credentials-missing"
