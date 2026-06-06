# Technical Debt Register

## Large Dashboard Modules

- `dashboard/server/live_dashboard_server.py` is intentionally broad because it owns local runtime orchestration, API fallback behavior, and SPA build serving. Split into server, assistant proxy, and build orchestration modules before adding more endpoints.
- `dashboard/assistant/local_chat_assistant.py` owns local model loading, retrieval context assembly, and assistant response generation. Split model lifecycle, context indexing, and chat surfaces before adding a second assistant backend.

Sweep note, 2026-06-06: `radon cc -s -a` reports average complexity B across
these modules. Highest hotspots are:

- `DashboardChatAssistant._maybe_short_circuit_response`: F (69)
- `DashboardChatAssistant.build_context`: F (48)
- `normalize_deck_plan`: F (42)
- `RepoRequestHandler._handle_v2_api`: E (37)
- `_v2_rsa_trajectories`: D (25)
