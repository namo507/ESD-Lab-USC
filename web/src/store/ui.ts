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
  chatOpen: boolean;
  chatSeed: string | null;
  selectedStageId: string;
  qaSelectedEpoch: number;
  setPipelineView: (v: PipelineView) => void;
  setDensity: (d: Density) => void;
  setHipaa: (v: boolean) => void;
  setChatOpen: (open: boolean) => void;
  toggleChat: () => void;
  setChatSeed: (seed: string | null) => void;
  consumeChatSeed: () => string | null;
  setStage: (id: string) => void;
  setQaEpoch: (idx: number) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set, get): UiState => ({
      pipelineView: "dag",
      density: "comfortable",
      showHipaa: true,
      chatOpen: false,
      chatSeed: null,
      selectedStageId: "hrv",
      qaSelectedEpoch: 0,
      setPipelineView: (v) => set({ pipelineView: v }),
      setDensity: (d) => set({ density: d }),
      setHipaa: (v) => set({ showHipaa: v }),
      setChatOpen: (open) => set({ chatOpen: open }),
      toggleChat: () => set((state) => ({ chatOpen: !state.chatOpen })),
      setChatSeed: (seed) => set({ chatSeed: seed }),
      consumeChatSeed: (): string | null => {
        const current = get().chatSeed;
        set({ chatSeed: null });
        return current;
      },
      setStage: (id: string) => set({ selectedStageId: id }),
      setQaEpoch: (idx: number) => set({ qaSelectedEpoch: idx }),
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
