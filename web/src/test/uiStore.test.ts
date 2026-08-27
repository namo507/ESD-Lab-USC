import { beforeEach, describe, expect, it } from "vitest";
import { useUi } from "@/store/ui";

describe("ui store assistant state", () => {
  beforeEach(() => {
    useUi.setState({
      brand: "default",
      chatOpen: false,
      chatSeed: null,
    });
    sessionStorage.clear();
  });

  it("toggles the chat drawer state", () => {
    expect(useUi.getState().chatOpen).toBe(false);

    useUi.getState().toggleChat();
    expect(useUi.getState().chatOpen).toBe(true);

    useUi.getState().toggleChat();
    expect(useUi.getState().chatOpen).toBe(false);
  });

  it("consumes a chat seed exactly once", () => {
    useUi.getState().setChatSeed("Explain RMSSD");

    expect(useUi.getState().consumeChatSeed()).toBe("Explain RMSSD");
    expect(useUi.getState().consumeChatSeed()).toBeNull();
  });

  it("tracks the selected dashboard brand skin", () => {
    expect(useUi.getState().brand).toBe("default");

    useUi.getState().setBrand("esd-2026");

    expect(useUi.getState().brand).toBe("esd-2026");
  });
});
