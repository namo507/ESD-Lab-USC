import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeckPlan } from "@/api/schemas";

const { fetchAssistantStatusMock, createJobMock, getJobMock } = vi.hoisted(() => ({
  fetchAssistantStatusMock: vi.fn(),
  createJobMock: vi.fn(),
  getJobMock: vi.fn(),
}));

vi.mock("@/api/chatApi", () => ({ fetchAssistantStatus: fetchAssistantStatusMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/api/presentationApi", () => ({
  planPresentation: vi.fn(),
  createPresentationJob: createJobMock,
  getPresentationJob: getJobMock,
}));

import { PresentationMaker } from "@/routes/PresentationMaker";

function makePlan(): DeckPlan {
  return {
    title: "Understanding RMSSD",
    subtitle: "A simple, beginner-friendly explainer",
    audience_level: "beginner",
    summary: "RMSSD is a simple marker of vagal tone.",
    disclaimer: null,
    grounded: false,
    citations: [],
    concept: "rmssd",
    slides: [
      { id: "title-1", type: "title", title: "Understanding RMSSD", bullets: [], citations: [] },
      { id: "why-2", type: "why", title: "Why this matters", bullets: ["It reflects regulation"], citations: [] },
      { id: "concept-3", type: "concept", title: "The core idea", bullets: ["Beat-to-beat variability"], citations: [] },
      { id: "recap-4", type: "recap", title: "Recap", bullets: ["One marker"], citations: [] },
    ],
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PresentationMaker />
    </QueryClientProvider>,
  );
}

async function typeConceptAndGenerate(text: string) {
  const input = screen.getByLabelText(/what should this deck explain/i);
  fireEvent.change(input, { target: { value: text } });
  const generate = screen.getByRole("button", { name: /generate presentation/i });
  await waitFor(() => expect(generate).not.toBeDisabled());
  fireEvent.click(generate);
  return { input, generate };
}

describe("PresentationMaker async job flow", () => {
  beforeEach(() => {
    fetchAssistantStatusMock.mockReset();
    createJobMock.mockReset();
    getJobMock.mockReset();
    fetchAssistantStatusMock.mockResolvedValue({ status: "ready", error: null, model: "local/qwen" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("submits fast (one create call), shows generating, then polls to a ready preview", async () => {
    createJobMock.mockResolvedValue({ job_id: "job-1", status: "queued", poll_after_ms: 900 });
    // First poll still running, then succeeded with the deck plan.
    getJobMock
      .mockResolvedValueOnce({ job_id: "job-1", status: "running", progress_message: "Composing your deck…", poll_after_ms: 1400 })
      .mockResolvedValue({ job_id: "job-1", status: "succeeded", result: { plan: makePlan() } });

    renderPage();
    await typeConceptAndGenerate("What is RMSSD?");

    // Fast submit: exactly one create call, with the scrubbed concept + options.
    expect(createJobMock).toHaveBeenCalledTimes(1);
    expect(createJobMock.mock.calls[0]?.[0]).toMatchObject({
      concept: "What is RMSSD?",
      options: { audience_level: "beginner", slide_count: 6 },
    });

    // Generating state shows while polling.
    await waitFor(() => expect(screen.getAllByText(/composing your deck/i).length).toBeGreaterThan(0));

    // Polls to success -> deck preview + download appear.
    await waitFor(
      () => expect(screen.getByText(/deck preview/i)).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(screen.getByRole("button", { name: /download pptx/i })).toBeInTheDocument();
    expect(getJobMock).toHaveBeenCalled();
  });

  it("polls to a failure, keeps the form intact, and offers retry", async () => {
    createJobMock.mockResolvedValue({ job_id: "job-2", status: "queued", poll_after_ms: 900 });
    getJobMock.mockResolvedValue({
      job_id: "job-2",
      status: "failed",
      error: "The assistant could not produce a valid presentation plan.",
    });

    renderPage();
    const { input } = await typeConceptAndGenerate("Explain gradient descent to a beginner.");

    await waitFor(() => expect(screen.getByText(/generation didn.t complete/i)).toBeInTheDocument());
    expect(screen.getByText(/could not produce a valid presentation plan/i)).toBeInTheDocument();

    // Form state is preserved for retry.
    expect((input as HTMLTextAreaElement).value).toBe("Explain gradient descent to a beginner.");
    expect(screen.getByRole("button", { name: /retry/i })).not.toBeDisabled();
  });

  it("does not call the job API until the user generates", async () => {
    createJobMock.mockResolvedValue({ job_id: "x", status: "queued", poll_after_ms: 900 });
    getJobMock.mockResolvedValue({ job_id: "x", status: "succeeded", result: { plan: makePlan() } });

    renderPage();
    await waitFor(() => expect(fetchAssistantStatusMock).toHaveBeenCalled());

    // No generation triggered yet.
    expect(createJobMock).not.toHaveBeenCalled();
    expect(getJobMock).not.toHaveBeenCalled();
  });
});
