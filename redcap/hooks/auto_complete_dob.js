/**
 * NANO Study REDCap Hook: Auto-Complete Adjusted Age
 *
 * Automatically calculates adjusted age in months from:
 *   - Date of Birth (field: dob)
 *   - Visit Date (field: visit_date)
 *   - Gestational Age at Birth (field: ga_weeks)
 *
 * Populates: age_in_days (days from DOB to visit)
 *
 * Deployment: REDCap External Module / redcap_data_entry_form hook
 * Instruments: All visit forms containing visit_date field
 */

(function () {
  "use strict";

  /**
   * Parse a REDCap date field value to a Date object.
   * REDCap stores dates as MM-DD-YYYY or YYYY-MM-DD depending on settings.
   * @param {string} dateStr - Date string from REDCap field
   * @returns {Date|null} Parsed Date or null if invalid
   */
  function parseRedCapDate(dateStr) {
    if (!dateStr || dateStr.trim() === "") return null;
    // Try ISO format first (YYYY-MM-DD)
    var isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return new Date(
        parseInt(isoMatch[1]),
        parseInt(isoMatch[2]) - 1,
        parseInt(isoMatch[3])
      );
    }
    // Try MM-DD-YYYY
    var mdyMatch = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (mdyMatch) {
      return new Date(
        parseInt(mdyMatch[3]),
        parseInt(mdyMatch[1]) - 1,
        parseInt(mdyMatch[2])
      );
    }
    return null;
  }

  /**
   * Calculate age in days between two dates.
   * @param {Date} birthDate - Date of birth
   * @param {Date} visitDate - Visit date
   * @returns {number} Age in days (positive integer)
   */
  function calcAgeInDays(birthDate, visitDate) {
    var msPerDay = 1000 * 60 * 60 * 24;
    return Math.round((visitDate - birthDate) / msPerDay);
  }

  /**
   * Calculate corrected gestational age in weeks at visit.
   * Corrected GA = actual age in days - (40 - ga_weeks) * 7
   * @param {number} ageInDays - Chronological age in days
   * @param {number} gaWeeks - Gestational age at birth in weeks
   * @returns {number} Corrected age in weeks (may be negative for NICU visits)
   */
  function calcCorrectedAgeWeeks(ageInDays, gaWeeks) {
    var prematurityDays = (40 - gaWeeks) * 7;
    return (ageInDays - prematurityDays) / 7;
  }

  /**
   * Main calculation function — runs on field change.
   */
  function updateAgeCalculations() {
    var dobVal = $("[name='dob']").val();
    var visitDateVal = $("[name='visit_date']").val();
    var gaWeeksVal = parseInt($("[name='ga_weeks']").val(), 10);

    var dob = parseRedCapDate(dobVal);
    var visitDate = parseRedCapDate(visitDateVal);

    if (!dob || !visitDate) return;
    if (visitDate < dob) {
      console.warn("NANO Hook: visit_date is before dob — check dates.");
      return;
    }

    var ageInDays = calcAgeInDays(dob, visitDate);

    // Populate age_in_days field
    var ageField = $("[name='age_in_days']");
    if (ageField.length) {
      ageField.val(ageInDays).trigger("change");
    }

    // If GA weeks available, compute and display corrected age
    if (!isNaN(gaWeeksVal) && gaWeeksVal >= 22 && gaWeeksVal <= 42) {
      var correctedWeeks = calcCorrectedAgeWeeks(ageInDays, gaWeeksVal);
      var correctedMonths = correctedWeeks / 4.345;

      var corrAgeField = $("[name='corrected_age_months']");
      if (corrAgeField.length) {
        corrAgeField.val(correctedMonths.toFixed(2)).trigger("change");
      }
    }
  }

  // Attach listeners when page loads
  $(document).ready(function () {
    // Trigger on change of DOB, visit date, or GA weeks
    $("[name='dob'], [name='visit_date'], [name='ga_weeks']").on(
      "change blur",
      updateAgeCalculations
    );

    // Run once on page load in case fields are pre-populated
    updateAgeCalculations();
  });
})();
