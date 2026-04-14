# REDCap Hooks

## Overview
REDCap Hooks allow custom JavaScript to run within REDCap data entry pages without modifying the REDCap core. In modern REDCap deployments, hooks are implemented as **External Modules** via the REDCap External Module Framework.

## Hook Files in This Directory

| File | Purpose |
|------|---------|
| `auto_complete_dob.js` | Auto-calculates adjusted age in months from DOB + visit date |
| `participant_id_validator.js` | Validates NANO participant ID format (NANO-XXXX) on data entry |
| `visit_completion_checker.js` | Checks all required fields complete before form submission |
| `flag_missing_ecg.js` | Flags record if ECG transfer not confirmed within 48 hours |

## Deployment as External Module

### Prerequisites
- REDCap version 8.7.0 or later (External Module Framework)
- REDCap Administrator access

### Deployment Steps

1. **Package the module:**
   Each hook corresponds to an External Module. Create a module directory under `modules/` on your REDCap server:
   ```
   /var/www/html/redcap/modules/nano_hooks_v1.0/
   ```

2. **Create `config.json`** in the module directory:
   ```json
   {
     "name": "NANO Study Data Entry Hooks",
     "namespace": "NANO\\Hooks",
     "description": "Custom validation and auto-calculation hooks for NANO Study",
     "versions": [{"0.1": "Initial release"}],
     "framework-version": 10,
     "enable-every-page": false,
     "project-settings": []
   }
   ```

3. **Create `ExternalModule.php`** extending `AbstractExternalModule` and enqueue JavaScript in `redcap_data_entry_form` hook.

4. **Enable in REDCap:** Control Center → External Modules → Enable for the NANO Study project.

### Reference Resources
- REDCap External Module Framework: https://github.com/vanderbilt-redcap/external-module-framework-docs
- CTSI External Module Guide: https://ctsit.github.io/redcap_external_modules/
- Hook function reference: https://projectredcap.org/resources/hooks/

## Testing Hooks
1. Enable module on a REDCap sandbox/dev project first
2. Test each hook function with valid and invalid inputs
3. Check browser console for JavaScript errors
4. Verify no REDCap core functionality is broken

## HIPAA Considerations
- Hooks run client-side; **never** send PHI to external endpoints via JavaScript
- Console logging in hooks must never log PHI values
- All hook actions are logged in REDCap's built-in audit trail

## Contact
For REDCap access or module deployment, contact USC Research Computing: research-computing@sc.edu
