// Flat skyline silhouettes for each place. Decorative: the text next to them names the place.
export type Scene = "longstreet" | "braamfontein" | "floridaroad" | "waterfront" | "maboneng" | "goldenmile";

const INK = "#101330";

const bg: Record<Scene, string> = {
  longstreet: "#2440ff",
  braamfontein: "#ffc93c",
  floridaroad: "#e7eaff",
  waterfront: "#e7eaff",
  maboneng: "#2440ff",
  goldenmile: "#ffc93c",
};

function Sun({ cx, cy, r, color = "#ffc93c" }: { cx: number; cy: number; r: number; color?: string }) {
  return <circle cx={cx} cy={cy} r={r} fill={color} />;
}

export function CityArt({ scene }: { scene: Scene }) {
  return (
    <svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMax slice" width="100%" height="100%" aria-hidden="true" style={{ display: "block", background: bg[scene] }}>
      {scene === "longstreet" && (
        <>
          <Sun cx={320} cy={46} r={26} />
          {/* Table Mountain, Devil's Peak, Lion's Head */}
          <path d="M0 108 L22 80 L36 60 L48 80 L74 72 L98 52 L262 50 L284 66 L312 74 Q334 34 358 62 L400 80 V160 H0Z" fill="#1626b8" />
          <g fill={INK}>
            <rect x="0" y="96" width="120" height="70" />
            <rect x="128" y="84" width="112" height="80" />
            <rect x="248" y="100" width="152" height="60" />
          </g>
          <g stroke="#ffc93c" strokeWidth="2">
            <path d="M0 116 H120 M128 104 H240 M248 120 H400" />
            <path d="M10 116 V140 M40 116 V140 M70 116 V140 M100 116 V140 M150 104 V128 M190 104 V128 M230 104 V128 M270 120 V144 M320 120 V144 M370 120 V144" strokeWidth="1.5" />
          </g>
          <rect x="300" y="132" width="22" height="28" fill="#ffc93c" />
        </>
      )}
      {scene === "braamfontein" && (
        <>
          <g fill={INK}>
            <rect x="0" y="62" width="64" height="98" />
            <rect x="64" y="30" width="56" height="130" />
            {/* Hillbrow Tower */}
            <rect x="336" y="20" width="10" height="140" />
            <rect x="326" y="34" width="30" height="16" rx="4" />
            <rect x="288" y="74" width="40" height="86" />
            <rect x="356" y="86" width="44" height="74" />
          </g>
          {/* Nelson Mandela Bridge */}
          <g stroke={INK} strokeWidth="2">
            <path d="M200 34 V150" strokeWidth="5" />
            <path d="M200 38 L140 132 M200 38 L160 132 M200 38 L180 132 M200 38 L220 132 M200 38 L240 132 M200 38 L260 132" />
          </g>
          <rect x="128" y="130" width="148" height="6" fill={INK} />
          <g fill="#2440ff">
            <circle cx="10" cy="56" r="3" />
            <circle cx="24" cy="60" r="3" />
            <circle cx="38" cy="61" r="3" />
            <circle cx="52" cy="58" r="3" />
          </g>
        </>
      )}
      {scene === "floridaroad" && (
        <>
          <Sun cx={70} cy={40} r={22} color="#ffc93c" />
          {/* Moses Mabhida arch in the distance */}
          <path d="M150 112 Q260 -10 370 112" stroke="#2440ff" strokeWidth="6" fill="none" />
          <g fill={INK}>
            <path d="M0 104 L70 80 L140 104 V160 H0Z" />
            <path d="M150 110 L260 86 L380 110 V160 H150Z" />
          </g>
          <path d="M0 124 H140 M150 128 H380" stroke="#ffc93c" strokeWidth="2.5" />
          {/* Palms */}
          <g stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round">
            <path d="M110 160 Q116 110 124 70" />
            <path d="M124 70 Q102 62 88 76 M124 70 Q140 52 160 54 M124 70 Q146 74 156 90 M124 70 Q118 50 128 36" strokeWidth="4" />
            <path d="M390 160 Q386 118 378 84" />
            <path d="M378 84 Q358 76 346 90 M378 84 Q392 68 400 66" strokeWidth="4" />
          </g>
        </>
      )}
      {scene === "waterfront" && (
        <>
          <path d="M0 96 L22 74 L36 58 L48 74 L74 68 L98 50 L262 48 L284 62 L400 82 V160 H0Z" fill="#c9cff7" />
          {/* Clock tower */}
          <g fill={INK}>
            <path d="M100 66 L118 40 L136 66Z" />
            <rect x="104" y="66" width="28" height="64" />
            <rect x="0" y="108" width="96" height="22" />
            <rect x="142" y="112" width="80" height="18" />
          </g>
          <circle cx="118" cy="82" r="6" fill="#ffc93c" />
          {/* Wheel */}
          <g stroke={INK} strokeWidth="3" fill="none">
            <circle cx="312" cy="78" r="48" />
            <path d="M312 30 V126 M264 78 H360 M278 44 L346 112 M346 44 L278 112" strokeWidth="1.5" />
            <path d="M312 78 L288 130 M312 78 L336 130" strokeWidth="4" />
          </g>
          <rect x="0" y="130" width="400" height="30" fill="#2440ff" />
          <path d="M20 142 H70 M180 148 H240 M300 140 H350" stroke="#ffc93c" strokeWidth="2.5" />
        </>
      )}
      {scene === "maboneng" && (
        <>
          {/* Ponte City */}
          <rect x="268" y="10" width="64" height="150" fill={INK} />
          <rect x="268" y="10" width="64" height="14" fill="#ffc93c" />
          <g stroke="#2440ff" strokeWidth="2">
            <path d="M268 50 H332 M268 76 H332 M268 102 H332 M268 128 H332" />
          </g>
          {/* Saw-tooth warehouses */}
          <path d="M0 84 L30 62 V84 L60 62 V84 L90 62 V84 L120 62 V84 L150 62 V84 L180 62 V84 V160 H0Z" fill={INK} />
          <circle cx="60" cy="128" r="18" fill="#ffc93c" />
          <path d="M104 146 L130 106 L156 146Z" fill="#e7eaff" />
          <rect x="196" y="96" width="70" height="64" fill={INK} />
          <rect x="336" y="92" width="64" height="68" fill={INK} />
        </>
      )}
      {scene === "goldenmile" && (
        <>
          <path d="M10 112 Q90 26 170 112" stroke="#2440ff" strokeWidth="5" fill="none" />
          <g fill={INK}>
            <rect x="180" y="40" width="40" height="80" />
            <rect x="222" y="62" width="44" height="58" />
            <rect x="268" y="30" width="42" height="90" />
            <rect x="312" y="70" width="88" height="50" />
          </g>
          <rect x="0" y="120" width="400" height="16" fill="#fff4d1" />
          <rect x="0" y="136" width="400" height="24" fill="#2440ff" />
          <path d="M0 146 Q20 140 40 146 T80 146 T120 146 T160 146 T200 146 T240 146 T280 146 T320 146 T360 146 T400 146" stroke="#e7eaff" strokeWidth="2" fill="none" />
          <g stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round">
            <path d="M60 136 Q66 92 76 60" />
            <path d="M76 60 Q54 52 40 66 M76 60 Q94 42 112 44 M76 60 Q98 64 110 78" strokeWidth="4" />
          </g>
        </>
      )}
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
