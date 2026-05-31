import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchAssistantStatusMock } = vi.hoisted(() => ({
  fetchAssistantStatusMock: vi.fn(),
}));

vi.mock("@/api/chatApi", () => ({
  fetchAssistantStatus: fetchAssistantStatusMock,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async () => undefined),
}));

import { PresentationMaker } from "@/routes/PresentationMaker";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PresentationMaker />
    </QueryClientProvider>,
  );
}

describe("PresentationMaker", () => {
  beforeEach(() => {
    fetchAssistantStatusMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the feature and accepts a concept input when the assistant is ready", async () => {
    fetchAssistantStatusMock.mockResolvedValue({ status: "ready", error: null, model: "local/qwen2.5" });

    renderPage();

    expect(screen.getByRole("heading", { name: /explain a concept/i })).toBeInTheDocument();

    const input = screen.getByLabelText(/what should this deck explain/i) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "What is RMSSD?" } });
    expect(input.value).toBe("What is RMSSD?");

    // Once the assistant reports ready, generation is enabled.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /generate presentation/i })).not.toBeDisabled();
    });
  });

  it("disables generation and surfaces a message when the assistant is unavailable", async () => {
    fetchAssistantStatusMock.mockResolvedValue({
      status: "unloaded",
      error: "The local GGUF model file is not present yet.",
      model: null,
    });

    renderPage();

    const input = screen.getByLabelText(/what should this deck explain/i);
    fireEvent.change(input, { target: { value: "Explain heart-rate defined attention" } });

    const generate = screen.getByRole("button", { name: /generate presentation/i });

    await waitFor(() => {
      expect(screen.getByText(/assistant model unavailable/i)).toBeInTheDocument();
    });
    // Even with a concept typed, generation stays disabled while unavailable.
    expect(generate).toBeDisabled();
    expect(screen.getByText(/generation is paused/i)).toBeInTheDocument();
  });
});
