import * as d3 from "d3";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, SectionLabel } from "@/components/primitives";
import { useCascadeDag } from "@/api/hooks";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import styles from "./FeatureRoutes.module.css";

interface Node extends d3.SimulationNodeDatum {
  id: string;
  domain: string;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  weight: number;
  evidence: string;
}

const DOMAIN_COLOR: Record<string, string> = {
  context: "var(--sand)",
  physiology: "var(--usc-garnet)",
  attention: "var(--blue)",
  family: "var(--green)",
  behavior: "var(--purple)",
  outcome: "var(--slate-500)",
};

export function CascadeDag() {
  const enabled = useFeatureFlag("CASCADE_DAG");
  if (!enabled) return null;

  const navigate = useNavigate();
  const showSim = useFeatureFlag("DYN_CASCADE_SIMULATOR");
  const { data } = useCascadeDag();
  const rows = data?.data ?? [];
  const graph = useMemo(() => {
    const nodeMap = new Map<string, Node>();
    rows.forEach((row) => {
      if (!nodeMap.has(row.source)) nodeMap.set(row.source, { id: row.source, domain: row.sourceDomain });
      if (!nodeMap.has(row.target)) nodeMap.set(row.target, { id: row.target, domain: row.targetDomain });
    });
    const nodes = Array.from(nodeMap.values());
    const links: Link[] = rows.map((row) => ({ source: row.source, target: row.target, weight: row.weight, evidence: row.evidence }));
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink<Node, Link>(links).id((d) => d.id).distance((d) => 120 - d.weight * 42))
      .force("charge", d3.forceManyBody().strength(-260))
      .force("center", d3.forceCenter(380, 220))
      .force("x", d3.forceX<Node>((d) => 120 + Object.keys(DOMAIN_COLOR).indexOf(d.domain) * 100).strength(0.08))
      .force("y", d3.forceY(220).strength(0.08))
      .stop();
    for (let i = 0; i < 120; i += 1) simulation.tick();
    return { nodes, links };
  }, [rows]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Concept route</span>
          <h1 className={styles.h1}>Developmental Cascade DAG</h1>
          <p className={styles.lede}>Mechanistic links from NICU physiology through attention and developmental outcomes.</p>
        </div>
        {showSim && (
          <Button icon="sliders" onClick={() => navigate("/cascade-sim")}>
            Run a what-if
          </Button>
        )}
      </header>

      <Card pad={20}>
        <SectionLabel>Force-directed DAG</SectionLabel>
        <svg viewBox="0 0 760 460" className={styles.plotSvg} role="img" aria-label="Developmental cascade directed graph">
          <defs>
            <marker id="cascade-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--slate-500)" />
            </marker>
          </defs>
          {graph.links.map((link, i) => {
            const source = link.source as Node;
            const target = link.target as Node;
            return (
              <g key={`${source.id}-${target.id}`}>
                <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="var(--slate-300)" strokeWidth={1 + link.weight * 2} markerEnd="url(#cascade-arrow)" opacity={0.72} />
                <text x={((source.x ?? 0) + (target.x ?? 0)) / 2} y={((source.y ?? 0) + (target.y ?? 0)) / 2 - 5} className={styles.tinyLabel}>{i % 2 === 0 ? link.evidence : ""}</text>
              </g>
            );
          })}
          {graph.nodes.map((node) => (
            <g key={node.id} transform={`translate(${node.x ?? 0} ${node.y ?? 0})`}>
              <circle r={28} fill={DOMAIN_COLOR[node.domain] ?? "var(--slate-500)"} opacity={0.92} />
              <text textAnchor="middle" y={42} className={styles.tinyLabel}>{node.id}</text>
            </g>
          ))}
        </svg>
      </Card>
    </div>
  );
}
