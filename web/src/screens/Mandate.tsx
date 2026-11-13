import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Button, Enter, TopBar } from "../components/ui";
import { api } from "../lib/api";
import { rand } from "../lib/format";
import { useEvent } from "./EventPage";

export function Mandate() {
  const { id } = useParams();
  const [drop] = useEvent(id);
  const navigate = useNavigate();
  const max = drop?.maxPerFan ?? 4;
  const face = Number(drop?.priceZar ?? 1200);
  const [qty, setQty] = useState(2);
  const [ceiling, setCeiling] = useState(1500);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api
      .getMandate(id)
      .then((m) => {
        if (m) {
          setQty(m.quantity);
          setCeiling(Number(m.ceilingZar));
        }
      })
      .catch(() => undefined);
  }, [id]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api.putMandate(id!, { quantity: qty, ceilingZar: ceiling });
      navigate(`/events/${id}/live`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your limits");
    } finally {
      setBusy(false);
    }
  }

  const total = qty * ceiling;

  return (
    <>
      <div className="phone">
        <TopBar back={`/events/${id}`} />
        <Enter>
          <h1 style={{ marginTop: 12 }}>Tell your agent what to get</h1>
          <p className="muted" style={{ marginTop: 10 }}>
            {drop?.name ?? "Sunset Sessions Live"}
          </p>
        </Enter>

        <Enter delay={0.06}>
          <div className="stack" style={{ marginTop: 22 }}>
            <div className="panel row">
              <div>
                <strong>Tickets</strong>
                <p className="faint">Up to {max} per fan</p>
              </div>
              <div className="stepper">
                <button type="button" aria-label="One ticket fewer" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                  −
                </button>
                <AnimatePresence mode="popLayout">
                  <motion.output key={qty} initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }} className="num" aria-live="polite">
                    {qty}
                  </motion.output>
                </AnimatePresence>
                <button type="button" aria-label="One more ticket" onClick={() => setQty((q) => Math.min(max, q + 1))}>
                  +
                </button>
              </div>
            </div>

            <div className="panel stack" style={{ gap: 10 }}>
              <div className="row">
                <label htmlFor="ceiling" style={{ fontWeight: 700 }}>
                  Most I'll pay per ticket
                </label>
                <strong className="num" style={{ fontSize: "1.4rem", color: "var(--cobalt)" }}>
                  {rand(ceiling)}
                </strong>
              </div>
              <input id="ceiling" type="range" min={face} max={Math.max(face * 2, 2500)} step={50} value={ceiling} onChange={(e) => setCeiling(Number(e.target.value))} />
              <div className="row faint">
                <span>{rand(face)} face value</span>
                <span>{rand(Math.max(face * 2, 2500))}</span>
              </div>
            </div>

            <motion.div className="callout" layout>
              <p>
                Your agent buys <strong>{qty} {qty === 1 ? "ticket" : "tickets"}</strong> at up to <strong>{rand(ceiling)}</strong> each.
              </p>
              <p className="muted" style={{ marginTop: 6 }}>
                It can spend at most <strong className="num">{rand(total)}</strong>, and it can't change these limits. Only you can.
              </p>
            </motion.div>
            {error && (
              <p role="alert" className="callout callout-blocked">
                {error}
              </p>
            )}
          </div>
        </Enter>
      </div>

      <div className="bottom-bar">
        <div className="bottom-bar-inner stack" style={{ gap: 8 }}>
          <Button block disabled={busy} onClick={save}>
            Save my agent's limits
          </Button>
          <p className="faint" style={{ textAlign: "center" }}>
            Your agent spends from your Siyangena wallet, never more than {rand(total)}.
          </p>
        </div>
      </div>
    </>
  );
}
