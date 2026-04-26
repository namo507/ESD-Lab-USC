import { memo, type KeyboardEvent } from "react";
import type { Epoch } from "@/api/schemas";
import { Tooltip, Icon } from "@/components/primitives";
import { ecgPath } from "@/lib/ecgPath";
import styles from "./EpochTile.module.css";

interface Props {
  epoch: Epoch;
  selected: boolean;
  onClick: () => void;
  /** Roving tabindex value for the grid cell. */
  tabIndex?: number;
  /** Keyboard handler from the grid wrapper. */
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
}

function sqiClass(sqi: number): string {
  if (sqi >= 0.7) return styles.sqiGreen ?? "";
  if (sqi >= 0.5) return styles.sqiGold ?? "";
  if (sqi >= 0.3) return styles.sqiAmber ?? "";
  return styles.sqiRed ?? "";
}

function flagColor(flag: Epoch["flag"]): string {
  if (flag === "clean") return "var(--slate-700)";
  if (flag === "ectopic" || flag === "motion") return "var(--amber-warn)";
  return "var(--red)";
}

export const EpochTile = memo(function EpochTile({ epoch, selected, onClick, tabIndex = -1, onKeyDown }: Props) {
  const isAccept = epoch.decision === "accept";
  const isReject = epoch.decision === "reject";
  const cls = [
    styles.tile,
    selected ? styles.selected : "",
    isAccept ? styles.accepted : "",
    isReject ? styles.rejected : "",
  ].join(" ").trim();
  const ariaLabel = `Epoch ${epoch.idx + 1}, SQI ${epoch.sqi.toFixed(2)}, ${epoch.flag}, ${
    epoch.decision === "auto" ? "pending review" : `${epoch.decision}ed`
  }`;
  return (
    <Tooltip
      maxWidth={260}
      text={`Epoch ${epoch.idx + 1} · ${epoch.t0}–${epoch.t1}s · SQI ${epoch.sqi.toFixed(2)} · ${epoch.flag}${
        epoch.decision !== "auto" ? ` · ${epoch.decision}ed` : ""
      }`}
    >
      <div
        role="gridcell"
        aria-selected={selected}
        aria-label={ariaLabel}
        tabIndex={tabIndex}
        onKeyDown={onKeyDown}
        onClick={onClick}
        className={cls}
      >
        <svg viewBox="0 0 60 30" className={styles.ecg} aria-hidden>
          <path d={ecgPath(60, 30, epoch.idx + 1, epoch.flag)} fill="none" stroke={flagColor(epoch.flag)} strokeWidth={0.9} />
        </svg>
        <div className={styles.foot}>
          <span className={styles.idx}>{epoch.idx + 1}</span>
          <div className={styles.sqiTrack}>
            <div className={`${styles.sqiBar} ${sqiClass(epoch.sqi)}`} style={{ width: `${epoch.sqi * 100}%` }} />
          </div>
        </div>
        {epoch.decision !== "auto" && (
          <div
            className={`${styles.pip} ${isAccept ? styles.pipOk : styles.pipFail}`}
            aria-label={isAccept ? "accepted" : "rejected"}
          >
            <Icon name={isAccept ? "check" : "x"} size={7} color="var(--fg-on-brand)" stroke={3} />
          </div>
        )}
      </div>
    </Tooltip>
  );
});
