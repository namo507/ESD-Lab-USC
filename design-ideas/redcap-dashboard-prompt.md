# Feature Implementation Prompt: REDCap-Integrated Participant Tracker Dashboard
## For: https://esd-lab-namo.pages.dev/redcap | Repo: https://github.com/namo507/ESD-Lab-USC

---

## CONTEXT AND BACKGROUND

You are building a new feature page at the `/redcap` route of an existing React + Vite research lab dashboard deployed on Cloudflare Pages (https://esd-lab-namo.pages.dev). The dashboard belongs to the ESD Lab at USC and is used by research coordinators who manage a longitudinal infant development study.

The study uses REDCap to collect caregiver questionnaires (including the CSBS Caregiver Questionnaire) at 6-month, 9-month, and 12-month visit timepoints. The research team currently has a known issue where incomplete surveys from earlier timepoints carry forward into later visits due to a structural limitation in REDCap's Survey Queue, causing data to land in the wrong event columns. The fix (Form Display Logic + Auto-Continue + Missing Data Codes) is already being implemented directly in REDCap. This dashboard feature is the companion monitoring and coordination layer that runs alongside REDCap using the REDCap API.

The REDCap instance is hosted at the user's institution. The API token will be stored as an environment variable (REDCAP_API_TOKEN) in Cloudflare Pages. REDCap's API endpoint follows the standard format: https://[institution-redcap-url]/api/

---

## THE CORE FEATURE IDEA: "Participant Visit Health Monitor" — A REDCap-Integrated Coordination Panel

### Concept
Build a real-time, REDCap-API-powered coordination panel embedded at /redcap that gives research coordinators a bird's-eye view of every participant's survey completion status across all three visit timepoints (6m, 9m, 12m), with intelligent anomaly detection that automatically flags the specific carry-forward misalignment issue described above — before it corrupts data.

Think of it as a "mission control" layer on top of REDCap: coordinators see everything they need without logging into REDCap itself, and the system proactively alerts them when the exact known failure mode (a misaligned CSBS CG survey) is occurring or about to occur.

---

## TECHNICAL ARCHITECTURE

### Stack
- Frontend: React + Vite (existing project structure)
- Deployment: Cloudflare Pages
- API proxy: Cloudflare Pages Functions (functions/api/redcap.js) to handle CORS and keep the API token server-side
- REDCap API: POST requests to the institution's REDCap API endpoint
- Styling: Match existing dashboard design system (Tailwind CSS or whatever CSS framework is already in use in the repo)
- State management: React hooks (useState, useEffect, useCallback) — no external state library needed
- Charts: Recharts or Chart.js (whichever is already in package.json; add Recharts if neither is present)

### Cloudflare Pages Function (Proxy Layer)
Create the file: functions/api/redcap.js

This function receives POST requests from the React frontend, injects the REDCAP_API_TOKEN environment variable, and forwards them to the REDCap API endpoint. This keeps the token completely server-side and solves CORS since all requests appear same-origin to the browser.

```javascript
// functions/api/redcap.js
export async function onRequestPost(context) {
  const { REDCAP_API_TOKEN, REDCAP_API_URL } = context.env;
  
  const body = await context.request.json();
  
  const formData = new URLSearchParams({
    token: REDCAP_API_TOKEN,
    format: 'json',
    returnFormat: 'json',
    ...body
  });

  const response = await fetch(REDCAP_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString()
  });

  const data = await response.json();
  
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
```

Set these in Cloudflare Pages environment variables:
- REDCAP_API_TOKEN = [your REDCap project API token]
- REDCAP_API_URL = https://[your-institution].edu/redcap/api/

---

## FEATURES TO BUILD (implement all of the following)

---

### FEATURE 1: Participant Visit Status Grid

A color-coded grid/table showing all participant records with their survey completion status per event per instrument.

**Data fetching (call via the proxy):**
```
POST /api/redcap
Body: {
  content: 'record',
  type: 'flat',
  exportSurveyFields: 'true',
  exportDataAccessGroups: 'false'
}
```

**What to render:**
- One row per participant (record_id)
- Columns: Record ID | 6m Visit Date | 6m CSBS Status | 9m Visit Date | 9m CSBS Status | 12m Visit Date | 12m CSBS Status | Anomaly Flag
- Status values from REDCap's _complete field: 0 = Incomplete (red badge), 1 = Unverified (yellow badge), 2 = Complete (green badge), "" = Not started (grey badge), "SKIP" = Intentionally skipped (blue badge with skip icon)
- Color-code each cell using a consistent status color system

**Anomaly detection logic (run client-side after data loads):**
Flag a participant row as "⚠️ Carry-Forward Risk" if ANY of the following conditions are true:
1. The 6m CSBS status is 0 (incomplete) AND the 9m visit_date is not blank (meaning the 9m visit has already started — the 6m form should have been closed already)
2. The 9m CSBS status is 0 (incomplete) AND the 12m visit_date is not blank
3. The 6m CSBS status is blank ("") AND the 9m CSBS status is 2 (complete) — data may have already shifted
4. Any event has a CSBS _complete value of 0 while the NEXT event's visit_date is non-null

These four conditions directly encode the exact failure mode from the lab's documented issue.

---

### FEATURE 2: Real-Time Anomaly Alert Banner

At the top of the /redcap page, display a dismissible banner that shows:
- Total number of participants currently flagged with carry-forward risk
- A collapsible list of the flagged record IDs and the specific risk condition
- A "Last checked: [timestamp]" indicator
- A "Refresh" button that re-fetches from REDCap API

If zero anomalies: show a green "All records clean — no carry-forward risks detected" status bar.
If anomalies exist: show an amber warning banner with the count and expandable details.

This is the single most operationally valuable feature because it replaces the current manual case-by-case audit with an automated early-warning system.

---

### FEATURE 3: Visit Completion Progress Tracker (Visual)

A stacked bar chart or grouped bar chart (using Recharts) showing:
- X axis: the three visit timepoints (6m, 9m, 12m)
- Y axis: count of participants
- Stacked segments: Complete (green) | Unverified (yellow) | Incomplete (orange) | Not Started (grey) | Skipped (blue)
- Hovering over a segment shows the record IDs in that category for that timepoint

This gives the PI and coordinators an instant visual progress overview during lab meetings.

**Data source:** Same record export as Feature 1, aggregated client-side by event and _complete status.

---

### FEATURE 4: Individual Record Detail Modal / Drawer

Clicking any row in the Feature 1 grid opens a right-side drawer (or modal) for that specific participant showing:
- All three visit timepoints with their dates and CSBS completion status
- The survey timestamp fields (if exported: [instrument]_timestamp) to show when each form was last touched
- A timeline visualization: horizontal line with three nodes (6m, 9m, 12m), color-coded by status
- If the participant is flagged for carry-forward risk: a prominent red alert card explaining exactly which timepoint is at risk and what the coordinator should do (the exact FDL/visit_date action from the solution doc)
- A direct deep-link button: "Open in REDCap →" that constructs the REDCap record URL for that participant

**Data fetching for detail view:**
```
POST /api/redcap
Body: {
  content: 'record',
  type: 'flat',
  records: '[record_id]',
  exportSurveyFields: 'true'
}
```

---

### FEATURE 5: Missing Data Code Tracker

A separate tab or collapsible section within the /redcap page that shows:
- All records where the CSBS fields contain the "SKIP" missing data code (indicating the visit was intentionally skipped using the new workflow)
- A count of total skipped timepoints by visit month
- A "Coverage" metric: (Complete + Skipped) / Total expected = effective data coverage rate per timepoint

This lets the team distinguish between "data we don't have because something went wrong" vs. "data we intentionally don't have because the visit was skipped" — directly addressing the audit trail concern from the solution documentation.

---

### FEATURE 6: Visit Date Entry Quick-Action Panel

A staff-only quick-entry form within the /redcap page that allows coordinators to enter a visit date for a participant without navigating to REDCap:

- Dropdown: select participant record ID
- Dropdown: select visit timepoint (6m / 9m / 12m)
- Date picker: visit date
- Submit button: "Record Visit Start"

On submit, call the REDCap API to save the visit_date field via the import records endpoint:
```
POST /api/redcap
Body: {
  content: 'record',
  action: 'import',
  data: JSON.stringify([{
    record_id: selectedRecord,
    redcap_event_name: selectedEvent,
    visit_date: formattedDate
  }])
}
```

This is the linchpin of the entire FDL-based fix: the visit_date entry is what disables the previous event's form. Making it easy to do from the dashboard means the fix gets used consistently by the team.

After a successful import, automatically refresh the Feature 1 grid to reflect the updated state.

Include a confirmation toast notification: "Visit date recorded for [record_id] at [event]. REDCap Form Display Logic will now disable the previous timepoint's CSBS survey."

---

## PAGE LAYOUT STRUCTURE

```
/redcap page layout:

[Header: "REDCap Study Monitor — Nano Study | Powered by REDCap API"]
[Last synced: timestamp | Refresh button | Sync status indicator]

[Anomaly Alert Banner — Feature 2]

[Tab Bar: Overview | Records | Visit Entry | Coverage]

Tab: Overview
  [Feature 3: Visit Completion Progress Chart]
  [Feature 5: Missing Data Code / Skipped Visits Summary]

Tab: Records
  [Feature 1: Participant Visit Status Grid]
  [Feature 4: Record Detail Drawer — opens on row click]

Tab: Visit Entry
  [Feature 6: Visit Date Quick-Action Panel]

Tab: Coverage
  [Aggregate stats: % complete by timepoint, CSBS completion rates, anomaly history log]
```

---

## COMPONENT FILE STRUCTURE TO CREATE

```
src/
  pages/
    REDCapMonitor.jsx          — main page component, handles routing tabs
  components/redcap/
    AnomalyBanner.jsx          — Feature 2
    ParticipantGrid.jsx        — Feature 1
    RecordDetailDrawer.jsx     — Feature 4
    VisitCompletionChart.jsx   — Feature 3
    MissingDataTracker.jsx     — Feature 5
    VisitDateEntryForm.jsx     — Feature 6
  hooks/
    useREDCapData.js           — custom hook for API calls and polling
  utils/
    redcapHelpers.js           — anomaly detection logic, status color mapping, event name constants
  constants/
    redcapConfig.js            — event names, instrument names, status codes
functions/
  api/
    redcap.js                  — Cloudflare Pages Function proxy (server-side token injection)
```

---

## CONSTANTS / CONFIGURATION (fill in with actual values from the REDCap project)

```javascript
// src/constants/redcapConfig.js
export const EVENTS = {
  SIX_MONTH:   'visit_6m_arm_1',   // replace with actual unique event name
  NINE_MONTH:  'visit_9m_arm_1',
  TWELVE_MONTH:'visit_12m_arm_1'
};

export const INSTRUMENTS = {
  CSBS_CG: 'csbs_cg'              // replace with actual instrument variable name
};

export const VISIT_DATE_FIELD = 'visit_date';  // replace with actual field name

export const COMPLETE_STATUS = {
  INCOMPLETE:   '0',
  UNVERIFIED:   '1',
  COMPLETE:     '2',
  NOT_STARTED:  '',
  SKIPPED:      'SKIP'
};

export const STATUS_COLORS = {
  '0':    { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Incomplete' },
  '1':    { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Unverified' },
  '2':    { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Complete'   },
  '':     { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Not Started'},
  'SKIP': { bg: 'bg-blue-100',   text: 'text-blue-600',   label: 'Skipped'    }
};
```

---

## ANOMALY DETECTION UTILITY FUNCTION

```javascript
// src/utils/redcapHelpers.js

export function detectCarryForwardRisk(records) {
  // records is a flat array of REDCap record rows (one per record_id + event pair)
  // group by record_id first
  const byRecord = {};
  records.forEach(row => {
    if (!byRecord[row.record_id]) byRecord[row.record_id] = {};
    byRecord[row.record_id][row.redcap_event_name] = row;
  });

  const flagged = [];

  Object.entries(byRecord).forEach(([recordId, events]) => {
    const e6  = events['visit_6m_arm_1']  || {};
    const e9  = events['visit_9m_arm_1']  || {};
    const e12 = events['visit_12m_arm_1'] || {};

    const risks = [];

    // Risk 1: 6m CSBS incomplete but 9m visit has started
    if (e6.csbs_cg_complete === '0' && e9.visit_date && e9.visit_date !== '') {
      risks.push('6m CSBS is incomplete but 9m visit has already started — carry-forward active');
    }

    // Risk 2: 9m CSBS incomplete but 12m visit has started
    if (e9.csbs_cg_complete === '0' && e12.visit_date && e12.visit_date !== '') {
      risks.push('9m CSBS is incomplete but 12m visit has already started — carry-forward active');
    }

    // Risk 3: 6m CSBS blank but 9m CSBS complete (data may have already shifted)
    if ((e6.csbs_cg_complete === '' || !e6.csbs_cg_complete) && e9.csbs_cg_complete === '2') {
      risks.push('6m CSBS is blank but 9m CSBS is complete — possible data misalignment already occurred');
    }

    // Risk 4: 9m CSBS blank but 12m CSBS complete
    if ((e9.csbs_cg_complete === '' || !e9.csbs_cg_complete) && e12.csbs_cg_complete === '2') {
      risks.push('9m CSBS is blank but 12m CSBS is complete — possible data misalignment already occurred');
    }

    if (risks.length > 0) {
      flagged.push({ recordId, risks });
    }
  });

  return flagged;
}
```

---

## POLLING / AUTO-REFRESH

Implement a polling mechanism in useREDCapData.js that:
- On initial page load: fetches all records from REDCap API
- Auto-refreshes every 5 minutes (configurable via a constant)
- Shows a "Last synced: X minutes ago" indicator that counts up in real time
- On manual "Refresh" button click: immediately re-fetches and resets the countdown
- Uses a loading skeleton state while data is being fetched (not a full-page spinner — just shimmer rows in the grid)

---

## UX / DESIGN REQUIREMENTS

- Match the existing ESD Lab dashboard color scheme, font, and component style exactly — do not introduce a new design system
- All status badges must be accessible (sufficient color contrast + text label, not just color alone)
- The anomaly banner should be the first thing a coordinator sees when opening the page — make it visually prominent (amber/red background if anomalies present, green if clean)
- The Participant Grid must be sortable by: Record ID, Visit Date, Anomaly Flag (anomalous records sort to top by default)
- The grid must be filterable by: status (show only incomplete / only flagged / only skipped)
- On mobile/tablet, the grid collapses into a card view per participant
- All REDCap API errors must surface as user-friendly toast notifications (not console-only errors), e.g., "Could not connect to REDCap API — check token configuration"

---

## SECURITY REQUIREMENTS

- The REDCAP_API_TOKEN must NEVER appear in the frontend JavaScript bundle. It lives only in Cloudflare Pages environment variables and is injected by the server-side function.
- All REDCap API calls must route through the Cloudflare Pages Function proxy at /api/redcap — never call the REDCap API directly from the browser.
- The /redcap page should check for an authenticated session before rendering the data grid (use whatever auth mechanism is already in the existing dashboard).
- Log all API calls and errors to the browser console in development mode, silent in production.

---

## IMPLEMENTATION NOTES AND CONSTRAINTS

1. The instrument variable name for CSBS CG and the exact unique event names (visit_6m_arm_1 etc.) must be confirmed from the actual REDCap project's Codebook before finalizing the constants file. Placeholder values are used above — replace them before deploying.

2. The visit_date field variable name must also be confirmed from the Codebook. If no such field currently exists, it needs to be added to REDCap first as part of the FDL implementation (see the full REDCap solution document).

3. REDCap's flat export format returns one row per record_id + event combination. The anomaly detection utility groups these by record_id before analysis.

4. The import records call in Feature 6 (Visit Date Entry) requires the API token to have import rights. Confirm this with the REDCap admin when requesting the token.

5. The Cloudflare Pages Function (functions/api/redcap.js) will need to be added to the repository root, not inside /src. Cloudflare Pages automatically detects and deploys files in the /functions directory.

6. Add the following to wrangler.toml (create it at the repo root if it does not exist):
   compatibility_date = "2024-11-25"

7. For local development, use: npx wrangler pages dev dist --binding REDCAP_API_TOKEN=your_token_here --binding REDCAP_API_URL=https://your-redcap.edu/api/

---

## DELIVERABLE CHECKLIST

When complete, the /redcap page should:
- [ ] Load all participant records from REDCap API on mount via the secure proxy
- [ ] Display a color-coded status grid with all participants, all three events, CSBS completion per event
- [ ] Automatically flag carry-forward risk records with ⚠️ and surface them in an anomaly banner at the top
- [ ] Show a grouped bar chart of completion status across all three visit timepoints
- [ ] Allow clicking any participant row to open a detail drawer with timeline and risk explanation
- [ ] Show a Missing Data Code tracker distinguishing SKIP-coded records from missing records
- [ ] Allow staff to enter a visit date from the dashboard (which triggers REDCap FDL to disable the prior event)
- [ ] Auto-refresh every 5 minutes with a visible countdown
- [ ] Show zero sensitive data (API token, raw REDCap URLs) in the frontend bundle
- [ ] Handle errors gracefully with user-facing toast messages
- [ ] Be fully functional on Cloudflare Pages with the Cloudflare Pages Function proxy in place
