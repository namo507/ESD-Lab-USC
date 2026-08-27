import { describe, expect, it } from "vitest";
import { fromDiscoveryRoute, isDiscoveryPath, toDiscoveryRoute } from "@/lib/discoveryRoutes";

describe("Discovery route helpers", () => {
  it("detects Discovery paths", () => {
    expect(isDiscoveryPath("/discovery")).toBe(true);
    expect(isDiscoveryPath("/discovery/participants")).toBe(true);
    expect(isDiscoveryPath("/participants")).toBe(false);
  });

  it("prefixes internal app routes once", () => {
    expect(toDiscoveryRoute("/")).toBe("/discovery");
    expect(toDiscoveryRoute("/results")).toBe("/discovery/results");
    expect(toDiscoveryRoute("/participants?study=home")).toBe("/discovery/participants?study=home");
    expect(toDiscoveryRoute("/discovery/results")).toBe("/discovery/results");
  });

  it("restores default routes from Discovery routes", () => {
    expect(fromDiscoveryRoute("/discovery")).toBe("/");
    expect(fromDiscoveryRoute("/discovery/results")).toBe("/results");
    expect(fromDiscoveryRoute("/discovery/participants?study=home")).toBe("/participants?study=home");
  });
});
