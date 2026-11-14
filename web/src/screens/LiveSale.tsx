import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { FanWallet, Mandate } from "@drop/shared";
import { Button, Coin, Enter, FeedRow, Ticket, TopBar } from "../components/ui";
import { api } from "../lib/api";
import { describe, rand, time } from "../lib/format";
import { useApp } from "../lib/store";
import { useAuth } from "../lib/auth";
import { useEvent } from "./EventPage";

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
      return { title: "Ready for the sale", sub: "Send your agent in and get on with your day", busy: false };
  }
}

export function LiveSale() {
  const { id } = useParams();
  const [drop] = useEvent(id);
  const { me } = useAuth();
  const fanId = me?.id ?? "";
  const { events, tick } = useApp();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [wallet, setWallet] = useState<FanWallet | null>(null);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [armed, setArmed] = useState(false);
  const starting = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api.wallet(id).then(setWallet).catch(() => setWallet(null));
    api.getMandate(id).then(setMandate).catch(() => setMandate(null));
  }, [id, tick]);

  const mine = useMemo(
    () => events.filter((e) => (!e.eventId || e.eventId === id) && (e.fanId === fanId || (!e.fanId && GLOBAL.has(e.type)))),
    [events, fanId, id],
  );
  const last = mine[mine.length - 1];
  const inWallet = Number(wallet?.allowanceZar ?? 0);
  const cap = mandate ? mandate.quantity * Number(mandate.ceilingZar) : 0;
  const left = mandate ? Math.max(0, mandate.quantity - mandate.bought) * Number(mandate.ceilingZar) : 0;
  // The agent spends from your wallet, never more than its limit and never more than you hold.
  const canSpend = mandate ? Math.min(inWallet, left) : 0;
  const short = Boolean(mandate) && wallet !== null && inWallet < left;
  const status = statusFrom(last?.type, last?.tool, mandate?.quantity ?? 0);
  const tickets = wallet?.tickets ?? 0;

  const soldOut = drop?.state === "sold_out";

  async function findResale() {
    if (starting.current) return;
    starting.current = true;
    setError("");
    try {
      setArmed(true);
      await api.runAgent(id!, "resale");
    } catch (e) {
      setArmed(false);
      setError(e instanceof Error ? e.message : "Couldn't start your agent");
    } finally {
      starting.current = false;
    }
  }

  async function arm() {
    if (starting.current) return; // a double click starts one agent, not two
    starting.current = true;
    setError("");
    try {
      setArmed(true);
      await api.runAgent(id!, "buy");
    } catch (e) {
      setArmed(false);
      setError(e instanceof Error ? e.message : "Couldn't start your agent");
    } finally {
      starting.current = false;
    }
  }

  return (
    <>
      <div className="phone">
        <TopBar back={`/events/${id}`} />

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
              <span className="muted">Your agent can spend</span>
              <strong className="num">
                {rand(canSpend)} {cap ? <span className="faint">of its {rand(cap)} limit</span> : null}
              </strong>
            </div>
            <div className="meter" aria-hidden="true">
              <motion.div
                initial={false}
                animate={{ width: `${cap ? Math.max(0, Math.min(100, (canSpend / cap) * 100)) : 0}%` }}
                transition={{ type: "spring", stiffness: 160, damping: 22 }}
              />
            </div>
            <div className="row">
              <span className="muted">In your wallet</span>
              <strong className="num">{wallet ? rand(inWallet) : "R…"}</strong>
            </div>
            {short && (
              <p style={{ fontWeight: 700 }}>
                Your wallet holds less than your agent's limit. <Link to="/wallet">Top up</Link> so it can use all of it.
              </p>
            )}
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
          <p className="muted">Nothing yet. Send your agent in and it buys the moment tickets go on sale.</p>
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
              {!mandate ? "Set your limits first" : armed ? "Your agent is in the queue" : "Send my agent in"}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
