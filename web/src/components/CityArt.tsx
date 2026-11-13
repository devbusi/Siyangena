// Flat, outlined scenes for each place, drawn in the app's style: black outlines, bright fills,
// every landmark whole inside the frame. Decorative: the text next to them names the place.
import type { ReactNode } from "react";

export type Scene = "longstreet" | "braamfontein" | "floridaroad" | "waterfront" | "maboneng" | "goldenmile";

const K = "#000";
const C = {
  sky: "#8ec5ff",
  cobalt: "#2440ff",
  sun: "#ffd43b",
  mint: "#56db9c",
  coral: "#ff5a36",
  lilac: "#e3c6ff",
  pink: "#ff9ecb",
  white: "#ffffff",
  sand: "#ffe9a8",
};

const line = { stroke: K, strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

function Sun({ x, y, r = 18 }: { x: number; y: number; r?: number }) {
  return <circle cx={x} cy={y} r={r} fill={C.sun} {...line} />;
}

function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 14 Q0 2 12 4 Q16 -6 28 -2 Q38 -6 42 4 Q54 4 52 14 Z"
      fill={C.white}
      {...line}
    />
  );
}

function Palm({ x, y, h = 70, lean = 6 }: { x: number; y: number; h?: number; lean?: number }) {
  const tx = x + lean;
  const ty = y - h;
  return (
    <g>
      <path d={`M${x - 3} ${y} Q${x + lean / 2} ${y - h / 2} ${tx - 2} ${ty} L${tx + 3} ${ty} Q${x + lean / 2 + 4} ${y - h / 2} ${x + 4} ${y} Z`} fill="#c98a4a" {...line} />
      {[
        `M${tx} ${ty} Q${tx - 18} ${ty - 14} ${tx - 34} ${ty + 4} Q${tx - 16} ${ty - 4} ${tx} ${ty}`,
        `M${tx} ${ty} Q${tx + 18} ${ty - 16} ${tx + 36} ${ty + 2} Q${tx + 16} ${ty - 4} ${tx} ${ty}`,
        `M${tx} ${ty} Q${tx - 6} ${ty - 24} ${tx - 22} ${ty - 30} Q${tx - 4} ${ty - 16} ${tx} ${ty}`,
        `M${tx} ${ty} Q${tx + 8} ${ty - 24} ${tx + 24} ${ty - 28} Q${tx + 6} ${ty - 14} ${tx} ${ty}`,
      ].map((d, i) => (
        <path key={i} d={d} fill={C.mint} {...line} />
      ))}
    </g>
  );
}

function Windows({ x, y, cols, rows, w = 10, h = 12, gx = 8, gy = 8, fill = C.white }: { x: number; y: number; cols: number; rows: number; w?: number; h?: number; gx?: number; gy?: number; fill?: string }) {
  const out: ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) out.push(<rect key={`${r}-${c}`} x={x + c * (w + gx)} y={y + r * (h + gy)} width={w} height={h} rx={2} fill={fill} stroke={K} strokeWidth={2} />);
  return <g>{out}</g>;
}

function LongStreet() {
  return (
    <>
      <rect width="400" height="160" fill={C.sky} />
      <Sun x={340} y={34} />
      <Cloud x={40} y={22} s={0.8} />
      {/* Table Mountain with Devil's Peak on the left and Lion's Head on the right */}
      <path d="M-4 112 L34 70 L52 52 L68 72 L96 58 L116 44 L270 42 L290 58 L318 68 Q334 40 354 50 Q366 58 372 72 L404 98 V120 H-4 Z" fill={C.mint} {...line} />
      <path d="M120 52 L262 50" stroke={K} strokeWidth={2} />
      {/* Victorian shopfronts with cast-iron balconies */}
      {[
        { x: 14, w: 88, top: 78, fill: C.coral },
        { x: 102, w: 78, top: 66, fill: C.lilac },
        { x: 180, w: 92, top: 82, fill: C.sun },
        { x: 272, w: 70, top: 70, fill: C.pink },
        { x: 342, w: 50, top: 86, fill: C.white },
      ].map((b) => (
        <g key={b.x}>
          <rect x={b.x} y={b.top} width={b.w} height={148 - b.top} fill={b.fill} {...line} />
          <rect x={b.x - 3} y={b.top - 6} width={b.w + 6} height={6} fill={K} />
          <Windows x={b.x + 10} y={b.top + 8} cols={Math.max(2, Math.floor((b.w - 10) / 22))} rows={1} w={12} h={16} gx={10} />
          <rect x={b.x - 2} y={116} width={b.w + 4} height={5} fill={K} />
          {Array.from({ length: Math.floor(b.w / 18) + 1 }).map((_, i) => (
            <path key={i} d={`M${b.x + 4 + i * 18} 121 V148`} stroke={K} strokeWidth={2} />
          ))}
          <path d={`M${b.x + b.w / 2 - 9} 148 V134 Q${b.x + b.w / 2} 124 ${b.x + b.w / 2 + 9} 134 V148 Z`} fill={K} />
        </g>
      ))}
      <rect x="-4" y="148" width="408" height="16" fill="#3a3a3a" {...line} />
      <path d="M20 156 H50 M90 156 H120 M160 156 H190 M230 156 H260 M300 156 H330 M370 156 H400" stroke={C.sun} strokeWidth={3} />
    </>
  );
}

function Braamfontein() {
  return (
    <>
      <rect width="400" height="160" fill={C.lilac} />
      <Sun x={60} y={34} />
      {/* City behind */}
      <rect x="18" y="64" width="44" height="74" fill={C.cobalt} {...line} />
      <rect x="62" y="80" width="36" height="58" fill={C.white} {...line} />
      <Windows x={26} y={72} cols={2} rows={3} w={10} h={10} gx={8} gy={8} fill={C.sun} />
      <rect x="296" y="76" width="38" height="62" fill={C.coral} {...line} />
      {/* Hillbrow Tower */}
      <rect x="350" y="26" width="12" height="112" fill={C.white} {...line} />
      <rect x="338" y="34" width="36" height="16" rx="6" fill={C.sun} {...line} />
      <rect x="342" y="56" width="28" height="8" rx="3" fill={C.white} {...line} />
      <path d="M356 26 V12" {...line} />
      {/* Nelson Mandela Bridge: two pylons, fanned cables, long deck over the rail yard */}
      <g fill="none" stroke={K} strokeWidth={2}>
        {[-1, 1].flatMap((dir) => [20, 40, 60, 80].map((d) => <path key={`a${dir}${d}`} d={`M160 40 L${160 + dir * d} 118`} />))}
        {[-1, 1].flatMap((dir) => [16, 32, 48].map((d) => <path key={`b${dir}${d}`} d={`M250 66 L${250 + dir * d} 118`} />))}
      </g>
      <path d="M155 138 L157 40 H163 L165 138 Z" fill={C.white} {...line} />
      <path d="M246 138 L247 66 H253 L254 138 Z" fill={C.white} {...line} />
      <rect x="60" y="116" width="270" height="9" rx="2" fill={C.coral} {...line} />
      {/* Rail yard */}
      <rect x="-4" y="138" width="408" height="26" fill={C.mint} {...line} />
      <path d="M-4 148 H404 M-4 156 H404" stroke={K} strokeWidth={2} />
      {Array.from({ length: 21 }).map((_, i) => (
        <path key={i} d={`M${i * 20} 146 V158`} stroke={K} strokeWidth={2} />
      ))}
    </>
  );
}

function FloridaRoad() {
  return (
    <>
      <rect width="400" height="160" fill={C.sun} />
      <Cloud x={300} y={20} s={0.8} />
      {/* Moses Mabhida Stadium in the distance */}
      <path d="M150 112 Q236 -6 330 112" fill="none" stroke={K} strokeWidth={11} strokeLinecap="round" />
      <path d="M150 112 Q236 -6 330 112" fill="none" stroke={C.white} strokeWidth={5} strokeLinecap="round" />
      <ellipse cx="240" cy="112" rx="96" ry="14" fill={C.white} {...line} />
      {/* Victorian houses with verandas */}
      {[
        { x: 20, w: 120, wall: C.white, roof: C.coral },
        { x: 236, w: 140, wall: C.mint, roof: C.cobalt },
      ].map((h) => (
        <g key={h.x}>
          <path d={`M${h.x - 6} 92 L${h.x + h.w / 2} 64 L${h.x + h.w + 6} 92 Z`} fill={h.roof} {...line} />
          <rect x={h.x} y={92} width={h.w} height={50} fill={h.wall} {...line} />
          <path d={`M${h.x - 8} 104 H${h.x + h.w + 8} L${h.x + h.w} 96 H${h.x} Z`} fill={h.roof} {...line} />
          {Array.from({ length: Math.floor(h.w / 24) + 1 }).map((_, i) => (
            <path key={i} d={`M${h.x + 4 + i * 24} 104 V142`} stroke={K} strokeWidth={2.5} />
          ))}
          <path d={`M${h.x} 122 H${h.x + h.w}`} stroke={K} strokeWidth={2} />
          <rect x={h.x + h.w / 2 - 8} y={118} width={16} height={24} fill={h.roof} stroke={K} strokeWidth={2} />
        </g>
      ))}
      <Palm x={180} y={142} h={78} lean={8} />
      <rect x="-4" y="142" width="408" height="22" fill="#3a3a3a" {...line} />
      <path d="M10 152 H40 M80 152 H110 M150 152 H180 M220 152 H250 M290 152 H320 M360 152 H390" stroke={C.white} strokeWidth={3} />
    </>
  );
}

function Waterfront() {
  return (
    <>
      <rect width="400" height="160" fill={C.sky} />
      <Sun x={236} y={30} r={16} />
      <path d="M-4 104 L30 72 L46 58 L60 74 L90 62 L108 50 L250 48 L268 62 L300 70 L404 96 V112 H-4 Z" fill={C.lilac} {...line} />
      {/* Clock Tower */}
      <path d="M60 50 L78 24 L96 50 Z" fill={C.coral} {...line} />
      <rect x="64" y="50" width="28" height="68" fill={C.coral} {...line} />
      <circle cx="78" cy="66" r="8" fill={C.white} {...line} />
      <path d="M78 66 V61 M78 66 H82" stroke={K} strokeWidth={2} />
      <rect x="10" y="96" width="54" height="22" fill={C.white} {...line} />
      <rect x="92" y="100" width="70" height="18" fill={C.sun} {...line} />
      {/* Cape Wheel */}
      <circle cx="300" cy="66" r="44" fill={C.sky} />
      <g fill="none" stroke={K} strokeWidth={2}>
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          return <path key={i} d={`M300 66 L${300 + 44 * Math.cos(a)} ${66 + 44 * Math.sin(a)}`} />;
        })}
      </g>
      <circle cx="300" cy="66" r="44" fill="none" {...line} strokeWidth={4} />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * Math.PI) / 4 + Math.PI / 8;
        const fills = [C.coral, C.sun, C.mint, C.pink];
        return <circle key={i} cx={300 + 44 * Math.cos(a)} cy={66 + 44 * Math.sin(a)} r={6} fill={fills[i % 4]} stroke={K} strokeWidth={2} />;
      })}
      <circle cx="300" cy="66" r="6" fill={C.white} {...line} />
      <path d="M300 66 L278 118 M300 66 L322 118" {...line} strokeWidth={4} />
      <rect x="-4" y="116" width="408" height="6" fill={K} />
      {/* Harbour */}
      <rect x="-4" y="122" width="408" height="42" fill={C.cobalt} {...line} />
      <path d="M20 136 q8 -6 16 0 t16 0 M150 146 q8 -6 16 0 t16 0 M330 138 q8 -6 16 0 t16 0" fill="none" stroke={C.white} strokeWidth={2.5} strokeLinecap="round" />
      <path d="M196 132 H252 L244 146 H204 Z" fill={C.white} {...line} />
      <path d="M222 132 V108 L240 128 Z" fill={C.sun} {...line} />
    </>
  );
}

function Maboneng() {
  return (
    <>
      <rect width="400" height="160" fill={C.coral} />
      <Cloud x={30} y={18} s={0.7} />
      {/* Ponte City: a cylinder tower with its crown */}
      <rect x="282" y="28" width="70" height="114" fill={C.white} {...line} />
      <ellipse cx="317" cy="28" rx="35" ry="8" fill={C.white} {...line} />
      <rect x="282" y="34" width="70" height="16" fill={C.sun} {...line} />
      {[64, 80, 96, 112, 128].map((y) => (
        <path key={y} d={`M282 ${y} Q317 ${y + 6} 352 ${y}`} fill="none" stroke={K} strokeWidth={2} />
      ))}
      {/* Saw-tooth warehouses with murals */}
      <path d="M10 142 V82 L40 64 V82 L70 64 V82 L100 64 V82 L130 64 V82 L160 64 V82 L190 64 V82 L220 64 V142 Z" fill={C.lilac} {...line} />
      <circle cx="58" cy="112" r="18" fill={C.sun} {...line} />
      <path d="M96 132 L120 94 L144 132 Z" fill={C.mint} {...line} />
      <path d="M160 100 Q176 88 192 100 Q208 112 196 128 Q180 138 166 126 Q152 114 160 100 Z" fill={C.cobalt} {...line} />
      <rect x="226" y="94" width="50" height="48" fill={C.mint} {...line} />
      <Windows x={234} y={102} cols={2} rows={2} w={12} h={12} gx={10} gy={8} />
      <rect x="358" y="88" width="36" height="54" fill={C.cobalt} {...line} />
      <rect x="-4" y="142" width="408" height="22" fill="#3a3a3a" {...line} />
      <path d="M14 152 H44 M84 152 H114 M154 152 H184 M224 152 H254 M294 152 H324 M364 152 H394" stroke={C.sun} strokeWidth={3} />
    </>
  );
}

function GoldenMile() {
  return (
    <>
      <rect width="400" height="160" fill={C.sky} />
      <Sun x={104} y={30} />
      {/* Beachfront hotels */}
      {[
        { x: 150, w: 40, top: 40, fill: C.white },
        { x: 190, w: 46, top: 58, fill: C.lilac },
        { x: 236, w: 40, top: 30, fill: C.white },
        { x: 276, w: 54, top: 52, fill: C.pink },
        { x: 330, w: 52, top: 44, fill: C.white },
      ].map((b) => (
        <g key={b.x}>
          <rect x={b.x} y={b.top} width={b.w} height={104 - b.top} fill={b.fill} {...line} />
          <Windows x={b.x + 7} y={b.top + 8} cols={2} rows={Math.floor((96 - b.top) / 16)} w={9} h={8} gx={b.w - 32} gy={8} fill={C.sky} />
        </g>
      ))}
      {/* Moses Mabhida arch behind the beach */}
      <path d="M20 104 Q80 30 140 104" fill="none" stroke={K} strokeWidth={9} strokeLinecap="round" />
      <path d="M20 104 Q80 30 140 104" fill="none" stroke={C.white} strokeWidth={4} strokeLinecap="round" />
      <rect x="-4" y="104" width="408" height="22" fill={C.sand} {...line} />
      {/* Umbrellas */}
      {[
        { x: 96, fill: C.coral },
        { x: 210, fill: C.mint },
        { x: 316, fill: C.sun },
      ].map((u) => (
        <g key={u.x}>
          <path d={`M${u.x} 104 V122`} {...line} />
          <path d={`M${u.x - 20} 106 Q${u.x} 82 ${u.x + 20} 106 Z`} fill={u.fill} {...line} />
        </g>
      ))}
      <Palm x={30} y={120} h={60} lean={-4} />
      {/* Sea */}
      <rect x="-4" y="126" width="408" height="38" fill={C.cobalt} {...line} />
      <path d="M0 138 q10 -7 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" fill="none" stroke={C.white} strokeWidth={2.5} />
    </>
  );
}

const DRAW: Record<Scene, () => ReactNode> = {
  longstreet: LongStreet,
  braamfontein: Braamfontein,
  floridaroad: FloridaRoad,
  waterfront: Waterfront,
  maboneng: Maboneng,
  goldenmile: GoldenMile,
};

export function CityArt({ scene }: { scene: Scene }) {
  const Draw = DRAW[scene];
  return (
    <svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true" style={{ display: "block" }}>
      <Draw />
    </svg>
  );
}

export const SCENES: { id: Scene; label: string; city: string }[] = [
  { id: "longstreet", label: "Long Street", city: "Cape Town" },
  { id: "braamfontein", label: "Braamfontein", city: "Johannesburg" },
  { id: "floridaroad", label: "Florida Road", city: "Durban" },
  { id: "waterfront", label: "V&A Waterfront", city: "Cape Town" },
  { id: "maboneng", label: "Maboneng", city: "Johannesburg" },
  { id: "goldenmile", label: "Golden Mile", city: "Durban" },
];
