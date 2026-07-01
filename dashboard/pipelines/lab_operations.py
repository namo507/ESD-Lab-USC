"""Lab operations workflow payload for the ESD Lab dashboard.

This block intentionally separates operations planning from scientific model
outputs.  It gives the dashboard and local assistant the same structured view of
Nano-first rollout priorities, Nico secondary integration, REDCap standardizing,
role handoffs, and expectation-management guardrails.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_lab_operations_payload(generated_at: str | None = None) -> dict[str, Any]:
    """Return a de-identified operations plan shared by UI and assistant."""

    timestamp = generated_at or _iso_now()
    return {
        "generated_at": timestamp,
        "source_documents": [
            {
                "study": "NANO",
                "file": "esd-lab-readings/NANO.pdf",
                "pages": 107,
                "award": "R01MH132925",
                "status": "primary operational focus",
            },
            {
                "study": "NICO",
                "file": "esd-lab-readings/NICO.pdf",
                "pages": 105,
                "award": "R01MH138028",
                "status": "secondary integration focus",
            },
        ],
        "priority": {
            "primary_objective": "Improve lab workflow, data handling, and operational efficiency without setting unrealistic expectations.",
            "secondary_objective": "Align academic research outputs with operational needs for daily lab function.",
            "current_priority": "Nano grant data and lab processes first; Nico remains visible as the secondary study lane.",
            "decision_dependency": "Pace rollout with Sam and Dr. Bradshaw decision availability.",
            "scope_guardrail": "Use de-identified aggregate status only; family-facing visualizations stay exploratory until approved.",
        },
        "dashboard_surface_status": [
            {
                "area": "Overview",
                "status": "live",
                "shown": "Lab Pulse KPIs, NANO/NICO study hero, pipeline DAG, cluster operations, readings geography, ESD Buddy, participant flow, and progress rings.",
                "next_need": "Make Nano-first operational workflow and role handoffs explicit.",
            },
            {
                "area": "REDCap",
                "status": "live",
                "shown": "Sync freshness, visit health, carry-forward risk, completeness heatwall, anomaly board, runtime parity, controls, and next-wave REDCap panels.",
                "next_need": "Standardize coding conventions and make inefficiencies easier to capture during observation.",
            },
            {
                "area": "Participants",
                "status": "live",
                "shown": "De-identified participant table, intake/story routing, participant detail, dual-study role badges, form policy, and timeline/passport links.",
                "next_need": "Map coordinator scheduling, assessment collection, and packet checks into repeatable steps.",
            },
            {
                "area": "Study Analytics",
                "status": "live",
                "shown": "Results and trajectories, HDA player, ECG quality, SHAP/model surfaces, NANO LGCM trajectories, and NICO Aim 3 clusters.",
                "next_need": "Separate operational summaries from manuscript-ready research reporting templates.",
            },
            {
                "area": "Assistant",
                "status": "live",
                "shown": "Hover-aware Buddy glossary, local GGUF chat drawer, assistant status, REDCap freshness, and fast-path prompts.",
                "next_need": "Ground assistant answers in the same lab-operations payload shown on the dashboard.",
            },
        ],
        "current_problems": [
            {
                "category": "Operational gaps",
                "items": [
                    "Many moving parts across research, visits, assessments, scoring, and reporting.",
                    "Coordinator, graduate-student, and undergraduate workflows need clearer boundaries.",
                    "Coding and data handling practices vary across lab members.",
                ],
            },
            {
                "category": "Data management",
                "items": [
                    "Most data lives in REDCap, but usage patterns vary by project.",
                    "Nano and Nico integration is limited and should be staged rather than forced.",
                    "Operational dashboards and academic writing outputs need distinct definitions.",
                ],
            },
            {
                "category": "Family perspective",
                "items": [
                    "Families currently receive text updates and on-site assessments.",
                    "Data sharing outside individual feedback on request is minimal.",
                    "Family-facing insight views should remain future-feasibility work until approved.",
                ],
            },
            {
                "category": "Resource management",
                "items": [
                    "Rollout must avoid overloading staff.",
                    "Priority decisions should align with Sam and Dr. Bradshaw availability.",
                    "Quick wins should be small, reversible, and visible to operators.",
                ],
            },
        ],
        "recommendations": [
            {
                "horizon": "Short-term",
                "items": [
                    "Shadow coordinators and learn REDCap workflows before changing process.",
                    "Start early requests with Nano data and document quick wins.",
                    "Capture visit scheduling, assessment collection, scoring, and blocker patterns.",
                ],
            },
            {
                "horizon": "Medium-term",
                "items": [
                    "Map graduate and undergraduate coding/scoring handoffs.",
                    "Draft aligned operational and research metrics.",
                    "Create a standard coding and data-handling system before expanding scope.",
                ],
            },
            {
                "horizon": "Long-term",
                "items": [
                    "Scale the workflow system to Nico and future grants.",
                    "Evaluate optional family-facing aggregate insights only after governance review.",
                    "Keep dashboards, reports, and assistant context synchronized from one payload.",
                ],
            },
        ],
        "workflow_phases": [
            {
                "id": "phase-1",
                "phase": "Onboarding and observation",
                "timeframe": "Weeks 1-2",
                "status": "active",
                "study_focus": "Nano first, Nico document context second",
                "tasks": [
                    "Read Nano and Nico grant documents at high level.",
                    "Shadow coordinators on visit scheduling, assessment collection, and scoring.",
                    "Document workflows, bottlenecks, and daily blockers.",
                    "Run morning and afternoon check-ins.",
                ],
                "outputs": ["Initial process map", "Quick-win opportunity list"],
                "owners": ["Coordinator", "Supervisor", "Lab operations analyst"],
            },
            {
                "id": "phase-2",
                "phase": "Data and process standardization",
                "timeframe": "Weeks 3-4",
                "status": "next",
                "study_focus": "Nano REDCap and coding conventions",
                "tasks": [
                    "Explore Nano REDCap dataset structure.",
                    "Identify inconsistencies in coding, scoring, and handoff practices.",
                    "Create a workflow chart across coordinator, graduate-student, and undergraduate tasks.",
                    "Draft aligned metrics for operations and research reporting.",
                ],
                "outputs": ["Standardized workflow documentation", "Draft operational metrics list"],
                "owners": ["Coordinator", "Graduate students", "Undergraduates"],
            },
            {
                "id": "phase-3",
                "phase": "Pilot improvements and reporting",
                "timeframe": "Months 2-3",
                "status": "planned",
                "study_focus": "Nano reports and coordinator quick wins",
                "tasks": [
                    "Implement small coordinator workflow improvements.",
                    "Build Nano data summaries for research outputs.",
                    "Coordinate priority assignments with Sam and Dr. Bradshaw.",
                    "Prepare lab and academic reporting templates.",
                ],
                "outputs": ["Pilot process improvements", "First structured lab report or dashboard"],
                "owners": ["Coordinator", "Sam", "Dr. Bradshaw", "Analyst"],
            },
            {
                "id": "phase-4",
                "phase": "Long-term growth and integration",
                "timeframe": "Month 3+",
                "status": "future",
                "study_focus": "Nico integration and multi-grant scale",
                "tasks": [
                    "Expand validated improvements to Nico.",
                    "Explore feasibility of family-facing aggregate insights.",
                    "Develop multi-grant data workflow management.",
                    "Keep academic and operational outputs aligned.",
                ],
                "outputs": ["Scalable workflow system", "Enhanced data management and reporting structure"],
                "owners": ["Operations team", "Study leads", "Data team"],
            },
        ],
        "role_workflows": [
            {
                "role": "Coordinators",
                "focus": "Visits, scheduling, packet readiness, assessment collection, and immediate blockers.",
                "handoff": "Daily check-in notes, REDCap status flags, visit-window updates, and unresolved family logistics.",
            },
            {
                "role": "Graduate students",
                "focus": "Scoring oversight, analytic interpretation, coding reliability, and manuscript-aligned metrics.",
                "handoff": "Coding decisions, reliability notes, analysis-ready variable definitions, and review queues.",
            },
            {
                "role": "Undergraduates",
                "focus": "Frame-by-frame coding, data entry support, scoring prep, and defined QA checks.",
                "handoff": "Coding logs, timestamp/sync flags, incomplete-scoring queues, and exception notes.",
            },
            {
                "role": "Supervisors",
                "focus": "Priority setting, scope control, escalation, and approval for family-facing or cross-grant changes.",
                "handoff": "Morning priorities, afternoon blockers, and decisions needed from Sam or Dr. Bradshaw.",
            },
        ],
        "draft_metrics": [
            {
                "name": "REDCap freshness",
                "kind": "operations",
                "definition": "Hours since the last successful REDCap-derived dashboard payload.",
                "status": "live",
            },
            {
                "name": "Visit-window adherence",
                "kind": "operations",
                "definition": "Difference between actual/forecast visit timing and protocol target window.",
                "status": "live",
            },
            {
                "name": "Coding queue age",
                "kind": "operations",
                "definition": "Oldest unscored or unreviewed coding/scoring item by study and visit.",
                "status": "draft",
            },
            {
                "name": "Assessment completion coverage",
                "kind": "operations and research",
                "definition": "Complete plus intentional skip states divided by expected assessments.",
                "status": "live",
            },
            {
                "name": "Analysis-ready Nano summary",
                "kind": "research",
                "definition": "Nano-specific output separating operational completeness from manuscript-ready variables.",
                "status": "draft",
            },
        ],
        "daily_routine": [
            {
                "block": "Morning check-in",
                "purpose": "Align priorities, confirm visit windows, and name decisions or blockers.",
            },
            {
                "block": "Observation/analysis block",
                "purpose": "Shadow workflows, inspect REDCap, document bottlenecks, or draft process artifacts.",
            },
            {
                "block": "Afternoon check-in",
                "purpose": "Share findings, capture blockers, and set the next smallest useful step.",
            },
        ],
        "rollout_controls": [
            "All data access and workflow tasks stay within business hours and visit time frames.",
            "Data outside approved visit windows is not used for dashboard or assistant outputs.",
            "New workflow changes should be piloted as quick wins before becoming lab-wide process.",
            "Assistant responses must use the same de-identified operations payload shown in the dashboard.",
        ],
        "quick_wins": [
            "Add a Nano-first operations status panel to Overview.",
            "Expose coordinator, graduate-student, and undergraduate handoffs in one visible workflow.",
            "Add assistant prompts for rollout plan, role handoffs, REDCap standardization, and family-facing feasibility.",
            "Keep Nico present as a secondary lane without forcing premature integration.",
        ],
        "family_data_sharing": {
            "current_state": "Text updates, on-site assessments, and individual feedback on request.",
            "near_term_policy": "Do not add family-facing participant visualizations yet.",
            "future_option": "Explore aggregate, plain-language insights after supervisor and governance review.",
        },
        "assistant_sync": {
            "context_key": "lab_operations",
            "buddy_insights": [
                "lab-ops-priority",
                "lab-ops-workflow",
                "lab-ops-roles",
                "lab-ops-metrics",
                "lab-ops-family",
            ],
            "fast_paths": [
                "Summarize the Nano-first rollout plan.",
                "What should coordinators, grad students, and undergrads each own?",
                "Which metrics should we draft for operations versus research?",
                "What is safe to share with families right now?",
            ],
        },
    }
