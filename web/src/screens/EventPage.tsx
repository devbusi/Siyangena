import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import type { Drop, Listing } from "@drop/shared";
import { Button, Enter, Ticker, Ticket, TopBar } from "../components/ui";
import { EventArt, salePill } from "./FanHome";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateLong, rand } from "../lib/format";
import { useApp, useDrop } from "../lib/store";

const PROMISES = [
  { title: "Checked promoter", body: "We check every promoter before their event goes on sale, so every ticket traces back to them." },
  { title: "One verified person, one wallet", body: "Bots can't fake an ID check, so they can't buy here." },
  { title: "Resale stays fair", body: "Fans resell through Siyangena only, capped at the promoter's price." },
  { title: "Fakes can't reach you", body: "Your wallet only accepts the real ticket for this event." },
];

export function useEvent(id: string | undefined): [Drop | null, () => void] {
  const fromList = useDrop(id);
  const { tick } = useApp();
  const [drop, setDrop] = useState<Drop | null>(fromList);
  const load = () => {
    if (id) api.getEvent(id).then(setDrop).catch(() => setDrop(null));
  };
  useEffect(load, [id, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return [drop ?? fromList, load];
}

export function EventPage() {
  const { id } = useParams();
  const [drop] = useEvent(id);
  const { me, signedIn } = useAuth();
  const navigate = useNavigate();
  const { tick } = useApp();
  const [listings, setListings] = useState<Listing[]>([]);
  const [error, setError] = useState("");

  const soldOut = drop?.state === "sold_out";
  useEffect(() => {
    if (id && soldOut) api.listings(id).then(setListings).catch(() => setListings([]));
  }, [id, soldOut, tick]);

  if (!drop) {
    return (
      <div className="phone">
        <TopBar back="/events" />
        <p className="muted" style={{ marginTop: 30 }}>
          Loading the event
        </p>
      </div>
    );
  }

  const pill = salePill(drop);
  const go = (path: string) => {
    if (!signedIn) return navigate(`/signin?next=${encodeURIComponent(path)}`);
    if (me && !me.verified) return navigate(`/verify?next=${encodeURIComponent(path)}`);
    navigate(path);
  };
  const open = listings.filter((l) => l.status === "open" && l.sellerFanId !== me?.id && Number(l.priceZar) <= Number(drop.resaleCapZar));

  async function buyListing(l: Listing) {
    setError("");
    if (!signedIn) return navigate(`/signin?next=/events/${drop!.id}`);
    try {
      await api.buyListing(l.id);
      navigate("/tickets");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't buy that ticket");
    }
  }

  return (
    <>
      <div className="phone">
        <TopBar back="/events" />
        <Ticker
          items={[
            drop.state === "open" ? "Tickets on sale now" : soldOut ? "Sold out: fair resale only" : "Tickets on sale soon",
            "Verified fans only",
            `Resale capped at ${rand(drop.resaleCapZar)}`,
            "No fakes, no scalpers",
          ]}
        />
        <div className="event-layout">
          <Enter>
            <section aria-labelledby="event-title" className="event-hero">
              <div className="art-box" style={{ height: 240 }}>
                <EventArt drop={drop} />
              </div>
              <div className="row" style={{ marginTop: 16 }}>
                <span className={`pill ${pill.tone}`}>{pill.label}</span>
                <span className="faint">{dateLong(drop.startsAt)}</span>
              </div>
              <h1 id="event-title" className="hero-title">
                {drop.name}
              </h1>
              <p className="hero-meta">{drop.venue}</p>
              {drop.promoterName && <p className="faint">By {drop.promoterName}</p>}
            </section>
          </Enter>
          <div className="event-side">
            <Enter delay={0.08}>
              <div className="price-row">
                <div className="panel">
                  <p className="faint">Ticket</p>
                  <p className="stat-value num">{rand(drop.priceZar)}</p>
                </div>
                <div className="panel">
                  <p className="faint">Per fan</p>
                  <p className="stat-value num">{drop.maxPerFan} max</p>
                </div>
                <div className="panel">
                  <p className="faint">Resale cap</p>
                  <p className="stat-value num">{rand(drop.resaleCapZar)}</p>
                </div>
              </div>
              <p className="faint" style={{ margin: "-8px 0 18px" }}>
                The promoter sets the limit per fan and the resale cap for this event.
              </p>
            </Enter>

            {soldOut && (
              <Enter delay={0.1}>
                <h2 style={{ margin: "6px 0 12px" }}>Fair resale</h2>
                {open.length === 0 ? (
                  <p className="callout" style={{ marginBottom: 18 }}>
                    No tickets listed right now. Add an agent and it buys the first fair one that fits your limits.
                  </p>
                ) : (
                  <div className="stack" style={{ marginBottom: 18 }}>
                    <AnimatePresence>
                      {open.map((l) => (
                        <motion.div key={l.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="panel list-card">
                          <div>
                            <strong>1 ticket</strong>
                            <p className="faint">
                              {rand(l.priceZar)} plus {rand(l.feeZar, true)} promoter fee
                            </p>
                          </div>
                          <Button variant="sun" className="btn-sm" onClick={() => buyListing(l)}>
                            Buy for {rand(l.totalZar, true)}
                          </Button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
                {error && (
                  <p role="alert" className="callout callout-blocked" style={{ marginBottom: 18 }}>
                    {error}
                  </p>
                )}
              </Enter>
            )}

            <Enter delay={0.14}>
              <h2 style={{ margin: "6px 0 12px" }}>Why this ticket is safe</h2>
              <ul className="promise-list">
                {PROMISES.map((p) => (
                  <li key={p.title}>
                    <span className="promise-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <span>
                      <strong>{p.title}</strong>
                      <br />
                      <span className="muted">{p.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Enter>
          </div>
        </div>
      </div>

      <div className="bottom-bar">
        <div className="bottom-bar-inner stack" style={{ gap: 8 }}>
          {!soldOut && drop.state !== "closed" && (
            <Button block onClick={() => go(`/events/${drop.id}/buy`)}>
              {drop.state === "open" ? "Buy tickets" : "Buy when sales open"}
            </Button>
          )}
          <Button variant="lilac" block onClick={() => go(`/events/${drop.id}/agent`)}>
            {soldOut ? "Add an agent to find me a ticket" : "Add an agent"}
          </Button>
        </div>
      </div>
    </>
  );
}

// Buy tickets directly. The default way in: no agent needed.
export function BuyTickets() {
  const { id } = useParams();
  const [drop] = useEvent(id);
  const { tick } = useApp();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [balance, setBalance] = useState<number | null>(null);
  const [state, setState] = useState<"idle" | "paying" | "waiting" | "done">("idle");
  const [requestId, setRequestId] = useState("");
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    api.wallet(id).then((w) => setBalance(Number(w.allowanceZar))).catch(() => setBalance(null));
  }, [id, tick]);

  useEffect(() => {
    if (state !== "waiting" || !requestId) return;
    api.purchase(requestId).then((p) => {
      if (p?.status === "fulfilled") {
        api.tickets(id).then((t) => setCount(t.count)).catch(() => undefined);
        setState("done");
      }
      if (p?.status === "refunded") {
        setState("idle");
        setError("The sale didn't complete, so your money was returned.");
      }
    });
  }, [tick, state, requestId, id]);

  if (!drop) return null;
  const max = drop.maxPerFan;
  const total = qty * Number(drop.priceZar);
  const short = balance !== null && balance < total;

  async function pay() {
    setError("");
    setState("paying");
    try {
      const r = await api.buy(drop!.id, qty);
      setRequestId(r.requestId);
      setState("waiting");
    } catch (e) {
      setState("idle");
      setError(e instanceof Error ? e.message : "Payment didn't go through");
    }
  }

  async function topUp() {
    setError("");
    try {
      const w = await api.topUp(Math.max(500, Math.ceil((total - (balance ?? 0)) / 500) * 500));
      setBalance(Number(w.allowanceZar));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Top-up didn't go through");
    }
  }

  return (
    <>
      <div className="phone">
        <TopBar back={`/events/${drop.id}`} />
        <Enter>
          <h1 style={{ marginTop: 12 }}>{state === "done" ? "They're yours!" : "Buy tickets"}</h1>
          <p style={{ marginTop: 8, fontWeight: 700 }}>
            {drop.name}, {dateLong(drop.startsAt)}
          </p>
        </Enter>

        {state === "done" ? (
          <motion.div initial={{ opacity: 0, y: 80, rotate: -9, scale: 0.85 }} animate={{ opacity: 1, y: 0, rotate: -2, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 14 }} style={{ marginTop: 24 }}>
            <Ticket name={drop.name} line={drop.venue} label={`${count || qty} ${(count || qty) === 1 ? "ticket" : "tickets"}`} />
          </motion.div>
        ) : (
          <Enter delay={0.06}>
            <div className="stack" style={{ marginTop: 22 }}>
              {drop.state !== "open" && <p className="callout callout-sun">Sales aren't open yet. Add an agent and it buys for you the second they open.</p>}
              <div className="panel row">
                <div>
                  <strong>Tickets</strong>
                  <p className="faint">Up to {max} per fan, set by the promoter</p>
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
              <div className="panel breakdown">
                <div className="row">
                  <span>
                    {qty} × {rand(drop.priceZar)}
                  </span>
                  <span className="num">{rand(total)}</span>
                </div>
                <div className="row">
                  <span>Paid from your Siyangena wallet</span>
                  <span className="num">{balance === null ? "…" : `${rand(balance)} available`}</span>
                </div>
                <div className="row total">
                  <span>Total</span>
                  <span className="num">{rand(total)}</span>
                </div>
              </div>
              {short && (
                <div className="callout callout-sun list-card">
                  <span>Your wallet is short for this.</span>
                  <Button variant="ghost" className="btn-sm" onClick={topUp}>
                    Add test money
                  </Button>
                </div>
              )}
              <p className="faint">Verified fans only, at face value. The per-fan limit counts every ticket you hold, including any your agent buys.</p>
              {error && (
                <p role="alert" className="callout callout-blocked">
                  {error}
                </p>
              )}
              <div className="panel list-card" style={{ background: "var(--lilac, #e3c6ff)" }}>
                <div>
                  <strong>Add an agent</strong>
                  <p className="faint">Next time it buys the second sales open, within your limits.</p>
                </div>
                <Button variant="ghost" className="btn-sm" onClick={() => navigate(`/events/${drop.id}/agent`)}>
                  Add
                </Button>
              </div>
            </div>
          </Enter>
        )}
      </div>
      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          {state === "done" ? (
            <Button variant="sun" block onClick={() => navigate("/tickets")}>
              See my tickets
            </Button>
          ) : (
            <Button block disabled={state !== "idle" || drop.state !== "open" || short} onClick={pay}>
              {state === "paying" ? "Paying" : state === "waiting" ? "Getting your tickets" : `Pay ${rand(total)}`}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
