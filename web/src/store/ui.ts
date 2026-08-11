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
export type BrandSkin = "default" | "esd-2026";

/**
 * Global study scope across the five-study REDCap portfolio.
 *
 * `ALL` means the whole portfolio rather than any single study. Values match
 * the uppercased `studies[].key` in the aggregate metrics payload, so a sixth
 * study appears in the UI without a code change here.
 */
export type StudyFilter = "ALL" | "ABC" | "IPSA" | "ACTION" | "NICO" | "NANO";

export const STUDY_FILTERS: readonly StudyFilter[] = [
  "ALL",
  "ABC",
  "IPSA",
  "ACTION",
  "NICO",
  "NANO",
] as const;

const STUDY_STORAGE_KEY = "esd-active-study";

/**
 * Values written by earlier builds that no longer exist as scopes.
 *
 * `BOTH` was the old NANO+NICO toggle. Anyone who used the dashboard before
 * the portfolio rollout still has it in localStorage, so it has to resolve to
 * the nearest equivalent instead of being treated as corrupt and reset.
 */
const LEGACY_STUDY_ALIASES: Record<string, StudyFilter> = {
  BOTH: "ALL",
  ALL_STUDIES: "ALL",
  PORTFOLIO: "ALL",
};

export function normalizeStudyFilter(value: unknown): StudyFilter | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  if ((STUDY_FILTERS as readonly string[]).includes(upper)) {
    return upper as StudyFilter;
  }
  return LEGACY_STUDY_ALIASES[upper] ?? null;
}

/**
 * Study scope persists in localStorage (its own key, like theme) so the choice
 * survives session resets. It carries no participant data, so it is not
 * PHI-adjacent and is safe outside sessionStorage.
 */
export function loadInitialStudy(): StudyFilter {
  if (typeof window === "undefined") return "ALL";
  try {
    const stored = normalizeStudyFilter(window.localStorage.getItem(STUDY_STORAGE_KEY));
    if (stored) return stored;
  } catch {
    /* sandboxed contexts may throw; fall through */
  }
  return "ALL";
}

function persistStudy(s: StudyFilter): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STUDY_STORAGE_KEY, s);
  } catch {
    /* ignore quota / privacy errors */
  }
}

interface UiState {
  pipelineView: PipelineView;
  density: Density;
  showHipaa: boolean;
  chatOpen: boolean;
  chatSeed: string | null;
  selectedStageId: string;
  qaSelectedEpoch: number;
  theme: ThemeMode;
  brand: BrandSkin;
  lastSyncAt: string | null;
  activeStudy: StudyFilter;
  setActiveStudy: (s: StudyFilter) => void;
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
  setBrand: (b: BrandSkin) => void;
  cycleTheme: () => void;
  setLastSyncAt: (ts: string) => void;
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
      brand: "default",
      lastSyncAt: null,
      activeStudy: loadInitialStudy(),
      setActiveStudy: (s) => {
        persistStudy(s);
        set({ activeStudy: s });
      },
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
      setBrand: (b) => set({ brand: b }),
      setLastSyncAt: (ts) => set({ lastSyncAt: ts }),
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
        lastSyncAt: s.lastSyncAt,
        brand: s.brand,
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

/** Write the resolved theme to both the legacy and ESD 2026 theme hooks. */
export function applyTheme(t: ThemeMode): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(t);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.esdTheme = resolved;
}
