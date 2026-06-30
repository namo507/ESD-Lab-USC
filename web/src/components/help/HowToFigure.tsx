import type { HowToFigureKind } from "@/data/helpContent";
import styles from "@/routes/HowTo.module.css";

type Pin = { n: number; label: string; x: number; y: number };

interface HowToFigureProps {
  kind: HowToFigureKind;
  pins: Pin[];
  /** Pin number currently highlighted (synced with the step list), or null. */
  activeN: number | null;
  onHover: (n: number | null) => void;
}

const VB_W = 320;
const VB_H = 180;

const C = {
  surface: "var(--warm-card)",
  subtle: "var(--warm-pill)",
  line: "var(--warm-border)",
  ink: "var(--warm-fg2)",
  muted: "var(--warm-fg4)",
  garnet: "var(--usc-garnet)",
  sand: "var(--sand)",
  blue: "var(--blue)",
  green: "var(--green)",
  purple: "var(--purple)",
  slate: "var(--slate-300)",
};

/** Browser-window chrome shared by every schematic scene. */
function Frame() {
  return (
    <>
      <rect x={3} y={3} width={314} height={174} rx={12} fill={C.surface} stroke={C.line} strokeWidth={1.2} />
      <circle cx={16} cy={14} r={2.6} fill={C.garnet} opacity={0.55} />
      <circle cx={25} cy={14} r={2.6} fill={C.sand} />
      <circle cx={34} cy={14} r={2.6} fill={C.green} opacity={0.6} />
      <line x1={3} y1={24} x2={317} y2={24} stroke={C.line} />
    </>
  );
}

function Scene({ kind }: { kind: HowToFigureKind }) {
  switch (kind) {
    case "landing-hero":
      return (
        <>
          <rect x={12} y={30} width={296} height={20} rx={5} fill={C.garnet} />
          <rect x={20} y={37} width={70} height={5} rx={2.5} fill="#fff" opacity={0.85} />
          <rect x={20} y={64} width={120} height={6} rx={3} fill={C.subtle} />
          <rect x={20} y={78} width={150} height={5} rx={2.5} fill={C.subtle} />
          <rect x={20} y={90} width={132} height={5} rx={2.5} fill={C.subtle} />
          <circle cx={150} cy={120} r={24} fill="none" stroke={C.blue} strokeWidth={8} opacity={0.8} />
          <circle cx={150} cy={120} r={24} fill="none" stroke={C.garnet} strokeWidth={8} strokeDasharray="40 110" />
          <circle cx={150} cy={120} r={7} fill={C.garnet} />
          <rect x={238} y={62} width={64} height={88} rx={8} fill={C.subtle} stroke={C.line} />
          <rect x={248} y={72} width={44} height={6} rx={3} fill={C.slate} />
          <rect x={248} y={86} width={36} height={5} rx={2.5} fill={C.line} />
          <rect x={248} y={98} width={40} height={5} rx={2.5} fill={C.line} />
        </>
      );
    case "nav":
      return (
        <>
          <rect x={12} y={30} width={296} height={22} rx={8} fill={C.subtle} stroke={C.line} />
          <circle cx={28} cy={41} r={5} fill={C.garnet} />
          {[150, 188, 226, 264].map((x) => (
            <rect key={x} x={x} y={37} width={28} height={8} rx={4} fill={C.slate} />
          ))}
          <rect x={12} y={64} width={140} height={48} rx={8} fill={C.subtle} stroke={C.line} />
          <rect x={166} y={64} width={142} height={48} rx={8} fill={C.subtle} stroke={C.line} />
          <circle cx={42} cy={150} r={16} fill={C.garnet} />
          <circle cx={37} cy={148} r={2.4} fill="#fff" />
          <circle cx={47} cy={148} r={2.4} fill="#fff" />
        </>
      );
    case "pipeline":
      return (
        <>
          {[18, 66, 114, 162, 210, 258].map((x, i) => (
            <g key={x}>
              {i > 0 && <line x1={x - 8} y1={104} x2={x} y2={104} stroke={C.line} strokeWidth={2} />}
              <rect x={x} y={82} width={44} height={44} rx={6} fill={C.subtle} stroke={C.line} />
              <rect
                x={x}
                y={82}
                width={44}
                height={5}
                rx={2.5}
                fill={i === 1 ? C.green : i === 5 ? C.garnet : C.slate}
              />
              <rect x={x + 8} y={98} width={28} height={5} rx={2.5} fill={C.line} />
              <rect x={x + 8} y={108} width={18} height={5} rx={2.5} fill={C.line} />
            </g>
          ))}
        </>
      );
    case "aim":
      return (
        <>
          <rect x={44} y={40} width={232} height={112} rx={10} fill={C.surface} stroke={C.line} />
          <rect x={52} y={48} width={120} height={10} rx={5} fill={C.subtle} />
          <path d="M 248 50 l 6 5 l -6 5" fill="none" stroke={C.garnet} strokeWidth={2} strokeLinecap="round" />
          <rect x={52} y={72} width={208} height={6} rx={3} fill={C.subtle} />
          <rect x={52} y={86} width={196} height={6} rx={3} fill={C.subtle} />
          <rect x={52} y={100} width={170} height={6} rx={3} fill={C.subtle} />
          <rect x={180} y={126} width={80} height={16} rx={8} fill={C.garnet} />
          <rect x={192} y={132} width={40} height={4} rx={2} fill="#fff" opacity={0.85} />
        </>
      );
    case "architecture":
      return (
        <>
          {[
            { y: 40, c: C.sand },
            { y: 60, c: C.blue },
            { y: 80, c: C.green },
            { y: 100, c: C.purple },
            { y: 120, c: C.slate },
          ].map((row, i) => (
            <rect
              key={row.y}
              x={16}
              y={row.y}
              width={72}
              height={15}
              rx={4}
              fill={row.c}
              opacity={0.85}
              stroke={i === 1 ? C.garnet : "none"}
              strokeWidth={i === 1 ? 1.5 : 0}
            />
          ))}
          <rect x={100} y={40} width={204} height={108} rx={8} fill={C.subtle} stroke={C.line} />
          <rect x={112} y={52} width={120} height={7} rx={3.5} fill={C.slate} />
          <rect x={112} y={68} width={180} height={6} rx={3} fill={C.line} />
          <rect x={112} y={82} width={160} height={6} rx={3} fill={C.line} />
          <rect x={112} y={124} width={54} height={14} rx={7} fill={C.surface} stroke={C.garnet} />
          <rect x={176} y={124} width={54} height={14} rx={7} fill={C.surface} stroke={C.garnet} />
        </>
      );
    case "cohort":
      return (
        <>
          <rect x={16} y={32} width={42} height={14} rx={7} fill={C.garnet} />
          <rect x={64} y={32} width={42} height={14} rx={7} fill={C.subtle} stroke={C.line} />
          <rect x={112} y={32} width={42} height={14} rx={7} fill={C.subtle} stroke={C.line} />
          <rect x={250} y={32} width={54} height={14} rx={7} fill={C.surface} stroke={C.garnet} />
          <rect x={16} y={56} width={288} height={14} rx={4} fill={C.subtle} />
          {[74, 90, 106, 122].map((y, i) => (
            <rect key={y} x={16} y={y} width={288} height={14} rx={3} fill={i % 2 ? C.surface : C.subtle} opacity={0.7} stroke={C.line} />
          ))}
          {[80, 150, 210, 260].map((x) => (
            <line key={x} x1={x} y1={56} x2={x} y2={136} stroke={C.line} />
          ))}
        </>
      );
    case "studio":
      return (
        <>
          {[60, 90, 120].map((y, i) => (
            <g key={y}>
              <line x1={36} y1={y} x2={150} y2={y} stroke={C.slate} strokeWidth={3} strokeLinecap="round" />
              <circle cx={36 + [54, 34, 78][i]!} cy={y} r={6} fill={C.garnet} />
            </g>
          ))}
          <path d="M 188 132 A 46 46 0 0 1 280 132" fill="none" stroke={C.slate} strokeWidth={8} strokeLinecap="round" />
          <path d="M 188 132 A 46 46 0 0 1 234 86" fill="none" stroke={C.garnet} strokeWidth={8} strokeLinecap="round" />
          <line x1={234} y1={132} x2={258} y2={104} stroke={C.ink} strokeWidth={2} strokeLinecap="round" />
          <circle cx={234} cy={132} r={4} fill={C.ink} />
          <rect x={42} y={142} width={56} height={14} rx={7} fill={C.subtle} stroke={C.line} />
        </>
      );
    case "assistant":
      return (
        <>
          <rect x={40} y={34} width={240} height={120} rx={10} fill={C.surface} stroke={C.line} />
          <rect x={52} y={46} width={120} height={18} rx={9} fill={C.subtle} />
          <rect x={150} y={70} width={118} height={16} rx={8} fill={C.garnet} opacity={0.16} />
          {[52, 108, 164].map((x) => (
            <rect key={x} x={x} y={96} width={50} height={13} rx={6.5} fill={C.subtle} stroke={C.line} />
          ))}
          <rect x={52} y={132} width={180} height={16} rx={8} fill={C.subtle} stroke={C.line} />
          <circle cx={246} cy={140} r={7} fill={C.garnet} />
          <circle cx={286} cy={150} r={14} fill={C.garnet} />
          <path d="M 281 150 l 10 0 M 286 145 l 0 10" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
        </>
      );
    case "library":
      return (
        <>
          <rect x={150} y={32} width={158} height={16} rx={8} fill={C.surface} stroke={C.line} />
          <circle cx={162} cy={40} r={4} fill="none" stroke={C.muted} strokeWidth={1.5} />
          {[
            { x: 40, h: 30 },
            { x: 62, h: 54 },
            { x: 84, h: 40 },
            { x: 106, h: 64 },
            { x: 128, h: 48 },
          ].map((b, i) => (
            <rect key={b.x} x={b.x} y={130 - b.h} width={16} height={b.h} rx={3} fill={[C.blue, C.garnet, C.sand, C.green, C.purple][i]} opacity={0.85} />
          ))}
          {[70, 88, 106, 124].map((y) => (
            <rect key={y} x={170} y={y} width={134} height={12} rx={3} fill={C.subtle} stroke={C.line} />
          ))}
        </>
      );
    case "operator-shell":
      return (
        <>
          <rect x={12} y={30} width={62} height={140} rx={8} fill={C.subtle} stroke={C.line} />
          {[42, 58, 74, 90, 106].map((y, i) => (
            <rect key={y} x={20} y={y} width={46} height={9} rx={4.5} fill={i === 0 ? C.garnet : C.slate} opacity={i === 0 ? 1 : 0.7} />
          ))}
          <rect x={82} y={30} width={226} height={16} rx={6} fill={C.garnet} opacity={0.85} />
          <rect x={90} y={35} width={120} height={6} rx={3} fill="#fff" opacity={0.8} />
          {[82, 156, 230].map((x) => (
            <rect key={x} x={x} y={54} width={68} height={40} rx={6} fill={C.surface} stroke={C.line} />
          ))}
          <rect x={82} y={104} width={226} height={56} rx={6} fill={C.subtle} stroke={C.line} />
          <rect x={238} y={150} width={64} height={16} rx={8} fill={C.surface} stroke={C.garnet} />
        </>
      );
    case "operator-topbar":
      return (
        <>
          <rect x={12} y={34} width={296} height={26} rx={10} fill={C.surface} stroke={C.line} />
          <rect x={36} y={40} width={120} height={14} rx={7} fill={C.subtle} stroke={C.line} />
          <circle cx={48} cy={47} r={4} fill="none" stroke={C.muted} strokeWidth={1.5} />
          <rect x={186} y={40} width={42} height={14} rx={7} fill={C.subtle} />
          <rect x={234} y={40} width={26} height={14} rx={7} fill={C.subtle} />
          <rect x={266} y={40} width={42} height={14} rx={7} fill={C.garnet} />
          <rect x={12} y={70} width={180} height={42} rx={8} fill={C.subtle} stroke={C.line} />
          <rect x={200} y={70} width={108} height={42} rx={8} fill={C.subtle} stroke={C.line} />
          <rect x={12} y={120} width={296} height={40} rx={8} fill={C.subtle} stroke={C.line} />
        </>
      );
    default:
      return null;
  }
}

export function HowToFigure({ kind, pins, activeN, onHover }: HowToFigureProps) {
  return (
    <svg
      className={styles.figureScene}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      role="group"
      aria-label="Annotated schematic of the described surface"
      preserveAspectRatio="xMidYMid meet"
    >
      <Frame />
      <Scene kind={kind} />
      {pins.map((pin) => {
        const sx = (pin.x / 100) * VB_W;
        const sy = (pin.y / 100) * VB_H;
        const active = activeN === pin.n;
        const flip = sx > VB_W * 0.7;
        const labelX = flip ? sx - 14 : sx + 14;
        const labelW = pin.label.length * 5.4 + 10;
        const labelRectX = flip ? labelX - labelW + 4 : labelX - 4;
        return (
          <g
            key={pin.n}
            className={styles.pinGroup}
            tabIndex={0}
            role="img"
            aria-label={`${pin.n}. ${pin.label}`}
            onMouseEnter={() => onHover(pin.n)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(pin.n)}
            onBlur={() => onHover(null)}
          >
            {active && <circle className={styles.pinPulse} cx={sx} cy={sy} r={9} fill={C.garnet} opacity={0.4} />}
            <rect
              x={labelRectX}
              y={sy - 8}
              width={labelW}
              height={16}
              rx={8}
              fill={C.surface}
              stroke={active ? C.garnet : C.line}
              opacity={active ? 1 : 0.92}
            />
            <text
              x={labelX}
              y={sy + 3.5}
              textAnchor={flip ? "end" : "start"}
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, fill: C.garnet }}
            >
              {pin.label}
            </text>
            <circle cx={sx} cy={sy} r={active ? 10 : 9} fill={C.garnet} stroke="#fff8f3" strokeWidth={1.5} />
            <text
              x={sx}
              y={sy + 3.2}
              textAnchor="middle"
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, fill: "#fff8f3" }}
            >
              {pin.n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
