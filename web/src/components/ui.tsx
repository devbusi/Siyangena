import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useApp, type Persona } from "../lib/store";
import type { Tone } from "../lib/format";

const spring = { type: "spring" as const, stiffness: 520, damping: 22 };

type Variant = "primary" | "sun" | "ghost";

// Flat outlined pill, like Slush: hover swaps the fill (CSS, hover devices only), tap gives a quick squash.
export function Button({
  variant = "primary",
  block,
  className = "",
  ...props
}: HTMLMotionProps<"button"> & { variant?: Variant; block?: boolean }) {
  return (
    <motion.button
      whileTap={props.disabled ? undefined : { scale: 0.95 }}
      transition={spring}
      className={`btn btn-${variant} ${block ? "btn-block" : ""} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({ to, variant = "primary", children }: { to: string; variant?: Variant; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <Button variant={variant} block onClick={() => navigate(to)}>
      {children}
    </Button>
  );
}

// Kept so older screens compile; the soft background bubbles are gone.
export function Spheres(_: { variant?: "hero" | "calm" }) {
  return null;
}

const STAR = "M0 -26 C3 -6 6 -3 26 0 C6 3 3 6 0 26 C-3 6 -6 3 -26 0 C-6 -3 -3 -6 0 -26Z";

// A flat, outlined token with a thick dark edge, like a coin seen at an angle.
export function Coin({ size = 120, face = "#ffd43b", tilt = 0 }: { size?: number; face?: string; tilt?: number }) {
  return (
    <svg width={size} height={size} viewBox="-60 -60 120 120" aria-hidden="true" style={{ overflow: "visible" }}>
      <g transform={`rotate(${tilt})`}>
        <ellipse cx="5" cy="8" rx="50" ry="50" fill="#000" />
        <ellipse cx="0" cy="0" rx="50" ry="50" fill={face} stroke="#000" strokeWidth="4" />
        <ellipse cx="0" cy="0" rx="39" ry="39" fill="none" stroke="#000" strokeWidth="3" />
        <path d={STAR} fill="#000" />
      </g>
    </svg>
  );
}

// Striped field of tumbling coins. The hero illustration.
export function CoinField({ height = 220, bg = "#56db9c", stripe = "#c9f3df" }: { height?: number; bg?: string; stripe?: string }) {
  const reduce = useReducedMotion();
  const coins = [
    { x: "4%", y: "8%", s: 78, t: -18, d: 0 },
    { x: "34%", y: "-14%", s: 112, t: 12, d: 0.4 },
    { x: "72%", y: "4%", s: 90, t: 28, d: 0.8 },
    { x: "18%", y: "52%", s: 96, t: -30, d: 0.2 },
    { x: "58%", y: "50%", s: 120, t: 8, d: 0.6 },
    { x: "-6%", y: "70%", s: 70, t: 40, d: 1 },
  ];
  return (
    <div className="art-box" style={{ height, background: bg }} aria-hidden="true">
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }} preserveAspectRatio="none" viewBox="0 0 100 100">
        <polygon points="0,30 100,78 100,100 0,52" fill={stripe} />
        <polygon points="0,-10 60,-10 0,18" fill={stripe} />
      </svg>
      {coins.map((c, i) => (
        <motion.div
          key={i}
          style={{ position: "absolute", left: c.x, top: c.y }}
          initial={reduce ? false : { y: -height - 60, rotate: c.t - 60 }}
          animate={{ y: 0, rotate: c.t }}
          transition={{ type: "spring", stiffness: 140, damping: 13, delay: c.d * 0.5 }}
        >
          <motion.div
            animate={reduce ? undefined : { y: [0, -7, 0] }}
            transition={{ duration: 3.6 + i * 0.5, repeat: Infinity, ease: "easeInOut", delay: 1.2 + c.d }}
          >
            <Coin size={c.s} />
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}

export function Ticker({ items }: { items: string[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="ticker" role="marquee" aria-label={items.join(". ")}>
      <div className="ticker-track" aria-hidden="true">
        {doubled.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </div>
  );
}

const PERSONAS: { id: Persona; label: string }[] = [
  { id: "thandi", label: "Thandi" },
  { id: "sipho", label: "Sipho" },
  { id: "promoter", label: "Promoter" },
];

export function TopBar({ back }: { back?: string }) {
  return (
    <header className="topbar">
      {back ? (
        <Link to={back} className="back-link" aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
      ) : (
        <Link to="/events" className="wordmark">
          <span className="wordmark-mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="-30 -30 60 60">
              <path d={STAR} fill="#000" />
            </svg>
          </span>
          Siyangena
        </Link>
      )}
    </header>
  );
}

// Demo control that sits on the sky outside the app frame: switch who you're looking at.
export function DemoBar() {
  const { persona, setPersona } = useApp();
  const navigate = useNavigate();
  const onDesk = useLocation().pathname.startsWith("/promoter");
  const shown = onDesk ? "promoter" : persona === "promoter" ? "thandi" : persona;
  return (
    <div className="demobar">
      <span>Viewing as</span>
      <div className="personas" role="group" aria-label="Viewing as">
        {PERSONAS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={shown === p.id}
            onClick={() => {
              setPersona(p.id);
              navigate(p.id === "promoter" ? "/promoter" : p.id === "sipho" ? "/live" : "/event");
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// One orchestrated entrance per screen: children rise in sequence.
export function Enter({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26, delay }}
    >
      {children}
    </motion.div>
  );
}

export function FeedRow({ title, detail, tone, at, receipt }: { title: string; detail: string; tone: Tone; at: string; receipt?: string }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className={`feed-item tone-${tone}`}
    >
      <span className="feed-dot" aria-hidden="true" />
      <span className="feed-title">
        {title}
        {tone === "blocked" && <span className="tag">Blocked</span>}
      </span>
      {detail && <span className="feed-detail">{detail}</span>}
      <span className="feed-meta">
        <span className="num">{at}</span>
        {receipt && (
          <a href={receipt} target="_blank" rel="noreferrer">
            Receipt
          </a>
        )}
      </span>
    </motion.li>
  );
}

export function Ticket({ name, line, label }: { name: string; line: string; label: string }) {
  return (
    <div className="ticket">
      <div>
        <h3>{name}</h3>
        <p style={{ fontWeight: 600 }}>{line}</p>
      </div>
      <div className="ticket-qr" aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 7 7" shapeRendering="crispEdges">
          <g fill="#fff">
            <rect x="0" y="0" width="3" height="3" />
            <rect x="4" y="0" width="3" height="3" />
            <rect x="0" y="4" width="3" height="3" />
            <rect x="4" y="4" width="1" height="1" />
            <rect x="6" y="5" width="1" height="2" />
            <rect x="3" y="3" width="1" height="1" />
          </g>
        </svg>
      </div>
      <div className="perf" />
      <p style={{ fontWeight: 700 }}>{label}</p>
      <p style={{ fontWeight: 600, textAlign: "right" }}>Guaranteed real</p>
    </div>
  );
}
