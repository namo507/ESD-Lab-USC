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
    render(<MessageText text={"Local assistant model policy:\n\n- Configured model\n- Smaller fallback"} />);

    expect(screen.getByText("Local assistant model policy:")).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("Configured model").closest("li")).not.toBeNull();
    expect(screen.getByText("Smaller fallback").closest("li")).not.toBeNull();
  });
});
