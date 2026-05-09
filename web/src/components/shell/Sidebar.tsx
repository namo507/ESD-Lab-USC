import { NavLink } from "react-router-dom";
import { Icon } from "@/components/primitives";
import type { StudySummary } from "@/api/schemas";

interface SidebarProps {
  study: StudySummary;
  qaPending: number;
  enrolled: number;
}

interface NavItem {
  to: string;
  label: string;
  icon: string;
  badge?: number;
  external?: boolean;
}

const NAV_GROUPS: Array<{ id: string; title: string; items: NavItem[] }> = [
  {
    id: "ops",
    title: "Lab Operations",
    items: [
      { to: "/", label: "Overview", icon: "layout-dashboard" },
      { to: "/participants", label: "Intakes & Stories", icon: "heart-handshake" },
      { to: "/qa", label: "Window QA", icon: "shield-check" },
    ],
  },
  {
    id: "studies",
    title: "Active Studies",
    items: [
      { to: "/", label: "NANO Study", icon: "activity" },
      { to: "/participants", label: "Home Study", icon: "home" },
      { to: "/participants", label: "FiSCAL-ASD", icon: "baby" },
    ],
  },
  {
    id: "data",
    title: "Data Infrastructure",
    items: [
      { to: "/runs", label: "Clinical Pipeline", icon: "git-branch" },
      { to: "/redcap", label: "REDCap Sync", icon: "refresh-cw" },
      { to: "/results", label: "Results & Trajectories", icon: "line-chart" },
    ],
  },
];

export function Sidebar({ study, qaPending, enrolled }: SidebarProps) {
  return (
    <aside
      className="w-60 flex-shrink-0 bg-white border-r border-[color:var(--warm-border)] py-5 px-3.5 flex flex-col gap-6 sticky top-0 self-start h-screen overflow-y-auto"
      aria-label="Primary navigation"
    >
      <div className="px-2">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-serif font-bold text-lg"
            style={{
              background: "linear-gradient(135deg, var(--usc-garnet) 0%, #a51124 100%)",
              boxShadow: "0 4px 12px rgba(115,0,10,0.25)",
            }}
            aria-hidden
          >
            e
          </div>
          <div>
            <div className="font-serif text-[15px] font-semibold text-[color:var(--warm-fg1)] -tracking-[0.01em]">
              ESD Lab
            </div>
            <div className="text-[10px] font-mono text-[color:var(--warm-fg4)] tracking-[0.04em]">
              UofSC · IMB
            </div>
          </div>
        </div>
      </div>

      {NAV_GROUPS.map((g) => (
        <div key={g.id}>
          <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--warm-fg4)]">
            {g.title}
          </div>
          <div className="flex flex-col gap-px">
            {g.items.map((it, i) => {
              const badge =
                it.label === "Window QA" && qaPending > 0
                  ? qaPending
                  : it.label === "NANO Study"
                    ? enrolled
                    : undefined;
              return (
                <NavLink
                  key={`${g.id}-${i}`}
                  to={it.to}
                  end={it.to === "/"}
                  className={({ isActive }) =>
                    `relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-sans text-left transition ${
                      isActive
                        ? "bg-[color:var(--vpt-bg)] text-garnet font-semibold"
                        : "text-[color:var(--warm-fg2)] hover:bg-[color:var(--warm-pill)]"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span
                          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-sm bg-garnet"
                          aria-hidden
                        />
                      )}
                      <Icon name={it.icon} size={16} stroke={1.5} color={isActive ? "var(--usc-garnet)" : "var(--warm-fg2)"} />
                      <span className="flex-1">{it.label}</span>
                      {badge !== undefined && (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-px rounded-full ${
                            isActive ? "bg-garnet text-white" : "bg-[color:var(--slate-100)] text-[color:var(--warm-fg3)]"
                          }`}
                        >
                          {badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mt-auto p-3 bg-[color:var(--warm-pill)] rounded-xl text-[11px] text-[color:var(--warm-fg3)] leading-relaxed">
        <div className="font-serif text-[13px] text-[color:var(--warm-fg2)] font-semibold mb-1">
          Dr. Bradshaw&apos;s lab
        </div>
        Institute for Mind &amp; Brain
        <br />
        1800 Gervais St · Columbia, SC
        <br />
        <span className="text-[color:var(--warm-fg4)] font-mono text-[10px]">
          {study.enrolled} / {study.target} enrolled · year 3
        </span>
      </div>
    </aside>
  );
}
