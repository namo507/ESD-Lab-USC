import { Tooltip } from "@/components/primitives";
import type { GroupCode } from "@/api/schemas";

const STYLE: Record<GroupCode, { bg: string; fg: string }> = {
  VPT:  { bg: "var(--vpt-bg)",  fg: "var(--vpt-fg)" },
  ASIB: { bg: "var(--asib-bg2)", fg: "var(--asib-fg)" },
  TD:   { bg: "var(--td-bg)",   fg: "var(--td-fg)" },
};

/** Garnet/plum/sage cohort tag with hover Gloss tooltip. */
export function GroupTag({ group }: { group: GroupCode }) {
  const m = STYLE[group];
  return (
    <Tooltip gloss={group}>
      <span
        className="inline-block px-2 py-[2px] rounded-md text-[10px] font-mono font-semibold tracking-[0.05em] cursor-help"
        style={{ background: m.bg, color: m.fg }}
      >
        {group}
      </span>
    </Tooltip>
  );
}
