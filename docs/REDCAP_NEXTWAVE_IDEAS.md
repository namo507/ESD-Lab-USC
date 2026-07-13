# REDCap Next-Wave Implementation Notes

Verified prompt source: `design-ideas/NANO-REDCap-NextWave-Feature-Ideas-Prompt.md`.

This repository now emits the additive REDCap v3 contract from the Python, R, and synthetic dashboard builders:

- `redcap_clinical`
- `redcap_integrity`
- `redcap_schedule`
- `redcap_respondent`
- `redcap_platform`
- `redcap_predictive`
- `clinical_cutoffs`

The shared controls live in `config/dashboard_controls.json`. EPDS cutoffs, ASQ zones, visit-window tolerance, small-cell suppression, and differential-privacy epsilon are treated as Tier-1 knobs and are snapshotted into `redcap_ops.controls_snapshot`.

Automation path:

1. `make redcap-publish`
2. Pull and QC REDCap data.
3. Rebuild `dashboard/data/dashboard_data.json`.
4. Regenerate TypeScript REDCap constants.
5. Emit assistant context and reindex the NVIDIA-hosted grounded assistant.
6. Build Pages and run Docker/Kubernetes health checks.

Privacy stance:

- Clinical and respondent views use aggregate rows or hashed record IDs only.
- REDCap token-backed platform endpoints remain server-side.
- Public views combine small-cell suppression with a visible differential-privacy count toggle.
- Missing REDCap metadata is marked with `TODO(verify)` instead of being treated as a verified score field.
