import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchStatusMock, streamChatMock } = vi.hoisted(() => ({
  fetchStatusMock: vi.fn(),
  streamChatMock: vi.fn(),
}));

vi.mock("@/api/chatApi", () => ({
  fetchLiveAssistantStatus: fetchStatusMock,
  isAssistantUsable: (status: { status?: string } | null | undefined) => (
    status?.status === "ready" || status?.status === "degraded" || status?.status === "fallback"
  ),
  streamChat: streamChatMock,
}));

import { AgenticQAPanel } from "@/components/warm/AgenticQAPanel";

describe("AgenticQAPanel", () => {
  beforeEach(() => {
    fetchStatusMock.mockReset();
    streamChatMock.mockReset();
  });

  it("uses the shared assistant stream and keeps the browser redaction indicator", async () => {
    const ready = {
      status: "ready",
      error: null,
      model: "nvidia/nemotron-3-super-120b-a12b",
    };
    fetchStatusMock.mockResolvedValue(ready);
    streamChatMock.mockImplementation(() => (async function* () {
      yield "Grounded ";
      yield "answer";
    })());

    render(<AgenticQAPanel />);
    const input = screen.getByLabelText(/agentic qa prompt/i);
    fireEvent.change(input, { target: { value: "Review DOB 2026-04-25" } });
    fireEvent.click(screen.getByRole("button", { name: /run/i }));

    expect(await screen.findByText("1 redaction")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Grounded answer")).toBeInTheDocument());
    expect(fetchStatusMock).toHaveBeenCalledTimes(1);
    expect(streamChatMock).toHaveBeenCalledWith(
      "Review DOB 2026-04-25",
      [],
      expect.any(AbortSignal),
      ready,
    );
  });

  it("falls back to the de-identified insight backlog without exposing status errors", async () => {
    fetchStatusMock.mockResolvedValue({
      status: "provider-unreachable",
      error: "The assistant service is temporarily unreachable.",
      model: null,
    });

    render(<AgenticQAPanel />);
    fireEvent.change(screen.getByLabelText(/agentic qa prompt/i), {
      target: { value: "Summarize the latest QA flags" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run/i }));

    expect(await screen.findByText(/Live AI is temporarily limited/i)).toBeInTheDocument();
    expect(streamChatMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/provider-unreachable/i)).not.toBeInTheDocument();
  });
});
