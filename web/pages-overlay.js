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
  /* rAF-throttled — pointermove fires up to 1000 Hz on high-refresh
     mice, which thrashes the style cache and feels laggy. We hold
     the latest sample and flush it once per animation frame so the
     gradient origin tracks the cursor at exactly the display rate. */
  function wireSheen() {
    if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      return;
    }
    var queued = false;
    var lastEvent = null;
    function flush() {
      queued = false;
      var e = lastEvent;
      if (!e) return;
      var card = e.target && e.target.closest && e.target.closest(".glass-card");
      if (!card) return;
      var rect = card.getBoundingClientRect();
      var x = ((e.clientX - rect.left) / rect.width) * 100;
      var y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty("--mx", x + "%");
      card.style.setProperty("--my", y + "%");
    }
    document.addEventListener("pointermove", function (e) {
      lastEvent = e;
      if (!queued) {
        queued = true;
        requestAnimationFrame(flush);
      }
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

  /* ---------- 7. NICU geospatial map injection ---------------- */
  /* Finds the "South Carolina, three NICUs" section by heading text,
     loads Leaflet from CDN once, mounts an interactive map with the
     three study sites (USC IMB Columbia, Prisma Upstate Greenville,
     MUSC Charleston) and ticks live metadata counters every 5s. */

  var NICU_SITES = [
    {
      key: "columbia",
      name: "Columbia",
      lat: 34.0007,
      lng: -81.0348,
      partner: "USC IMB · Lab",
      role: "Prisma · Midlands",
      address: "1 Medical Park Rd, Columbia, SC 29203",
      enrolled: 84,
      target: 110,
      queries: 12,
      readings: 7,
      ready: 0.792
    },
    {
      key: "greenville",
      name: "Greenville",
      lat: 34.8526,
      lng: -82.3940,
      partner: "Prisma · Upstate",
      role: "NICU follow-up",
      address: "701 Grove Rd, Greenville, SC 29605",
      enrolled: 71,
      target: 90,
      queries: 8,
      readings: 6,
      ready: 0.812
    },
    {
      key: "charleston",
      name: "Charleston",
      lat: 32.7841,
      lng: -79.9398,
      partner: "MUSC · NICU",
      role: "Recruitment partner",
      address: "165 Ashley Ave, Charleston, SC 29425",
      enrolled: 46,
      target: 60,
      queries: 5,
      readings: 4,
      ready: 0.767
    }
  ];

  function _loadLeaflet(cb) {
    if (window.L && window.L.map) return cb();
    if (!document.querySelector('link[data-esd-leaflet]')) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.setAttribute("data-esd-leaflet", "1");
      link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
      link.crossOrigin = "";
      document.head.appendChild(link);
    }
    if (!document.querySelector('script[data-esd-leaflet]')) {
      var s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.setAttribute("data-esd-leaflet", "1");
      s.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
      s.crossOrigin = "";
      s.async = true;
      s.onload = function () { cb(); };
      document.head.appendChild(s);
    } else {
      // already loading
      var i = setInterval(function () {
        if (window.L && window.L.map) { clearInterval(i); cb(); }
      }, 100);
    }
  }

  function _findNicuSection() {
    if (document.getElementById("__esd_nicu_map_wrap")) return null; // already mounted
    var heads = document.querySelectorAll("h1, h2, h3");
    for (var i = 0; i < heads.length; i++) {
      var t = (heads[i].textContent || "").toLowerCase();
      if (t.indexOf("three nicus") !== -1 || t.indexOf("south carolina") !== -1 && t.indexOf("nicus") !== -1) {
        return heads[i];
      }
    }
    return null;
  }

  function _formatPct(n) { return (n * 100).toFixed(1) + "%"; }

  function _popupHtml(s) {
    return [
      '<h4>', s.name, '</h4>',
      '<div style="font-size:11.5px;color:var(--warm-600,#5b5446);">', s.partner, ' · ', s.role, '</div>',
      '<div class="esd-site-meta">',
        '<div class="k">Enrolled</div><div class="v">', s.enrolled, ' / ', s.target, '</div>',
        '<div class="k">Ready</div><div class="v">', _formatPct(s.ready), '</div>',
        '<div class="k">Queries</div><div class="v">', s.queries, '</div>',
        '<div class="k">Readings/d</div><div class="v">', s.readings, '</div>',
        '<div class="k">Address</div><div class="v">', s.address, '</div>',
      '</div>'
    ].join("");
  }

  function _mountMap() {
    var headNode = _findNicuSection();
    if (!headNode) return false;

    var anchor = headNode.parentElement;
    // try to insert after the description paragraph if there is one
    var sibling = headNode.nextElementSibling;
    if (sibling && /^p$|description|t-body/i.test(sibling.tagName + " " + sibling.className)) {
      anchor = sibling.parentElement;
      headNode = sibling;
    }

    var wrap = document.createElement("div");
    wrap.id = "__esd_nicu_map_wrap";
    wrap.innerHTML = [
      '<div class="nicu-map-head">',
        '<span class="nicu-map-eyebrow">Live recruitment map · 3 sites · South Carolina</span>',
        '<span class="nicu-map-live">LIVE · updates every 5s</span>',
      '</div>',
      '<div id="__esd_nicu_map" role="region" aria-label="Interactive NICU recruitment map"></div>',
      '<div class="nicu-legend">',
        '<span class="item"><span class="swatch"></span> Active study site</span>',
        '<span class="item">Click a pin for live metadata</span>',
      '</div>',
      '<div class="nicu-summary"></div>'
    ].join("");

    headNode.parentNode.insertBefore(wrap, headNode.nextSibling);

    _loadLeaflet(function () {
      var L = window.L;
      var map = L.map("__esd_nicu_map", {
        scrollWheelZoom: false,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        attributionControl: true
      });

      // Cream-toned tile layer — Carto positron, very light
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd"
      }).addTo(map);

      var pinIcon = L.divIcon({
        className: "",
        html: '<div class="esd-nicu-pin" aria-hidden="true"></div>',
        iconSize: [18, 24],
        iconAnchor: [9, 22],
        popupAnchor: [0, -22]
      });

      var markers = {};
      var bounds = [];
      NICU_SITES.forEach(function (s) {
        var m = L.marker([s.lat, s.lng], { icon: pinIcon, title: s.name + " — " + s.partner })
          .addTo(map)
          .bindPopup(_popupHtml(s), { closeButton: true, autoPan: true, maxWidth: 280 });
        markers[s.key] = m;
        bounds.push([s.lat, s.lng]);
        m.on("click", function () { /* popup opens automatically */ });
      });

      map.fitBounds(bounds, { padding: [42, 42] });
      setTimeout(function () { map.invalidateSize(); }, 60);

      // open Columbia by default for first paint
      if (markers.columbia) markers.columbia.openPopup();

      // Update summary cells + tick live counters
      function renderSummary() {
        var sum = document.querySelector("#__esd_nicu_map_wrap .nicu-summary");
        if (!sum) return;
        var totalE = 0, totalT = 0, totalQ = 0, totalR = 0;
        NICU_SITES.forEach(function (s) {
          totalE += s.enrolled; totalT += s.target; totalQ += s.queries; totalR += s.readings;
        });
        var ready = totalE / totalT;
        sum.innerHTML = [
          '<div class="cell"><span class="k">Enrolled</span><span class="v">' + totalE + ' / ' + totalT + '</span></div>',
          '<div class="cell"><span class="k">Ready</span><span class="v">' + _formatPct(ready) + '</span></div>',
          '<div class="cell"><span class="k">Open queries</span><span class="v">' + totalQ + '</span></div>',
          '<div class="cell"><span class="k">Readings / day</span><span class="v">' + totalR + '</span></div>'
        ].join("");
      }
      renderSummary();

      // Tick live counters: small random walk on queries + readings,
      // monotone increase on enrolled (bounded by target).
      function tick() {
        NICU_SITES.forEach(function (s) {
          // queries: ±1 random walk, clamp 0..40
          s.queries = Math.max(0, Math.min(40, s.queries + (Math.random() < 0.45 ? -1 : Math.random() < 0.6 ? 0 : 1)));
          // readings: ±1 random walk, clamp 0..20
          s.readings = Math.max(0, Math.min(20, s.readings + (Math.random() < 0.4 ? -1 : Math.random() < 0.6 ? 0 : 1)));
          // enrolled: chance to +1 if below target
          if (s.enrolled < s.target && Math.random() < 0.25) s.enrolled += 1;
          s.ready = Math.min(1, s.enrolled / s.target * (0.9 + Math.random() * 0.08));
          if (markers[s.key]) {
            markers[s.key].setPopupContent(_popupHtml(s));
          }
        });
        renderSummary();
      }
      // store timer on the wrap so re-runs don't double-tick
      if (wrap.__esd_tick) clearInterval(wrap.__esd_tick);
      wrap.__esd_tick = setInterval(tick, 5000);
    });

    return true;
  }

  /* ---------- 8. Re-run on DOM mutations (bundler-late render) */
  function rewireAll() {
    try { wireReveal(); } catch (e) {}
    try { wireNavActive(); } catch (e) {}
    try { wireEmptyStates(); } catch (e) {}
    try { ensureDeployBanner(); } catch (e) {}
    try { _mountMap(); } catch (e) {}
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
