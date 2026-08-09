"""Tests for the dashboard chat assistant scaffolding."""

from __future__ import annotations

import json
import threading
import time

from dashboard.assistant.local_chat_assistant import (
    AssistantConfig,
    DashboardChatAssistant,
)


def test_build_context_prioritizes_matching_dashboard_fragments(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()

    dashboard_payload = {
        "meta": {
            "data_source": "repo_demo_inputs",
            "study": {"name": "NANO Study"},
        },
        "enrollment": {
            "overall": {"current": 209, "target": 260},
            "by_group": {
                "ASIB": {"current": 54, "target": 65},
                "PT": {"current": 104, "target": 130},
            },
        },
        "redcap_audit": {"summary": {"open_queries": 78}},
        "ml_performance": {
            "models": [
                {"model_name": "Random Forest", "auroc": 0.82},
                {"model_name": "1D-CNN + LSTM", "auroc": 0.899},
            ]
        },
        "organization_site": {
            "stories": [
                {
                    "title": "Enrollment news",
                    "summary": "Current model story with noisy terms.",
                },
            ]
        },
    }
    readings_payload = {
        "summary": {"total_readings": 20},
        "featured": [{"title": "Autonomic pathways in autism"}],
    }

    (data_dir / "dashboard_data.json").write_text(json.dumps(dashboard_payload))
    (data_dir / "readings_data.json").write_text(json.dumps(readings_payload))

    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=data_dir,
    )

    context = assistant.build_context(
        "What is the best model AUROC and current enrollment?"
    )

    assert "Enrollment total: 209 of 260" in context["context"]
    assert any(citation == "enrollment.overall" for citation in context["citations"])
    assert any(
        citation == "ml_performance.models[1]" for citation in context["citations"]
    )
    assert not any(
        citation.startswith("organization_site") for citation in context["citations"]
    )


def test_build_context_keeps_enrollment_questions_tight_and_relevant(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()

    dashboard_payload = {
        "meta": {
            "data_source": "repo_demo_inputs",
            "study": {"name": "NANO Study"},
        },
        "enrollment": {
            "overall": {"current": 209, "target": 260},
            "by_group": {
                "ASIB": {"current": 54, "target": 65},
                "PT": {"current": 104, "target": 130},
            },
        },
        "participant_operations": {
            "summary": {
                "single": 140,
                "dual": 18,
                "risk_watch": 9,
                "risk_high": 2,
            },
            "meta": {"source_doc": "docs/participant_operations_workflow.md"},
        },
        "lab_operations": {
            "priority": {
                "current_priority": "Nano grant data and lab processes first",
            },
            "workflow_phases": [
                {"phase": "Phase 1", "timeframe": "Now", "status": "active"}
            ],
        },
        "organization_site": {
            "stories": [{"title": "Enrollment news", "summary": "Public site summary."}]
        },
    }
    (data_dir / "dashboard_data.json").write_text(json.dumps(dashboard_payload))
    (data_dir / "readings_data.json").write_text(json.dumps({"summary": {}}))

    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=data_dir,
    )

    context = assistant.build_context("What is current enrollment?")

    assert context["focus_sections"] == ["enrollment"]
    assert "Enrollment total: 209 of 260" in context["context"]
    assert "Participant operations:" not in context["context"]
    assert len(context["context"]) < 1200


def test_child_friendly_nano_explainer_is_grounded_and_structured(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()
    (data_dir / "dashboard_data.json").write_text(
        json.dumps(
            {
                "meta": {
                    "data_source": "repo_demo_inputs",
                    "study": {"name": "NANO Study"},
                },
                "lab_operations": {
                    "priority": {
                        "current_priority": "Nano grant data and lab processes first",
                        "scope_guardrail": "Use de-identified aggregate status only",
                    }
                },
                "organization_site": {
                    "studies": [
                        {
                            "slug": "nano-study",
                            "title": "NANO Study",
                            "summary": (
                                "A newborn study that follows babies through their first "
                                "3 years, tracking social, motor, and language skills while "
                                "giving families feedback and tips."
                            ),
                            "compensation": "up to $250",
                        }
                    ]
                },
            }
        )
    )
    (data_dir / "readings_data.json").write_text(json.dumps({"summary": {}}))
    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=data_dir,
    )

    result = assistant.answer("Explain the NANO Study like I am 5 years old.")

    reply = result["reply"]
    assert result["citations"][0] == "organization_site.studies[0]"
    assert reply.count("\n-") == 3
    assert "first 3 years" in reply
    assert "social, movement, and language" in reply
    assert "feedback and tips" in reply
    assert "up to $250" in reply
    assert "We need to" not in reply


def test_child_friendly_nano_explainer_does_not_invent_missing_public_facts(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()
    (data_dir / "dashboard_data.json").write_text(
        json.dumps(
            {
                "meta": {"study": {"name": "NANO Study"}},
                "organization_site": {
                    "studies": [
                        {
                            "slug": "nano-study",
                            "title": "NANO Study",
                            "summary": "A public study page is available.",
                        }
                    ]
                },
            }
        )
    )
    (data_dir / "readings_data.json").write_text(json.dumps({"summary": {}}))
    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=data_dir,
    )

    result = assistant.answer("Explain the NANO Study like I am 5 years old.")

    reply = result["reply"]
    assert "first 3 years" not in reply
    assert "social, movement, and language" not in reply
    assert "up to $250" not in reply


def test_assistant_short_circuits_next_wave_feature_context(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()

    dashboard_payload = {
        "meta": {
            "data_source": "repo_demo_inputs",
            "study": {"name": "NANO Study"},
        },
        "hda_composition": {
            "by_group": {
                "VPT": [
                    {
                        "month": 0,
                        "orienting": 0.34,
                        "sustained": 0.27,
                        "inattention": 0.21,
                        "termination": 0.18,
                    }
                ],
                "ASIB": [],
                "TD": [],
            }
        },
        "attrition_funnel": {
            "stages": [{"label": "Analysis-ready", "retainedPct": 81.4}]
        },
        "county_profiles": [
            {
                "county": "Richland County",
                "fips": "45079",
                "participants": 42,
                "sdohScore": 58,
            }
        ],
    }
    (data_dir / "dashboard_data.json").write_text(json.dumps(dashboard_payload))
    (data_dir / "readings_data.json").write_text(json.dumps({"summary": {}}))

    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=data_dir,
    )

    context = assistant.build_context("Explain the CGA milestone river")
    response = assistant._maybe_short_circuit_response(
        "Explain the CGA milestone river",
        context,
    )

    assert response is not None
    assert "CGA Milestone River" in response
    assert "hda_composition" in response


def test_assistant_answers_nvidia_provider_policy_before_leaderboard(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()
    (data_dir / "dashboard_data.json").write_text(
        json.dumps(
            {
                "meta": {"data_source": "repo_demo_inputs"},
                "ml_performance": {
                    "models": [{"model_name": "1D-CNN + LSTM", "auroc": 0.899}]
                },
            }
        )
    )
    (data_dir / "readings_data.json").write_text(json.dumps({"summary": {}}))

    assistant = DashboardChatAssistant(
        config=AssistantConfig(
            model_id="nvidia/nemotron-3-super-120b-a12b",
            model_tier="hosted",
            model_label="NVIDIA Nemotron 3 Super 120B A12B",
            runtime="nvidia-build-api",
        ),
        data_dir=data_dir,
    )

    question = (
        "Which NVIDIA model and provider are configured for ESD Buddy, and "
        "what happens when the provider is rate limited?"
    )
    context = assistant.build_context(question)
    response = assistant._maybe_short_circuit_response(question, context)

    assert response is not None
    assert "NVIDIA assistant provider policy:" in response
    assert "NVIDIA Nemotron 3 Super 120B A12B" in response
    assert "nvidia-build-api" in response
    assert "external rate limits still apply" in response
    assert "model leaderboard" not in response.lower()


def test_query_burden_question_does_not_hit_caregiver_burden_shortcut(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()
    (data_dir / "dashboard_data.json").write_text(
        json.dumps(
            {
                "meta": {"data_source": "repo_demo_inputs"},
                "redcap_audit": {"summary": {"open_queries": 78}},
                "redcap_respondent": {
                    "caregiver_burden": [
                        {
                            "label": "Caregiver 1",
                            "completed": 12,
                            "assigned": 20,
                            "fatigue_index": 0.2,
                        }
                    ]
                },
            }
        )
    )
    (data_dir / "readings_data.json").write_text(json.dumps({"summary": {}}))

    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=data_dir,
    )

    context = assistant.build_context(
        "How much open REDCap query burden is visible right now?"
    )
    response = assistant._maybe_short_circuit_response(
        "How much open REDCap query burden is visible right now?",
        context,
    )

    assert response is None


def test_assistant_answers_rmss_typo_with_rmssd_trajectory_values(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()
    (data_dir / "dashboard_data.json").write_text(
        json.dumps(
            {
                "meta": {"data_source": "repo_demo_inputs"},
                "trajectories": {
                    "months": [3, 6, 12],
                    "by_group": {
                        "PT": {"mean": {"RMSSD": [31.2, 34.2, None]}},
                        "TD": {"mean": {"RMSSD": [32.6, 36.5, 44.9]}},
                    },
                    "biomarkers": ["RMSSD"],
                },
            }
        )
    )
    (data_dir / "readings_data.json").write_text(json.dumps({"summary": {}}))

    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=data_dir,
    )

    context = assistant.build_context("what is rmss median")
    response = assistant._maybe_short_circuit_response("what is rmss median", context)

    assert response is not None
    assert "RMSSD is the root mean square" in response
    assert "- PT: 34.2 ms at 6 months CGA." in response
    assert "- TD: 44.9 ms at 12 months CGA." in response


def test_stream_serializes_concurrent_model_generations(tmp_path, monkeypatch):
    class SingleFlightGenerator:
        def __init__(self) -> None:
            self.active = False
            self.started = threading.Event()
            self.release = threading.Event()

        def create_chat_completion(self, **kwargs):
            assert kwargs.get("stream") is True

            def chunks():
                if self.active:
                    raise RuntimeError("model busy - another request in flight")
                self.active = True
                self.started.set()
                self.release.wait(timeout=1)
                try:
                    yield {"choices": [{"delta": {"content": "ok"}}]}
                finally:
                    self.active = False

            return chunks()

    generator = SingleFlightGenerator()
    assistant = DashboardChatAssistant(
        config=AssistantConfig(
            api_key="test-key",
            max_concurrency=1,
            generation_queue_timeout_seconds=1.0,
        ),
        data_dir=tmp_path,
        client=generator,
    )
    monkeypatch.setattr(
        assistant,
        "_prepare_request",
        lambda message, history=None: (
            {"citations": [], "facts": {}, "grounded": True},
            [{"role": "user", "content": message}],
        ),
    )
    monkeypatch.setattr(assistant, "_maybe_short_circuit_response", lambda *_: None)

    replies: list[str] = []
    errors: list[str] = []

    def run_stream() -> None:
        try:
            replies.append("".join(assistant.stream("status?")))
        except Exception as exc:  # pragma: no cover - assertion reports details
            errors.append(str(exc))

    first = threading.Thread(target=run_stream)
    second = threading.Thread(target=run_stream)
    first.start()
    assert generator.started.wait(timeout=1)
    second.start()
    time.sleep(0.05)
    generator.release.set()
    first.join(timeout=1)
    second.join(timeout=1)

    assert not first.is_alive()
    assert not second.is_alive()
    assert errors == []
    assert replies == ["ok", "ok"]


def test_status_reports_missing_provider_credentials(tmp_path):
    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=tmp_path,
    )

    status = assistant.get_status()

    assert not status["ready"]
    assert status["state"] == "credentials-missing"
    assert "credentials" in status["message"].lower()
    assert status["model_path"] is None


def test_status_ready_with_injected_provider_client(tmp_path):
    assistant = DashboardChatAssistant(
        config=AssistantConfig(),
        data_dir=tmp_path,
        client=object(),
    )

    status = assistant.get_status()

    assert status["ready"] is True
    assert status["state"] == "ready"
    assert status["provider"] == "nvidia"
    assert status["runtime"] == "nvidia-build-api"
    assert status["model_path"] is None


def test_summary_derives_enrollment_total_from_groups(tmp_path):
    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=tmp_path,
    )

    summary = assistant._build_summary_block(
        payload={
            "meta": {"study": {"name": "NANO Study", "n_target": 260}},
            "enrollment": {
                "by_group": {
                    "ASIB": {"current": 53, "target": 65},
                    "PT": {"current": 105, "target": 130},
                    "TD": {"current": 53, "target": 65},
                }
            },
            "redcap_audit": {"summary": {"open_queries": 78}},
        },
        readings={"summary": {"total_readings": 20}},
    )

    assert "Enrollment total: 211 of 260" in summary
    assert "Open REDCap queries: 78" in summary


def test_summary_uses_best_model_actual_index(tmp_path):
    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=tmp_path,
    )

    fragments = assistant._build_summary_fragments(
        payload={
            "meta": {"study": {"name": "NANO Study", "n_target": 260}},
            "enrollment": {"overall": {"current": 211, "target": 260}},
            "ml_performance": {
                "models": [
                    {"name": "Random Forest", "auroc": 0.82},
                    {"name": "1D-CNN + LSTM", "auroc": 0.899},
                    {"name": "XGBoost", "auroc": 0.859},
                ]
            },
        },
        readings={"summary": {"total_readings": 20}},
    )

    assert (
        "ml_performance.models[1]",
        "Best model: 1D-CNN + LSTM (0.899)",
    ) in fragments


def test_assistant_answers_redcap_runtime_parity_from_ops_payload(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()
    (data_dir / "dashboard_data.json").write_text(
        json.dumps(
            {
                "meta": {
                    "data_source": "repo_demo_inputs",
                    "study": {"name": "NANO Study"},
                },
                "redcap_ops": {
                    "runtime_parity": {
                        "pages": "abc12345",
                        "docker": "abc12345",
                        "k8s": "abc12345",
                    }
                },
            }
        )
    )
    (data_dir / "readings_data.json").write_text(json.dumps({"summary": {}}))

    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=data_dir,
    )

    context = assistant.build_context("Are Pages, Docker, and K8s in runtime parity?")
    response = assistant._maybe_short_circuit_response(
        "Are Pages, Docker, and K8s in runtime parity?",
        context,
    )

    assert response is not None
    assert "in sync" in response
    assert "pages=abc12345" in response


def test_assistant_answers_redcap_furthest_behind_from_trackers(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()
    (data_dir / "dashboard_data.json").write_text(
        json.dumps(
            {
                "meta": {
                    "data_source": "repo_demo_inputs",
                    "study": {"name": "NANO Study"},
                },
                "redcap_trackers": {
                    "enrollment": [
                        {
                            "event": "6_months_arm_1",
                            "label": "6 months",
                            "expected": 50,
                            "completed": 45,
                        },
                        {
                            "event": "24_months_arm_1",
                            "label": "24 months",
                            "expected": 40,
                            "completed": 20,
                        },
                    ]
                },
            }
        )
    )
    (data_dir / "readings_data.json").write_text(json.dumps({"summary": {}}))

    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=data_dir,
    )

    context = assistant.build_context("Which REDCap event is furthest behind target?")
    response = assistant._maybe_short_circuit_response(
        "Which REDCap event is furthest behind target?",
        context,
    )

    assert response is not None
    assert "24 months is furthest behind target" in response
    assert "20/40 complete" in response


def test_assistant_answers_redcap_epds_next_wave_from_clinical_payload(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()
    (data_dir / "dashboard_data.json").write_text(
        json.dumps(
            {
                "meta": {
                    "data_source": "repo_demo_inputs",
                    "study": {"name": "NANO Study"},
                },
                "clinical_cutoffs": {"epds_positive": 10, "epds_high": 13},
                "redcap_clinical": {
                    "epds_trajectory": [
                        {
                            "event": "24_months_arm_1",
                            "label": "24 Months",
                            "screen_positive": 7,
                            "high_concern": 3,
                            "self_harm_flags": 1,
                        },
                        {
                            "event": "36_months_arm_1",
                            "label": "36 Months",
                            "screen_positive": 5,
                            "high_concern": 2,
                            "self_harm_flags": 0,
                        },
                    ]
                },
                "redcap_schedule": {"upcoming_visits": []},
            }
        )
    )
    (data_dir / "readings_data.json").write_text(json.dumps({"summary": {}}))

    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=data_dir,
    )

    context = assistant.build_context("How many mothers are EPDS screen-positive?")
    response = assistant._maybe_short_circuit_response(
        "How many mothers are EPDS screen-positive?",
        context,
    )

    assert response is not None
    assert "12 screen-positive" in response
    assert "cutoff >= 10" in response


def test_assistant_answers_lab_operations_rollout_from_payload(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()
    (data_dir / "dashboard_data.json").write_text(
        json.dumps(
            {
                "meta": {
                    "data_source": "repo_demo_inputs",
                    "study": {"name": "NANO Study"},
                },
                "lab_operations": {
                    "priority": {
                        "current_priority": "Nano grant data and lab processes first; Nico remains visible.",
                    },
                    "workflow_phases": [
                        {
                            "phase": "Onboarding and observation",
                            "timeframe": "Weeks 1-2",
                            "status": "active",
                        },
                        {
                            "phase": "Data and process standardization",
                            "timeframe": "Weeks 3-4",
                            "status": "next",
                        },
                    ],
                    "role_workflows": [
                        {
                            "role": "Coordinators",
                            "focus": "Visits and blockers.",
                            "handoff": "Daily check-in notes.",
                        }
                    ],
                },
            }
        )
    )
    (data_dir / "readings_data.json").write_text(json.dumps({"summary": {}}))

    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=data_dir,
    )

    context = assistant.build_context("Summarize the Nano rollout workflow phase")
    response = assistant._maybe_short_circuit_response(
        "Summarize the Nano rollout workflow phase",
        context,
    )

    assert response is not None
    assert "Nano grant data" in response
    assert "Onboarding and observation" in response


def test_assistant_answers_lab_reporting_from_payload(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()
    (data_dir / "dashboard_data.json").write_text(
        json.dumps(
            {
                "meta": {
                    "data_source": "repo_demo_inputs",
                    "study": {"name": "NANO Study"},
                },
                "lab_operations": {
                    "reporting_management": {
                        "status": "planning",
                        "goal": "Define actionable reporting before formal templates.",
                        "priority_note": "Start with demographic availability and participant tracking.",
                        "alignment_rule": "Align priority data sets before building reports.",
                    },
                    "reporting_reviews": [
                        {
                            "area": "Demographic data availability",
                            "status": "highest priority",
                            "source_system": "REDCap demographics",
                            "why_actionable": "Needed for cohort composition.",
                            "breakdowns": ["study lane", "cohort/group"],
                            "next_action": "Time a de-identified REDCap pull.",
                        }
                    ],
                    "priority_datasets": [
                        {
                            "name": "Nano demographic baseline",
                            "study": "NANO",
                            "owner": "Coordinator plus data lead",
                            "source_system": "REDCap demographics_complete_this_first",
                            "pull_speed": "Measure during Week 3",
                            "readiness": "priority draft",
                            "report_use": "cohort composition",
                        }
                    ],
                    "budget_reporting": {
                        "goal": "Make budget-facing work possible from prepared aggregate inputs.",
                        "current_gap": "Budget tasks are slowed by manual processes.",
                        "ready_now": ["enrollment versus target"],
                        "needs_alignment": ["finance-approved sources"],
                        "guardrail": "Do not connect live budget ledgers without approval.",
                    },
                },
            }
        )
    )
    (data_dir / "readings_data.json").write_text(json.dumps({"summary": {}}))

    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=data_dir,
    )

    context = assistant.build_context(
        "Which reporting needs and budget data should we prioritize?"
    )
    response = assistant._maybe_short_circuit_response(
        "Which reporting needs and budget data should we prioritize?",
        context,
    )

    assert response is not None
    assert "Budget reporting goal" in response
    assert "prepared aggregate inputs" in response
