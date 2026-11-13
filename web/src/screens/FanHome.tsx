import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Button, Enter, Ticket, TopBar } from "../components/ui";
import { CityArt, type Scene } from "../components/CityArt";
import { api } from "../lib/api";
import { rand } from "../lib/format";
import { useApp } from "../lib/store";

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      <NavLink to="/events">Events</NavLink>
      <NavLink to="/live">Agent</NavLink>
      <NavLink to="/tickets">Tickets</NavLink>
      <NavLink to="/wishlist">Wishlist</NavLink>
    </nav>
  );
}

const CITIES = ["All", "Cape Town", "Johannesburg", "Durban"] as const;

export function Discover() {
  const { drop } = useApp();
  const [city, setCity] = useState<(typeof CITIES)[number]>("All");
  const cards: { scene: Scene; city: string; name: string; when: string; price: string; pill: string; tone: string; to?: string }[] = [
    {
      scene: "longstreet",
      city: "Cape Town",
      name: drop?.name ?? "Sunset Sessions Live",
      when: "Sat 12 Dec",
      price: rand(drop?.priceZar ?? 1200),
      pill: drop?.state === "open" ? "On sale now" : drop?.state === "sold_out" ? "Resale only" : "On sale at 18:00",
      tone: drop?.state === "open" ? "pill-live" : "pill-quiet",
      to: "/event",
    },
    { scene: "braamfontein", city: "Johannesburg", name: "Braam Rooftop Sessions", when: "Fri 18 Dec", price: "R250", pill: "Opens Friday", tone: "pill-quiet" },
    { scene: "floridaroad", city: "Durban", name: "Florida Road Block Party", when: "Sat 19 Dec", price: "R180", pill: "Opens Monday", tone: "pill-quiet" },
  ];
  const shown = cards.filter((c) => city === "All" || c.city === city);

  return (
    <>
      <div className="phone">
        <TopBar />
        <Enter>
          <h1 style={{ margin: "10px 0 14px" }}>Events near you</h1>
          <div className="chips" role="group" aria-label="City">
            {CITIES.map((c) => (
              <motion.button key={c} type="button" className="chip" aria-pressed={city === c} whileTap={{ scale: 0.92 }} onClick={() => setCity(c)}>
                {c}
              </motion.button>
            ))}
          </div>
        </Enter>
        <motion.div layout className="stack" style={{ marginTop: 18 }}>
          <AnimatePresence mode="popLayout">
            {shown.map((c, i) => {
              const inner = (
                <>
                  <div className="event-art">
                    <CityArt scene={c.scene} />
                  </div>
                  <div className="event-body">
                    <div>
                      <h3>{c.name}</h3>
                      <p className="faint">
                        {c.city}, {c.when}, from {c.price}
                      </p>
                    </div>
                    <span className={`pill ${c.tone}`}>{c.pill}</span>
                  </div>
                </>
              );
              return (
                <motion.div
                  key={c.name}
                  layout
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 300, damping: 26, delay: i * 0.05 }}
                >
                  {c.to ? (
                    <Link to={c.to} className="event-card">
                      {inner}
                    </Link>
                  ) : (
                    <div className="event-card" style={{ opacity: 0.85 }}>
                      {inner}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      </div>
      <TabBar />
    </>
  );
}

export function Tickets() {
  const { fanId, drop, tick } = useApp();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [gifting, setGifting] = useState(false);

  useEffect(() => {
    api.getTickets(fanId).then((t) => setCount(t.count)).catch(() => setCount(0));
  }, [fanId, tick]);

  return (
    <>
      <div className="phone">
        <TopBar />
        <Enter>
          <h1 style={{ margin: "10px 0 18px" }}>My tickets</h1>
        </Enter>
        {count === 0 ? (
          <div className="callout stack" style={{ gap: 10 }}>
            <strong>No tickets yet</strong>
            <p className="muted">Arm your agent and it buys the moment tickets go on sale.</p>
            <Button onClick={() => navigate("/live")}>Go to my agent</Button>
          </div>
        ) : (
          <div className="stack" style={{ gap: 18 }}>
            {Array.from({ length: count }).map((_, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 40, rotate: -4 }} animate={{ opacity: 1, y: 0, rotate: i % 2 ? 1.5 : -1.5 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: i * 0.08 }} className="stack" style={{ gap: 10 }}>
                <Ticket name={drop?.name ?? "Sunset Sessions Live"} line={drop?.venue ?? "Long Street, Cape Town"} label={`Ticket ${i + 1} of ${count}`} />
                <div className="row" style={{ gap: 8 }}>
                  <Button variant="ghost" className="btn-sm" style={{ flex: 1 }} onClick={() => setGifting(true)}>
                    Send to a friend
                  </Button>
                  <Button variant="ghost" className="btn-sm" style={{ flex: 1 }} onClick={() => navigate("/resell")}>
                    I can't go
                  </Button>
                </div>
              </motion.div>
            ))}
            <p className="faint" style={{ textAlign: "center" }}>
              Tickets only change hands through Siyangena, so nobody can sell you a fake or a copy.
            </p>
          </div>
        )}
      </div>
      <TabBar />
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
                <label htmlFor="friend">Friend's mobile number</label>
                <input id="friend" className="input" type="tel" inputMode="tel" placeholder="082 000 0000" />
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
      <TabBar />
    </>
  );
}
