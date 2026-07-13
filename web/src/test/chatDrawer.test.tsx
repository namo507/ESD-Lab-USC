import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageText, parseMessageText } from "@/components/shell/ChatDrawer";

describe("ChatDrawer message text", () => {
  it("parses paragraphs and bullets without collapsing spacing", () => {
    expect(parseMessageText("Summary:\n\n- First item\n- Second item")).toEqual([
      { kind: "paragraph", text: "Summary:" },
      { kind: "bullets", items: ["First item", "Second item"] },
    ]);
  });

  it("renders bullet answers as semantic lists", () => {
    render(<MessageText text={"Assistant availability:\n\n- NVIDIA ready\n- Limited fallback"} />);

    expect(screen.getByText("Assistant availability:")).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("NVIDIA ready").closest("li")).not.toBeNull();
    expect(screen.getByText("Limited fallback").closest("li")).not.toBeNull();
  });
});
