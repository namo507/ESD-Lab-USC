import { describe, expect, it } from "vitest";

import { GESTURE_COOLDOWN_MS, SpeechDriver, isClauseBoundary, tokenOpenness } from "@/components/buddy3d/speech";

describe("token shape drives the mouth", () => {
  it("closes the mouth on a sentence end", () => {
    expect(tokenOpenness("done.")).toBe(0);
    expect(tokenOpenness("really!")).toBe(0);
    expect(tokenOpenness("what?")).toBe(0);
  });

  it("partially closes on a clause break", () => {
    expect(tokenOpenness("however,")).toBeLessThan(0.25);
    expect(tokenOpenness("however,")).toBeGreaterThan(0);
  });

  it("opens wider for vowel-dense tokens than consonant-dense ones", () => {
    expect(tokenOpenness("aeiou")).toBeGreaterThan(tokenOpenness("strength"));
  });

  it("treats whitespace as no signal", () => {
    expect(tokenOpenness("   ")).toBe(0);
    expect(tokenOpenness("")).toBe(0);
  });

  it("recognises clause boundaries", () => {
    expect(isClauseBoundary("end.")).toBe(true);
    expect(isClauseBoundary("mid,")).toBe(true);
    expect(isClauseBoundary("word")).toBe(false);
  });
});

describe("SpeechDriver", () => {
  it("opens as tokens arrive and falls shut when they stop", () => {
    const driver = new SpeechDriver();
    let now = 0;
    driver.sample(now);
    driver.push("hello", now);
    for (let i = 0; i < 6; i += 1) {
      now += 30;
      driver.push("hello", now);
    }
    const speaking = driver.sample(now).openness;
    expect(speaking).toBeGreaterThan(0.1);

    // Nothing more arrives; the mouth must not hang open.
    for (let i = 0; i < 40; i += 1) {
      now += 30;
      driver.sample(now);
    }
    expect(driver.sample(now).openness).toBeLessThan(0.05);
  });

  it("fires at most one gesture per cooldown window", () => {
    const driver = new SpeechDriver();
    let gestures = 0;
    let now = 0;
    for (let i = 0; i < 10; i += 1) {
      driver.push("clause,", now);
      if (driver.sample(now).gesture) gestures += 1;
      now += 100;
    }
    expect(gestures).toBe(1);

    now += GESTURE_COOLDOWN_MS + 10;
    driver.push("clause,", now);
    expect(driver.sample(now).gesture).toBe(true);
  });

  it("holds the mouth shut for a beat after a sentence ends", () => {
    const driver = new SpeechDriver();
    let now = 1000;
    driver.push("word", now);
    driver.sample(now);
    driver.push("end.", now);
    now += 60;
    expect(driver.sample(now).openness).toBeLessThan(0.35);
  });

  it("resets to silence", () => {
    const driver = new SpeechDriver();
    driver.push("loud", 0);
    driver.sample(50);
    driver.reset();
    expect(driver.sample(100).openness).toBe(0);
  });
});
