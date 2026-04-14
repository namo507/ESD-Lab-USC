# REDCap Setup Guide — NANO Study

## 1. Longitudinal Project Setup

### 1.1 Create a New Longitudinal Project
1. Log in to your institution's REDCap instance.
2. Click **New Project** → select **Practice / Just for fun** or **Research** as project purpose.
3. Under *Project Type*, select **Longitudinal data collection with multiple events**.
4. Enter project title: `NANO Study` and click **Create Project**.

### 1.2 Define Arms
Navigate to **Project Setup → Define My Events and Designate Instruments for My Events**.

| Arm # | Arm Label |
|-------|-----------|
| 1 | NICU & Follow-Up |

### 1.3 Define Events
Add the following events under Arm 1:

| Event Name (unique) | Event Label | Days Offset |
|---------------------|-------------|-------------|
| `nicu_admission_arm_1` | NICU Admission | 0 |
| `month_1_arm_1` | Month 1 | 30 |
| `month_2_arm_1` | Month 2 | 60 |
| `month_3_arm_1` | Month 3 | 90 |
| `month_6_arm_1` | Month 6 | 180 |
| `month_9_arm_1` | Month 9 | 270 |
| `month_12_arm_1` | Month 12 | 365 |
| `month_24_arm_1` | Month 24 | 730 |
| `month_36_arm_1` | Month 36 | 1095 |

### 1.4 Create Instruments
Go to **Online Designer** and create the following instruments:
- `demographics` — baseline only
- `medical_history` — baseline only
- `ados_assessment` — designated to assessment events
- `bayley_scales` — designated to follow-up events
- `ecg_session` — designated to all follow-up events
- `parent_questionnaire` — all events

### 1.5 Designate Instruments to Events
Use **Designate Instruments for My Events** to assign each instrument to the appropriate event(s). Only assign instruments that are relevant to each time point to minimize data entry burden.

---

## 2. API Setup and Token Generation

1. Navigate to **Project Setup → API**.
2. Click **Manage All Project Tokens** (requires admin) or **Request API Token**.
3. Select permissions: Export Records, Import Records, Export Metadata, Export Field Names.
4. The token will appear on the API Tokens page after admin approval.
5. Store the token in your `.env` file (never in source code):
   ```
   REDCAP_API_TOKEN=your_token_here
   REDCAP_API_URL=https://redcap.yourinstitution.edu/api/
   ```
6. Load in R with `Sys.getenv("REDCAP_API_TOKEN")` or in Python with `os.environ["REDCAP_API_TOKEN"]`.

---

## 3. External Module Deployment for JS Hooks

1. Download the desired External Module from the REDCap Repo or GitHub.
2. Place unzipped module folder in `<redcap_root>/modules/`.
3. In REDCap: **Control Center → External Modules → Manage** → Enable module for your project.
4. Configure module settings per its documentation.
5. For custom JS hooks without an EM, use **Online Designer → Instrument-level custom action tags** or the built-in `@CALCTEXT` / `@HIDDEN` action tags.

---

## 4. Automated Survey Invitations

1. Enable surveys on the instrument: **Online Designer → Enable as Survey**.
2. Go to **Survey Distribution Tools → Automated Invitations**.
3. Click **Set Up Automated Invitations** for the target instrument.
4. Define the condition (e.g., *event = month_1_arm_1 AND enrollment_complete = 2*).
5. Set delay: e.g., send 1 day after condition is met.
6. Optionally set reminders at 3 days and 7 days if not completed.

---

## 5. Double-Entry Configuration

1. Go to **Project Setup → Enable optional modules → Double Data Entry**.
2. Assign roles: **Reviewer** sees both entries; **Data Entry Person 1/2** sees only their own.
3. After both entries are saved, the Reviewer resolves discrepancies in **Data Comparison Tool**.

---

## 6. Event Naming Conventions

All event unique names follow the pattern: `{label}_{arm_label}`.  
Example: `month_1_arm_1`, `nicu_admission_arm_1`.  
**Rules:** lowercase, underscores only, no spaces, no special characters.

---

## 7. Troubleshooting

| Issue | Cause | Resolution |
|-------|-------|------------|
| API returns 403 | Token lacks permission | Request additional API rights from admin |
| Missing events in export | Instruments not designated | Re-check event-instrument designation |
| Survey link not sending | Condition logic error | Test condition in Record Status Dashboard |
| Double-entry locked | Both entries not complete | Ensure both DDE users have saved their forms |
| External module not visible | Not enabled for project | Enable in Project Settings → External Modules |
