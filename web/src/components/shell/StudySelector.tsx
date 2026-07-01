import { useUi, type StudyFilter } from "@/store/ui";

/**
 * Persistent NANO / NICO / BOTH study scope toggle.
 *
 * Rendered in the sidebar directly under the logo. Selection lives in the
 * Zustand `uiStore` (`activeStudy`) and is persisted to localStorage, so every
 * page, chart, and data call can reactively filter to the chosen study.
 */
const OPTIONS: Array<{ value: StudyFilter; label: string; activeStyle: React.CSSProperties }> = [
  { value: "NANO", label: "NANO", activeStyle: { background: "var(--color-indigo-500, #6366F1)", color: "#fff" } },
  { value: "NICO", label: "NICO", activeStyle: { background: "var(--color-teal-500, #14B8A6)", color: "#fff" } },
  { value: "BOTH", label: "Both", activeStyle: { background: "var(--slate-600, #475569)", color: "#fff" } },
];

export function StudySelector() {
  const activeStudy = useUi((s) => s.activeStudy);
  const setActiveStudy = useUi((s) => s.setActiveStudy);

  return (
    <div className="px-2">
      <div className="pb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--warm-fg4)]">
        Study
      </div>
      <div
        role="radiogroup"
        aria-label="Active study scope"
        className="flex gap-1 p-1 rounded-lg bg-[color:var(--warm-pill)] border border-[color:var(--warm-border)]"
      >
        {OPTIONS.map((opt) => {
          const isActive = activeStudy === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setActiveStudy(opt.value)}
              className={`flex-1 px-1.5 py-1 rounded-md text-[11px] font-semibold tracking-[0.02em] transition ${
                isActive ? "shadow-sm" : "text-[color:var(--warm-fg3)] hover:bg-[color:var(--warm-card)]"
              }`}
              style={isActive ? opt.activeStyle : undefined}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
