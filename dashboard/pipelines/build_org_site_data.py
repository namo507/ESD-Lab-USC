"""Build ESD Lab public-site metadata for the dashboard.

This module fetches a curated set of public ESD Lab pages and converts them
into a dashboard-friendly JSON payload. It is used by the dashboard build
pipeline so the organization section is sourced from the live public website
instead of hard-coded markup in the frontend.
"""
from __future__ import annotations

import argparse
import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup
from bs4 import Tag


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / "dashboard" / "data" / "organization_site_data.json"
BASE_URL = "https://www.esdlabsc.com"
PAGE_URLS = {
    "home": f"{BASE_URL}/",
    "about": f"{BASE_URL}/about",
    "studies": f"{BASE_URL}/our-studies",
    "team": f"{BASE_URL}/our-team",
    "partners": f"{BASE_URL}/our-partners",
    "resources": f"{BASE_URL}/resources",
    "publications": f"{BASE_URL}/publications-presentations",
    "news": f"{BASE_URL}/news",
    "stories": f"{BASE_URL}/participant-stories",
    "contact": f"{BASE_URL}/contact-us",
    "signup": f"{BASE_URL}/newborn-sign-up",
}
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; ESD-Lab-USC-Dashboard/1.0; +https://www.esdlabsc.com/)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
EMAIL_PATTERN = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
PHONE_PATTERN = re.compile(r"\(?\d{3}\)?\s*[-.]?\s*\d{3}\s*[-.]\s*\d{4}")
YEAR_PATTERN = re.compile(r"20\d{2}")
MONEY_PATTERN = re.compile(r"(?:up to\s*)?\$\d+(?:\s*per\s*study\s*visit)?", re.IGNORECASE)
HEADING_TAGS = {"h1", "h2", "h3", "h4"}
TEXT_TAGS = {"p", "li"}
NOISE_TEXT = {
    "skip to content",
    "subscribe",
    "we respect your privacy.",
    "additional links",
    "instagram",
    "facebook",
}
NOISE_LINK_LABELS = {
    "main website",
    "about & mission",
    "current studies",
    "our team",
    "publications",
    "resources",
    "contact & sign up",
    "sign up",
    "contact us",
    "read more",
}


logger = logging.getLogger("build_org_site_data")
if not logger.handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s :: %(message)s",
    )


@dataclass
class PageDocument:
    key: str
    url: str
    title: str
    blocks: list[dict[str, str | None]]

    @property
    def text(self) -> str:
        return " ".join(
            block["text"]
            for block in self.blocks
            if block.get("text")
        )


def normalize_text(value: str | None) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text.replace("\xa0", " ")


def is_internal_site_url(url: str | None) -> bool:
    if not url:
        return False
    parsed = urlparse(url)
    if not parsed.netloc:
        return True
    return parsed.netloc.endswith("esdlabsc.com")


def clean_href(href: str | None, base_url: str) -> str | None:
    if not href:
        return None
    absolute = urljoin(base_url, href)
    parsed = urlparse(absolute)
    if parsed.scheme not in {"http", "https"}:
        return None
    return absolute


def is_noise_text(text: str) -> bool:
    lowered = text.lower().strip()
    if not lowered:
        return True
    if lowered in NOISE_TEXT:
        return True
    return lowered.startswith("site design by") or lowered.startswith("open this area in google maps")


def dedupe_by(items: Iterable[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
      value = normalize_text(item.get(key))
      if not value or value in seen:
          continue
      seen.add(value)
      out.append(item)
    return out


def fetch_html(url: str, timeout: int = 12) -> str:
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def html_to_blocks(html: str, url: str) -> list[dict[str, str | None]]:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "template"]):
        tag.decompose()

    blocks: list[dict[str, str | None]] = []
    seen: set[tuple[str, str, str | None]] = set()
    for node in soup.find_all([*HEADING_TAGS, *TEXT_TAGS, "a"]):
        if not isinstance(node, Tag):
            continue
        text = normalize_text(node.get_text(" ", strip=True))
        if is_noise_text(text):
            continue
        href = clean_href(node.get("href"), url) if node.name == "a" else None
        if node.name == "a" and (not href or text.lower() in NOISE_LINK_LABELS):
            continue
        signature = (node.name, text, href)
        if signature in seen:
            continue
        seen.add(signature)
        blocks.append({"tag": node.name, "text": text, "href": href})
    return blocks


def fetch_page(key: str, url: str, timeout: int = 12) -> PageDocument:
    html = fetch_html(url, timeout=timeout)
    soup = BeautifulSoup(html, "html.parser")
    title = normalize_text(soup.title.get_text(" ", strip=True) if soup.title else key)
    return PageDocument(key=key, url=url, title=title, blocks=html_to_blocks(html, url))


def find_heading_index(blocks: list[dict[str, str | None]], needle: str) -> int | None:
    lowered = needle.lower()
    for index, block in enumerate(blocks):
        if block["tag"] in HEADING_TAGS and lowered in str(block["text"] or "").lower():
            return index
    return None


def collect_after_heading(
    blocks: list[dict[str, str | None]],
    heading: str,
    max_items: int = 3,
    stop_headings: Iterable[str] | None = None,
) -> list[str]:
    index = find_heading_index(blocks, heading)
    if index is None:
        return []
    stop_tokens = [token.lower() for token in (stop_headings or [])]
    items: list[str] = []
    for block in blocks[index + 1 :]:
        tag = block["tag"]
        text = normalize_text(block.get("text"))
        if tag in HEADING_TAGS:
            lowered = text.lower()
            if items:
                if not stop_tokens or any(token in lowered for token in stop_tokens):
                    break
                if tag in {"h1", "h2", "h3"}:
                    break
        if tag in TEXT_TAGS and text:
            items.append(text)
            if len(items) >= max_items:
                break
    return items


def first_link(pages: dict[str, PageDocument], page_key: str, predicate) -> str | None:
    for block in pages[page_key].blocks:
        if block["tag"] != "a" or not block.get("href"):
            continue
        if predicate(str(block.get("text") or ""), str(block.get("href") or "")):
            return str(block["href"])
    return None


def extract_phone(text: str) -> str | None:
    match = PHONE_PATTERN.search(text)
    if not match:
        return None
    digits = re.sub(r"\D", "", match.group(0))
    if len(digits) != 10:
        return normalize_text(match.group(0))
    return f"({digits[0:3]}) {digits[3:6]}-{digits[6:10]}"


def extract_emails(text: str) -> list[str]:
    emails = [email.lower() for email in EMAIL_PATTERN.findall(text)]
    deduped: list[str] = []
    seen: set[str] = set()
    for email in emails:
        if email in seen:
            continue
        seen.add(email)
        deduped.append(email)
    return deduped


def extract_address(text: str) -> str | None:
    match = re.search(
        r"1800\s+Gervais\s+Street\s*,?\s*Columbia\s*,?\s*(?:South\s+Carolina|SC)\s*29201",
        text,
        re.IGNORECASE,
    )
    if not match:
        return None
    address = normalize_text(match.group(0))
    return address.replace("South Carolina", "SC")


def extract_team_highlights(page: PageDocument, limit: int = 6) -> list[dict[str, str]]:
    highlights: list[dict[str, str]] = []
    for index, block in enumerate(page.blocks):
        if block["tag"] not in {"h2", "h3"}:
            continue
        name = normalize_text(block.get("text"))
        if not name or name.lower() in {"our team", "graduate students", "research coordinators", "lab alumni", "contact us"}:
            continue
        if not re.search(r"(phd|mph|dpt|ma|ba|bs)", name, re.IGNORECASE):
            continue
        details = collect_after_heading(page.blocks[index:], name, max_items=3)
        role = details[0] if details else "Team member"
        summary = details[1] if len(details) > 1 else details[0] if details else ""
        email_match = EMAIL_PATTERN.search(" ".join(details))
        highlights.append({
            "name": name,
            "role": role,
            "summary": summary,
            "email": email_match.group(0).lower() if email_match else "",
            "href": PAGE_URLS["team"],
        })
        if len(highlights) >= limit:
            break
    return highlights


def extract_studies(page: PageDocument) -> list[dict[str, Any]]:
    text = page.text
    definitions = [
        {
            "slug": "nano-study",
            "heading": "NANO Study",
            "href": PAGE_URLS["signup"],
            "cta_label": "Sign up for NANO",
            "audience": "Infants followed through 3 years",
        },
        {
            "slug": "nicu-exit-study",
            "heading": "NICU Exit Study",
            "href": PAGE_URLS["studies"],
            "cta_label": "Learn about NICU Exit",
            "audience": "Preterm infants after NICU discharge",
        },
    ]
    studies: list[dict[str, Any]] = []
    for definition in definitions:
        snippets = collect_after_heading(page.blocks, definition["heading"], max_items=5, stop_headings=["previous studies", "interested in participating", "contact us"])
        summary = " ".join(snippets[:2]).strip()
        full_text = " ".join(snippets)
        compensation = MONEY_PATTERN.search(full_text)
        bullets = re.findall(r"\d\)\s*([^\n]+)", full_text)
        tags = [normalize_text(item) for item in bullets[:3]]
        studies.append(
            {
                "slug": definition["slug"],
                "title": definition["heading"],
                "summary": summary,
                "details": snippets,
                "href": definition["href"],
                "cta_label": definition["cta_label"],
                "audience": definition["audience"],
                "compensation": compensation.group(0) if compensation else "",
                "eligibility": tags,
                "source_page": PAGE_URLS["studies"],
            }
        )
    return studies


def extract_family_pathway(page: PageDocument) -> list[dict[str, str]]:
    steps = [
        ("Sign Up", PAGE_URLS["signup"], "Interest form"),
        ("Complete Visits", PAGE_URLS["studies"], "Study visits"),
        ("Get Feedback", PAGE_URLS["resources"], "Resources and support"),
    ]
    items: list[dict[str, str]] = []
    for title, href, link_label in steps:
        snippets = collect_after_heading(page.blocks, title, max_items=2)
        items.append(
            {
                "title": title,
                "description": " ".join(snippets) if snippets else "",
                "href": href,
                "link_label": link_label,
            }
        )
    return items


def extract_resource_items(page: PageDocument, limit: int = 18) -> list[dict[str, str]]:
    category = "General"
    categories = [
        "Autism Resources",
        "Early Intervention",
        "Special Education",
        "Family Support",
        "Learn More!",
    ]
    items: list[dict[str, str]] = []
    for block in page.blocks:
        text = normalize_text(block.get("text"))
        if block["tag"] in HEADING_TAGS and text in categories:
            category = text.rstrip("!")
            continue
        if block["tag"] != "a" or not block.get("href"):
            continue
        href = str(block["href"])
        if is_internal_site_url(href):
            continue
        items.append(
            {
                "title": text,
                "href": href,
                "category": category,
                "source_page": page.url,
            }
        )
        if len(items) >= limit:
            break
    return dedupe_by(items, "href")


def extract_partner_items(page: PageDocument, limit: int = 18) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for block in page.blocks:
        if block["tag"] != "a" or not block.get("href"):
            continue
        title = normalize_text(block.get("text"))
        href = str(block["href"])
        if is_internal_site_url(href):
            continue
        if title.lower() in {"instagram", "facebook"}:
            continue
        items.append(
            {
                "name": title,
                "href": href,
                "source_page": page.url,
            }
        )
        if len(items) >= limit:
            break
    return dedupe_by(items, "href")


def extract_news_items(page: PageDocument, limit: int = 12) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    blocks = page.blocks
    for index, block in enumerate(blocks):
        if block["tag"] != "a" or not block.get("href"):
            continue
        href = str(block["href"])
        title = normalize_text(block.get("text"))
        if is_internal_site_url(href) or len(title) < 18:
            continue
        if title.lower() in NOISE_LINK_LABELS:
            continue
        tail = []
        for next_block in blocks[index + 1 : index + 5]:
            if next_block["tag"] in HEADING_TAGS or next_block["tag"] == "a":
                break
            text = normalize_text(next_block.get("text"))
            if text:
                tail.append(text)
        detail = " · ".join(tail)
        year_match = YEAR_PATTERN.search(f"{title} {detail} {href}")
        items.append(
            {
                "kind": "news",
                "title": title,
                "summary": detail,
                "source": detail.split("|")[0].strip() if detail else "News mention",
                "href": href,
                "year": int(year_match.group(0)) if year_match else None,
                "tags": ["Press", "Outreach"],
            }
        )
        if len(items) >= limit:
            break
    return dedupe_by(items, "href")


def extract_publication_items(page: PageDocument, limit: int = 12) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for index, block in enumerate(page.blocks):
        if block["tag"] not in HEADING_TAGS:
            continue
        title = normalize_text(block.get("text"))
        if title.lower() in {"publications & poster presentations", "conference presentations & awards"}:
            continue
        if not (YEAR_PATTERN.search(title) and ("poster" in title.lower() or "research talk" in title.lower() or "publication" in title.lower())):
            continue
        tail = []
        for next_block in page.blocks[index + 1 : index + 4]:
            if next_block["tag"] in HEADING_TAGS:
                break
            text = normalize_text(next_block.get("text"))
            if text:
                tail.append(text)
        year_match = YEAR_PATTERN.search(title)
        items.append(
            {
                "kind": "publication",
                "title": title,
                "summary": " ".join(tail),
                "source": "ESD Lab publications",
                "href": page.url,
                "year": int(year_match.group(0)) if year_match else None,
                "tags": ["Publication", "Presentation"],
            }
        )
        if len(items) >= limit:
            break
    return items


def extract_story_links(page: PageDocument, limit: int = 8) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for block in page.blocks:
        if block["tag"] != "a" or not block.get("href"):
            continue
        href = str(block["href"])
        title = normalize_text(block.get("text"))
        if "/participant-stories/" not in href or href.rstrip("/") == PAGE_URLS["stories"].rstrip("/"):
            continue
        if len(title) < 8 or title.lower() in {"read more", "participant stories"}:
            continue
        items.append({"title": title, "href": href})
        if len(items) >= limit:
            break
    return dedupe_by(items, "href")


def enrich_story_summaries(links: list[dict[str, str]], timeout: int = 12) -> list[dict[str, Any]]:
    stories: list[dict[str, Any]] = []
    for item in links[:6]:
        summary = ""
        year = None
        try:
            page = fetch_page("story", item["href"], timeout=timeout)
            paragraphs = collect_after_heading(page.blocks, item["title"], max_items=2)
            summary = " ".join(paragraphs)
            year_match = YEAR_PATTERN.search(page.text)
            year = int(year_match.group(0)) if year_match else None
        except Exception as exc:  # pragma: no cover - defensive fallback path
            logger.warning("Story fetch failed for %s: %s", item["href"], exc)
        stories.append(
            {
                "kind": "story",
                "title": item["title"],
                "summary": summary,
                "source": "Participant story",
                "href": item["href"],
                "year": year,
                "tags": ["Family experience", "Participant story"],
            }
        )
    return stories


def fallback_payload() -> dict[str, Any]:
    return {
        "meta": {
            "generated_at": None,
            "source_mode": "fallback",
            "source_url": BASE_URL,
            "pages_crawled": 0,
            "errors": [],
        },
        "summary": {
            "current_public_studies": 2,
            "featured_stories": 3,
            "partner_count": 16,
            "publication_items": 2,
            "news_mentions": 4,
            "impact_item_count": 9,
            "available_years": [2026, 2025, 2024, 2022, 2021, 2020],
            "phone": "(803) 993-8356",
            "emails": ["esdlab@sc.edu", "esdlab.espanol@sc.edu"],
            "address": "1800 Gervais Street, Columbia, SC 29201",
            "signup_url": PAGE_URLS["signup"],
            "contact_url": PAGE_URLS["contact"],
            "main_site_url": PAGE_URLS["home"],
        },
        "mission": {
            "headline": "Early identification and intervention of autism spectrum disorder in infancy.",
            "summary": "The public site frames the ESD Lab as a USC clinical infant research program translating developmental science into earlier support for children and families.",
            "mission_text": "Our mission is to make scientific discoveries about infant development and autism spectrum disorder to improve the lives of neurodiverse children and their families.",
            "details": [
                "Led by Dr. Jessica Bradshaw at the University of South Carolina.",
                "Affiliated with the Carolina Autism and Neurodevelopment Research Center.",
                "Combines research, community partnership, and family-facing support.",
            ],
        },
        "studies": [
            {
                "slug": "nano-study",
                "title": "NANO Study",
                "summary": "Three-year newborn follow-up with developmental feedback for families and up to $250 compensation.",
                "details": [
                    "Follows newborns through the first 3 years of life.",
                    "Tracks social, motor, and language skills over time.",
                ],
                "href": PAGE_URLS["signup"],
                "cta_label": "Sign up for NANO",
                "audience": "Infants followed through 3 years",
                "compensation": "up to $250",
                "eligibility": [
                    "Preterm infants under 1 month",
                    "Infants under 3 months with an older autistic sibling",
                    "Infants under 1 month with a typically developing older sibling",
                ],
                "source_page": PAGE_URLS["studies"],
            },
            {
                "slug": "nicu-exit-study",
                "title": "NICU Exit Study",
                "summary": "Preterm infant follow-up after NICU discharge with 3-4 visits in the first year and local resource connections.",
                "details": [
                    "Conducted with the UofSC College of Nursing.",
                    "Provides feedback, local resources, and per-visit compensation.",
                ],
                "href": PAGE_URLS["studies"],
                "cta_label": "Learn about NICU Exit",
                "audience": "Preterm infants after NICU discharge",
                "compensation": "$40 per study visit",
                "eligibility": [
                    "Preterm infants discharged from Prisma-Richland NICU",
                    "3-4 visits during the first year",
                ],
                "source_page": PAGE_URLS["studies"],
            },
        ],
        "family_pathway": [
            {
                "title": "Sign Up",
                "description": "Families or providers submit the interest form to connect with the lab.",
                "href": PAGE_URLS["signup"],
                "link_label": "Interest form",
            },
            {
                "title": "Complete Visits",
                "description": "The lab facilitates visits across the first 2-3 years depending on study pathway.",
                "href": PAGE_URLS["studies"],
                "link_label": "Study visits",
            },
            {
                "title": "Get Feedback",
                "description": "Families receive feedback, referrals, and support resources during participation.",
                "href": PAGE_URLS["resources"],
                "link_label": "Resources and support",
            },
        ],
        "team_highlights": [
            {
                "name": "Jessica Bradshaw, PhD",
                "role": "Lab Director",
                "summary": "Associate Professor of Psychology focused on early identification and intervention of autism spectrum disorder.",
                "email": "jbradshaw@sc.edu",
                "href": PAGE_URLS["team"],
            },
            {
                "name": "Ellen E. Spiller, MPH, DPT",
                "role": "Research Scientist",
                "summary": "Supports NIH- and foundation-funded studies focused on infant behavior and physiological development.",
                "email": "espiller@sc.edu",
                "href": PAGE_URLS["team"],
            },
        ],
        "resources": [
            {"title": "Autism Spectrum Disorder - National Institute of Mental Health (NIMH)", "href": "https://www.nimh.nih.gov/health/topics/autism-spectrum-disorders-asd", "category": "Autism Resources", "source_page": PAGE_URLS["resources"]},
            {"title": "American Academy of Pediatrics | Patient Care - Autism", "href": "https://www.aap.org/en/patient-care/autism/", "category": "Autism Resources", "source_page": PAGE_URLS["resources"]},
            {"title": "Parents as Teachers | SC First Steps", "href": "https://www.scfirststeps.org/what-we-do/programs/parents-as-teachers/", "category": "Family Support", "source_page": PAGE_URLS["resources"]},
        ],
        "partners": [
            {"name": "About Play", "href": "https://aboutplaysc.com/", "source_page": PAGE_URLS["partners"]},
            {"name": "Team Therapy", "href": "https://teamtherapysc.com/", "source_page": PAGE_URLS["partners"]},
            {"name": "Project Hope Foundation", "href": "https://www.projecthopesc.org/", "source_page": PAGE_URLS["partners"]},
        ],
        "contact": {
            "phone": "(803) 993-8356",
            "emails": ["esdlab@sc.edu", "esdlab.espanol@sc.edu"],
            "address": "1800 Gervais Street, Columbia, SC 29201",
            "signup_url": PAGE_URLS["signup"],
            "contact_url": PAGE_URLS["contact"],
            "parking_url": f"{BASE_URL}/s/imb_directions_and_map.pdf",
            "undergraduate_application_url": "https://forms.gle/TMyAsqF3kGh217jg9",
            "instagram_url": "https://www.instagram.com/uofsc_esdlab/",
            "spanish_email": "esdlab.espanol@sc.edu",
        },
        "publications": [
            {"kind": "publication", "title": "Poster Presentation | SCAND 2026", "summary": "Summary Scores of the NICU Network Neurobehavioral Scale as predictors of ASD-specific behaviors at 12 months.", "source": "ESD Lab publications", "href": PAGE_URLS["publications"], "year": 2026, "tags": ["Publication", "Presentation"]},
            {"kind": "publication", "title": "Research Talk | ISDP 2025", "summary": "Infant RSA predicts emerging social communication in children later diagnosed with autism spectrum disorder.", "source": "ESD Lab publications", "href": PAGE_URLS["publications"], "year": 2025, "tags": ["Publication", "Presentation"]},
        ],
        "news": [
            {"kind": "news", "title": "AutismConnect Serves More Than 1,000 People in its Third Year", "summary": "McCausland College of Arts and Sciences USC | April 2026", "source": "McCausland College of Arts and Sciences USC", "href": "https://www.sc.edu/study/colleges_schools/artsandsciences/about/news/2026/autismconnect-usc-autism-conference-south-carolina.php", "year": 2026, "tags": ["Press", "Outreach"]},
            {"kind": "news", "title": "Early Detection Helped Hayden. Why 2 USC Researchers are Studying Links Between Premature Birth, Autism", "summary": "South Carolina Public Radio interview | September 2025", "source": "South Carolina Public Radio", "href": "https://www.southcarolinapublicradio.org/sc-news/2025-09-05/early-detection-helped-hayden-why-2-usc-researchers-are-studying-links-between-premature-birth-autism", "year": 2025, "tags": ["Press", "Outreach"]},
            {"kind": "news", "title": "A New Study Shows The Importance Of Early Diagnosis Of Autism Spectrum Disorder", "summary": "Forbes | December 2021", "source": "Forbes", "href": "https://www.forbes.com/sites/jenniferpalumbo/2021/12/31/how-a-new-study-shows-the-importance-of-early-diagnosis-of-autistic-infants/", "year": 2021, "tags": ["Press", "Outreach"]},
        ],
        "stories": [
            {"kind": "story", "title": "Wrenley's Story", "summary": "Participant story highlighting the ESD Lab's family-facing impact and ongoing support.", "source": "Participant story", "href": f"{BASE_URL}/participant-stories/wrenleys-story", "year": 2022, "tags": ["Family experience", "Participant story"]},
            {"kind": "story", "title": "Brandon and Bryanna", "summary": "The ESD Lab provided a free comprehensive autism evaluation within two weeks of referral.", "source": "Participant story", "href": f"{BASE_URL}/participant-stories/brandon-and-bryanna-embracing-the-diagnosis", "year": 2022, "tags": ["Family experience", "Participant story"]},
            {"kind": "story", "title": "Charlie's Story", "summary": "Monitoring and feedback helped the family understand speech delays and advocate for the right services.", "source": "Participant story", "href": f"{BASE_URL}/participant-stories/charlies-story-the-role-of-early-intervention", "year": 2022, "tags": ["Family experience", "Participant story"]},
        ],
        "impact_feed": [],
        "impact_summary": {},
    }


def build_payload_from_pages(pages: dict[str, PageDocument], timeout: int = 12) -> dict[str, Any]:
    about_page = pages["about"]
    home_page = pages["home"]
    studies_page = pages["studies"]
    team_page = pages["team"]
    partners_page = pages["partners"]
    resources_page = pages["resources"]
    publications_page = pages["publications"]
    news_page = pages["news"]
    stories_page = pages["stories"]
    contact_page = pages["contact"]

    mission_details = collect_after_heading(about_page.blocks, "Our Mission", max_items=3)
    mission_summary = collect_after_heading(about_page.blocks, "About the Lab", max_items=2)
    studies = extract_studies(studies_page)
    stories = enrich_story_summaries(extract_story_links(stories_page), timeout=timeout)
    news = extract_news_items(news_page)
    publications = extract_publication_items(publications_page)
    resources = extract_resource_items(resources_page)
    partners = extract_partner_items(partners_page)
    pathway = extract_family_pathway(home_page)
    team_highlights = extract_team_highlights(team_page)

    contact_text = f"{contact_page.text} {home_page.text}"
    phone = extract_phone(contact_text) or ""
    emails = extract_emails(contact_text)
    address = extract_address(contact_text) or ""
    contact = {
        "phone": phone,
        "emails": emails,
        "address": address,
        "signup_url": PAGE_URLS["signup"],
        "contact_url": PAGE_URLS["contact"],
        "parking_url": first_link(pages, "contact", lambda text, href: "parking" in text.lower() or href.endswith(".pdf")) or f"{BASE_URL}/s/imb_directions_and_map.pdf",
        "undergraduate_application_url": first_link(pages, "contact", lambda text, _href: "apply" in text.lower()) or "https://forms.gle/TMyAsqF3kGh217jg9",
        "instagram_url": first_link(pages, "contact", lambda text, href: "instagram" in text.lower() or "instagram.com" in href) or "https://www.instagram.com/uofsc_esdlab/",
        "spanish_email": next((email for email in emails if "espanol" in email), ""),
    }

    impact_feed = sorted(
        publications + news + stories,
        key=lambda item: (item.get("year") or 0, item.get("kind") == "story", item.get("title") or ""),
        reverse=True,
    )
    years = sorted({item["year"] for item in impact_feed if item.get("year")}, reverse=True)
    payload = {
        "meta": {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "source_mode": "live_fetch",
            "source_url": BASE_URL,
            "pages_crawled": len(pages),
            "errors": [],
        },
        "summary": {
            "current_public_studies": len(studies),
            "featured_stories": len(stories),
            "partner_count": len(partners),
            "publication_items": len(publications),
            "news_mentions": len(news),
            "impact_item_count": len(impact_feed),
            "available_years": years,
            "phone": phone,
            "emails": emails,
            "address": address,
            "signup_url": PAGE_URLS["signup"],
            "contact_url": PAGE_URLS["contact"],
            "main_site_url": PAGE_URLS["home"],
        },
        "mission": {
            "headline": mission_summary[0] if mission_summary else "Early social development and autism research translated for families.",
            "summary": " ".join(mission_summary[:2]),
            "mission_text": " ".join(mission_details[:2]),
            "details": mission_details,
        },
        "studies": studies,
        "family_pathway": pathway,
        "team_highlights": team_highlights,
        "resources": resources,
        "partners": partners,
        "contact": contact,
        "publications": publications,
        "news": news,
        "stories": stories,
        "impact_feed": impact_feed,
        "impact_summary": {
            "types": [
                {"label": "Publications", "value": "publication", "count": len(publications)},
                {"label": "News", "value": "news", "count": len(news)},
                {"label": "Stories", "value": "story", "count": len(stories)},
            ],
            "years": years,
        },
    }
    return payload


def build_payload(allow_network: bool = True, timeout: int = 12) -> dict[str, Any]:
    errors: list[str] = []
    pages: dict[str, PageDocument] = {}
    if allow_network:
        for key, url in PAGE_URLS.items():
            try:
                pages[key] = fetch_page(key, url, timeout=timeout)
            except Exception as exc:  # pragma: no cover - defensive network path
                logger.warning("Unable to fetch %s (%s): %s", key, url, exc)
                errors.append(f"{key}: {exc}")

    required_pages = {"home", "about", "studies", "stories", "news", "contact"}
    if required_pages.issubset(pages):
        payload = build_payload_from_pages(pages, timeout=timeout)
        payload["meta"]["errors"] = errors
        return payload

    payload = fallback_payload()
    payload["meta"]["generated_at"] = datetime.now().isoformat(timespec="seconds")
    payload["meta"]["errors"] = errors
    payload["impact_feed"] = sorted(
        payload["publications"] + payload["news"] + payload["stories"],
        key=lambda item: (item.get("year") or 0, item.get("kind") == "story", item.get("title") or ""),
        reverse=True,
    )
    payload["impact_summary"] = {
        "types": [
            {"label": "Publications", "value": "publication", "count": len(payload["publications"])},
            {"label": "News", "value": "news", "count": len(payload["news"])},
            {"label": "Stories", "value": "story", "count": len(payload["stories"])},
        ],
        "years": payload["summary"]["available_years"],
    }
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build ESD Lab public-site metadata for the dashboard.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    parser.add_argument("--timeout", type=int, default=12)
    parser.add_argument("--no-network", action="store_true")
    args = parser.parse_args(argv)

    payload = build_payload(allow_network=not args.no_network, timeout=args.timeout)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    logger.info("Wrote ESD Lab site payload → %s", args.output)
    logger.info("source_mode=%s impact_items=%d", payload["meta"]["source_mode"], len(payload.get("impact_feed", [])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())