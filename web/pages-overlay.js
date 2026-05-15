/* =============================================================
   ESD Pages Layout Overlay — runtime JS patches
   - Scroll progress indicator
   - IntersectionObserver re-tune for .reveal (threshold 0.15)
   - Mousemove sheen wiring (--mx / --my on .glass-card)
   - Nav active-section highlighter
   - Watcher for chart tiles with empty/blank canvases
   ============================================================= */
(function () {
  "use strict";

  if (window.__ESD_OVERLAY_LOADED__) return;
  window.__ESD_OVERLAY_LOADED__ = true;

  /* ---------- 1. Scroll progress bar -------------------------- */
  function ensureScrollBar() {
    var bar = document.getElementById("__esd_scroll_progress");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "__esd_scroll_progress";
      document.body.appendChild(bar);
    }
    return bar;
  }
  function updateScroll() {
    var bar = ensureScrollBar();
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var pct = max > 0 ? window.scrollY / max : 0;
    bar.style.transform = "scaleX(" + Math.min(1, Math.max(0, pct)) + ")";
  }

  /* ---------- 2. IntersectionObserver for .reveal ------------- */
  /* threshold 0.15 + rootMargin -50px-bottom per modernization doc:
     prevents premature triggers before element enters focal area
     AND resolves the height-overflow stall where tall tiles can
     never reach intersectionRatio = 1.0. */
  function wireReveal() {
    var els = document.querySelectorAll(".reveal:not(.in)");
    if (!els.length || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -50px 0px" }
    );
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 3. Mousemove sheen on .glass-card --------------- */
  /* Skipped entirely on touch-primary devices via matchMedia gate —
     mirrors the @media (hover: hover) CSS gate so no JS work is
     wasted on devices that won't render the effect. */
  function wireSheen() {
    if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      return;
    }
    document.addEventListener("mousemove", function (e) {
      var card = e.target.closest && e.target.closest(".glass-card");
      if (!card) return;
      var rect = card.getBoundingClientRect();
      var x = ((e.clientX - rect.left) / rect.width) * 100;
      var y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty("--mx", x + "%");
      card.style.setProperty("--my", y + "%");
    }, { passive: true });
  }

  /* ---------- 4. Nav active highlight on scroll --------------- */
  function wireNavActive() {
    var sections = Array.prototype.slice.call(
      document.querySelectorAll("section[id], section[data-section-id], .scene[id]")
    );
    var links = Array.prototype.slice.call(
      document.querySelectorAll(".nav-link, .nav-grid a, [data-nav-target]")
    );
    if (!sections.length || !links.length || !("IntersectionObserver" in window)) return;

    var map = {};
    links.forEach(function (a) {
      var t = a.getAttribute("href") || a.getAttribute("data-nav-target") || "";
      if (t.indexOf("#") === 0) t = t.slice(1);
      if (t) map[t] = a;
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var id = entry.target.id || entry.target.getAttribute("data-section-id");
        if (!id || !map[id]) return;
        if (entry.isIntersecting) {
          links.forEach(function (l) { l.classList.remove("active"); l.removeAttribute("aria-current"); });
          map[id].classList.add("active");
          map[id].setAttribute("aria-current", "page");
        }
      });
    }, { threshold: 0.35 });
    sections.forEach(function (s) { io.observe(s); });
  }

  /* ---------- 5. Empty audit table detection ------------------ */
  function wireEmptyStates() {
    document.querySelectorAll(".audit-table").forEach(function (tbl) {
      var rows = tbl.querySelectorAll("tbody tr");
      if (rows.length === 0) tbl.classList.add("audit-empty");
    });
  }

  /* ---------- 6. Deploy banner -------------------------------- */
  function ensureDeployBanner() {
    if (document.getElementById("__esd_deploy_banner")) return;
    var meta = document.querySelector('meta[name="esd-deploy-stamp"]');
    var stamp = meta ? meta.content : null;
    if (!stamp) return;
    var b = document.createElement("div");
    b.id = "__esd_deploy_banner";
    b.textContent = "BUILD · " + stamp;
    document.body.appendChild(b);
  }

  /* ---------- 7. Re-run on DOM mutations (bundler-late render) */
  function rewireAll() {
    try { wireReveal(); } catch (e) {}
    try { wireNavActive(); } catch (e) {}
    try { wireEmptyStates(); } catch (e) {}
    try { ensureDeployBanner(); } catch (e) {}
  }

  /* ---------- Boot -------------------------------------------- */
  function boot() {
    ensureScrollBar();
    updateScroll();
    wireSheen();
    rewireAll();
    window.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("resize", updateScroll);

    // Watch for bundler-late DOM injection
    var mo = new MutationObserver(function () { rewireAll(); });
    mo.observe(document.body, { childList: true, subtree: true });
    // Stop watching after 30s — bundler should be settled
    setTimeout(function () { mo.disconnect(); rewireAll(); }, 30000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
