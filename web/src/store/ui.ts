/**
 * Zustand UI store. Keeps non-server state out of TanStack Query.
 *
 * Persists user prefs in sessionStorage only — never localStorage,
 * because anything keyed under a participant could be PHI-adjacent.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type PipelineView = "dag" | "sankey" | "kanban";
export type Density = "comfortable" | "compact";

interface UiState {
  pipelineView: PipelineView;
  density: Density;
  showHipaa: boolean;
  selectedStageId: string;
  qaSelectedEpoch: number;
  setPipelineView: (v: PipelineView) => void;
  setDensity: (d: Density) => void;
  setHipaa: (v: boolean) => void;
  setStage: (id: string) => void;
  setQaEpoch: (idx: number) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      pipelineView: "dag",
      density: "comfortable",
      showHipaa: true,
      selectedStageId: "hrv",
      qaSelectedEpoch: 0,
      setPipelineView: (v) => set({ pipelineView: v }),
      setDensity: (d) => set({ density: d }),
      setHipaa: (v) => set({ showHipaa: v }),
      setStage: (id) => set({ selectedStageId: id }),
      setQaEpoch: (idx) => set({ qaSelectedEpoch: idx }),
    }),
    {
      name: "esd-nano-ui",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        pipelineView: s.pipelineView,
        density: s.density,
        showHipaa: s.showHipaa,
      }),
    },
  ),
);
