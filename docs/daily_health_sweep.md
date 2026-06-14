# Daily Full-Stack Health Sweep

The repository has a scheduled GitHub Actions workflow at
`.github/workflows/daily-health-sweep.yml`. It runs every day at 08:17 UTC and
can also be started manually from the Actions tab.

The sweep is intentionally repair-first and commit-later:

1. Reinstalls Python and frontend dependencies, retrying the frontend install if
   optional native packages are missing.
2. Cleans transient Python cache/test artifacts.
3. Applies safe auto-repairs with Black, isort, and ESLint `--fix`.
4. Regenerates dashboard/readings JSON through `make dashboard-refresh`.
5. Validates the GitHub workflow wiring with `scripts/check_github_workflows.py`.
6. Runs backend checks, pytest, frontend lint/tests/build, and Pages packaging.
7. Starts the local dashboard backend and checks `/api/healthz`.
8. Runs Playwright desktop/mobile visual checks with
   `web/scripts/visual-health-check.mjs`.
9. Probes the public Pages URLs, including `/overview` and
   `/?v=20260604-032545`.

If all checks pass and safe repairs changed tracked files, the workflow commits
them back to the branch. If the sweep cannot self-heal, it uploads screenshots,
runtime logs, probe output, and opens or updates the
`Daily full-stack health sweep failed` issue.

Run the visual check locally after starting the dashboard backend:

```bash
node web/scripts/visual-health-check.mjs \
  --base-url http://127.0.0.1:8080 \
  --live-url https://esd-lab-namo.pages.dev/overview \
  --live-url 'https://esd-lab-namo.pages.dev/?v=20260604-032545'
```
