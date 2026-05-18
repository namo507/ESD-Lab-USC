import { describe, expect, it } from "vitest";
import { buildReadingsGeoFromReadings, type ReadingGeoSource } from "@/data/readingsGeo";

describe("buildReadingsGeoFromReadings", () => {
  it("prefers a U.S. map when affiliation coverage spans multiple states", () => {
    const readings: ReadingGeoSource[] = [
      {
        id: "sc-ca",
        title: "Autonomic pathways",
        year: 2025,
        category: "Grant Materials",
        source: "Advances",
        keywords: ["autism", "infancy"],
        abstract: "University of South Carolina, Columbia, SC, USA with Stanford University, Stanford, CA, USA.",
        pageCount: 20,
        href: "/autonomic.pdf",
      },
      {
        id: "ny-il",
        title: "Emotion development",
        year: 2024,
        category: "Front Matter",
        source: "Advances",
        keywords: ["emotion"],
        abstract: "Cornell University, Ithaca, NY, USA with Northwestern University, Evanston, IL, USA.",
        pageCount: 18,
        href: "/emotion.pdf",
      },
      {
        id: "tx-va",
        title: "Home visiting",
        year: 2025,
        category: "Grant Materials",
        source: "Advances",
        keywords: ["home", "equity"],
        abstract: "The University of Texas at Austin, Austin, TX, USA with University of Virginia, Charlottesville, VA, USA.",
        pageCount: 14,
        href: "/home-visiting.pdf",
      },
    ];

    const geo = buildReadingsGeoFromReadings(readings);

    expect(geo.mode).toBe("us");
    expect(geo.activeStates.map((state) => state.code)).toEqual([
      "CA",
      "IL",
      "NY",
      "SC",
      "TX",
      "VA",
    ]);
    expect(geo.activeStates.find((state) => state.code === "SC")?.readings[0]?.id).toBe("sc-ca");
  });

  it("falls back to global mode when only country-level geography is present", () => {
    const readings: ReadingGeoSource[] = [
      {
        id: "paris",
        title: "Language acquisition",
        year: 2025,
        category: "Front Matter",
        source: "Advances",
        keywords: ["language"],
        abstract: "Integrative Neuroscience and Cognition Center, Paris, France.",
        pageCount: 12,
        href: "/language.pdf",
      },
      {
        id: "london",
        title: "Publisher note",
        year: 2025,
        category: "Front Matter",
        source: "Elsevier",
        keywords: ["publisher"],
        abstract: "Academic Press, 125 London Wall, London, United Kingdom.",
        pageCount: 2,
        href: "/publisher.pdf",
      },
    ];

    const geo = buildReadingsGeoFromReadings(readings);

    expect(geo.mode).toBe("global");
    expect(geo.activeStates).toHaveLength(0);
    expect(geo.activeCountries.map((country) => country.code)).toEqual(["France", "United Kingdom"]);
  });
});