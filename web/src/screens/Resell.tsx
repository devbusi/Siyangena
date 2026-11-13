import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Listing } from "@drop/shared";
import { AnimatePresence, motion } from "motion/react";
import { Button, Coin, Enter, TopBar } from "../components/ui";
import { api } from "../lib/api";
import { rand } from "../lib/format";
import { useApp } from "../lib/store";
import { useAuth } from "../lib/auth";
import { useEvent } from "./EventPage";

const STEPS = [
  { key: "open", label: "Listed for resale" },
  { key: "signing", label: "A verified ticket holder wants it" },
  { key: "settled", label: "Swapped and paid" },
];

export function Resell() {
  const { eventId } = useParams();
  const [drop] = useEvent(eventId);
  const { me } = useAuth();
  const fanId = me?.id ?? "";
  const { tick } = useApp();
  const face = Number(drop?.priceZar ?? 1200);
  const cap = Number(drop?.resaleCapZar ?? face);
  const feePct = drop?.resaleFeePct ?? 5;
  const [price, setPrice] = useState(String(face));
  const [started, setStarted] = useState(false);
  const [tickets, setTickets] = useState(0);
  const [error, setError] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [before, setBefore] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!eventId) return;
    api.tickets(eventId).then((t) => setTickets(t.count)).catch(() => setTickets(0));
    api
      .listings(eventId)
      .then((all) => {
        const mine = all.filter((l) => l.sellerFanId === fanId && !before.has(l.id));
        setListing(mine[mine.length - 1] ?? null);
      })
      .catch(() => undefined);
  }, [fanId, eventId, tick, before]);

  const n = Number(price.replace(/[^\d.]/g, "")) || 0;
  const over = n > cap;
  const fee = Math.round(n * feePct) / 100;

  const reached = started && listing ? STEPS.findIndex((s) => s.key === listing.status) : -1;
  const done = reached === STEPS.length - 1;

  async function list() {
    setError("");
    try {
      const existing = await api.listings(eventId!).catch(() => [] as Listing[]);
      setBefore(new Set(existing.map((l) => l.id)));
      setStarted(true);
      await api.resell(eventId!, n);
    } catch (e) {
      setStarted(false);
      setError(e instanceof Error ? e.message : "Couldn't list your ticket");
    }
  }

  return (
    <>
      <div className="phone">
        <TopBar back="/tickets" />
        <Enter>
          <h1 style={{ margin: "10px 0 8px" }}>{done ? "Sold!" : "Can't go?"}</h1>
          <p className="muted">
            {done
              ? `${rand(n)} is in your wallet. The ticket went to a verified ticket holder.`
              : "Your agent sells it to a verified ticket holder on the waiting list. You get paid the moment the ticket moves."}
          </p>
        </Enter>

        <AnimatePresence mode="wait">
          {!started ? (
            <motion.div key="form" exit={{ opacity: 0, y: -10 }}>
              <Enter delay={0.06}>
                <div className="stack" style={{ marginTop: 20 }}>
                  <div className="field">
                    <label htmlFor="price">Your price</label>
                    <div className="input-money" style={over ? { boxShadow: "0 0 0 3px var(--coral)" } : undefined}>
                      <span>R</span>
                      <input id="price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} aria-describedby="cap-note" />
                    </div>
                    <p id="cap-note" className={over ? "" : "faint"} style={over ? { color: "#b3270b", fontWeight: 700 } : undefined}>
                      {over ? `The promoter caps resale at ${rand(cap)} for this event. Lower your price to list.` : `The promoter set the cap for this event at ${rand(cap)}. Face value was ${rand(face)}.`}
                    </p>
                  </div>
                  <div className="panel breakdown">
                    <div className="row">
                      <span>You get</span>
                      <span className="num">{rand(n)}</span>
                    </div>
                    <div className="row muted">
                      <span>Promoter fee, paid by the buyer ({feePct}%)</span>
                      <span className="num">{rand(fee, true)}</span>
                    </div>
                    <div className="row total">
                      <span>Buyer pays</span>
                      <span className="num">{rand(n + fee, true)}</span>
                    </div>
                  </div>
                  {tickets === 0 && <p className="callout callout-sun">You don't have a ticket to sell yet.</p>}
                  {error && (
                    <p role="alert" className="callout callout-blocked">
                      {error}
                    </p>
                  )}
                </div>
              </Enter>
            </motion.div>
          ) : (
            <motion.div key="progress" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="stack" style={{ marginTop: 22 }}>
              <div style={{ display: "grid", placeItems: "center", padding: "8px 0" }}>
                <motion.div
                  animate={done ? { rotateY: 0, scale: [1, 1.15, 1] } : { rotateY: [0, 360] }}
                  transition={done ? { duration: 0.5 } : { duration: 1.6, repeat: Infinity, ease: "linear" }}
                >
                  <Coin size={110} face={done ? "#56db9c" : "#ffd43b"} />
                </motion.div>
              </div>
              {listing?.status === "refused" && <p className="callout callout-blocked">The promoter refused this resale. Your ticket is still yours.</p>}
              <div className="panel">
              <ol className="steps" aria-live="polite">
                {STEPS.map((s, i) => (
                  <li key={s.key} className={i <= reached ? "done" : i === reached + 1 ? "now" : ""}>
                    <span className="step-dot" aria-hidden="true">
                      {i <= reached && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    {s.label}
                  </li>
                ))}
              </ol>
              </div>
              <p className="faint" style={{ textAlign: "center" }}>
                The ticket and the money swap in one step. If either side fails, nothing moves.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {!started && (
        <div className="bottom-bar">
          <div className="bottom-bar-inner">
            <Button block disabled={over || n <= 0 || tickets === 0} onClick={list}>
              List my ticket at {rand(n)}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
