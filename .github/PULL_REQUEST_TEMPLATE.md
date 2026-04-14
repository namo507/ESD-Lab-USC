## Description
<!-- Briefly describe the change and the motivation -->

## Type of Change
- [ ] New feature
- [ ] Bug fix
- [ ] Documentation update
- [ ] Refactor (no behavior change)
- [ ] Data pipeline change
- [ ] Security / HIPAA compliance fix

## Automated Checks
- [ ] `pytest tests/` passes locally
- [ ] `black --check` passes
- [ ] `flake8` passes

## HIPAA Compliance
- [ ] No PHI committed (verified against `.gitignore`)
- [ ] No hardcoded absolute data paths
- [ ] All data access via `config/paths.yml`
- [ ] Audit log reviewed if data transformations changed
- [ ] No credentials, tokens, or `.env` values in code

## Code Quality
- [ ] Type hints added to all new Python functions
- [ ] Google-style docstrings on all new Python functions
- [ ] Roxygen2 docs on all new R functions
- [ ] Tests added or updated for changed functionality
- [ ] `CHANGELOG.md` updated under `[Unreleased]`

## For Data Pipeline Changes Only
- [ ] Tested on synthetic data before running on real data
- [ ] Deidentification audit log reviewed
- [ ] REDCap API calls use pagination (not single large export)
- [ ] Output paths are config-driven, not hardcoded

## Reviewer Notes
<!-- Anything the reviewer should pay special attention to -->
