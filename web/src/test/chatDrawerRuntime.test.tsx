import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchLiveAssistantStatusMock, streamChatMock } = vi.hoisted(() => ({
  fetchLiveAssistantStatusMock: vi.fn(),
  streamChatMock: vi.fn(),
}));

vi.mock("@/api/chatApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/chatApi")>()),
  fetchLiveAssistantStatus: fetchLiveAssistantStatusMock,
  streamChat: streamChatMock,
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
    fetchLiveAssistantStatusMock.mockReset();
    fetchLiveAssistantStatusMock.mockResolvedValue(READY_STATUS);
    streamChatMock.mockReset();
    useUi.setState({ chatOpen: true, chatSeed: null });
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
