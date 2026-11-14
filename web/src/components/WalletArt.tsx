import { motion, useReducedMotion } from "motion/react";
import { Coin } from "./ui";

const STAR = "M0 -26 C3 -6 6 -3 26 0 C6 3 3 6 0 26 C-3 6 -6 3 -26 0 C-6 -3 -3 -6 0 -26Z";

function Stub({ name, bg, rot, left, bottom, delay }: { name: string; bg: string; rot: number; left: string; bottom: number; delay: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="stub"
      style={{ left, bottom, background: bg }}
      initial={reduce ? false : { y: 120, rotate: 0, opacity: 0 }}
      animate={{ y: 0, rotate: rot, opacity: 1 }}
      whileHover={{ y: -14, rotate: rot * 0.4 }}
      transition={{ type: "spring", stiffness: 180, damping: 13, delay }}
    >
      <div style={{ flex: 1 }}>
        <p className="stub-name">{name}</p>
        <p className="stub-sub">Admit one</p>
      </div>
      <span className="stub-tear" aria-hidden="true" />
      <svg width="24" height="24" viewBox="-30 -30 60 60" aria-hidden="true">
        <path d={STAR} fill="#000" />
      </svg>
    </motion.div>
  );
}

// Hero illustration: a wallet with tickets popping out of it, and a couple of coins.
export function WalletArt({ height = 420 }: { height?: number }) {
  return (
    <div className="art-box wallet-art" style={{ height }} role="img" aria-label="A wallet with three tickets popping out of it">
      <div className="wallet-stripe" aria-hidden="true" />
      <motion.div className="wallet-coin" style={{ left: "6%", top: "7%" }} drag dragSnapToOrigin whileHover={{ rotate: 20, scale: 1.08 }}>
        <Coin size={78} tilt={-18} />
      </motion.div>
      <motion.div className="wallet-coin" style={{ right: "7%", top: "11%" }} drag dragSnapToOrigin whileHover={{ rotate: -20, scale: 1.08 }}>
        <Coin size={58} tilt={22} />
      </motion.div>
      <Stub name="Sunset Sessions" bg="#ffd43b" rot={-15} left="6%" bottom={170} delay={0.15} />
      <Stub name="Rooftop Nights" bg="#ff5a36" rot={3} left="28%" bottom={195} delay={0.3} />
      <Stub name="Sundowner" bg="#e3c6ff" rot={18} left="48%" bottom={160} delay={0.45} />
      <svg className="wallet" width="300" height="190" viewBox="0 0 300 190" aria-hidden="true">
        <rect x="10" y="16" width="280" height="168" rx="26" fill="#000" />
        <rect x="4" y="8" width="280" height="168" rx="26" fill="#2440ff" stroke="#000" strokeWidth="5" />
        <path d="M4 64 H284" stroke="#000" strokeWidth="4" />
        <rect x="180" y="74" width="110" height="64" rx="18" fill="#8ec5ff" stroke="#000" strokeWidth="5" />
        <circle cx="214" cy="106" r="18" fill="#ffd43b" stroke="#000" strokeWidth="4" />
        <path transform="translate(214 106) scale(.5)" d={STAR} fill="#000" />
        <path d="M30 140 H120" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
