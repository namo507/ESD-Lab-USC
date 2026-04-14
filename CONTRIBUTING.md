# Contributing to NANO Study Repository

Thank you for contributing to the NANO Study codebase. Please follow these guidelines to maintain code quality and HIPAA compliance.

## Table of Contents
- [HIPAA Requirements](#hipaa-requirements)
- [Branching Strategy](#branching-strategy)
- [Commit Conventions](#commit-conventions)
- [Pull Request Checklist](#pull-request-checklist)
- [Code Style](#code-style)
- [Development Workflow](#development-workflow)

---

## HIPAA Requirements

**Before contributing any code:**
1. Complete CITI Human Subjects (Social/Behavioral) training
2. Sign the USC IRB data-use agreement (contact PI)
3. Review `docs/hipaa_compliance_checklist.md`
4. Never commit files matching patterns in `.gitignore`
5. All data access must use `config/paths.yml` — no hardcoded paths

---

## Branching Strategy

We use **Git Flow** with these permanent branches:

```
main          <- Production-ready, stable code only. Protected branch.
develop       <- Integration branch for features. CI must pass to merge.
```

### Short-lived Branches

| Branch Type | Naming Pattern | Branch From | Merge Into |
|-------------|---------------|-------------|------------|
| Feature | `feature/<issue-number>-short-description` | `develop` | `develop` |
| Hotfix | `hotfix/<issue-number>-short-description` | `main` | `main` + `develop` |
| Release | `release/<version>` | `develop` | `main` + `develop` |
| Experiment | `experiment/<name>` | `develop` | Never merged (archive) |

### Examples

```bash
# Start a new feature
git checkout develop
git pull origin develop
git checkout -b feature/42-add-rsa-extraction

# Work, commit, then open PR into develop
git push origin feature/42-add-rsa-extraction
```

---

## Commit Conventions

We follow **Conventional Commits** (`https://www.conventionalcommits.org`):

```
<type>(<scope>): <short description>

[optional body]

[optional footer: BREAKING CHANGE, Closes #issue]
```

### Types

| Type | When to Use |
|------|------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no logic change |
| `refactor` | Code restructure, no behavior change |
| `test` | Add or fix tests |
| `chore` | Build, CI, dependency updates |
| `data` | Data dictionary, config, path changes |
| `analysis` | New analysis script or notebook |
| `security` | Security or HIPAA compliance fix |

### Examples

```
feat(ecg): add RSA extraction via continuous wavelet transform

Implements RSA computation using the 0.12-0.4 Hz respiratory band
extracted via Morlet wavelet decomposition.

Closes #17
```

```
fix(redcap): handle pagination for records > 10000 rows

The pull function previously silently truncated large exports.
Now uses chunk_size=1000 with page offset.
```

---

## Pull Request Checklist

All PRs must pass these checks before review:

### Automated (CI)
- [ ] `pytest` passes with no failures
- [ ] `black --check` passes (no formatting issues)
- [ ] `flake8` passes (no linting errors)

### Manual (Author)
- [ ] No PHI, raw data, or credentials committed (check `.gitignore`)
- [ ] No hardcoded absolute paths — all paths via `config/paths.yml`
- [ ] New Python functions have type hints + Google-style docstrings
- [ ] New R functions have `roxygen2` documentation
- [ ] Tests added for new features / bug fixes
- [ ] `docs/` updated if protocol or workflow changed
- [ ] `CHANGELOG.md` entry added under `[Unreleased]`
- [ ] At least one co-author has reviewed the code
- [ ] For analysis changes: results validated against known test cases

### For Data Pipeline Changes
- [ ] Tested on synthetic data before running on real data
- [ ] Deidentification audit log reviewed
- [ ] REDCap API calls use pagination (not single large export)

---

## Code Style

### Python
- Formatter: **black** (line length 88)
- Linter: **flake8** (configured in `.flake8`)
- Type hints required for all function signatures
- Docstrings: **Google style**

```python
def compute_rmssd(ibi_series: pd.Series) -> float:
    """Compute RMSSD from inter-beat interval series.

    Args:
        ibi_series: Pandas Series of IBI values in milliseconds.
            Must have at least 2 valid values.

    Returns:
        Root mean square of successive differences in milliseconds.

    Raises:
        ValueError: If ibi_series has fewer than 2 non-null values.
    """
```

### R
- Style: **tidyverse** style guide
- Docstrings: **roxygen2** format

```r
#' Compute RMSSD from IBI vector
#'
#' @param ibi_vec Numeric vector of inter-beat intervals in milliseconds.
#' @return Numeric scalar: root mean square of successive differences (ms).
#' @export
#' @examples
#' compute_rmssd(c(850, 860, 840, 870, 855))
compute_rmssd <- function(ibi_vec) {
  diffs <- diff(ibi_vec)
  sqrt(mean(diffs^2, na.rm = TRUE))
}
```

### Running Quality Checks

```bash
make lint         # Run black + flake8 + isort
make test         # Run pytest
make install      # Install/update dependencies
```

---

## Development Workflow

1. **Create issue** describing the change needed
2. **Assign** yourself and add appropriate labels
3. **Branch** from `develop` following naming convention
4. **Develop** with frequent small commits
5. **Test locally** with `make test`
6. **Lint** with `make lint`
7. **Open PR** with completed checklist
8. **Request review** from at least one team member
9. **Address review comments**
10. **Squash and merge** into `develop`

For questions, contact the lab Slack `#nano-repo` channel or email the PI.
