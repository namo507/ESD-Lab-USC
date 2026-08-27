import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression test for a stale-closure bug in the QA keyboard shortcuts.
 *
 * `qaSelectedEpoch` lives in the global UI store, not component state, so it
 * does not reset when you move between visits. The keydown effect used to
 * depend only on [selected, total]; opening one visit and then another with
 * the same epoch count left both unchanged, so the listener was never rebuilt
 * and kept the previous visit's `visitId`. A keyboard accept then recorded the
 * decision -- and its audit entry -- against the visit you had navigated away
 * from. Mouse clicks were unaffected, which is why it went unnoticed.
 */
const { paramsMock, logAuditMock, mutateMock, participantsMock, epochsMock } = vi.hoisted(() => ({
  paramsMock: vi.fn(),
  logAuditMock: vi.fn(),
  mutateMock: vi.fn(),
  participantsMock: vi.fn(),
  epochsMock: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useParams: paramsMock, useNavigate: () => vi.fn() };
});
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));
vi.mock("@/api/hooks", () => ({
  useParticipants: participantsMock,
  useEpochs: epochsMock,
  useEpochDecision: (visitId: string) => ({
    mutate: (vars: unknown) => mutateMock({ visitId, vars }),
  }),
}));
vi.mock("@/hooks/useFeatureFlag", () => ({ useFeatureFlag: () => false }));

import { QA } from "@/routes/QA";
import { useUi } from "@/store/ui";

/* Two visits with an identical epoch count -- the condition that left both
   dependencies unchanged across the navigation. */
const epochs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    idx: i, sqi: 0.9, flag: "clean" as const, decision: "auto" as const,
  }));

const participants = [
  { id: "NANO-0102", visit: "v1", name: "A", status: "active", age_days: 100 },
  { id: "NANO-0117", visit: "v1", name: "B", status: "active", age_days: 100 },
];

describe("QA keyboard shortcuts", () => {
  beforeEach(() => {
    logAuditMock.mockReset();
    mutateMock.mockReset();
    participantsMock.mockReturnValue({ data: participants });
    epochsMock.mockReturnValue({ data: epochs(64) });
    useUi.setState({ qaSelectedEpoch: 3 });
  });

  it("binds accept/reject to the visit on screen after navigating between equal-length visits", () => {
    paramsMock.mockReturnValue({ id: "NANO-0102" });
    const { rerender } = render(<QA />);

    fireEvent.keyDown(window, { key: "a" });
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ visitId: "NANO-0102__v1" }),
    );

    // Same epoch count and the selection survives in the global store, so
    // neither of the old dependencies changes across this navigation.
    mutateMock.mockReset();
    logAuditMock.mockReset();
    paramsMock.mockReturnValue({ id: "NANO-0117" });
    rerender(<QA />);

    fireEvent.keyDown(window, { key: "a" });

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ visitId: "NANO-0117__v1" }),
    );
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "NANO-0117__v1" }),
    );
  });
});
