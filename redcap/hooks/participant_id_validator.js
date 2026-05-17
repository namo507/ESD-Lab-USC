/**
 * participant_id_validator.js
 * REDCap External Module Hook — NANO Study ESD Lab
 *
 * Validates that the NANO participant ID entered on any data entry form
 * conforms to the required format: NANO-XXXX where XXXX is a zero-padded
 * 4-digit integer (0001–0260 for the 260-participant NANO cohort).
 *
 * Deployment: Paste this script into the REDCap External Module or
 * Action Tag field (see redcap/hooks/README.md for full instructions).
 *
 * Fields affected:
 *   - nano_id            (text field, all forms)
 *   - nano_id_secondary  (text field, verification forms only)
 *
 * Behavior:
 *   - On blur: validates format; shows inline error if invalid.
 *   - On form submit: prevents submission if any NANO ID field is invalid.
 *   - On page load: re-validates pre-populated fields.
 *
 * Author: ESD Lab Informatics Team
 * Version: 1.0.0
 */

(function ($) {
  "use strict";

  // ── Constants ──────────────────────────────────────────────────────────────

  /** Regex: NANO- followed by exactly 4 digits (0001 – 9999). */
  var NANO_ID_PATTERN = /^NANO-\d{4}$/;

  /** Valid participant range for the NANO study cohort. */
  var MIN_PARTICIPANT = 1;
  var MAX_PARTICIPANT = 260;

  /** REDCap field names that should contain a NANO participant ID. */
  var NANO_ID_FIELDS = ["nano_id", "nano_id_secondary"];

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Tests whether a string is a well-formed NANO participant ID and that
   * the numeric portion falls within the registered cohort range.
   *
   * @param {string} value - The raw string from the input field.
   * @returns {{ valid: boolean, message: string }} Validation result.
   */
  function validateNanoId(value) {
    var trimmed = $.trim(value);

    if (trimmed === "") {
      return { valid: true, message: "" }; // Empty is allowed (required-ness is REDCap's concern)
    }

    if (!NANO_ID_PATTERN.test(trimmed)) {
      return {
        valid: false,
        message:
          "Invalid format. Expected NANO-XXXX (e.g., NANO-0042). " +
          "Must be 'NANO-' followed by exactly 4 digits.",
      };
    }

    var numericPart = parseInt(trimmed.split("-")[1], 10);
    if (numericPart < MIN_PARTICIPANT || numericPart > MAX_PARTICIPANT) {
      return {
        valid: false,
        message:
          "Participant number " +
          numericPart +
          " is outside the valid NANO cohort range (" +
          MIN_PARTICIPANT +
          "–" +
          MAX_PARTICIPANT +
          "). Please verify the ID.",
      };
    }

    return { valid: true, message: "" };
  }

  /**
   * Displays an inline validation error beneath the target field.
   * Removes any existing error message first.
   *
   * @param {jQuery} $input  - The input jQuery element.
   * @param {string} message - Error message to display, or '' to clear.
   */
  function showError($input, message) {
    var errorId = $input.attr("name") + "_nano_validation_error";
    $("#" + errorId).remove();

    if (message) {
      $input
        .addClass("nano-id-invalid")
        .after(
          $("<span>")
            .attr("id", errorId)
            .addClass("nano-id-error-msg")
            .css({
              color: "#cc0000",
              fontSize: "0.85em",
              display: "block",
              marginTop: "2px",
            })
            .text("⚠ " + message)
        );
    } else {
      $input.removeClass("nano-id-invalid");
    }
  }

  /**
   * Validates a single NANO ID input and updates its visual state.
   *
   * @param {jQuery} $input - The input jQuery element to validate.
   * @returns {boolean} True if the field is valid (or empty).
   */
  function validateField($input) {
    var result = validateNanoId($input.val());
    showError($input, result.message);
    return result.valid;
  }

  // ── DOM Attachment ─────────────────────────────────────────────────────────

  /**
   * Finds all NANO ID input fields on the current REDCap page and attaches
   * real-time validation handlers.
   */
  function attachValidators() {
    NANO_ID_FIELDS.forEach(function (fieldName) {
      var $input = $('input[name="' + fieldName + '"]');

      if ($input.length === 0) {
        return; // Field not present on this form/event
      }

      // Style the field for visual feedback
      $input.css("textTransform", "uppercase");

      // Validate on focus-out (blur)
      $input.on("blur", function () {
        validateField($(this));
      });

      // Auto-uppercase as user types; validate on each keystroke
      $input.on("input keyup", function () {
        var pos = this.selectionStart;
        $(this).val($(this).val().toUpperCase());
        this.setSelectionRange(pos, pos);
        validateField($(this));
      });

      // Validate any pre-populated value on page load
      if ($input.val() !== "") {
        validateField($input);
      }
    });
  }

  /**
   * Intercepts REDCap form submission and blocks it if any NANO ID field
   * contains an invalid value. Shows an alert with details.
   */
  function attachSubmitGuard() {
    // REDCap form submit buttons (Save & Continue, Save & Exit, etc.)
    $("button#submit-btn-saverecord, input[type='submit']").on(
      "click",
      function (e) {
        var errors = [];

        NANO_ID_FIELDS.forEach(function (fieldName) {
          var $input = $('input[name="' + fieldName + '"]');
          if ($input.length === 0) return;

          var result = validateNanoId($input.val());
          if (!result.valid) {
            errors.push("Field '" + fieldName + "': " + result.message);
            showError($input, result.message);
          }
        });

        if (errors.length > 0) {
          e.preventDefault();
          e.stopImmediatePropagation();
          alert(
            "⚠ NANO Participant ID Validation Error\n\n" +
              "The following field(s) have invalid NANO IDs:\n\n" +
              errors.join("\n") +
              "\n\nPlease correct the ID(s) before saving.\n" +
              "Format required: NANO-XXXX (4-digit zero-padded number, e.g., NANO-0042)"
          );
          return false;
        }
      }
    );
  }

  // ── Initialisation ─────────────────────────────────────────────────────────

  $(document).ready(function () {
    attachValidators();
    attachSubmitGuard();

    // Re-attach if REDCap dynamically loads a survey page (single-page app)
    $(document).on("redcap_survey_page_loaded", function () {
      attachValidators();
    });
  });
})(window.$ || window.jQuery);
