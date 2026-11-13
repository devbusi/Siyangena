import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import type { Drop, FanTickets, FanWallet } from "@drop/shared";
import { Button, Enter, Marquee, Ticket, TopBar } from "../components/ui";
import { CityArt, SCENES, type Scene } from "../components/CityArt";
import { api } from "../lib/api";
import { dateLong, rand, time } from "../lib/format";
import { useApp } from "../lib/store";
import { MARQUEE_PLACES } from "../lib/places";

export function EventArt({ drop }: { drop: Drop }) {
  if (drop.posterUrl) return <img className="poster" src={drop.posterUrl} alt="" />;
  const scene = (SCENES.find((s) => s.id === drop.scene)?.id ?? "longstreet") as Scene;
  return <CityArt scene={scene} />;
}

export function salePill(drop: Drop): { label: string; tone: string } {
  switch (drop.state) {
    case "open":
      return { label: `${drop.supply - drop.sold} left`, tone: "pill-live" };
    case "sold_out":
      return { label: "Resale only", tone: "pill-quiet" };
    case "closed":
      return { label: "Sales closed", tone: "pill-quiet" };
    default:
      return { label: "On sale soon", tone: "pill-quiet" };
  }
}

export function Discover() {
  const { drops } = useApp();
  const [city, setCity] = useState("All");
  const [q, setQ] = useState("");
  // Cities come from the events themselves, so anywhere in the country shows up.
  const cities = ["All", ...Array.from(new Set(drops.map((d) => d.city).filter((c): c is string => Boolean(c)))).sort()];
  const needle = q.trim().toLowerCase();
  const shown = drops.filter(
    (d) =>
      (city === "All" || d.city === city) &&
      (!needle || [d.name, d.venue, d.city, d.promoterName].some((v) => v?.toLowerCase().includes(needle))),
  );

  return (
    <>
      <div className="phone">
        <TopBar />
        <Enter className="wide">
          <Marquee rows={[MARQUEE_PLACES]} size={44} speed={40} />
          <div className="discover-head">
            <h1 style={{ margin: "4px 0 0" }}>Events near you</h1>
            <div className="field" style={{ flex: "1 1 280px", maxWidth: 420 }}>
              <label htmlFor="search" className="sr-only">
                Search events
              </label>
              <input id="search" className="input" type="search" placeholder="Search events, venues, towns" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="chips" role="group" aria-label="City" style={{ marginTop: 14 }}>
            {cities.map((c) => (
              <motion.button key={c} type="button" className="chip" aria-pressed={city === c} whileTap={{ scale: 0.92 }} onClick={() => setCity(c)}>
                {c}
              </motion.button>
            ))}
          </div>
        </Enter>
        {shown.length === 0 ? (
          <div className="callout stack" style={{ gap: 6, marginTop: 18 }}>
            <strong>{needle || city !== "All" ? "Nothing matches that" : "No events yet"}</strong>
            <p className="muted">New events show up the moment a promoter creates them. Add who you want to see to your wishlist.</p>
          </div>
        ) : (
          <motion.div layout className="event-grid wide" style={{ marginTop: 18 }}>
            <AnimatePresence mode="popLayout">
              {shown.map((d, i) => {
                const pill = salePill(d);
                return (
                  <motion.div
                    key={d.id}
                    layout
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 300, damping: 26, delay: i * 0.05 }}
                  >
                    <Link to={`/events/${d.id}`} className="event-card">
                      <div className="event-art">
                        <EventArt drop={d} />
                      </div>
                      <div className="event-body">
                        <div>
                          <h3>{d.name}</h3>
                          <p className="faint">
                            {d.venue}, {dateLong(d.startsAt)}, {rand(d.priceZar)}
                          </p>
                        </div>
                        <span className={`pill ${pill.tone}`}>{pill.label}</span>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </>
  );
}

export function Tickets() {
  const { tick } = useApp();
  const navigate = useNavigate();
  const [data, setData] = useState<FanTickets | null>(null);
  const [gifting, setGifting] = useState(false);

  useEffect(() => {
    api.tickets().then(setData).catch(() => setData({ count: 0, history: [], events: [] }));
  }, [tick]);

  const held = data?.events ?? [];

  return (
    <>
      <div className="phone">
        <TopBar />
        <Enter>
          <h1 style={{ margin: "10px 0 18px" }}>My tickets</h1>
        </Enter>
        {!data ? (
          <p className="muted">Loading your tickets</p>
        ) : held.length === 0 ? (
          <div className="callout stack" style={{ gap: 10 }}>
            <strong>No tickets yet</strong>
            <p className="muted">Find an event and buy at face value, or add an agent that buys the moment sales open.</p>
            <Button onClick={() => navigate("/events")}>Find tickets</Button>
          </div>
        ) : (
          <div className="stack" style={{ gap: 22 }}>
            {held.flatMap((e) =>
              Array.from({ length: e.count }).map((_, i) => (
                <motion.div
                  key={`${e.eventId}-${i}`}
                  initial={{ opacity: 0, y: 40, rotate: -4 }}
                  animate={{ opacity: 1, y: 0, rotate: i % 2 ? 1.5 : -1.5 }}
                  transition={{ type: "spring", stiffness: 260, damping: 16, delay: i * 0.08 }}
                  className="stack"
                  style={{ gap: 10 }}
                >
                  <Ticket name={e.name} line={`${e.venue}, ${dateLong(e.startsAt)}`} label={`Ticket ${i + 1} of ${e.count}`} />
                  <div className="row" style={{ gap: 8 }}>
                    <Button variant="ghost" className="btn-sm" style={{ flex: 1 }} onClick={() => setGifting(true)}>
                      Send to a friend
                    </Button>
                    <Button variant="ghost" className="btn-sm" style={{ flex: 1 }} onClick={() => navigate(`/tickets/${e.eventId}/resell`)}>
                      I can't go
                    </Button>
                  </div>
                </motion.div>
              )),
            )}
            <p className="faint" style={{ textAlign: "center" }}>
              Tickets only change hands through Siyangena, so nobody can sell you a fake or a copy.
            </p>
          </div>
        )}
      </div>
      <AnimatePresence>
        {gifting && (
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setGifting(false)}>
            <motion.section
              role="dialog"
              aria-label="Send a ticket to a friend"
              className="sheet"
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2>Send to a friend</h2>
              <p className="muted">Free and instant. Their name goes on the ticket for the gate, and each ticket can be gifted once.</p>
              <div className="field">
                <label htmlFor="friend">Friend's email</label>
                <input id="friend" className="input" type="email" placeholder="friend@example.com" />
              </div>
              <p className="callout callout-sun">Gifting opens before the event. Selling instead? Use "I can't go" so you're paid safely.</p>
              <Button variant="ghost" block onClick={() => setGifting(false)}>
                Close
              </Button>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function WalletScreen() {
  const { tick } = useApp();
  const [wallet, setWallet] = useState<FanWallet | null>(null);
  const [history, setHistory] = useState<FanTickets["history"]>([]);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    api
      .wallet()
      .then((w) => {
        setWallet(w);
        setLoadError("");
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't load your wallet"));
    api.tickets().then((t) => setHistory(t.history)).catch(() => undefined);
  }, [tick, attempt]);

  async function topUp(amount: number) {
    setError("");
    setBusy(amount);
    try {
      setWallet(await api.topUp(amount));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Top-up didn't go through");
    } finally {
      setBusy(0);
    }
  }

  return (
    <>
      <div className="phone">
        <TopBar />
        <Enter>
          <h1 style={{ margin: "10px 0 16px" }}>Wallet</h1>
          <div className="panel stack" style={{ background: "var(--sun)", gap: 8 }}>
            <p style={{ fontWeight: 800 }}>You can spend</p>
            <p className="stat-value num" style={{ fontSize: "4rem" }}>
              {wallet ? rand(wallet.allowanceZar) : "R…"}
            </p>
            {loadError && !wallet && (
              <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <p style={{ fontWeight: 700 }}>{loadError}</p>
                <Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
                  Try again
                </Button>
              </div>
            )}
            <p className="faint">Your money for tickets and your agent. Anything you don't spend stays yours.</p>
          </div>
        </Enter>
        <Enter delay={0.06}>
          <div className="stack" style={{ marginTop: 16 }}>
            <p style={{ fontWeight: 800 }}>Add test money</p>
            <div className="row" style={{ gap: 8 }}>
              {[500, 1000, 2500].map((a) => (
                <Button key={a} variant="ghost" className="btn-sm" style={{ flex: 1 }} disabled={busy > 0} onClick={() => topUp(a)}>
                  {busy === a ? "Adding" : rand(a)}
                </Button>
              ))}
            </div>
            <p className="faint">This is the test version, so top-ups are play money. Card and instant EFT come at launch.</p>
            {error && (
              <p role="alert" className="callout callout-blocked">
                {error}
              </p>
            )}
            {history.length > 0 && (
              <div className="stack" style={{ gap: 0, marginTop: 8 }}>
                <p className="d" style={{ fontSize: "1.4rem", marginBottom: 6 }}>
                  History
                </p>
                {history.slice(0, 12).map((h, i) => (
                  <div key={i} className="row" style={{ padding: "10px 0", borderBottom: "2px solid #000" }}>
                    <div>
                      <strong>{h.description}</strong>
                      <p className="faint">{time(h.at)}</p>
                    </div>
                    {h.explorerUrl && (
                      <a href={h.explorerUrl} target="_blank" rel="noreferrer">
                        Receipt
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Enter>
      </div>
    </>
  );
}

export function Wishlist() {
  const wishes = [
    { name: "International headliner, Cape Town", state: "Bought", tone: "pill-ok", note: "2 tickets at R1,200, the second they went on sale." },
    { name: "Amapiano nights, Joburg", state: "Watching", tone: "pill-quiet", note: "Your agent buys on Siyangena and partner sites." },
    { name: "Festival weekend, Durban", state: "Found", tone: "pill-live", note: "On sale on a site that doesn't work with agents yet. You're first to know, so you can buy it yourself." },
  ];
  return (
    <>
      <div className="phone">
        <TopBar />
        <Enter>
          <h1 style={{ margin: "10px 0 8px" }}>Who do you want to see?</h1>
          <p className="muted">Your agent watches for new events and buys within your limits.</p>
        </Enter>
        <Enter delay={0.06}>
          <form className="panel stack" style={{ marginTop: 18 }} onSubmit={(e) => e.preventDefault()}>
            <div className="field">
              <label htmlFor="wish">Artist, event or vibe</label>
              <input id="wish" className="input" placeholder="Amapiano nights in Joburg" />
            </div>
            <div className="row" style={{ gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="wmax">Max per ticket</label>
                <input id="wmax" className="input" defaultValue="R1,500" />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="wcity">City</label>
                <input id="wcity" className="input" defaultValue="Anywhere" />
              </div>
            </div>
            <Button type="submit" block>
              Add to wishlist
            </Button>
          </form>
        </Enter>
        <div className="stack" style={{ marginTop: 18 }}>
          {wishes.map((w) => (
            <div key={w.name} className="panel stack" style={{ gap: 6 }}>
              <div className="row">
                <strong>{w.name}</strong>
                <span className={`pill ${w.tone}`}>{w.state}</span>
              </div>
              <p className="muted">{w.note}</p>
            </div>
          ))}
          <p className="faint" style={{ textAlign: "center" }}>
            Your agent only buys where the seller allows it. Everywhere else, it tells you first.
          </p>
        </div>
      </div>
    </>
  );
}
