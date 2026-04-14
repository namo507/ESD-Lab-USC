/**
 * NANO Study REDCap Hook: Visit Completion Checker
 *
 * Checks that all required fields for the current visit event are
 * completed before the user submits/saves a form.
 *
 * Shows a blocking modal confirmation if required fields are empty,
 * listing which fields still need values. User must confirm to proceed.
 *
 * Deployment: REDCap External Module / redcap_data_entry_form hook
 * Applicable instruments: ecg_recording_log, temperature_recording_log,
 *   behavioral_coding_log, ados2_scores, bayley4_scores
 */

(function () {
  "use strict";

  /**
   * Required fields by instrument name.
   * Keys match REDCap instrument (form) names.
   * Values are arrays of required field names for that form.
   */
  var REQUIRED_FIELDS_BY_INSTRUMENT = {
    ecg_recording_log: [
      "ecg_recording_date",
      "ecg_file_name",
      "ecg_duration_min",
      "ecg_quality_flag",
      "ecg_transfer_confirmed",
    ],
    temperature_recording_log: [
      "temp_recording_date",
      "temp_abdominal_start",
      "temp_peripheral_start",
      "temp_quality_flag",
    ],
    behavioral_coding_log: [
      "behavioral_coding_coder_1",
      "behavioral_coding_coder_2",
      "behavioral_icc",
    ],
    ados2_scores: [
      "ados2_module",
      "ados2_sa_raw",
      "ados2_rrb_raw",
      "ados2_css_total",
    ],
    bayley4_scores: [
      "bayley4_cog_composite",
      "bayley4_lang_composite",
      "bayley4_motor_composite",
    ],
  };

  /**
   * Get the current instrument name from REDCap page context.
   * REDCap exposes this as a global variable 'instrument'.
   * @returns {string|null} Instrument name or null if unavailable
   */
  function getCurrentInstrument() {
    if (typeof instrument !== "undefined") return instrument;
    // Fallback: read from page URL
    var match = window.location.search.match(/[?&]page=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * Check which required fields for the current instrument are empty.
   * @param {string[]} requiredFields - Array of field names to check
   * @returns {string[]} Array of field names that are empty/missing
   */
  function getMissingFields(requiredFields) {
    return requiredFields.filter(function (fieldName) {
      var field = $("[name='" + fieldName + "']");
      if (field.length === 0) return false; // Field not on this form
      var val = field.val();
      return !val || val.trim() === "" || val === "0";
    });
  }

  /**
   * Show a confirmation modal listing missing fields.
   * Returns a Promise that resolves to true (proceed anyway) or false (stay).
   * @param {string[]} missingFields - Field names that are incomplete
   * @returns {boolean} User's choice to proceed
   */
  function confirmIncompleteSubmission(missingFields) {
    var fieldList = missingFields.join(", ");
    var message =
      "⚠️ The following required fields are incomplete:\n\n" +
      fieldList +
      "\n\nAre you sure you want to save with missing data? " +
      "This will be flagged for PI review.";
    return window.confirm(message);
  }

  /**
   * Intercept save/submit button clicks to validate required fields.
   */
  function attachSubmitValidation() {
    var currentInstrument = getCurrentInstrument();
    if (!currentInstrument) return;

    var requiredFields = REQUIRED_FIELDS_BY_INSTRUMENT[currentInstrument];
    if (!requiredFields || requiredFields.length === 0) return;

    // REDCap save buttons have various IDs/classes across versions
    $(document).on(
      "click",
      "#submit-btn-saverecord, #submit-btn-savenextrecord, " +
        ".submit-btn, [name='submit-btn-saverecord']",
      function (e) {
        var missing = getMissingFields(requiredFields);
        if (missing.length > 0) {
          var proceed = confirmIncompleteSubmission(missing);
          if (!proceed) {
            e.preventDefault();
            e.stopImmediatePropagation();
            // Highlight missing fields
            missing.forEach(function (fieldName) {
              $("[name='" + fieldName + "']").css({
                "border-color": "#dc3545",
                "background-color": "#fff3f3",
              });
            });
          }
        }
      }
    );
  }

  $(document).ready(function () {
    attachSubmitValidation();
  });
})();
