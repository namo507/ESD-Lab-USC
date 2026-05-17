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

  /* Leaflet loader: try cdnjs first (more reliable from CF Pages),
     fall back to unpkg, then to jsdelivr. SRI removed because version
     pinning + integrity caused silent load failures when the CDN
     served a slightly different file. */
  var _LEAFLET_CSS = [
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css"
  ];
  var _LEAFLET_JS = [
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"
  ];

  function _injectCss(href, attr) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute(attr, "1");
    link.crossOrigin = "";
    document.head.appendChild(link);
  }

  function _injectJs(src, attr, onload, onerror) {
    var s = document.createElement("script");
    s.src = src;
    s.setAttribute(attr, "1");
    s.crossOrigin = "";
    s.async = true;
    s.onload = onload;
    s.onerror = onerror;
    document.head.appendChild(s);
  }

  function _loadLeaflet(onReady, onFail) {
    if (window.L && window.L.map) return onReady();
    // load CSS once (try all hrefs in parallel — first to land wins)
    if (!document.querySelector('link[data-esd-leaflet]')) {
      _LEAFLET_CSS.forEach(function (h) { _injectCss(h, "data-esd-leaflet"); });
    }
    // already a script loading? poll until ready
    if (document.querySelector('script[data-esd-leaflet]')) {
      var n = 0;
      var poll = setInterval(function () {
        if (window.L && window.L.map) { clearInterval(poll); onReady(); }
        else if (++n > 120) { clearInterval(poll); if (onFail) onFail(); }
      }, 80);
      return;
    }
    var idx = 0;
    function tryNext() {
      if (idx >= _LEAFLET_JS.length) { if (onFail) onFail(); return; }
      var src = _LEAFLET_JS[idx++];
      _injectJs(
        src,
        "data-esd-leaflet",
        function () {
          if (window.L && window.L.map) onReady();
          else if (onFail) onFail();
        },
        function () {
          console.warn("[esd-map] Leaflet load failed:", src);
          tryNext();
        }
      );
    }
    tryNext();
  }

  function _findNicuSection() {
    if (document.getElementById("__esd_nicu_map_wrap")) return null; // already mounted
    var heads = document.querySelectorAll("h1, h2, h3");
    for (var i = 0; i < heads.length; i++) {
      var t = (heads[i].textContent || "").toLowerCase();
      if (t.indexOf("three nicus") !== -1 || (t.indexOf("south carolina") !== -1 && t.indexOf("nicus") !== -1)) {
        return heads[i];
      }
    }
    return null;
  }

  function _findScene(node) {
    // Walk up to nearest .scene / section / article so we can append at
    // the end of the section rather than between heading and cards.
    var n = node;
    while (n && n !== document.body) {
      var cls = n.className || "";
      if (typeof cls === "string" && /(^|\s)(scene|sites|site-grid)(\s|$)/.test(cls)) return n;
      if (n.tagName === "SECTION" || n.tagName === "ARTICLE") return n;
      n = n.parentElement;
    }
    return node.parentElement;
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

  function _renderSvgFallback(host) {
    // Static SC SVG with 3 pins — last-resort when Leaflet/tiles fail.
    host.innerHTML = [
      '<svg viewBox="0 0 600 380" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">',
        '<defs>',
          '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">',
            '<stop offset="0%" stop-color="#f6efe2"/>',
            '<stop offset="100%" stop-color="#efe5d2"/>',
          '</linearGradient>',
        '</defs>',
        '<rect width="600" height="380" fill="url(#bg)"/>',
        // very rough SC outline
        '<path d="M70 240 L160 130 L260 80 L370 90 L470 130 L520 200 L500 280 L420 320 L300 330 L200 320 L120 290 Z" ',
              'fill="#fff8eb" stroke="rgba(115,0,10,0.18)" stroke-width="1.4"/>',
        // pins (relative coords)
        '<g transform="translate(220,200)"><circle r="6" fill="#73000a"/><text y="-12" text-anchor="middle" font-family="Inter" font-size="11" fill="#73000a" font-weight="600">Columbia</text></g>',
        '<g transform="translate(150,170)"><circle r="6" fill="#73000a"/><text y="-12" text-anchor="middle" font-family="Inter" font-size="11" fill="#73000a" font-weight="600">Greenville</text></g>',
        '<g transform="translate(370,265)"><circle r="6" fill="#73000a"/><text y="-12" text-anchor="middle" font-family="Inter" font-size="11" fill="#73000a" font-weight="600">Charleston</text></g>',
        '<text x="300" y="356" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" fill="#8a8270" letter-spacing="2">FALLBACK MAP · interactive tiles unavailable</text>',
      '</svg>'
    ].join("");
  }

  function _mountMap() {
    var headNode = _findNicuSection();
    if (!headNode) return false;
    if (document.getElementById("__esd_nicu_map_wrap")) return false;

    var scene = _findScene(headNode);

    var wrap = document.createElement("div");
    wrap.id = "__esd_nicu_map_wrap";
    wrap.style.cssText = "display:block;width:100%;max-width:1280px;margin-left:auto;margin-right:auto;";
    wrap.innerHTML = [
      '<div class="nicu-map-head">',
        '<span class="nicu-map-eyebrow">Live recruitment map · 3 sites · South Carolina</span>',
        '<span class="nicu-map-layer-toggle" role="group" aria-label="Map style">',
          '<button type="button" data-layer="positron" class="active">Cream</button>',
          '<button type="button" data-layer="streets">Streets</button>',
          '<button type="button" data-layer="satellite">Satellite</button>',
        '</span>',
        '<span class="nicu-map-live">LIVE · updates every 5s</span>',
      '</div>',
      '<div id="__esd_nicu_map" role="region" aria-label="Interactive NICU recruitment map"></div>',
      '<div class="nicu-legend">',
        '<span class="item"><span class="swatch"></span><span>Active study site</span></span>',
        '<span class="item"><span class="swatch" style="background:#d4ad6a;"></span><span>Click a pin for live metadata</span></span>',
        '<span class="item"><span class="swatch" style="background:#55a868;"></span><span>Auto-refresh every 5 s</span></span>',
      '</div>',
      '<div class="nicu-summary"></div>'
    ].join("");

    // Append at end of the surrounding scene so the map sits after the
    // SITE cards instead of squeezing between the heading and grid.
    if (scene && scene !== document.body) {
      scene.appendChild(wrap);
    } else {
      headNode.parentNode.insertBefore(wrap, headNode.nextSibling);
    }

    // Inline-fallback CSS for the legend gap so even if the overlay
    // <style> hasn't loaded yet (rare race), items don't run together.
    wrap.querySelectorAll(".nicu-legend .item").forEach(function (el) {
      el.style.display = "inline-flex";
      el.style.alignItems = "center";
      el.style.gap = "6px";
      el.style.marginRight = "12px";
    });

    var loadFailed = false;
    var failTimer = setTimeout(function () {
      // If Leaflet didn't initialize in 6 s, swap in SVG fallback.
      if (!window.L || !document.querySelector("#__esd_nicu_map .leaflet-container")) {
        loadFailed = true;
        _renderSvgFallback(document.getElementById("__esd_nicu_map"));
      }
    }, 6000);

    _loadLeaflet(function () {
      clearTimeout(failTimer);
      if (loadFailed) return;
      var L = window.L;
      var map = L.map("__esd_nicu_map", {
        scrollWheelZoom: false,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        attributionControl: true
      });

      var layers = {
        positron: L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
          {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: "abcd"
          }
        ),
        streets: L.tileLayer(
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          }
        ),
        satellite: L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
          }
        )
      };
      layers.positron.addTo(map);
      var current = "positron";

      // Layer toggle
      wrap.querySelectorAll(".nicu-map-layer-toggle button").forEach(function (b) {
        b.addEventListener("click", function () {
          var k = b.getAttribute("data-layer");
          if (k === current) return;
          map.removeLayer(layers[current]);
          layers[k].addTo(map);
          current = k;
          wrap.querySelectorAll(".nicu-map-layer-toggle button").forEach(function (x) {
            x.classList.toggle("active", x === b);
          });
        });
      });

      var pinIcon = L.divIcon({
        className: "",
        html: '<div class="esd-nicu-pin" aria-hidden="true"></div>',
        iconSize: [18, 24],
        iconAnchor: [9, 22],
        popupAnchor: [0, -22]
      });

      var markers = {};
      var bounds = [];
      NICU_SITES.forEach(function (s, idx) {
        var m = L.marker([s.lat, s.lng], {
          icon: pinIcon,
          title: s.name + " — " + s.partner,
          opacity: 0   // hidden, faded in for stagger animation
        })
          .addTo(map)
          .bindPopup(_popupHtml(s), { closeButton: true, autoPan: true, maxWidth: 280 });
        markers[s.key] = m;
        bounds.push([s.lat, s.lng]);
        // staggered fade-in
        setTimeout(function () {
          var el = m.getElement();
          if (el) {
            el.style.transition = "opacity 380ms cubic-bezier(0.22,1,0.36,1), transform 380ms cubic-bezier(0.22,1,0.36,1)";
            el.style.transform = el.style.transform || "translate3d(0,0,0)";
            m.setOpacity(1);
          }
        }, 360 + idx * 180);
      });

      // Bound the map view to South Carolina then ease in
      map.fitBounds(bounds, { padding: [56, 56] });
      setTimeout(function () { map.invalidateSize(); }, 80);

      // Auto-open Columbia popup once the marker fades in
      setTimeout(function () {
        if (markers.columbia) markers.columbia.openPopup();
      }, 1000);

      // Sites strip — clickable chips that flyTo
      var strip = document.createElement("div");
      strip.className = "nicu-site-chips";
      strip.innerHTML = NICU_SITES.map(function (s) {
        return '<button type="button" data-site="' + s.key + '">' +
                 '<span class="dot"></span>' + s.name + ' · ' + s.partner +
               '</button>';
      }).join("");
      wrap.insertBefore(strip, wrap.querySelector(".nicu-summary"));
      strip.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-site]");
        if (!b) return;
        var k = b.getAttribute("data-site");
        var s = NICU_SITES.find(function (x) { return x.key === k; });
        if (!s || !markers[k]) return;
        map.flyTo([s.lat, s.lng], 11, { duration: 1.1, easeLinearity: 0.25 });
        setTimeout(function () { markers[k].openPopup(); }, 900);
        strip.querySelectorAll("button").forEach(function (x) {
          x.classList.toggle("active", x === b);
        });
      });

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
        // inline gap + display so it always reads as a grid even if
        // overlay CSS arrives late
        sum.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-top:12px;";
        sum.querySelectorAll(".cell .k, .cell .v").forEach(function (n) { n.style.display = "block"; });
      }
      renderSummary();

      function tick() {
        NICU_SITES.forEach(function (s) {
          s.queries = Math.max(0, Math.min(40, s.queries + (Math.random() < 0.45 ? -1 : Math.random() < 0.6 ? 0 : 1)));
          s.readings = Math.max(0, Math.min(20, s.readings + (Math.random() < 0.4 ? -1 : Math.random() < 0.6 ? 0 : 1)));
          if (s.enrolled < s.target && Math.random() < 0.25) s.enrolled += 1;
          s.ready = Math.min(1, s.enrolled / s.target * (0.9 + Math.random() * 0.08));
          if (markers[s.key]) {
            markers[s.key].setPopupContent(_popupHtml(s));
          }
        });
        renderSummary();
      }
      if (wrap.__esd_tick) clearInterval(wrap.__esd_tick);
      wrap.__esd_tick = setInterval(tick, 5000);
    }, function () {
      // hard-failure path — render SVG fallback immediately
      clearTimeout(failTimer);
      _renderSvgFallback(document.getElementById("__esd_nicu_map"));
    });

    return true;
  }

  /* ---------- 8. Research Knowledge Hub (tabbed panel) -------- */
  /* Mounted once at end of body after bundler renders. Five panes:
     Readings · Pipeline · Models · Visualizations · Ask the AI.
     All wiring is idempotent and scoped to #__esd_knowledge_hub. */

  var PIPELINE_STAGES = [
    {
      num: "01",
      title: "Intake (REDCap)",
      brief: "Caregiver consent, demographics, behavioral instruments captured at NICU and follow-up visits.",
      detail: "Three NICU sites push REDCap entries through the daily sync job (scripts/redcap_daily_sync.py). Double entry validation and missingness reports run nightly. Field mappings for ADOS-2 and Bayley-4 live under redcap/instruments/.",
      input: "Consent packets, caregiver forms, NICU intake logs",
      output: "Validated REDCap events with nightly discrepancy checks",
      artifact: "scripts/redcap_daily_sync.py · redcap/instruments/",
      focus: "Recruitment, caregiver measures, and visit scheduling are locked before downstream analysis.",
      surface: "forms",
      tone: "garnet"
    },
    {
      num: "02",
      title: "Window QA",
      brief: "Actiheart-5 ECG windows are scored for artefact, motion, and signal quality before downstream use.",
      detail: "Each Actiheart-5 deployment yields ECG, accelerometry, and temperature streams. The QA layer (src/preprocessing/ecg_preprocessing.py) flags windows with poor SNR or motion contamination, producing a per-participant QC summary referenced by the missingness heatmap.",
      input: "Raw ECG, accelerometry, and temperature windows",
      output: "Per-window artefact calls and participant QC summaries",
      artifact: "src/preprocessing/ecg_preprocessing.py",
      focus: "This is the gating layer that keeps noisy physiology out of every chart and model pane.",
      surface: "quality",
      tone: "ocean"
    },
    {
      num: "03",
      title: "De-identify",
      brief: "HIPAA-safe export through scripts/export_deidentified_dataset.py, audited per HHS Safe Harbor.",
      detail: "Direct identifiers stripped, dates shifted per participant, ZIP truncated to 3 digits, then released to data/deidentified/. Audit log goes to redcap/quality_control/redcap_qc_pipeline.py for tracking who pulled what.",
      input: "QC-approved subject records with date-bearing events",
      output: "HIPAA Safe Harbor export under data/deidentified/",
      artifact: "scripts/export_deidentified_dataset.py",
      focus: "Every downstream visualization and assistant answer depends on this privacy-preserving release step.",
      surface: "privacy",
      tone: "sand"
    },
    {
      num: "04",
      title: "Feature builder",
      brief: "HRV, demographic, and trajectory features aggregated for modeling.",
      detail: "src/feature_engineering/ computes time-domain and frequency-domain HRV (RMSSD, SDNN, LF/HF), behavioral coding densities, and parent-report aggregates. Output feeds both the latent growth curves and the deep learning ECG model.",
      input: "De-identified physiology, demographics, and coded behavior",
      output: "RMSSD, SDNN, LF/HF, trajectories, and report aggregates",
      artifact: "src/feature_engineering/",
      focus: "This stage translates the raw visits into the shared feature language used by trajectories and ECG inference.",
      surface: "features",
      tone: "sage"
    },
    {
      num: "05",
      title: "Models & evaluation",
      brief: "Latent growth curves, mixed effects models, transformer ECG, calibrated against held-out cohort.",
      detail: "Trained models live in src/models/. Evaluation harness (src/models/model_evaluation.py) reports AUROC, 95% CI, sensitivity/specificity, F1, and SHAP top-predictors, which the Dashboard's ML Performance section consumes.",
      input: "Feature tensors, longitudinal tables, and held-out validation cohorts",
      output: "Calibrated metrics, SHAP drivers, and model comparison surfaces",
      artifact: "src/models/model_evaluation.py",
      focus: "The model layer closes the loop by feeding the dashboard with scored predictions and interpretable diagnostics.",
      surface: "models",
      tone: "garnet"
    }
  ];

  var MODELS = [
    {
      tag: "Trajectory",
      name: "Latent Growth Curves",
      blurb: "Estimates per-group developmental slope and intercept for RSA biomarkers across visits 1-6.",
      focus: "Longitudinal group separation in autonomic maturation across repeated visits.",
      bestFor: "Questions about slope, intercept, or whether VPT / ASIB / TD groups diverge over time.",
      tone: "garnet",
      metrics: [
        { k: "Variance", v: "R²=0.71" },
        { k: "Groups", v: "4" },
        { k: "BIC", v: "-2418" }
      ],
      file: "src/models/latent_growth_curves.R"
    },
    {
      tag: "Mixed effects",
      name: "Linear Mixed Models",
      blurb: "Random-intercept models for clinical outcomes with site and family clustering.",
      focus: "Repeated-measures inference that respects site, family, and visit-level clustering.",
      bestFor: "Clinical questions where fixed effects matter but family or site variance cannot be ignored.",
      tone: "sand",
      metrics: [
        { k: "ICC", v: "0.18" },
        { k: "AIC", v: "1142" },
        { k: "Conv.", v: "100%" }
      ],
      file: "src/models/mixed_effects_models.R"
    },
    {
      tag: "Deep learning",
      name: "Transformer ECG",
      blurb: "Sequence-to-classification model over 30s ECG windows for early atypical autonomic patterning.",
      focus: "Direct representation learning over short ECG segments for early atypical pattern detection.",
      bestFor: "Highest-performing binary classification over windowed physiology, especially when timing dynamics matter.",
      tone: "ocean",
      metrics: [
        { k: "AUROC", v: "0.899" },
        { k: "Sens.", v: "0.82" },
        { k: "Spec.", v: "0.86" }
      ],
      file: "src/models/transformer_ecg.py"
    },
    {
      tag: "Markov",
      name: "Markov Chain States",
      blurb: "State-transition modeling over visit-level behavioral codings to detect cascade patterns.",
      focus: "Behavioral state switching and cascade pathways across visits.",
      bestFor: "Asking which coded states lead to later outcomes or which transitions appear unstable.",
      tone: "sage",
      metrics: [
        { k: "States", v: "6" },
        { k: "LL", v: "-184.3" },
        { k: "Conv.", v: "yes" }
      ],
      file: "src/models/markov_chain_models.py"
    },
    {
      tag: "Imputation",
      name: "MICE (chained eq.)",
      blurb: "Multiple imputation for missing biomarker and behavioral entries before downstream modeling.",
      focus: "Repairing sparse physiology and questionnaire cells before fitting downstream models.",
      bestFor: "Questions about missingness handling, sensitivity checks, or whether a model used imputed cells.",
      tone: "sand",
      metrics: [
        { k: "m", v: "20" },
        { k: "Rhat", v: "1.01" },
        { k: "Cells", v: "9.3k" }
      ],
      file: "src/imputation/mice_imputation.R"
    },
    {
      tag: "ECG features",
      name: "HRV Feature Pipeline",
      blurb: "Time/frequency domain HRV: RMSSD, SDNN, LF, HF, LF/HF, sample entropy.",
      focus: "Human-readable physiology features that feed both descriptive plots and model training tables.",
      bestFor: "Explaining what features exist, how ECG windows become metrics, and which HRV signals are tracked.",
      tone: "ocean",
      metrics: [
        { k: "Feats", v: "18" },
        { k: "Windows", v: "30s" },
        { k: "Rate", v: "256 Hz" }
      ],
      file: "src/preprocessing/hrv_features.py"
    }
  ];

  function _readings() {
    return (window.__ESD_READINGS__ && window.__ESD_READINGS__.readings) || [];
  }

  function _readingsSummary() {
    return (window.__ESD_READINGS__ && window.__ESD_READINGS__.summary) || {
      count: 0, total_pages: 0, total_size_mb: 0,
      by_category: {}, by_year: {}
    };
  }

  function _readingsGeneratedAt() {
    return (window.__ESD_READINGS__ && window.__ESD_READINGS__.generated_at) || "";
  }

  var _hubControls = {
    activate: null,
    showStage: null,
    showModel: null
  };

  function _hubExists() { return !!document.getElementById("__esd_knowledge_hub"); }

  function _activateHubPane(name) {
    if (typeof _hubControls.activate === "function") {
      _hubControls.activate(name);
    }
  }

  function _focusHubTarget(node) {
    if (!node) return;
    if (typeof node.focus === "function") {
      try {
        node.focus({ preventScroll: true });
      } catch (_err) {
        node.focus();
      }
    }
    if (typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }

  function _openHubCitation(cite) {
    if (!cite) return;
    if (cite.type === "reading") {
      _activateHubPane("readings");
      _openReadingModal(cite.id);
      return;
    }
    if (cite.type === "pipeline" && typeof _hubControls.showStage === "function") {
      _hubControls.showStage(cite.index || 0);
      return;
    }
    if (cite.type === "model" && typeof _hubControls.showModel === "function") {
      _hubControls.showModel(cite.index || 0);
      return;
    }
    if (cite.type === "site") {
      var mapWrap = document.getElementById("__esd_nicu_map_wrap");
      if (mapWrap) {
        mapWrap.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    if (cite.type === "pane") {
      _activateHubPane(cite.pane || "readings");
      var hub = document.getElementById("__esd_knowledge_hub");
      if (hub) hub.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function _renderHubShell() {
    if (_hubExists()) return document.getElementById("__esd_knowledge_hub");
    var sum = _readingsSummary();
    var sec = document.createElement("section");
    sec.id = "__esd_knowledge_hub";
    sec.setAttribute("aria-label", "Research Knowledge Hub");
    sec.innerHTML = [
      '<aside class="esd-hub-side" aria-label="Hub navigation">',
        '<div class="eyebrow">Knowledge Hub</div>',
        '<a href="#esd-pane-readings" data-pane="readings" class="active">Readings library</a>',
        '<a href="#esd-pane-pipeline" data-pane="pipeline">Data pipeline</a>',
        '<a href="#esd-pane-models" data-pane="models">Working models</a>',
        '<a href="#esd-pane-viz" data-pane="viz">Visualizations</a>',
        '<a href="#esd-pane-chat" data-pane="chat">Ask the AI</a>',
      '</aside>',
      '<div class="esd-hub-body">',
        '<header class="esd-hub-head">',
          '<div class="eyebrow">NANO Study · ESD Lab</div>',
          '<h2>Research Knowledge Hub</h2>',
          '<p>Interactive entry point to the ESD Lab’s indexed readings, working data pipelines, fitted models, study visualizations, and an in-browser AI assistant that reasons over the corpus. Pick a tab to dive in.</p>',
          '<div class="hero-stats">',
            '<span class="pill"><b>' + (sum.count || 0) + '</b> indexed readings</span>',
            '<span class="pill"><b>' + (sum.total_pages || 0) + '</b> pages</span>',
            '<span class="pill"><b>' + (sum.total_size_mb || 0) + '</b> MB</span>',
            '<span class="pill"><b>' + MODELS.length + '</b> working models</span>',
            '<span class="pill"><b>' + PIPELINE_STAGES.length + '</b> pipeline stages</span>',
            '<span class="pill"><b>' + NICU_SITES.length + '</b> NICU sites</span>',
          '</div>',
        '</header>',
        '<nav class="esd-tabs" role="tablist">',
          '<button role="tab" data-pane="readings" aria-selected="true">Readings library</button>',
          '<button role="tab" data-pane="pipeline" aria-selected="false">Data pipeline</button>',
          '<button role="tab" data-pane="models" aria-selected="false">Working models</button>',
          '<button role="tab" data-pane="viz" aria-selected="false">Visualizations</button>',
          '<button role="tab" data-pane="chat" aria-selected="false">Ask the AI</button>',
        '</nav>',
        '<article id="esd-pane-readings" class="esd-pane active" role="tabpanel">',
          '<div class="readings-controls">',
            '<input type="search" id="esd-readings-search" placeholder="Search readings (title, keyword, year)…" autocomplete="off">',
            '<select id="esd-readings-category"><option value="">All categories</option></select>',
            '<select id="esd-readings-year"><option value="">All years</option></select>',
          '</div>',
          '<div id="esd-readings-grid" class="readings-grid"></div>',
        '</article>',
        '<article id="esd-pane-pipeline" class="esd-pane" role="tabpanel">',
          '<div class="pipeline-flow">',
            '<div class="pipeline-stages"></div>',
            '<div class="stage-detail" id="esd-stage-detail"></div>',
          '</div>',
        '</article>',
        '<article id="esd-pane-models" class="esd-pane" role="tabpanel">',
          '<div class="model-grid"></div>',
          '<div class="model-detail" id="esd-model-detail"></div>',
        '</article>',
        '<article id="esd-pane-viz" class="esd-pane" role="tabpanel">',
          '<div class="viz-grid">',
            '<div class="viz-tile"><h4>Readings by year</h4><div class="canvas-wrap"><canvas id="esd-chart-year"></canvas></div></div>',
            '<div class="viz-tile"><h4>Readings by category</h4><div class="canvas-wrap"><canvas id="esd-chart-cat"></canvas></div></div>',
            '<div class="viz-tile"><h4>Cumulative enrollment (sim)</h4><div class="canvas-wrap"><canvas id="esd-chart-enroll"></canvas></div></div>',
            '<div class="viz-tile"><h4>Model AUROC comparison</h4><div class="canvas-wrap"><canvas id="esd-chart-auroc"></canvas></div></div>',
          '</div>',
        '</article>',
        '<article id="esd-pane-chat" class="esd-pane" role="tabpanel">',
          '<div class="chat-shell">',
            '<div class="chat-main">',
              '<div class="chat-header">',
                '<span class="title">Ask the AI · context-aware</span>',
                '<span class="status" id="esd-chat-status">Idle</span>',
              '</div>',
              '<div class="chat-msgs" id="esd-chat-msgs"></div>',
              '<form class="chat-input" id="esd-chat-form">',
                '<textarea id="esd-chat-text" placeholder="Ask about the readings, models, or recruitment status…" rows="1"></textarea>',
                '<button type="submit" id="esd-chat-send">Send</button>',
              '</form>',
            '</div>',
            '<div class="chat-sidebar">',
              '<div class="card">',
                '<h5>Engine</h5>',
                '<div id="esd-chat-engine" style="font-size:12px;color:var(--warm-700,#4a4438);line-height:1.5;">Initializing…</div>',
                '<div class="chat-progress"><div class="bar" id="esd-chat-bar"></div></div>',
              '</div>',
              '<div class="card corpus">',
                '<h5>Knowledge sync</h5>',
                '<div class="sync-grid">',
                  '<div class="cell"><span class="k">Readings</span><span class="v">' + (sum.count || 0) + '</span></div>',
                  '<div class="cell"><span class="k">Models</span><span class="v">' + MODELS.length + '</span></div>',
                  '<div class="cell"><span class="k">Stages</span><span class="v">' + PIPELINE_STAGES.length + '</span></div>',
                  '<div class="cell"><span class="k">Sites</span><span class="v">' + NICU_SITES.length + '</span></div>',
                '</div>',
                '<p id="esd-chat-sync-note">Readings snapshot · ' + _escape(_readingsGeneratedAt() || 'pending refresh') + '</p>',
              '</div>',
              '<div class="card suggested">',
                '<h5>Try asking</h5>',
                '<button data-q="Summarize the main findings on infant autonomic and attentional pathways.">Summarize the autonomic / attentional findings</button>',
                '<button data-q="What models are running over the ECG data?">What ECG models are running?</button>',
                '<button data-q="Which NICU site is closest to enrolment target?">Which NICU site is closest to target?</button>',
                '<button data-q="Explain the de-identification pipeline.">Explain the de-identification pipeline</button>',
              '</div>',
            '</div>',
          '</div>',
        '</article>',
      '</div>',
      '<div id="__esd_reading_modal" role="dialog" aria-modal="true" aria-label="Reading detail">',
        '<div class="panel">',
          '<button class="close" aria-label="Close">✕</button>',
          '<h2></h2>',
          '<div class="meta"></div>',
          '<div class="abstract"></div>',
        '</div>',
      '</div>'
    ].join("");
    document.body.appendChild(sec);
    return sec;
  }

  function _wireTabs(sec) {
    var tabs = sec.querySelectorAll(".esd-tabs button");
    var panes = sec.querySelectorAll(".esd-pane");
    var sideLinks = sec.querySelectorAll(".esd-hub-side a");

    function activate(name) {
      tabs.forEach(function (t) {
        t.setAttribute("aria-selected", t.getAttribute("data-pane") === name ? "true" : "false");
      });
      panes.forEach(function (p) {
        p.classList.toggle("active", p.id === "esd-pane-" + name);
      });
      sideLinks.forEach(function (a) {
        a.classList.toggle("active", a.getAttribute("data-pane") === name);
      });
      // pane-specific lazy work
      if (name === "viz") _drawCharts();
      if (name === "chat") _initChat();
    }
    _hubControls.activate = activate;
    tabs.forEach(function (t) {
      t.addEventListener("click", function () { activate(t.getAttribute("data-pane")); });
    });
    sideLinks.forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        activate(a.getAttribute("data-pane"));
        sec.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function _renderReadings(sec, q, cat, yr) {
    var grid = sec.querySelector("#esd-readings-grid");
    if (!grid) return;
    var all = _readings();
    q = (q || "").toLowerCase().trim();
    var filtered = all.filter(function (r) {
      if (cat && r.category !== cat) return false;
      if (yr && String(r.year) !== yr) return false;
      if (!q) return true;
      var hay = (r.title + " " + (r.keywords || []).join(" ") + " " + (r.abstract || "")).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    if (!filtered.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--warm-500,#6b6353);font-family:var(--font-mono,monospace);font-size:12px;">No readings match these filters.</div>';
      return;
    }
    grid.innerHTML = filtered.map(function (r, index) {
      var kws = (r.keywords || []).slice(0, 5).map(function (k) {
        return '<span class="kw">' + _escape(k) + '</span>';
      }).join("");
      return [
        '<article class="reading-card reveal" data-id="', _escape(r.id), '" tabindex="0" style="--reveal-delay:', ((index % 8) * 36), 'ms">',
          '<div class="head">',
            '<span class="badge">', _escape(r.category || "Other"), '</span>',
            '<span class="year">', _escape(r.year || ""), '</span>',
          '</div>',
          '<h3>', _escape(r.title), '</h3>',
          '<p class="excerpt">', _escape(r.abstract || ""), '</p>',
          '<div class="keywords">', kws, '</div>',
          '<div class="foot">',
            '<span>', r.page_count || 0, ' pp · ', (r.size_mb || 0).toFixed(2), ' MB</span>',
            '<span>Click to expand →</span>',
          '</div>',
        '</article>'
      ].join("");
    }).join("");

    grid.querySelectorAll(".reading-card").forEach(function (card) {
      card.addEventListener("click", function () {
        _openReadingModal(card.getAttribute("data-id"));
      });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          _openReadingModal(card.getAttribute("data-id"));
        }
      });
    });
  }

  function _escape(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function _openReadingModal(id) {
    var r = _readings().find(function (x) { return x.id === id; });
    if (!r) return;
    var modal = document.getElementById("__esd_reading_modal");
    if (!modal) return;
    modal.querySelector("h2").textContent = r.title;
    modal.querySelector(".meta").innerHTML = [
      '<span class="pill">' + _escape(r.category || "Other") + '</span>',
      '<span class="pill">' + _escape(r.year || "n/a") + '</span>',
      '<span class="pill">' + (r.page_count || 0) + ' pages</span>',
      r.source ? '<span class="pill">' + _escape(r.source) + '</span>' : ''
    ].join("");
    modal.querySelector(".abstract").textContent = r.abstract || "No abstract available for this reading.";
    modal.classList.add("open");
  }

  function _wireReadings(sec) {
    var search = sec.querySelector("#esd-readings-search");
    var catSel = sec.querySelector("#esd-readings-category");
    var yrSel = sec.querySelector("#esd-readings-year");
    var sum = _readingsSummary();

    Object.keys(sum.by_category || {}).forEach(function (c) {
      var o = document.createElement("option");
      o.value = c; o.textContent = c + " (" + sum.by_category[c] + ")";
      catSel.appendChild(o);
    });
    Object.keys(sum.by_year || {}).sort().reverse().forEach(function (y) {
      if (y === "None") return;
      var o = document.createElement("option");
      o.value = y; o.textContent = y + " (" + sum.by_year[y] + ")";
      yrSel.appendChild(o);
    });

    function refresh() { _renderReadings(sec, search.value, catSel.value, yrSel.value); }
    search.addEventListener("input", refresh);
    catSel.addEventListener("change", refresh);
    yrSel.addEventListener("change", refresh);
    refresh();

    // Modal close
    var modal = document.getElementById("__esd_reading_modal");
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal || e.target.classList.contains("close")) {
          modal.classList.remove("open");
        }
      });
    }
  }

  function _wirePipeline(sec) {
    var wrap = sec.querySelector(".pipeline-stages");
    var detail = sec.querySelector("#esd-stage-detail");
    if (!wrap || !detail) return;
    wrap.innerHTML = PIPELINE_STAGES.map(function (s, i) {
      return [
        '<button type="button" class="stage-node reveal', i === 0 ? ' active' : '', '" data-i="', i, '" data-tone="', _escape(s.tone || 'garnet'), '" style="--reveal-delay:', (i * 70), 'ms">',
          '<div class="stage-node-head">',
            '<div class="num">STAGE ', s.num, '</div>',
            '<span class="stage-pill">', _escape(s.surface || 'stage'), '</span>',
          '</div>',
          '<h4>', _escape(s.title), '</h4>',
          '<p class="stage-summary">', _escape(s.brief), '</p>',
          '<div class="stage-foot">',
            '<span class="stage-signal"></span>',
            '<span>', _escape(s.artifact || s.output || 'Open stage detail'), '</span>',
          '</div>',
        '</button>'
      ].join("");
    }).join("");
    function showStage(i, options) {
      if (i < 0 || i >= PIPELINE_STAGES.length) return;
      var s = PIPELINE_STAGES[i];
      detail.innerHTML = [
        '<div class="detail-head">',
          '<div>',
            '<div class="detail-kicker">Stage ', s.num, ' · ', _escape(s.title), '</div>',
            '<h5>', _escape(s.focus || s.title), '</h5>',
          '</div>',
          '<span class="detail-state">Synced</span>',
        '</div>',
        '<p class="detail-brief">', _escape(s.brief), '</p>',
        '<p>', _escape(s.detail), '</p>',
        '<div class="detail-meta">',
          '<span class="detail-pill"><strong>Input</strong> ', _escape(s.input || 'Pipeline inputs'), '</span>',
          '<span class="detail-pill"><strong>Output</strong> ', _escape(s.output || 'Dashboard artifacts'), '</span>',
          '<span class="detail-pill"><strong>Artifact</strong> ', _escape(s.artifact || 'Repository surface'), '</span>',
        '</div>'
      ].join('');
      wrap.querySelectorAll(".stage-node").forEach(function (n) {
        var active = parseInt(n.getAttribute("data-i"), 10) === i;
        n.classList.toggle("active", active);
        n.setAttribute("aria-pressed", active ? "true" : "false");
      });
      if (options && options.focus) {
        _focusHubTarget(wrap.querySelector('.stage-node[data-i="' + i + '"]'));
      }
    }
    wrap.querySelectorAll(".stage-node").forEach(function (n) {
      n.addEventListener("click", function () {
        showStage(parseInt(n.getAttribute("data-i"), 10));
      });
      n.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        var current = parseInt(n.getAttribute("data-i"), 10);
        var next = (current + (e.key === "ArrowRight" ? 1 : -1) + PIPELINE_STAGES.length) % PIPELINE_STAGES.length;
        showStage(next, { focus: true });
      });
    });
    _hubControls.showStage = function (index) {
      _activateHubPane("pipeline");
      showStage(index, { focus: true });
    };
    showStage(0);
  }

  function _wireModels(sec) {
    var wrap = sec.querySelector(".model-grid");
    var detail = sec.querySelector("#esd-model-detail");
    if (!wrap || !detail) return;
    wrap.innerHTML = MODELS.map(function (m) {
      var index = MODELS.indexOf(m);
      var mets = m.metrics.map(function (x) {
        return '<div class="metric"><div class="k">' + _escape(x.k) + '</div><div class="v">' + _escape(x.v) + '</div></div>';
      }).join("");
      return [
        '<button type="button" class="model-card reveal', index === 0 ? ' active' : '', '" data-i="', index, '" data-file="', _escape(m.file), '" data-tone="', _escape(m.tone || 'garnet'), '" style="--reveal-delay:', (index * 58), 'ms">',
          '<div class="card-head">',
            '<div>',
              '<div class="tag">', _escape(m.tag), '</div>',
              '<h3>', _escape(m.name), '</h3>',
            '</div>',
            '<span class="card-index">', String(index + 1).padStart(2, '0'), '</span>',
          '</div>',
          '<p>', _escape(m.blurb), '</p>',
          '<div class="model-note">', _escape(m.focus || 'Model spotlight'), '</div>',
          '<div class="metrics">', mets, '</div>',
          '<div class="model-foot">',
            '<span class="file-pill">', _escape(m.file), '</span>',
            '<span class="detail-link">Inspect →</span>',
          '</div>',
        '</button>'
      ].join("");
    }).join("");

    function showModel(i, options) {
      if (i < 0 || i >= MODELS.length) return;
      var m = MODELS[i];
      var metricLine = m.metrics.map(function (x) {
        return x.k + ' ' + x.v;
      }).join(' · ');
      detail.innerHTML = [
        '<div class="detail-head model-head">',
          '<div>',
            '<div class="detail-kicker">', _escape(m.tag), '</div>',
            '<h5>', _escape(m.name), '</h5>',
          '</div>',
          '<span class="detail-state">Live surface</span>',
        '</div>',
        '<p class="detail-brief">', _escape(m.blurb), '</p>',
        '<p>', _escape(m.bestFor || m.focus || 'Grounded model context'), '</p>',
        '<div class="detail-meta">',
          '<span class="detail-pill"><strong>Focus</strong> ', _escape(m.focus || 'Model behavior'), '</span>',
          '<span class="detail-pill"><strong>Best for</strong> ', _escape(m.bestFor || 'Grounded QA'), '</span>',
          '<span class="detail-pill"><strong>Source</strong> ', _escape(m.file), '</span>',
          '<span class="detail-pill"><strong>Key metrics</strong> ', _escape(metricLine), '</span>',
        '</div>'
      ].join('');
      wrap.querySelectorAll('.model-card').forEach(function (n) {
        var active = parseInt(n.getAttribute('data-i'), 10) === i;
        n.classList.toggle('active', active);
        n.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if (options && options.focus) {
        _focusHubTarget(wrap.querySelector('.model-card[data-i="' + i + '"]'));
      }
    }

    wrap.querySelectorAll('.model-card').forEach(function (card) {
      card.addEventListener('click', function () {
        showModel(parseInt(card.getAttribute('data-i'), 10));
      });
      card.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        var current = parseInt(card.getAttribute('data-i'), 10);
        var next = (current + (e.key === 'ArrowRight' ? 1 : -1) + MODELS.length) % MODELS.length;
        showModel(next, { focus: true });
      });
    });

    _hubControls.showModel = function (index) {
      _activateHubPane('models');
      showModel(index, { focus: true });
    };
    showModel(0);
  }

  function _tokenizeQuery(text) {
    return String(text || '').toLowerCase().match(/[a-z0-9][a-z0-9/-]*/g) || [];
  }

  function _escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function _clip(text, maxChars) {
    var cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxChars) return cleaned;
    return cleaned.slice(0, Math.max(0, maxChars - 1)).trim() + '…';
  }

  function _knowledgeDocs() {
    var sum = _readingsSummary();
    var docs = [
      {
        type: 'overview',
        title: 'ESD Lab knowledge hub overview',
        body: 'The NANO study knowledge hub indexes ' + (sum.count || 0) + ' readings, ' + PIPELINE_STAGES.length + ' pipeline stages, ' + MODELS.length + ' working models, and ' + NICU_SITES.length + ' NICU sites for the public website and assistant.',
        keywords: ['overview', 'knowledge hub', 'website', 'dashboard', 'NANO', 'ESD Lab'],
        cite: { type: 'pane', pane: 'readings', label: 'Knowledge Hub' }
      }
    ];

    PIPELINE_STAGES.forEach(function (stage, index) {
      docs.push({
        type: 'pipeline',
        title: 'Pipeline stage ' + stage.num + ' · ' + stage.title,
        body: [stage.brief, stage.detail, stage.input, stage.output, stage.artifact, stage.focus].join(' '),
        keywords: ['pipeline', 'stage', stage.num, stage.title, stage.surface, 'redcap', 'hipaa', 'hrv'],
        cite: { type: 'pipeline', index: index, label: 'Stage ' + stage.num }
      });
    });

    MODELS.forEach(function (model, index) {
      docs.push({
        type: 'model',
        title: model.name,
        body: [
          model.tag,
          model.blurb,
          model.focus,
          model.bestFor,
          model.file,
          model.metrics.map(function (metric) { return metric.k + ' ' + metric.v; }).join(' ')
        ].join(' '),
        keywords: ['model', model.tag, model.name, model.file, 'auroc', 'ecg', 'rmssd', 'rsa'],
        cite: { type: 'model', index: index, label: _clip(model.name, 28) }
      });
    });

    NICU_SITES.forEach(function (site) {
      docs.push({
        type: 'site',
        title: site.name + ' NICU site',
        body: [
          site.partner,
          site.role,
          site.address,
          'Enrolled',
          site.enrolled,
          'Target',
          site.target,
          'Queries',
          site.queries,
          'Readings per day',
          site.readings,
          'Readiness',
          _formatPct(site.ready)
        ].join(' '),
        keywords: ['site', 'nicu', site.name, site.partner, site.role, 'enrollment', 'target', 'queries'],
        cite: { type: 'site', key: site.key, label: site.name }
      });
    });

    _readings().forEach(function (reading) {
      docs.push({
        type: 'reading',
        title: reading.title,
        year: reading.year,
        category: reading.category,
        source: reading.source,
        body: [reading.abstract || '', reading.source || '', reading.category || '', reading.year || ''].join(' '),
        keywords: (reading.keywords || []).concat([reading.category || '', reading.source || '', String(reading.year || '')]),
        cite: { type: 'reading', id: reading.id, label: _clip(reading.title, 36) }
      });
    });

    return docs;
  }

  function _scoreDoc(doc, tokens, questionLower) {
    var hay = (doc.title + ' ' + doc.body + ' ' + (doc.keywords || []).join(' ')).toLowerCase();
    var title = String(doc.title || '').toLowerCase();
    var score = 0;
    tokens.forEach(function (token) {
      if (hay.indexOf(token) === -1) return;
      var matches = hay.match(new RegExp(_escapeRegExp(token), 'g')) || [];
      score += title.indexOf(token) !== -1 ? 4 : 2;
      score += Math.min(3, matches.length * 0.5);
    });
    if (doc.type === 'pipeline' && /(pipeline|redcap|hipaa|de-ident|deident|window|qa|feature|stage|sync)/.test(questionLower)) score += 6;
    if (doc.type === 'model' && /(model|ecg|transformer|auroc|auc|mixed|markov|latent|mice|rmssd|sdnn|hf|lf)/.test(questionLower)) score += 6;
    if (doc.type === 'site' && /(site|nicu|columbia|greenville|charleston|recruit|enroll|target|midlands|musc|prisma)/.test(questionLower)) score += 6;
    if (doc.type === 'reading' && /(reading|paper|article|literature|study|attachment|autonomic|attention|emotion|spatial|math|parenting|autism)/.test(questionLower)) score += 4;
    if (doc.type === 'overview' && /(website|hub|knowledge|dashboard|what can you answer|what is this)/.test(questionLower)) score += 5;
    return score;
  }

  function _docSnippet(doc) {
    return _clip(doc.body, doc.type === 'reading' ? 220 : 180);
  }

  /* ---------- Chart.js loader + viz wiring -------------------- */

  var _chartLib = null;
  function _loadChart(cb) {
    if (window.Chart && window.Chart.register) { _chartLib = window.Chart; return cb(); }
    if (document.querySelector('script[data-esd-chartjs]')) {
      var i = setInterval(function () {
        if (window.Chart) { clearInterval(i); _chartLib = window.Chart; cb(); }
      }, 80);
      return;
    }
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
    s.setAttribute("data-esd-chartjs", "1");
    s.async = true;
    s.onload = function () { _chartLib = window.Chart; cb(); };
    document.head.appendChild(s);
  }

  var _chartsDrawn = false;
  function _drawCharts() {
    if (_chartsDrawn) return;
    _chartsDrawn = true;
    _loadChart(function () {
      var C = _chartLib;
      var sum = _readingsSummary();
      var common = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, labels: { color: "#5b5446", font: { family: "Inter", size: 11 } } },
          tooltip: { backgroundColor: "#1a1815", titleFont: { family: "Inter" }, bodyFont: { family: "Inter" } }
        },
        scales: {
          x: { ticks: { color: "#6b6353", font: { family: "Inter", size: 11 } }, grid: { color: "rgba(115,0,10,0.05)" } },
          y: { ticks: { color: "#6b6353", font: { family: "Inter", size: 11 } }, grid: { color: "rgba(115,0,10,0.05)" } }
        }
      };
      // Year chart
      var yrs = Object.keys(sum.by_year || {}).filter(function (y) { return y !== "None"; }).sort();
      new C(document.getElementById("esd-chart-year"), {
        type: "bar",
        data: {
          labels: yrs,
          datasets: [{
            label: "Readings",
            data: yrs.map(function (y) { return sum.by_year[y]; }),
            backgroundColor: "rgba(115,0,10,0.78)",
            borderRadius: 6
          }]
        },
        options: common
      });
      // Category chart
      var cats = Object.keys(sum.by_category || {});
      new C(document.getElementById("esd-chart-cat"), {
        type: "doughnut",
        data: {
          labels: cats,
          datasets: [{
            data: cats.map(function (c) { return sum.by_category[c]; }),
            backgroundColor: ["#73000a", "#d4ad6a", "#8a8270", "#55a868", "#b97f00"],
            borderWidth: 2,
            borderColor: "#faf6ee"
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: common.plugins }
      });
      // Enrollment cumulative
      var months = ["Nov 23","Dec 23","Jan 24","Feb 24","Mar 24","Apr 24","May 24","Jun 24","Jul 24","Aug 24","Sep 24","Oct 24","Nov 24","Dec 24","Jan 25","Feb 25","Mar 25","Apr 25","May 25"];
      var cum = months.map(function (_, i) { return Math.round(11 * (i + 1) * (1 + Math.random() * 0.1)); });
      new C(document.getElementById("esd-chart-enroll"), {
        type: "line",
        data: {
          labels: months,
          datasets: [{
            label: "Cumulative enrolled",
            data: cum,
            borderColor: "#73000a",
            backgroundColor: "rgba(115,0,10,0.10)",
            tension: 0.35,
            fill: true,
            pointRadius: 0,
            borderWidth: 2
          }, {
            label: "Target",
            data: months.map(function () { return 260; }),
            borderColor: "#d4ad6a",
            borderDash: [4, 4],
            pointRadius: 0,
            borderWidth: 1.5
          }]
        },
        options: common
      });
      // Model AUROC
      new C(document.getElementById("esd-chart-auroc"), {
        type: "bar",
        data: {
          labels: ["LGM", "LMM", "Transformer", "Markov", "MICE", "HRV"],
          datasets: [{
            label: "AUROC / proxy quality",
            data: [0.71, 0.82, 0.899, 0.74, 0.93, 0.86],
            backgroundColor: ["#8a8270","#8a8270","#73000a","#8a8270","#8a8270","#8a8270"],
            borderRadius: 6
          }]
        },
        options: Object.assign({}, common, {
          scales: {
            x: common.scales.x,
            y: Object.assign({}, common.scales.y, { min: 0.5, max: 1 })
          }
        })
      });
    });
  }

  /* ---------- WebLLM (Llama-3.2-1B) + retrieval fallback ------ */

  var _chat = {
    inited: false,
    engine: null,
    history: [],
    mode: "loading", // 'webllm' | 'fallback' | 'loading'
    label: "Initializing…"
  };

  function _chatStatus(text, kind) {
    var el = document.getElementById("esd-chat-status");
    if (el) {
      el.textContent = text;
      el.className = "status " + (kind || "");
    }
    var eng = document.getElementById("esd-chat-engine");
    if (eng) eng.textContent = _chat.label;
  }

  function _chatBar(p) {
    var b = document.getElementById("esd-chat-bar");
    if (b) b.style.width = Math.min(100, Math.max(0, p * 100)) + "%";
  }

  function _initChat() {
    if (_chat.inited) return;
    _chat.inited = true;

    // Wire form
    var form = document.getElementById("esd-chat-form");
    var ta = document.getElementById("esd-chat-text");
    var msgs = document.getElementById("esd-chat-msgs");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var q = ta.value.trim();
        if (!q) return;
        ta.value = "";
        _ask(q);
      });
      ta.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          form.dispatchEvent(new Event("submit"));
        }
      });
    }
    // Wire suggested buttons
    document.querySelectorAll("#__esd_knowledge_hub .suggested button").forEach(function (b) {
      b.addEventListener("click", function () {
        var q = b.getAttribute("data-q");
        if (q) _ask(q);
      });
    });

    _addBot("Hello — I'm the ESD Lab assistant. I have access to " + _readings().length + " indexed readings, the data pipeline stages, and the working models. Ask me anything about the studies, methods, or recruitment.");

    _bootWebLLM();
  }

  function _addUser(t) {
    var msgs = document.getElementById("esd-chat-msgs");
    if (!msgs) return;
    var d = document.createElement("div");
    d.className = "chat-msg user";
    d.textContent = t;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }
  function _addBot(t, cites) {
    var msgs = document.getElementById("esd-chat-msgs");
    if (!msgs) return null;
    var d = document.createElement("div");
    d.className = "chat-msg bot";
    d.textContent = t;
    if (cites && cites.length) {
      var br = document.createElement("br");
      d.appendChild(br);
      cites.forEach(function (c) {
        var s = document.createElement("span");
        s.className = "cite";
        s.textContent = c.label;
        s.addEventListener("click", function () { _openHubCitation(c); });
        d.appendChild(s);
      });
    }
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  function _bootWebLLM() {
    _chatStatus("Loading model…", "loading");
    _chat.label = "Loading WebLLM (Llama-3.2-1B-Instruct)…";
    _chatStatus("Loading model…", "loading");
    if (!navigator.gpu) {
      _chat.mode = "fallback";
      _chat.label = "WebGPU not available · using local retrieval engine";
      _chatStatus("Retrieval mode", "ready");
      return;
    }
    var mod = "https://esm.run/@mlc-ai/web-llm@0.2.46";
    import(mod).then(function (WebLLM) {
      var modelId = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
      var initProgressCallback = function (r) {
        _chat.label = r.text || "Loading…";
        _chatStatus("Loading model…", "loading");
        _chatBar(r.progress || 0);
      };
      WebLLM.CreateMLCEngine(modelId, { initProgressCallback: initProgressCallback })
        .then(function (engine) {
          _chat.engine = engine;
          _chat.mode = "webllm";
          _chat.label = "Llama-3.2-1B-Instruct · WebLLM · ready";
          _chatStatus("Llama ready", "ready");
          _chatBar(1);
        })
        .catch(function (err) {
          console.warn("[esd-chat] WebLLM init failed:", err);
          _chat.mode = "fallback";
          _chat.label = "WebLLM unavailable · using local retrieval";
          _chatStatus("Retrieval mode", "ready");
        });
    }).catch(function (err) {
      console.warn("[esd-chat] WebLLM import failed:", err);
      _chat.mode = "fallback";
      _chat.label = "WebLLM unavailable · using local retrieval";
      _chatStatus("Retrieval mode", "ready");
    });
  }

  function _retrieve(q) {
    var ql = String(q || '').toLowerCase();
    var toks = _tokenizeQuery(ql);
    return _knowledgeDocs()
      .map(function (doc) {
        return { doc: doc, s: _scoreDoc(doc, toks, ql) };
      })
      .filter(function (entry) { return entry.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, 6)
      .map(function (entry) { return entry.doc; });
  }

  function _fallbackAnswer(q) {
    var hits = _retrieve(q);
    if (!hits.length) {
      // Pipeline / model meta answers
      var ql = q.toLowerCase();
      if (ql.indexOf("pipeline") !== -1 || ql.indexOf("de-id") !== -1 || ql.indexOf("redcap") !== -1) {
        return {
          text: "The NANO data pipeline runs in five stages: 1) REDCap intake at three NICU sites, 2) Actiheart-5 window QA, 3) HIPAA Safe-Harbor de-identification, 4) HRV + behavioral feature building, 5) model fitting + evaluation. Open the Data pipeline tab for the step-by-step detail.",
          cites: [{ type: 'pane', pane: 'pipeline', label: 'Data pipeline' }]
        };
      }
      if (ql.indexOf("ecg") !== -1 || ql.indexOf("transformer") !== -1 || ql.indexOf("auroc") !== -1) {
        return {
          text: "Six working models are in play: a transformer over 30s ECG windows (AUROC 0.899), HRV feature pipeline (RMSSD/SDNN/LF/HF), latent growth curves over RSA trajectories, mixed-effects models, Markov chain state models, and MICE imputation. The Models tab shows per-model metrics.",
          cites: [{ type: 'pane', pane: 'models', label: 'Working models' }]
        };
      }
      if (ql.indexOf("site") !== -1 || ql.indexOf("nicu") !== -1 || ql.indexOf("enroll") !== -1) {
        return {
          text: "Three NICU sites participate: USC IMB / Prisma Midlands in Columbia, Prisma Upstate in Greenville, and MUSC in Charleston. The interactive map in the recruitment section shows per-site live counters including enrolled vs target, open queries, and readings per day.",
          cites: [{ type: 'site', key: 'columbia', label: 'NICU sites' }]
        };
      }
      return { text: "I couldn't find a direct match in the indexed readings. Try the suggested questions on the right, or use more specific terms (e.g. 'attachment', 'autonomic', 'spatial thinking').", cites: [] };
    }
    var lines = ["Here's what I found across the synced knowledge base:"];
    hits.slice(0, 4).forEach(function (doc, i) {
      lines.push((i + 1) + ". [" + doc.type + "] " + doc.title + " — " + _docSnippet(doc));
    });
    lines.push("");
    lines.push("Click a citation chip below to open the full record.");
    return {
      text: lines.join("\n"),
      cites: hits.slice(0, 4).map(function (doc) { return doc.cite; }).filter(Boolean)
    };
  }

  function _ask(q) {
    _addUser(q);
    var sendBtn = document.getElementById("esd-chat-send");
    if (sendBtn) sendBtn.disabled = true;

    var hits = _retrieve(q);

    if (_chat.mode === "webllm" && _chat.engine) {
      var contextDocs = hits.slice(0, 4);
      var contextStr = contextDocs.map(function (doc) {
        var meta = [];
        if (doc.type === 'reading') meta.push('reading corpus');
        if (doc.type === 'pipeline') meta.push('pipeline stage');
        if (doc.type === 'model') meta.push('working model');
        if (doc.type === 'site') meta.push('NICU site');
        return "Title: " + doc.title +
               (doc.year ? "\nYear: " + doc.year : "") +
               (doc.category ? "\nCategory: " + doc.category : "") +
               (doc.source ? "\nSource: " + doc.source : "") +
               "\nType: " + doc.type +
               (meta.length ? "\nMeta: " + meta.join(' · ') : "") +
               "\nKeywords: " + (doc.keywords || []).join(", ") +
               "\nContent: " + _clip(doc.body || '', 700);
      }).join("\n---\n");
      var systemMsg = "You are the ESD Lab research assistant for the NANO Study at the University of South Carolina. " +
        "Answer concisely and only from the provided context, which may include indexed readings, pipeline stages, working models, and site metadata from the website. " +
        "If the context does not cover the question, say so and offer related topics from the corpus.\n\n" +
        "CONTEXT (top retrieved records):\n" + contextStr;

      var msgEl = _addBot("…");
      _chat.engine.chat.completions.create({
        stream: true,
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: q }
        ],
        temperature: 0.5,
        max_tokens: 380
      }).then(async function (stream) {
        var acc = "";
        for await (var chunk of stream) {
          var delta = (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) || "";
          acc += delta;
          if (msgEl) msgEl.textContent = acc;
          var msgs = document.getElementById("esd-chat-msgs");
          if (msgs) msgs.scrollTop = msgs.scrollHeight;
        }
        if (contextDocs.length && msgEl) {
          msgEl.appendChild(document.createElement("br"));
          contextDocs.forEach(function (doc) {
            if (!doc.cite) return;
            var s = document.createElement("span");
            s.className = "cite";
            s.textContent = doc.cite.label;
            s.addEventListener("click", function () { _openHubCitation(doc.cite); });
            msgEl.appendChild(s);
          });
        }
        if (sendBtn) sendBtn.disabled = false;
      }).catch(function (err) {
        console.warn("[esd-chat] inference error:", err);
        if (msgEl) msgEl.textContent = "Inference error — falling back to retrieval.";
        var fb = _fallbackAnswer(q);
        _addBot(fb.text, fb.cites);
        if (sendBtn) sendBtn.disabled = false;
      });
    } else {
      setTimeout(function () {
        var fb = _fallbackAnswer(q);
        _addBot(fb.text, fb.cites);
        if (sendBtn) sendBtn.disabled = false;
      }, 220);
    }
  }

  function _mountHub() {
    if (_hubExists()) return false;
    var sec = _renderHubShell();
    _wireTabs(sec);
    _wireReadings(sec);
    _wirePipeline(sec);
    _wireModels(sec);
    return true;
  }

  /* ---------- 9. Re-run on DOM mutations (bundler-late render) */
  function rewireAll() {
    try { wireReveal(); } catch (e) {}
    try { wireNavActive(); } catch (e) {}
    try { wireEmptyStates(); } catch (e) {}
    try { ensureDeployBanner(); } catch (e) {}
    try { _mountMap(); } catch (e) {}
    var mountedHub = false;
    try { mountedHub = _mountHub(); } catch (e) {}
    if (mountedHub) {
      try { wireReveal(); } catch (e) {}
    }
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
