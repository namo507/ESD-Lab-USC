import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/primitives";
import { useUi } from "@/store/ui";

interface TopNavProps {
  query: string;
  onSearch: (q: string) => void;
  syncing: boolean;
  onForceSync: () => void;
  idleMinutes: number;
}

/**
 * Glass header — translucent white, blur(12px), Source Serif title.
 * Force-sync button is the operator's manual trigger for the data layer
 * (TanStack Query invalidations + visible DAG pulse acceleration).
 */
export function TopNav({ query, onSearch, syncing, onForceSync, idleMinutes }: TopNavProps) {
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const setChatOpen = useUi((state) => state.setChatOpen);
  const setChatSeed = useUi((state) => state.setChatSeed);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  function openChatWithQuery(nextQuery: string) {
    const trimmed = nextQuery.trim();
    setChatSeed(trimmed ? trimmed : null);
    setChatOpen(true);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    openChatWithQuery(searchRef.current?.value ?? event.currentTarget.value);
  }

  return (
    <header
      className="glass-header sticky top-0 z-30 flex items-center gap-5 px-8 py-5 border-b border-[color:var(--warm-border)]"
      role="banner"
    >
      <div className="flex-1 min-w-0">
        <h1 className="m-0 font-serif text-[22px] font-semibold text-[color:var(--warm-fg1)] -tracking-[0.015em] truncate">
          Early Social Development Lab
        </h1>
        <div className="text-[12px] text-[color:var(--warm-fg3)] mt-0.5 truncate">
          Institute for Mind and Brain · 1800 Gervais Street, Columbia SC · Dr. Jessica Bradshaw
        </div>
      </div>

      <label className="relative flex-[0_1_320px] min-w-[180px] bg-[color:var(--warm-pill)] border border-[color:var(--warm-border)] rounded-full pl-9 pr-3.5 py-2 flex items-center gap-2">
        <Icon name="sparkles" size={14} stroke={1.5} color="var(--usc-garnet)" style={{ position: "absolute", left: 12 }} />
        <input
          ref={searchRef}
          aria-label="Ask the lab"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          onFocus={() => openChatWithQuery(searchRef.current?.value ?? query)}
          onKeyDown={onSearchKeyDown}
          placeholder="Ask the lab · NANO-0173 RMSSD trend?"
          className="flex-1 bg-transparent border-none outline-none text-[13px] text-[color:var(--warm-fg1)]"
        />
        <span className="text-[9px] font-mono text-[color:var(--warm-fg4)] bg-white border border-[color:var(--warm-border)] px-1.5 py-px rounded">
          ⌘K
        </span>
      </label>

      <button
        type="button"
        onClick={() => navigate("/runs")}
        className="hidden lg:inline-flex items-center gap-1.5 text-[11px] font-mono text-[color:var(--warm-fg3)] hover:text-[color:var(--warm-fg1)] transition"
        title="Idle countdown · 30 m HIPAA gate"
      >
        <Icon name="shield-check" size={12} stroke={1.5} color="var(--sage)" />
        <span>{idleMinutes} m</span>
      </button>

      <div className="text-right">
        <div className="font-mono text-[14px] font-medium text-[color:var(--warm-fg1)] tracking-[0.02em]">{time}</div>
        <div className="text-[11px] text-[color:var(--warm-fg3)]">{date}</div>
      </div>

      <button
        type="button"
        onClick={onForceSync}
        disabled={syncing}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-white text-[13px] font-medium transition shadow-garnet"
        style={{ background: syncing ? "var(--warm-fg2)" : "var(--usc-garnet)", cursor: syncing ? "wait" : "pointer" }}
      >
        <Icon
          name="refresh-cw"
          size={14}
          stroke={1.5}
          color="white"
          style={{ animation: syncing ? "esd-spin 0.7s linear infinite" : "none" }}
        />
        {syncing ? "syncing…" : "Force Sync"}
      </button>
    </header>
  );
}
