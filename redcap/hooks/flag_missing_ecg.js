/**
 * NANO Study REDCap Hook: Flag Missing ECG Data
 *
 * Flags a record in REDCap if ECG data transfer has not been confirmed
 * within 48 hours of the visit date.
 *
 * On page load of the ecg_recording_log instrument:
 *   - Computes hours elapsed since visit_date
 *   - If > 48h and ecg_transfer_confirmed != 1, shows a prominent alert
 *   - Optionally sets ecg_missing_flag field to 1 for automated filtering
 *
 * Deployment: REDCap External Module / redcap_data_entry_form hook
 * Instrument: ecg_recording_log
 */

(function () {
  "use strict";

  /** Number of hours after which ECG transfer is considered overdue */
  var ECG_TRANSFER_DEADLINE_HOURS = 48;

  /**
   * Parse a REDCap date string to a Date object (supports YYYY-MM-DD).
   * @param {string} dateStr
   * @returns {Date|null}
   */
  function parseDate(dateStr) {
    if (!dateStr || dateStr.trim() === "") return null;
    var d = new Date(dateStr.trim());
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Calculate hours elapsed from a given date to now.
   * @param {Date} pastDate
   * @returns {number} Hours elapsed (positive = past)
   */
  function hoursElapsed(pastDate) {
    return (Date.now() - pastDate.getTime()) / (1000 * 60 * 60);
  }

  /**
   * Display an overdue ECG alert banner at the top of the form.
   * @param {number} hoursOver - Number of hours past deadline
   */
  function showEcgOverdueAlert(hoursOver) {
    var alertId = "ecg-transfer-overdue-alert";
    if ($("#" + alertId).length) return; // already shown

    var daysOver = (hoursOver / 24).toFixed(1);
    var alertHtml =
      '<div id="' +
      alertId +
      '" style="' +
      "background:#721c24; color:white; padding:12px 16px; margin:10px 0; " +
      'border-radius:6px; font-size:0.95em; font-weight:bold;">' +
      "🚨 ECG TRANSFER OVERDUE: Visit occurred " +
      daysOver +
      " days ago but ECG transfer has not been confirmed. " +
      "Please transfer ECG files to the secure server and update " +
      "<strong>ecg_transfer_confirmed</strong> immediately. " +
      "Contact the lab manager if files cannot be located." +
      "</div>";

    // Insert at top of form
    $("form#form, #questiontable, .formtable").first().prepend(alertHtml);
  }

  /**
   * Check ECG transfer status and flag if overdue.
   */
  function checkEcgTransferStatus() {
    // Only run on ecg_recording_log instrument
    var instrument =
      typeof window.instrument !== "undefined" ? window.instrument : "";
    if (
      instrument !== "ecg_recording_log" &&
      !window.location.search.includes("ecg_recording_log")
    ) {
      return;
    }

    var visitDateVal = $("[name='visit_date'], [name='ecg_recording_date']")
      .first()
      .val();
    var transferConfirmed = $("[name='ecg_transfer_confirmed']").val();

    // Transfer already confirmed — no flag needed
    if (transferConfirmed === "1" || transferConfirmed === "Yes") return;

    var visitDate = parseDate(visitDateVal);
    if (!visitDate) return;

    var elapsed = hoursElapsed(visitDate);
    if (elapsed > ECG_TRANSFER_DEADLINE_HOURS) {
      showEcgOverdueAlert(elapsed - ECG_TRANSFER_DEADLINE_HOURS);

      // Set hidden flag field if it exists
      var flagField = $("[name='ecg_missing_flag']");
      if (flagField.length && flagField.val() !== "1") {
        flagField.val("1").trigger("change");
      }
    }
  }

  // Re-check when transfer confirmed field changes
  function attachTransferListener() {
    $("[name='ecg_transfer_confirmed']").on("change", function () {
      if ($(this).val() === "1" || $(this).val() === "Yes") {
        $("#ecg-transfer-overdue-alert").remove();
        $("[name='ecg_missing_flag']").val("0").trigger("change");
      }
    });
  }

  $(document).ready(function () {
    checkEcgTransferStatus();
    attachTransferListener();
  });
})();
