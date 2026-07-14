import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { askNanoBuddyMock, fetchLiveAssistantStatusMock, fetchNanoBuddyStatusMock, streamChatMock } = vi.hoisted(() => ({
  askNanoBuddyMock: vi.fn(),
  fetchLiveAssistantStatusMock: vi.fn(),
  fetchNanoBuddyStatusMock: vi.fn(),
  streamChatMock: vi.fn(),
}));

vi.mock("@/api/chatApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/chatApi")>()),
  fetchLiveAssistantStatus: fetchLiveAssistantStatusMock,
  streamChat: streamChatMock,
}));

vi.mock("@/api/nanoBuddyApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/nanoBuddyApi")>()),
  askNanoBuddy: askNanoBuddyMock,
  fetchNanoBuddyStatus: fetchNanoBuddyStatusMock,
}));

import { ChatDrawer } from "@/components/shell/ChatDrawer";
import { useUi } from "@/store/ui";

const READY_STATUS = {
  status: "ready" as const,
  error: null,
  model: "nvidia/test-model",
};

describe("ChatDrawer response controls", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    askNanoBuddyMock.mockReset();
    fetchNanoBuddyStatusMock.mockReset();
    fetchNanoBuddyStatusMock.mockResolvedValue(READY_STATUS);
    fetchLiveAssistantStatusMock.mockReset();
    fetchLiveAssistantStatusMock.mockResolvedValue(READY_STATUS);
    streamChatMock.mockReset();
    useUi.setState({ chatOpen: true, chatSeed: null });
  });

  it("uses the strict NANO Buddy endpoint path and labels metric and document provenance", async () => {
    window.history.replaceState({}, "", "/nano/dashboard");
    askNanoBuddyMock.mockResolvedValue({
      answer: "1,265 sessions have passed aggregate QA.",
      citations: [{ title: "ECG Processing SOP", path: "docs/ecg_processing_protocol.md", loc: "document" }],
      usedMetrics: ["nano.pipeline_summary.qa_passed_sessions"],
      refused: false,
    });

    render(<ChatDrawer />);

    fireEvent.change(screen.getByRole("textbox", { name: "Message ESD Buddy" }), {
      target: { value: "Show participant data" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText(/1,265 sessions have passed aggregate QA/i)).toBeInTheDocument();
    expect(screen.getByText("Live aggregate metrics")).toBeInTheDocument();
    expect(screen.getByText("Document sources")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ECG Processing SOP" })).toHaveAttribute(
      "href",
      "https://github.com/namo507/ESD-Lab-USC/blob/main/docs/ecg_processing_protocol.md",
    );
    expect(askNanoBuddyMock).toHaveBeenCalledWith("Show participant data", expect.any(AbortSignal));
    expect(streamChatMock).not.toHaveBeenCalled();
    expect(await screen.findByText("Aggregate Buddy ready")).toBeInTheDocument();
  });

  it("shows the NANO privacy refusal returned by Buddy", async () => {
    window.history.replaceState({}, "", "/nano/dashboard");
    askNanoBuddyMock.mockResolvedValue({
      answer: "I cannot provide participant-level data. Use approved secure systems.",
      citations: [],
      usedMetrics: [],
      refused: true,
    });

    render(<ChatDrawer />);
    const sensitiveQuestion = "Call 803-555-1212 about NANO-1043 on 2026-07-14";
    fireEvent.change(screen.getByRole("textbox", { name: "Message ESD Buddy" }), {
      target: { value: sensitiveQuestion },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText(/cannot provide participant-level data/i)).toBeInTheDocument();
    expect(screen.getByText("Protected request refused")).toBeInTheDocument();
    expect(screen.queryByText(sensitiveQuestion)).not.toBeInTheDocument();
    expect(JSON.stringify(askNanoBuddyMock.mock.calls)).not.toContain("NANO-1043");
    expect(JSON.stringify(askNanoBuddyMock.mock.calls)).not.toContain("803-555-1212");
    expect(askNanoBuddyMock).toHaveBeenCalledWith(
      expect.stringContaining("{{REDACTED:PHI}}"),
      expect.any(AbortSignal),
    );
  });

  it("stops an in-flight response without leaving a permanent streaming bubble", async () => {
    streamChatMock.mockImplementation(async function* (
      _message: string,
      _history: unknown[],
      signal?: AbortSignal,
    ) {
      yield "A grounded partial answer";
      await new Promise<void>((_resolve, reject) => {
        const stop = () => reject(new DOMException("Aborted", "AbortError"));
        if (signal?.aborted) stop();
        else signal?.addEventListener("abort", stop, { once: true });
      });
    });

    render(<ChatDrawer />);

    fireEvent.change(screen.getByRole("textbox", { name: "Message ESD Buddy" }), {
      target: { value: "Explain the HDA gauge" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("A grounded partial answer")).toBeInTheDocument();
    expect(askNanoBuddyMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Stop response" }));

    expect(await screen.findByText("Response stopped.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.queryByLabelText("Assistant is responding")).not.toBeInTheDocument();
  });

  it("stops while the assistant readiness check is still pending", async () => {
    fetchLiveAssistantStatusMock.mockImplementation((signal?: AbortSignal) => {
      if (!signal) return new Promise(() => undefined);
      return new Promise((_resolve, reject) => {
        const stop = () => reject(new DOMException("Aborted", "AbortError"));
        if (signal.aborted) stop();
        else signal.addEventListener("abort", stop, { once: true });
      });
    });

    render(<ChatDrawer />);

    fireEvent.change(screen.getByRole("textbox", { name: "Message ESD Buddy" }), {
      target: { value: "Summarize the latest study status" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop response" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Stop response" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Message ESD Buddy" })).toHaveValue(
      "Summarize the latest study status",
    );
    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it("retries a failed answer in place with clean conversation history", async () => {
    streamChatMock
      .mockImplementationOnce(() => ({
        [Symbol.asyncIterator]() {
          return this;
        },
        async next() {
          throw new Error("The assistant service is temporarily unreachable.");
        },
      }))
      .mockImplementationOnce(async function* () {
        yield "Recovered grounded answer";
      });

    render(<ChatDrawer />);

    fireEvent.change(screen.getByRole("textbox", { name: "Message ESD Buddy" }), {
      target: { value: "Summarize REDCap health" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("The assistant service is temporarily unreachable.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Recovered grounded answer")).toBeInTheDocument();
    expect(screen.queryByText("The assistant service is temporarily unreachable.")).not.toBeInTheDocument();
    expect(screen.getAllByText("Summarize REDCap health")).toHaveLength(1);
    expect(streamChatMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled());
    expect(streamChatMock.mock.calls[1]?.[1]).toEqual([
      expect.objectContaining({ role: "assistant", content: expect.stringContaining("I'm ESD Buddy") }),
    ]);
  });
});
