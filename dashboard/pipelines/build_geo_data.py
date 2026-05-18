"""NANO Study — Geospatial data generator for dashboard payloads.

Produces the ``geo`` key retained in ``dashboard_data.json`` for the
legacy geospatial surface and any future compatibility consumers. All data is aggregated to ZIP-code level
and any cell with fewer than SUPPRESSION_THRESHOLD participants is
suppressed to prevent re-identification.

For demo / synthetic mode the module generates plausible Columbia SC
Midlands geography using a fixed seed. In production mode, it would
read geocoded ZIP centroids from the REDCap demographic extract.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Any

import numpy as np

SEED = 42
SUPPRESSION_THRESHOLD = 5

# ESD Lab location: 1800 Gervais Street, Columbia, SC 29201
LAB_LAT = 34.0007
LAB_LNG = -81.0348

# Midlands SC ZIP codes with approximate centroids
SC_ZIPS = [
    ("29201", "Downtown Columbia",      34.0007, -81.0348),
    ("29203", "North Columbia",         34.0420, -81.0180),
    ("29204", "Eau Claire",             34.0310, -80.9890),
    ("29205", "Shandon",                34.0010, -80.9870),
    ("29206", "Forest Acres",           34.0270, -80.9550),
    ("29209", "Hopkins / Lower Richland",33.9380, -80.9680),
    ("29210", "Broad River / Irmo",     34.0480, -81.1200),
    ("29212", "Irmo / Dutch Fork",      34.0830, -81.1790),
    ("29223", "Northeast Columbia",     34.0990, -80.9170),
    ("29229", "Elgin / NE Richland",    34.1380, -80.8530),
    ("29036", "Chapin",                 34.1660, -81.3480),
    ("29045", "Elgin",                  34.1730, -80.7760),
    ("29063", "Irmo",                   34.0930, -81.1880),
    ("29072", "Lexington",              33.9770, -81.2350),
    ("29073", "Lexington / Pelion",     33.9010, -81.2500),
    ("29169", "West Columbia",          33.9930, -81.0730),
    ("29170", "West Columbia",          33.9700, -81.1070),
    ("29033", "Cayce",                  33.9580, -81.0520),
    ("29150", "Sumter",                 33.9370, -80.3920),
    ("29501", "Florence",               34.1850, -79.7630),
    ("29020", "Camden",                 34.2520, -80.6040),
    ("29016", "Blythewood",             34.2170, -80.9720),
    ("29078", "Lugoff",                 34.2270, -80.6810),
]

# Known referring NICUs in the Midlands
NICU_SITES = [
    ("Prisma Health Richland",         34.0095, -81.0185, 22, 30.4),
    ("Lexington Medical Center",       33.9530, -81.1890, 14, 31.2),
    ("Providence Health NE",           34.0820, -80.9240,  8, 29.8),
    ("Palmetto Health Baptist",        34.0010, -81.0290, 10, 30.9),
]

# PRAPARE SDoH domains
SDOH_DOMAINS = ["housing", "food", "transportation", "social_isolation", "stress"]


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres between two points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def generate_geo_data(enrollment_data: dict | None = None) -> dict[str, Any]:
    """Build the full ``geo`` payload for the dashboard.

    Parameters
    ----------
    enrollment_data : dict, optional
        The ``enrollment`` block from dashboard_data.json.  Used to align
        the timeline animation months.  Falls back to a 30-month window.
    """
    rng = np.random.default_rng(SEED)

    # ── Recruitment zones ────────────────────────────────────────────────
    recruitment_zones = []
    total_participants = 0
    zip_participants: dict[str, int] = {}

    for zipcode, label, lat, lng in SC_ZIPS:
        distance = _haversine_km(LAB_LAT, LAB_LNG, lat, lng)
        # Probability of enrollment inversely proportional to distance
        prob_factor = max(0.05, 1.0 / (1.0 + distance / 15.0))
        n_total = int(rng.poisson(prob_factor * 18))
        if n_total < 1:
            n_total = int(rng.integers(0, 3))

        # Split by group (ASIB ~25%, PT ~50%, TD ~25%)
        n_asib = int(round(n_total * (0.25 + rng.normal(0, 0.05))))
        n_td = int(round(n_total * (0.25 + rng.normal(0, 0.05))))
        n_asib = max(0, min(n_total, n_asib))
        n_td = max(0, min(n_total - n_asib, n_td))
        n_pt = n_total - n_asib - n_td

        suppressed = n_total < SUPPRESSION_THRESHOLD and n_total > 0
        total_participants += n_total
        zip_participants[zipcode] = n_total

        recruitment_zones.append({
            "zip": zipcode,
            "label": label,
            "centroid": [lng, lat],
            "n_total": n_total if not suppressed else None,
            "n_by_group": {
                "ASIB": n_asib, "PT": n_pt, "TD": n_td
            } if not suppressed else None,
            "distance_km": round(distance, 1),
            "suppressed": suppressed,
        })

    # Sort by total descending and assign density rank
    recruitment_zones.sort(key=lambda z: -(z["n_total"] or 0))
    for i, zone in enumerate(recruitment_zones):
        zone["density_rank"] = i + 1

    # ── SDoH heat data ───────────────────────────────────────────────────
    sdoh_heat = []
    for zone in recruitment_zones:
        if zone["suppressed"] or (zone["n_total"] or 0) < SUPPRESSION_THRESHOLD:
            continue
        distance = zone["distance_km"]
        # Further from lab → slightly higher social risk (correlation)
        base_risk = 0.25 + (distance / 200.0) + rng.normal(0, 0.08)
        base_risk = max(0.1, min(0.85, base_risk))

        domains = {}
        for domain in SDOH_DOMAINS:
            offset = {
                "housing": 0.0, "food": -0.05,
                "transportation": 0.08,  # transport risk correlates more with distance
                "social_isolation": 0.02, "stress": 0.04,
            }.get(domain, 0.0)
            score = max(0.0, min(1.0, base_risk + offset + rng.normal(0, 0.06)))
            domains[domain] = round(score, 2)

        n_respondents = max(SUPPRESSION_THRESHOLD, int((zone["n_total"] or 0) * 0.6))
        sdoh_heat.append({
            "zip": zone["zip"],
            "centroid": zone["centroid"],
            "composite_risk": round(base_risk, 2),
            "domains": domains,
            "n_respondents": n_respondents,
            "suppressed": False,
        })

    # ── Catchment data ───────────────────────────────────────────────────
    distance_rings_km = [10, 25, 50, 100]
    ring_counts = {r: 0 for r in distance_rings_km}
    for zone in recruitment_zones:
        n = zone["n_total"] or 0
        dist = zone["distance_km"]
        for ring in distance_rings_km:
            if dist <= ring:
                ring_counts[ring] += n
                break
        else:
            ring_counts[distance_rings_km[-1]] += n

    # Convert to non-cumulative per-ring
    ring_participants = []
    prev = 0
    for ring in distance_rings_km:
        count = ring_counts[ring] - prev if ring_counts[ring] > prev else ring_counts[ring]
        # Actually we need cumulative-to-ring minus previous rings
        pass

    # Simpler: count per distance band
    ring_participants = []
    for i, ring in enumerate(distance_rings_km):
        lower = distance_rings_km[i - 1] if i > 0 else 0
        n = sum(
            z["n_total"] or 0
            for z in recruitment_zones
            if lower < z["distance_km"] <= ring
        )
        pct = round(100 * n / max(1, total_participants), 1)
        completeness = round(max(55, 92 - (ring * 0.3) + rng.normal(0, 3)), 1)
        ring_participants.append({
            "ring_km": ring,
            "lower_km": lower,
            "n": n,
            "pct": pct,
            "mean_completeness": completeness,
        })

    nicu_sites = [
        {
            "name": name,
            "coords": [lng, lat],
            "n_referred": n_ref,
            "mean_ga_weeks": round(ga + rng.normal(0, 0.3), 1),
        }
        for name, lat, lng, n_ref, ga in NICU_SITES
    ]

    catchment = {
        "lab_location": [LAB_LNG, LAB_LAT],
        "distance_rings_km": distance_rings_km,
        "participants_by_ring": ring_participants,
        "nicu_sites": nicu_sites,
        "total_participants": total_participants,
    }

    # ── Partner network ──────────────────────────────────────────────────
    partner_network = [
        {"name": "About Play",            "coords": [-81.05, 33.99], "type": "community",  "href": "https://aboutplaysc.com"},
        {"name": "Team Therapy",           "coords": [-81.08, 34.02], "type": "clinical",   "href": "https://teamtherapysc.com"},
        {"name": "SC Autism Society",      "coords": [-81.03, 34.01], "type": "advocacy",   "href": "https://scautism.org"},
        {"name": "Prisma Health Children", "coords": [-81.02, 34.01], "type": "hospital",   "href": "https://prismahealth.org"},
        {"name": "Lexington Medical",      "coords": [-81.19, 33.95], "type": "hospital",   "href": "https://lexmed.com"},
        {"name": "MUSC",                   "coords": [-79.95, 32.78], "type": "academic",   "href": "https://musc.edu"},
        {"name": "Wil Lou Gray",           "coords": [-81.10, 33.97], "type": "education",  "href": ""},
        {"name": "First Steps SC",         "coords": [-81.04, 34.00], "type": "government", "href": "https://scfirststeps.org"},
        {"name": "BabyNet SC",             "coords": [-81.01, 33.99], "type": "government", "href": ""},
        {"name": "Palmetto Peds",          "coords": [-80.96, 34.03], "type": "clinical",   "href": ""},
    ]

    # ── Enrollment geo timeline ──────────────────────────────────────────
    months_available = enrollment_data.get("months", []) if enrollment_data else []
    if not months_available:
        today = datetime.now()
        start = today - timedelta(days=30 * 30)
        months_available = [
            (start + timedelta(days=30 * i)).strftime("%Y-%m") for i in range(30)
        ]

    enrollment_geo_timeline = []
    active_zips = [z for z in recruitment_zones if not z["suppressed"] and (z["n_total"] or 0) >= SUPPRESSION_THRESHOLD]

    for mi, month_label in enumerate(months_available):
        progress = (mi + 1) / len(months_available)
        new_enrollments = []
        for zone in active_zips:
            target = zone["n_total"] or 0
            cumulative = min(target, int(round(target * progress * (0.8 + 0.2 * rng.random()))))
            prev_cumulative = min(target, int(round(target * max(0, progress - 1 / len(months_available)) * (0.8 + 0.2 * rng.random()))))
            n_new = max(0, cumulative - prev_cumulative)
            if n_new > 0 or cumulative > 0:
                new_enrollments.append({
                    "zip": zone["zip"],
                    "n_new": n_new,
                    "cumulative": cumulative,
                })

        enrollment_geo_timeline.append({
            "month_index": mi,
            "month_label": month_label,
            "new_enrollments": new_enrollments,
        })

    # ── Assemble ─────────────────────────────────────────────────────────
    return {
        "meta": {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "suppression_threshold": SUPPRESSION_THRESHOLD,
            "coordinate_system": "EPSG:4326",
            "center": [LAB_LNG, LAB_LAT],
            "zoom_default": 10,
            "bounds": [[-81.45, 33.70], [-79.60, 34.35]],
        },
        "recruitment_zones": recruitment_zones,
        "sdoh_heat": sdoh_heat,
        "catchment": catchment,
        "partner_network": partner_network,
        "enrollment_geo_timeline": enrollment_geo_timeline,
    }
