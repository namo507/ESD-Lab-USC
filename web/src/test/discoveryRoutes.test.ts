import { describe, expect, it } from "vitest";
import { fromDiscoveryRoute, isDiscoveryPath, toDiscoveryRoute } from "@/lib/discoveryRoutes";

describe("Discovery route helpers", () => {
  it("detects Discovery paths", () => {
    expect(isDiscoveryPath("/discovery")).toBe(true);
    expect(isDiscoveryPath("/discovery/overview")).toBe(true);
    expect(isDiscoveryPath("/overview")).toBe(false);
  });

  it("prefixes internal app routes once", () => {
    expect(toDiscoveryRoute("/")).toBe("/discovery");
    expect(toDiscoveryRoute("/overview")).toBe("/discovery/overview");
    expect(toDiscoveryRoute("/participants?study=home")).toBe("/discovery/participants?study=home");
    expect(toDiscoveryRoute("/discovery/overview")).toBe("/discovery/overview");
  });

  it("restores default routes from Discovery routes", () => {
    expect(fromDiscoveryRoute("/discovery")).toBe("/");
    expect(fromDiscoveryRoute("/discovery/overview")).toBe("/overview");
    expect(fromDiscoveryRoute("/discovery/participants?study=home")).toBe("/participants?study=home");
  });
});
