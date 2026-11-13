import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { FanWallet, Mandate } from "@drop/shared";
import { Button, Coin, Enter, FeedRow, Ticket, TopBar } from "../components/ui";
import { api } from "../lib/api";
import { describe, rand, time } from "../lib/format";
import { useApp } from "../lib/store";

const GLOBAL = new Set(["drop.opened", "drop.sold_out"]);

function statusFrom(type: string | undefined, tool: string | undefined, n: number) {
  switch (type) {
    case "drop.opened":
      return { title: "Tickets are on sale", sub: "Checking your limits", busy: true };
    case "sale.intent":
      return { title: `Buying ${n || ""} tickets`.replace("  ", " "), sub: "Reserved at face value", busy: true };
    case "sale.paid":
      return { title: "Paying now", sub: "Confirming in seconds", busy: true };
    case "sale.ticket_sent":
    case "resale.settled":
      return { title: "Got them!", sub: "Real tickets, straight from the promoter", busy: false };
    case "mandate.blocked":
      return { title: "Stopped at your limit", sub: "Your agent can't go over what you set", busy: false };
    case "agent.action":
      return tool === "get_mandate"
        ? { title: "Reading your limits", sub: "Waiting for tickets to go on sale", busy: true }
        : { title: "Your agent is on it", sub: "Acting within your limits", busy: true };
    case "drop.sold_out":
      return { title: "Sold out", sub: "Your agent can find you a fair resale ticket", busy: false };
    case "resale.listed":
      return { title: "A ticket came up", sub: "Checking it against your limits", busy: true };
    case "resale.sign_requested":
      return { title: "Swapping now", sub: "Ticket and money move together", busy: true };
    default:
      return { title: "Ready for the sale", sub: "Arm your agent and get on with your day", busy: false };
  }
}

export function LiveSale() {
  const { fanId, events, tick, drop } = useApp();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [wallet, setWallet] = useState<FanWallet | null>(null);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getWallet(fanId).then(setWallet).catch(() => setWallet(null));
    api.getMandate(fanId).then(setMandate).catch(() => setMandate(null));
  }, [fanId, tick]);

  const mine = useMemo(
    () => events.filter((e) => e.fanId === fanId || (!e.fanId && GLOBAL.has(e.type))),
    [events, fanId],
  );
  const last = mine[mine.length - 1];
  const allowance = Number(wallet?.allowanceZar ?? 0);
  const cap = mandate ? mandate.quantity * Number(mandate.ceilingZar) : 0;
  const status = statusFrom(last?.type, last?.tool, mandate?.quantity ?? 0);
  const tickets = wallet?.tickets ?? 0;

  const soldOut = drop?.state === "sold_out";

  async function findResale() {
    setError("");
    try {
      setArmed(true);
      await api.runAgent(fanId, "resale");
    } catch (e) {
      setArmed(false);
      setError(e instanceof Error ? e.message : "Couldn't start your agent");
    }
  }

  async function arm() {
    setError("");
    try {
      setArmed(true);
      await api.runAgent(fanId, "buy");
    } catch (e) {
      setArmed(false);
      setError(e instanceof Error ? e.message : "Couldn't start your agent");
    }
  }

  return (
    <>
      <div className="phone">
        <TopBar back="/event" />

        <Enter>
          <section className="agent-stage" aria-live="polite">
            <div className="orb" aria-hidden="true">
              <motion.div
                style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}
                animate={reduce ? undefined : status.busy ? { rotateY: [0, 360] } : { rotateY: 0, y: [0, -6, 0] }}
                transition={status.busy ? { duration: 1.6, repeat: Infinity, ease: "linear" } : { y: { duration: 3, repeat: Infinity, ease: "easeInOut" } }}
              >
                <Coin size={120} face={tickets > 0 ? "#56db9c" : "#ffd43b"} />
              </motion.div>
            </div>
            <p className="faint">{drop?.name ?? "Sunset Sessions Live"}</p>
            <AnimatePresence mode="wait">
              <motion.h1
                key={status.title}
                className="orb-status"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                {status.title}
              </motion.h1>
            </AnimatePresence>
            <p className="muted" style={{ marginTop: 6 }}>
              {status.sub}
            </p>
          </section>
        </Enter>

        <Enter delay={0.06}>
          <div className="panel stack" style={{ gap: 10 }}>
            <div className="row">
              <span className="muted">Agent can still spend</span>
              <strong className="num">
                {rand(allowance)} {cap ? <span className="faint">of {rand(cap)}</span> : null}
              </strong>
            </div>
            <div className="meter" aria-hidden="true">
              <motion.div
                initial={false}
                animate={{ width: `${cap ? Math.max(0, Math.min(100, (allowance / cap) * 100)) : 100}%` }}
                transition={{ type: "spring", stiffness: 160, damping: 22 }}
              />
            </div>
            {mandate && (
              <p className="faint">
                Limit: {mandate.quantity} tickets at up to {rand(mandate.ceilingZar)} each. Only you can change it.
              </p>
            )}
          </div>
        </Enter>

        <AnimatePresence>
          {tickets > 0 && (
            <motion.div
              key="tickets"
              style={{ margin: "18px 0 4px", display: "grid", gap: 12 }}
              initial={reduce ? false : { opacity: 0, y: 80, rotate: -9, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, rotate: -2, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 14 }}
            >
              <Ticket name={drop?.name ?? "Sunset Sessions Live"} line={drop?.venue ?? "Long Street"} label={`${tickets} ${tickets === 1 ? "ticket" : "tickets"}`} />
            </motion.div>
          )}
        </AnimatePresence>

        <h2 style={{ margin: "22px 0 4px", fontSize: "1.2rem" }}>What your agent did</h2>
        {mine.length === 0 ? (
          <p className="muted">Nothing yet. Arm your agent and it will act the moment tickets go on sale.</p>
        ) : (
          <ul className="feed">
            <AnimatePresence initial={false}>
              {[...mine].reverse().map((e, i) => {
                const d = describe(e);
                return <FeedRow key={`${e.at}-${e.type}-${mine.length - i}`} title={d.title} detail={d.detail} tone={d.tone} at={time(e.at)} receipt={e.explorerUrl} />;
              })}
            </AnimatePresence>
          </ul>
        )}
        {error && (
          <p role="alert" style={{ color: "var(--coral)", marginTop: 12, fontWeight: 600 }}>
            {error}
          </p>
        )}
      </div>

      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          {tickets > 0 ? (
            <Button variant="sun" block onClick={() => navigate("/tickets")}>
              See my tickets
            </Button>
          ) : soldOut ? (
            <Button variant="sun" block disabled={armed || !mandate} onClick={findResale}>
              {armed ? "Looking for a resale ticket" : "Find me a resale ticket"}
            </Button>
          ) : (
            <Button block disabled={armed || !mandate} onClick={arm}>
              {!mandate ? "Set your limits first" : armed ? "Your agent is armed" : "Arm my agent"}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
