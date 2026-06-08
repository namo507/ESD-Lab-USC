import { useNavigate } from "react-router-dom";
import { Tooltip } from "@/components/primitives";

export interface VersionTagProps {
  tag: string;
  snapshotTag?: string;
  createdAt?: string;
}

export function VersionTag({ tag, snapshotTag = tag, createdAt }: VersionTagProps) {
  const navigate = useNavigate();
  const tooltip = `Part of snapshot: ${snapshotTag}${createdAt ? ` · created ${createdAt}` : ""}`;
  return (
    <Tooltip text={tooltip}>
      <button
        type="button"
        onClick={() => navigate(`/changelog?version_tag=${encodeURIComponent(snapshotTag)}`)}
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--r-2)",
          background: "var(--bg-subtle)",
          color: "var(--fg2)",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-micro)",
          padding: "2px 6px",
        }}
      >
        {tag}
      </button>
    </Tooltip>
  );
}
