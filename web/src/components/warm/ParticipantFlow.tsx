import { useNavigate } from "react-router-dom";
import { Gloss } from "@/components/primitives";
import { GroupTag } from "./GroupTag";
import { StatusPill } from "./StatusPill";
import type { Participant } from "@/api/schemas";

/**
 * Recent participant flow card. Maps `Participant.qa` and `visit` onto the
 * design package's status vocabulary; rows are click-through to the
 * `/participants/:id` detail route.
 */
function deriveStatus(p: Participant): string {
  if (p.qa === "pass" && p.hda) return "feedback_sent";
  if (p.qa === "pass") return "visit_complete";
  if (p.qa === "pending") return "qa_review";
  if (p.qa === "reject") return "redcap_synced";
  return "awaiting_feedback";
}

/** Site fallback per design package (Greenville / Columbia / Charleston). */
function siteOf(p: Participant): string {
  return p.site;
}

interface Props {
  rows: Participant[];
}

export function ParticipantFlow({ rows }: Props) {
  const navigate = useNavigate();
  return (
    <div className="bg-white border border-[color:var(--warm-border)] rounded-2xl shadow-card overflow-hidden min-h-[320px]">
      <div className="px-6 py-5 border-b border-[color:var(--warm-rule)] flex justify-between items-start gap-4">
        <div>
          <div className="font-serif text-h3 font-semibold text-[color:var(--warm-fg1)] -tracking-[0.01em]">
            Recent participant flow
          </div>
          <div className="text-[12px] text-[color:var(--warm-fg3)] mt-1">
            Last 4 hours of visit activity across all sites · ADOS-2 CSS, Bayley-4 ready
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/participants")}
          className="text-[11px] px-3 py-1.5 rounded-full border border-[color:var(--warm-border)] bg-transparent text-garnet hover:bg-[color:var(--warm-pill)] transition"
        >
          view all →
        </button>
      </div>
      <div className="flex flex-col">
        {rows.map((p, i) => {
          const status = deriveStatus(p);
          return (
            <button
              type="button"
              key={p.id}
              onClick={() => navigate(`/participants/${p.id}`)}
              className="grid grid-cols-[110px_56px_1fr_auto_auto] gap-3.5 px-6 py-3 items-center hover:bg-[color:var(--warm-bg)] transition text-left"
              style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--warm-rule)" : "none" }}
            >
              <span className="font-mono text-[12px] text-[color:var(--warm-fg1)] font-medium">{p.id}</span>
              <GroupTag group={p.group} />
              <div>
                <span className="text-[12px] text-[color:var(--warm-fg2)]">
                  <span className="font-mono text-[color:var(--warm-fg3)]">{p.visit}</span>
                  <span className="mx-2 text-[color:var(--warm-fg5)]">·</span>
                  <Gloss term="CGA">CGA</Gloss>
                  {" "}
                  <span className="font-mono">{p.cga_wks.toFixed(1)} wk</span>
                  <span className="mx-2 text-[color:var(--warm-fg5)]">·</span>
                  <span className="text-[color:var(--warm-fg4)]">{siteOf(p)}</span>
                </span>
              </div>
              <StatusPill status={status} />
              <span className="text-[11px] font-mono text-[color:var(--warm-fg4)] min-w-[70px] text-right">{p.updated}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
