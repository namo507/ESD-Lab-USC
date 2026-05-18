/**
 * Zustand UI store. Keeps non-server state out of TanStack Query.
 *
 * Persists user prefs in sessionStorage only — never localStorage,
 * because anything keyed under a participant could be PHI-adjacent.
 *
 * Theme is the lone exception: persisted to localStorage under its own
 * key so the choice survives across HIPAA-idle re-auths. No participant
 * data is keyed under the theme value.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type PipelineView = "dag" | "sankey" | "kanban";
export type Density = "comfortable" | "compact";
export type ThemeMode = "light" | "dark" | "system";

interface UiState {
  pipelineView: PipelineView;
  density: Density;
  showHipaa: boolean;
  chatOpen: boolean;
  chatSeed: string | null;
  selectedStageId: string;
  qaSelectedEpoch: number;
  theme: ThemeMode;
  setPipelineView: (v: PipelineView) => void;
  setDensity: (d: Density) => void;
  setHipaa: (v: boolean) => void;
  setChatOpen: (open: boolean) => void;
  toggleChat: () => void;
  setChatSeed: (seed: string | null) => void;
  consumeChatSeed: () => string | null;
  setStage: (id: string) => void;
  setQaEpoch: (idx: number) => void;
  setTheme: (t: ThemeMode) => void;
  cycleTheme: () => void;
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
      theme: "system",
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
      setTheme: (t) => set({ theme: t }),
      cycleTheme: () =>
        set((s) => ({
          theme: s.theme === "light" ? "dark" : s.theme === "dark" ? "system" : "light",
        })),
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

/**
 * Theme persists separately in localStorage so it survives session resets
 * and HIPAA re-auths. Value: "light" | "dark" | "system".
 */
const THEME_STORAGE_KEY = "esd-nano-theme";

export function loadInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* sandboxed contexts may throw; fall through */
  }
  return "system";
}

export function persistTheme(t: ThemeMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, t);
  } catch {
    /* ignore quota / privacy errors */
  }
}

/** Resolve "system" to the live OS preference. */
export function resolveTheme(t: ThemeMode): "light" | "dark" {
  if (t !== "system") return t;
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Write the resolved theme to the <html data-theme> attribute. */
export function applyTheme(t: ThemeMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolveTheme(t);
}
