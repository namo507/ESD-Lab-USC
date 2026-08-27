import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, SectionLabel } from "@/components/primitives";
import { RouteDataTable } from "@/components/dyn/RouteDataTable";
import { useCascadeDag } from "@/api/hooks";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { CascadeDagRow } from "@/api/schemas";
import styles from "./FeatureRoutes.module.css";
import local from "./CascadeDag.module.css";

const DOMAIN_COLOR: Record<string, string> = {
  context: "var(--sand)",
  physiology: "var(--usc-garnet)",
  attention: "var(--blue)",
  family: "var(--green)",
  behavior: "var(--purple)",
  outcome: "var(--slate-500)",
};

const DOMAIN_LABEL: Record<string, string> = {
  context: "Context",
  physiology: "Physiology",
  attention: "Attention",
  family: "Family",
  behavior: "Behavior",
  outcome: "Outcome",
};

const W = 900;
const H = 480;
const NODE_W = 132;
const NODE_H = 52;
const PAD_X = 112;
const PAD_TOP = 74;
const PAD_BOTTOM = 54;

interface CNode {
  id: string;
  domain: string;
  layer: number;
  x: number;
  y: number;
  inDeg: number;
  outDeg: number;
}

interface CLink {
  index: number;
  sourceId: string;
  targetId: string;
  sourceDomain: string;
  targetDomain: string;
  weight: number;
  evidence: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  path: string;
}

/** Cubic bezier between two points with horizontal control handles. */
function curve(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

/** Greedy word-wrap into at most two lines for the in-node label. */
function wrapLabel(text: string, maxChars = 15): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    if (!cur) cur = word;
    else if (`${cur} ${word}`.length <= maxChars) cur += ` ${word}`;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) {
    lines[1] = lines.slice(1).join(" ");
    lines.length = 2;
  }
  return lines;
}

/**
 * Layered (longest-path) layout for the cascade DAG. Each factor is placed in
 * the column equal to the longest causal chain that reaches it, so the graph
 * reads left → right from upstream drivers to adaptive outcome. Positions are
 * deterministic — no force jitter — which keeps interaction targets stable.
 */
function buildGraph(rows: CascadeDagRow[]) {
  const nodeMeta = new Map<string, string>();
  const parents = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  rows.forEach((row) => {
    if (!nodeMeta.has(row.source)) nodeMeta.set(row.source, row.sourceDomain);
    if (!nodeMeta.has(row.target)) nodeMeta.set(row.target, row.targetDomain);
    parents.set(row.target, [...(parents.get(row.target) ?? []), row.source]);
    outDeg.set(row.source, (outDeg.get(row.source) ?? 0) + 1);
    inDeg.set(row.target, (inDeg.get(row.target) ?? 0) + 1);
  });

  const ids = Array.from(nodeMeta.keys());
  const layer = new Map<string, number>();
  const inProgress = new Set<string>();
  const resolveLayer = (id: string): number => {
    const cached = layer.get(id);
    if (cached !== undefined) return cached;
    if (inProgress.has(id)) return 0; // defensive cycle guard (data is a DAG)
    inProgress.add(id);
    let depth = 0;
    for (const parent of parents.get(id) ?? []) depth = Math.max(depth, resolveLayer(parent) + 1);
    inProgress.delete(id);
    layer.set(id, depth);
    return depth;
  };
  ids.forEach(resolveLayer);

  const maxLayer = ids.reduce((max, id) => Math.max(max, layer.get(id) ?? 0), 0);
  const byLayer = new Map<number, string[]>();
  ids.forEach((id) => {
    const lay = layer.get(id) ?? 0;
    byLayer.set(lay, [...(byLayer.get(lay) ?? []), id]);
  });

  const colW = maxLayer > 0 ? (W - PAD_X * 2) / maxLayer : 0;
  const top = PAD_TOP;
  const bottom = H - PAD_BOTTOM;
  const pos = new Map<string, { x: number; y: number }>();
  for (const [lay, group] of byLayer) {
    const x = PAD_X + lay * colW;
    group.forEach((id, i) => {
      const y = group.length === 1 ? (top + bottom) / 2 : top + (i * (bottom - top)) / (group.length - 1);
      pos.set(id, { x, y });
    });
  }

  const nodes: CNode[] = ids.map((id) => ({
    id,
    domain: nodeMeta.get(id) ?? "outcome",
    layer: layer.get(id) ?? 0,
    x: pos.get(id)!.x,
    y: pos.get(id)!.y,
    inDeg: inDeg.get(id) ?? 0,
    outDeg: outDeg.get(id) ?? 0,
  }));

  const links: CLink[] = rows.map((row, index) => {
    const s = pos.get(row.source)!;
    const t = pos.get(row.target)!;
    const x1 = s.x + NODE_W / 2;
    const x2 = t.x - NODE_W / 2;
    return {
      index,
      sourceId: row.source,
      targetId: row.target,
      sourceDomain: row.sourceDomain,
      targetDomain: row.targetDomain,
      weight: row.weight,
      evidence: row.evidence,
      x1,
      y1: s.y,
      x2,
      y2: t.y,
      path: curve(x1, s.y, x2, t.y),
    };
  });

  const domains = Array.from(new Set(nodes.map((n) => n.domain)));
  const strongest = links.reduce<CLink | null>((best, l) => (!best || l.weight > best.weight ? l : best), null);
  const meanWeight = links.length ? links.reduce((sum, l) => sum + l.weight, 0) / links.length : 0;

  return {
    nodes,
    links,
    nodeById: new Map(nodes.map((n) => [n.id, n])),
    domains,
    maxLayer,
    strongest,
    meanWeight,
  };
}

export function CascadeDag() {
  const enabled = useFeatureFlag("CASCADE_DAG");
  const navigate = useNavigate();
  const showSim = useFeatureFlag("DYN_CASCADE_SIMULATOR");
  const { data, isLoading } = useCascadeDag();
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const graph = useMemo(() => buildGraph(data?.data ?? []), [data?.data]);

  if (!enabled) return null;

  const focus = hovered ?? selected;
  const litNodes = new Set<string>();
  const litEdges = new Set<number>();
  if (focus) {
    litNodes.add(focus);
    graph.links.forEach((link) => {
      if (link.sourceId === focus || link.targetId === focus) {
        litEdges.add(link.index);
        litNodes.add(link.sourceId);
        litNodes.add(link.targetId);
      }
    });
  }
  const nodeOpacity = (id: string) => (!focus || litNodes.has(id) ? 1 : 0.22);
  const edgeOpacity = (i: number) => (!focus || litEdges.has(i) ? 1 : 0.1);

  const selectedNode = selected ? graph.nodeById.get(selected) ?? null : null;
  const incoming = selectedNode ? graph.links.filter((l) => l.targetId === selectedNode.id) : [];
  const outgoing = selectedNode ? graph.links.filter((l) => l.sourceId === selectedNode.id) : [];

  const tableRows = graph.links
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .map((l) => [
      l.sourceId,
      l.targetId,
      `${DOMAIN_LABEL[l.sourceDomain] ?? l.sourceDomain} → ${DOMAIN_LABEL[l.targetDomain] ?? l.targetDomain}`,
      l.weight.toFixed(2),
      l.evidence,
    ]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Concept route</span>
          <h1 className={styles.h1}>Developmental Cascade DAG</h1>
          <p className={styles.lede}>
            Mechanistic links from NICU physiology through attention and developmental outcomes. Hover or select any
            factor to trace its upstream drivers and downstream effects.
          </p>
        </div>
        {showSim && (
          <Button icon="sliders" onClick={() => navigate("/cascade-sim")}>
            Run a what-if
          </Button>
        )}
      </header>

      <section className={styles.metricGrid} aria-label="Cascade summary">
        <div className={styles.metric}>
          <div className={styles.metricLabel}>Factors</div>
          <div className={styles.metricValue}>{graph.nodes.length}</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>Mechanistic links</div>
          <div className={styles.metricValue}>{graph.links.length}</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>Cascade depth</div>
          <div className={styles.metricValue}>{graph.maxLayer + 1}</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>Strongest path</div>
          <div className={styles.metricValue}>{graph.strongest ? graph.strongest.weight.toFixed(2) : "—"}</div>
        </div>
      </section>

      <div className={styles.split}>
        <Card pad={20}>
          <div className={local.toolbar}>
            <SectionLabel>Layered cascade · left → right</SectionLabel>
            <span className={local.hint}>
              {isLoading ? "loading…" : selected ? "click the factor again to clear" : "tip · click a factor to pin its trace"}
            </span>
          </div>

          <div className={local.svgWrap}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className={styles.plotSvg}
              role="img"
              aria-label="Developmental cascade directed graph, arranged left to right from upstream drivers to adaptive outcome"
            >
              <defs>
                <marker
                  id="cascade-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--slate-500)" />
                </marker>
                <marker
                  id="cascade-arrow-lit"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6.5"
                  markerHeight="6.5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--usc-garnet)" />
                </marker>
                <radialGradient id="cascade-dot">
                  <stop offset="0%" stopColor="var(--usc-garnet)" stopOpacity="1" />
                  <stop offset="55%" stopColor="var(--usc-garnet)" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="var(--usc-garnet)" stopOpacity="0" />
                </radialGradient>
                {graph.links.map((link) => (
                  <path key={`def-${link.index}`} id={`cascade-edge-${link.index}`} d={link.path} />
                ))}
              </defs>

              {/* directional flow caption */}
              <text x={PAD_X - 40} y={30} className={local.colCaption}>
                ◂ earlier · upstream drivers
              </text>
              <text x={W - PAD_X + 40} y={30} textAnchor="end" className={local.colCaption}>
                later · adaptive outcomes ▸
              </text>
              <line
                x1={PAD_X - 40}
                y1={40}
                x2={W - PAD_X + 40}
                y2={40}
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray="2 5"
              />

              {/* edges */}
              {graph.links.map((link) => {
                const lit = litEdges.has(link.index);
                return (
                  <g key={`edge-${link.index}`} className={local.edge} style={{ opacity: edgeOpacity(link.index) }}>
                    <path
                      className={local.edgeLine}
                      d={link.path}
                      fill="none"
                      stroke={lit ? "var(--usc-garnet)" : "var(--slate-300)"}
                      strokeWidth={lit ? 2.4 + link.weight * 3.2 : 1.2 + link.weight * 2.6}
                      strokeLinecap="round"
                      markerEnd={lit ? "url(#cascade-arrow-lit)" : "url(#cascade-arrow)"}
                      style={{ animationDelay: `${link.index * 90}ms` }}
                    >
                      <title>{`${link.sourceId} → ${link.targetId} · weight ${link.weight.toFixed(2)} · ${link.evidence}`}</title>
                    </path>
                    <text
                      x={(link.x1 + link.x2) / 2}
                      y={(link.y1 + link.y2) / 2 - 6}
                      textAnchor="middle"
                      className={styles.tinyLabel}
                      style={{ fill: lit ? "var(--usc-garnet)" : "var(--slate-400)", fontWeight: lit ? 600 : 400 }}
                    >
                      {lit ? `${link.weight.toFixed(2)} · ${link.evidence}` : link.weight.toFixed(2)}
                    </text>
                  </g>
                );
              })}

              {/* traveling flow dots (paused under prefers-reduced-motion) */}
              {graph.links.map((link) => {
                const dur = 2.6 - link.weight * 1.1;
                return (
                  <g
                    key={`flow-${link.index}`}
                    className={local.flowDot}
                    style={{ opacity: focus && !litEdges.has(link.index) ? 0 : 0.85 }}
                    aria-hidden
                  >
                    {[0, 0.5].map((delay) => (
                      <circle key={delay} r={4.5} fill="url(#cascade-dot)">
                        <animateMotion dur={`${dur}s`} begin={`${delay * dur}s`} repeatCount="indefinite">
                          <mpath href={`#cascade-edge-${link.index}`} />
                        </animateMotion>
                      </circle>
                    ))}
                  </g>
                );
              })}

              {/* nodes */}
              {graph.nodes.map((node) => {
                const color = DOMAIN_COLOR[node.domain] ?? "var(--slate-500)";
                const isSel = selected === node.id;
                const lines = wrapLabel(node.id);
                return (
                  <g
                    key={node.id}
                    className={local.node}
                    style={{ opacity: nodeOpacity(node.id) }}
                    transform={`translate(${node.x} ${node.y})`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSel}
                    aria-label={`${node.id}, ${DOMAIN_LABEL[node.domain] ?? node.domain} domain, ${node.inDeg} drivers, ${node.outDeg} effects`}
                    onClick={() => setSelected((cur) => (cur === node.id ? null : node.id))}
                    onMouseEnter={() => setHovered(node.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(node.id)}
                    onBlur={() => setHovered(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected((cur) => (cur === node.id ? null : node.id));
                      }
                    }}
                  >
                    {isSel && (
                      <rect
                        x={-NODE_W / 2 - 5}
                        y={-NODE_H / 2 - 5}
                        width={NODE_W + 10}
                        height={NODE_H + 10}
                        rx={12}
                        fill="none"
                        stroke="var(--usc-garnet)"
                        strokeWidth={1.5}
                        opacity={0.6}
                      >
                        <animate attributeName="opacity" values="0.6;0.15;0.6" dur="2.2s" repeatCount="indefinite" />
                      </rect>
                    )}
                    <rect
                      x={-NODE_W / 2}
                      y={-NODE_H / 2}
                      width={NODE_W}
                      height={NODE_H}
                      rx={9}
                      fill="var(--bg-surface)"
                      stroke={isSel ? "var(--usc-garnet)" : "var(--border)"}
                      strokeWidth={isSel ? 2 : 1}
                    />
                    <rect x={-NODE_W / 2} y={-NODE_H / 2} width={5} height={NODE_H} rx={2} fill={color} />
                    <text
                      x={-NODE_W / 2 + 2}
                      y={-NODE_H / 2 - 6}
                      className={local.colCaption}
                      style={{ fill: color }}
                    >
                      {(DOMAIN_LABEL[node.domain] ?? node.domain).toUpperCase()}
                    </text>
                    {lines.map((line, li) => (
                      <text
                        key={li}
                        x={4}
                        y={lines.length === 1 ? 4 : li === 0 ? -3 : 13}
                        textAnchor="middle"
                        style={{
                          fontFamily: "Inter, sans-serif",
                          fontSize: 11.5,
                          fontWeight: 600,
                          fill: "var(--ink)",
                        }}
                      >
                        {line}
                      </text>
                    ))}
                  </g>
                );
              })}
            </svg>
          </div>

          <div className={styles.legend} style={{ marginTop: 12 }}>
            {graph.domains.map((domain) => (
              <span key={domain} className={styles.legendItem}>
                <span className={styles.swatch} style={{ background: DOMAIN_COLOR[domain] ?? "var(--slate-500)" }} />
                {DOMAIN_LABEL[domain] ?? domain}
              </span>
            ))}
            <span className={styles.legendItem} style={{ marginLeft: "auto" }}>
              line thickness &amp; flow speed ∝ path weight
            </span>
          </div>
        </Card>

        <Card pad={20}>
          {selectedNode ? (
            <div>
              <div className={local.panelHead}>
                <span className={local.panelTitle}>{selectedNode.id}</span>
                <span className={local.domainChip}>
                  <span
                    className={styles.swatch}
                    style={{ background: DOMAIN_COLOR[selectedNode.domain] ?? "var(--slate-500)" }}
                  />
                  {DOMAIN_LABEL[selectedNode.domain] ?? selectedNode.domain}
                </span>
              </div>
              <p className={styles.muted} style={{ fontSize: 12, margin: 0 }}>
                {selectedNode.inDeg} upstream driver{selectedNode.inDeg === 1 ? "" : "s"} · {selectedNode.outDeg} downstream
                effect{selectedNode.outDeg === 1 ? "" : "s"} · cascade layer {selectedNode.layer + 1}
              </p>

              <div className={local.sectionTitle}>Upstream drivers</div>
              {incoming.length ? (
                incoming
                  .slice()
                  .sort((a, b) => b.weight - a.weight)
                  .map((link) => <TraceRow key={link.index} name={link.sourceId} link={link} />)
              ) : (
                <p className={local.emptyTrace}>Root factor — no modeled upstream drivers.</p>
              )}

              <div className={local.sectionTitle}>Downstream effects</div>
              {outgoing.length ? (
                outgoing
                  .slice()
                  .sort((a, b) => b.weight - a.weight)
                  .map((link) => <TraceRow key={link.index} name={link.targetId} link={link} />)
              ) : (
                <p className={local.emptyTrace}>Terminal outcome — no modeled downstream effects.</p>
              )}
            </div>
          ) : (
            <div>
              <div className={local.panelHead}>
                <span className={local.panelTitle}>Trace a factor</span>
              </div>
              <p className={local.emptyTrace}>
                Select any factor in the graph to see the standardized path weights and evidence linking it to its
                drivers and effects. Strongest modeled links:
              </p>
              <div className={local.sectionTitle}>Top links</div>
              {graph.links
                .slice()
                .sort((a, b) => b.weight - a.weight)
                .slice(0, 4)
                .map((link) => (
                  <TraceRow key={link.index} name={`${link.sourceId} → ${link.targetId}`} link={link} />
                ))}
            </div>
          )}
        </Card>
      </div>

      <Card pad={20}>
        <RouteDataTable
          caption="Cascade DAG edges: source factor, target factor, domain transition, standardized weight, and evidence."
          columns={["Source", "Target", "Domain flow", "Weight", "Evidence"]}
          rows={tableRows}
        />
      </Card>
    </div>
  );
}

function TraceRow({ name, link }: { name: string; link: CLink }) {
  return (
    <div className={local.linkRow}>
      <div className={local.linkMeta}>
        <span className={local.linkName}>{name}</span>
        <span className={local.linkEvidence}>{link.evidence}</span>
      </div>
      <div className={local.weightCol}>
        <span className={local.weightBar}>
          <span className={local.weightFill} style={{ width: `${Math.round(link.weight * 100)}%` }} />
        </span>
        <span className={local.weightNum}>{link.weight.toFixed(2)}</span>
      </div>
    </div>
  );
}
