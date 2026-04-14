# Onboarding Guide — NANO Study ESD Lab

Welcome to the NANO Study team! This guide will help you set up your development environment and get started contributing.

## Prerequisites Checklist

- [ ] Complete **CITI Human Subjects Research** training (Social/Behavioral focus)
  - URL: https://about.citiprogram.org/
  - Send completion certificate to PI before accessing any data
- [ ] Sign USC IRB **Data Use Agreement** (contact PI for form)
- [ ] Request **REDCap access**: email research-computing@sc.edu with PI approval
- [ ] Request **GitHub team invite**: ask PI to add you to the `namo507/ESD-Lab-USC` repo
- [ ] Request **secure server access**: contact USC Research Computing with PI authorization
- [ ] Set up USC **VPN** (required for secure server access): https://sc.edu/about/offices_and_divisions/division_of_information_technology/security/vpn/

## Repository Setup (10 Steps)

```bash
# 1. Clone the repository
git clone https://github.com/namo507/ESD-Lab-USC.git
cd ESD-Lab-USC

# 2. Create Python virtual environment
python3 -m venv .venv
source .venv/bin/activate  # macOS/Linux

# 3. Install Python dependencies
make install

# 4. Install R dependencies (in R/RStudio console)
# install.packages("renv")
# renv::restore()

# 5. Copy environment template
cp .env.example .env

# 6. Mount the secure data drive (macOS example)
# sudo mkdir -p /Volumes/nano_secure
# mount -t smbfs //your_netid@research.sc.edu/nano_study /Volumes/nano_secure

# 7. Edit .env with your credentials
# NANO_DATA_ROOT=/Volumes/nano_secure
# REDCAP_API_TOKEN=<your_token_from_REDCap>

# 8. Verify configuration
make check-env

# 9. Run tests (should pass on synthetic data)
make test

# 10. Set up pre-commit hooks
pre-commit install
```

## REDCap Resources for Longitudinal Studies

The NANO Study uses REDCap in **longitudinal mode** with multiple arms and events. These resources will help you understand the data structure:

| Resource | URL | Description |
|----------|-----|-------------|
| **REDCap Official Docs** | https://projectredcap.org | Official documentation, training videos, and user guides |
| **Temple University REDCap Longitudinal Guide** | https://redcap.temple.edu/guides/longitudinal_studies.pdf | Practical step-by-step guide for longitudinal project setup |
| **ITHS REDCap Longitudinal Studies Class** | https://www.iths.org/investigators/services/bmi/redcap/ | PDF training materials for longitudinal data collection |
| **REDCapR Package Docs** | https://cran.r-project.org/package=REDCapR | R package for REDCap API access; function reference and vignettes |
| **REDCap Community Forum** | https://community.projectredcap.org | Peer support, tips, and troubleshooting for REDCap users |

## First Tasks

- [ ] Read `docs/hipaa_compliance_checklist.md`
- [ ] Read `docs/ecg_processing_protocol.md`
- [ ] Run `notebooks/01_redcap_data_exploration.ipynb` with synthetic data
- [ ] Review `data/data_dictionary/NANO_master_data_dictionary.csv`
- [ ] Make a test PR to `develop` branch (e.g., fix a typo in docs)

## Lab Conventions

- **Branches**: `feature/<issue-number>-description` (see `docs/git_workflow.md`)
- **Commits**: Conventional Commits format (see `CONTRIBUTING.md`)
- **Data**: Never hardcode paths — always use `config/paths.yml`
- **Meetings**: Weekly lab meeting Fridays 10am; monthly data review with PI

## Contact Directory

| Issue | Contact | Email |
|-------|---------|-------|
| Repository / code questions | Lead programmer | (see Slack #nano-repo) |
| REDCap access | USC Research Computing | research-computing@sc.edu |
| Secure server issues | USC IT | ithelp@sc.edu |
| IRB / HIPAA questions | PI Dr. Bradshaw | bradshaw@mailbox.sc.edu |
| ECG/physiology methods | Co-I Dr. O'Reilly | (see Slack) |
| NICU recruitment | Co-I Dr. Dail | (see Slack) |
| Participant scheduling | Lab coordinator | (see Slack #nano-scheduling) |
