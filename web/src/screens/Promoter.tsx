import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ACTIVE, type PromoterStats } from "@drop/shared";
import { Button, Enter, FeedRow, Marquee, TopBar } from "../components/ui";
import { CityArt, SCENES, type Scene } from "../components/CityArt";
import { api } from "../lib/api";
import { MOCK } from "../lib/config";
import { mockDemo } from "../lib/mock";
import { describe, rand, time } from "../lib/format";
import { useApp } from "../lib/store";
import { useAuth } from "../lib/auth";
import { useEvent } from "./EventPage";
import { EventArt, salePill } from "./FanHome";
import { dateLong } from "../lib/format";
import type { Drop } from "@drop/shared";

const toZar = (units: string | number) => Number(units) * ACTIVE.fxZarPerUnit;

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="toggle" onClick={onChange}>
      <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 30 }} style={{ left: on ? 27 : 3 }} />
    </button>
  );
}

// ---------- Control room ----------

export function PromoterDesk() {
  const { id } = useParams();
  const [drop, refreshDrop] = useEvent(id);
  const { events: allEvents, tick, refreshDrops } = useApp();
  const events = allEvents.filter((e) => e.eventId === id);
  const navigate = useNavigate();
  const [stats, setStats] = useState<PromoterStats | null>(null);
  const [cap, setCap] = useState("");
  const [fee, setFee] = useState("");
  const [perFan, setPerFan] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (id) api.stats(id).then(setStats).catch(() => setStats(null));
  }, [id, tick]);

  useEffect(() => {
    if (!drop) return;
    setCap(String(Number(drop.resaleCapZar)));
    setFee(String(drop.resaleFeePct));
    setPerFan(String(drop.maxPerFan));
  }, [drop?.id, drop?.resaleCapZar, drop?.resaleFeePct, drop?.maxPerFan]);

  const open = drop?.state === "open";
  const blocked = events.filter((e) => describe(e).tone === "blocked").length;

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      refreshDrop();
      refreshDrops();
      if (ok) setSaved(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  const face = Number(drop?.priceZar ?? 0);
  const capN = Number(cap) || 0;

  return (
    <div className="desk">
      <TopBar back="/promoter" />
      <Marquee rows={[[drop ? drop.name : "Your event", "Verified fans only", "Resale at your price", "Live"]]} size={34} speed={36} />
      {!drop ? (
        <Enter>
          <div className="stack" style={{ maxWidth: 520, margin: "40px auto", textAlign: "center" }}>
            <h1>Your first event</h1>
            <p className="muted">Get verified, then create an event. Fans' agents buy within their limits and resale stays at your price.</p>
            <Button onClick={() => navigate("/promoter/onboard")}>Get verified</Button>
          </div>
        </Enter>
      ) : (
        <>
          <Enter>
            <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
              <div>
                <span className={`pill ${open ? "pill-live" : drop.state === "sold_out" ? "pill-ok" : ""}`}>
                  {open ? "On sale" : drop.state === "sold_out" ? "Sold out" : drop.state === "closed" ? "Sales closed" : "Not on sale yet"}
                </span>
                <h1 style={{ marginTop: 10, fontSize: "clamp(2.6rem, 6vw, 4.2rem)" }}>{drop.name}</h1>
                <p className="hero-meta">{drop.venue}</p>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Button variant="ghost" onClick={() => navigate("/promoter/create")}>
                  New event
                </Button>
                {open ? (
                  <Button variant="ghost" disabled={busy} onClick={() => run(() => api.closeSales(id!))}>
                    Close sales
                  </Button>
                ) : (
                  <Button variant="sun" disabled={busy || drop.state === "sold_out"} onClick={() => run(() => api.openSales(id!))}>
                    Open sales
                  </Button>
                )}
              </div>
            </div>
          </Enter>

          <Enter delay={0.06}>
            <div className="kpis">
              <div className="kpi">
                <p style={{ fontWeight: 700 }}>Sold</p>
                <p className="stat-value num">
                  {drop.sold} of {drop.supply}
                </p>
              </div>
              <div className="kpi">
                <p style={{ fontWeight: 700 }}>Ticket sales</p>
                <p className="stat-value num">{rand(stats ? toZar(stats.revenueRlusd) : drop.sold * face)}</p>
              </div>
              <div className="kpi">
                <p style={{ fontWeight: 700 }}>Resale fees earned</p>
                <p className="stat-value num">{rand(stats ? toZar(stats.feesRlusd) : 0)}</p>
                <p className="faint">{stats?.resales ?? 0} resales</p>
              </div>
              <div className="kpi">
                <p style={{ fontWeight: 700 }}>Bad attempts stopped</p>
                <p className="stat-value num">{blocked}</p>
              </div>
            </div>
          </Enter>

          <div className="desk-grid">
            <Enter delay={0.1}>
              <div className="stack">
                <form
                  className="panel stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => api.updateEvent(id!, { resaleCapZar: capN, resaleFeePct: Number(fee), maxPerFan: Number(perFan) }), "Saved. New sales follow these rules.");
                  }}
                >
                  <h2 style={{ fontSize: "1.8rem" }}>Your rules</h2>
                  <div className="field">
                    <label htmlFor="perfan">Tickets per fan</label>
                    <input id="perfan" className="input" inputMode="numeric" value={perFan} onChange={(e) => setPerFan(e.target.value)} />
                    <p className="faint">Counts every ticket a fan holds or has reserved, across agents and resale.</p>
                  </div>
                  <div className="field">
                    <label htmlFor="cap">Resale cap per ticket</label>
                    <input id="cap" className="input" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} />
                    <p className="faint">
                      {face ? (capN <= face ? "Fans can only resell at face value or less." : `Up to ${Math.round((capN / face - 1) * 100)}% over face value of ${rand(face)}.`) : ""}
                    </p>
                  </div>
                  <div className="field">
                    <label htmlFor="fee">Your fee on each resale (%)</label>
                    <input id="fee" className="input" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
                    <p className="faint">The buyer pays it. On a {rand(capN || face)} resale you earn {rand(((capN || face) * (Number(fee) || 0)) / 100, true)}.</p>
                  </div>
                  <Button type="submit" block disabled={busy}>
                    Save rules
                  </Button>
                  <AnimatePresence>
                    {saved && (
                      <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="callout callout-ok" onAnimationComplete={() => setTimeout(() => setSaved(""), 2500)}>
                        {saved}
                      </motion.p>
                    )}
                  </AnimatePresence>
                  {error && (
                    <p role="alert" className="callout callout-blocked">
                      {error}
                    </p>
                  )}
                </form>

                <div className="panel stack" style={{ gap: 8 }}>
                  <h3>Where the money goes</h3>
                  <div className="breakdown">
                    <div className="row">
                      <span>Ticket sales, paid to you instantly</span>
                      <span className="num">{rand(stats ? toZar(stats.revenueRlusd) : drop.sold * face)}</span>
                    </div>
                    <div className="row">
                      <span>Resale fees</span>
                      <span className="num">{rand(stats ? toZar(stats.feesRlusd) : 0)}</span>
                    </div>
                    <div className="row total">
                      <span>Total so far</span>
                      <span className="num">{rand(stats ? toZar(stats.revenueRlusd) + toZar(stats.feesRlusd) : drop.sold * face)}</span>
                    </div>
                  </div>
                </div>

                {MOCK && (
                  <div className="panel stack callout-sun" style={{ gap: 10 }}>
                    <h3>Try a bad actor</h3>
                    <Button variant="ghost" block onClick={() => mockDemo.scalperLists(id!)}>
                      Scalper lists at R1,700
                    </Button>
                    <Button variant="ghost" block onClick={() => mockDemo.fakeTicket(id!)}>
                      Someone sends a fake ticket
                    </Button>
                  </div>
                )}
              </div>
            </Enter>

            <Enter delay={0.14}>
              <section className="panel" aria-live="polite">
                <h2 style={{ fontSize: "1.8rem" }}>Live</h2>
                {events.length === 0 ? (
                  <p className="muted" style={{ marginTop: 8 }}>
                    Nothing yet. Open sales and every agent action shows up here.
                  </p>
                ) : (
                  <ul className="feed">
                    <AnimatePresence initial={false}>
                      {[...events]
                        .reverse()
                        .slice(0, 40)
                        .map((e, i) => {
                          const d = describe(e);
                          const who = e.fanId && e.fanId.length < 12 ? `${e.fanId[0].toUpperCase()}${e.fanId.slice(1)}: ` : e.fanId ? "A fan: " : "";
                          return <FeedRow key={`${e.at}-${e.type}-${events.length - i}`} title={who + d.title} detail={d.detail} tone={d.tone} at={time(e.at)} receipt={e.explorerUrl} />;
                        })}
                    </AnimatePresence>
                  </ul>
                )}
              </section>
            </Enter>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Promoter home: apply, wait for review, or run events ----------

export function PromoterHome() {
  const { me } = useAuth();
  const { tick } = useApp();
  const navigate = useNavigate();
  const [mine, setMine] = useState<Drop[] | null>(null);
  const app = me?.application;
  const approved = me?.role === "admin" || app?.status === "approved";

  useEffect(() => {
    if (approved) api.myEvents().then(setMine).catch(() => setMine([]));
  }, [approved, tick]);

  if (!me) return null;
  if (!app && me.role !== "admin") return <Navigate to="/promoter/apply" replace />;
  if (!approved) return <ReviewStatus />;

  return (
    <div className="desk">
      <TopBar />
      <Marquee rows={[["Your events", "Sell out fairly", "Earn on resale", "No touts"]]} size={34} speed={36} />
      <Enter>
        <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
          <div>
            <span className="pill pill-ok">Approved</span>
            <h1 style={{ marginTop: 10, fontSize: "clamp(2.6rem, 6vw, 4.2rem)" }}>{app?.displayName ?? me.fullName}</h1>
          </div>
          <Button onClick={() => navigate("/promoter/create")}>New event</Button>
        </div>
      </Enter>
      {mine === null ? (
        <p className="muted" style={{ marginTop: 20 }}>
          Loading your events
        </p>
      ) : mine.length === 0 ? (
        <div className="callout stack" style={{ gap: 8, marginTop: 20, maxWidth: 620 }}>
          <strong>No events yet</strong>
          <p className="muted">Create your first event. You set the price, how many tickets each fan can hold and the resale cap.</p>
          <Button onClick={() => navigate("/promoter/create")}>Create an event</Button>
        </div>
      ) : (
        <div className="event-grid wide" style={{ marginTop: 20 }}>
          {mine.map((d) => {
            const pill = salePill(d);
            return (
              <Link key={d.id} to={`/promoter/events/${d.id}`} className="event-card">
                <div className="event-art">
                  <EventArt drop={d} />
                </div>
                <div className="event-body">
                  <div>
                    <h3>{d.name}</h3>
                    <p className="faint">
                      {dateLong(d.startsAt)}, {d.sold} of {d.supply} sold
                    </p>
                  </div>
                  <span className={`pill ${pill.tone}`}>{pill.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReviewStatus() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const app = me!.application!;
  const status = app.status;
  const steps: { label: string; state: "done" | "now" | "todo" }[] = [
    { label: "Details sent", state: "done" },
    { label: app.kind === "business" ? "Business details checked" : "Past events and socials checked", state: status === "pending" ? "now" : "done" },
    { label: "Approved: your events can go on sale", state: "todo" },
  ];
  return (
    <div className="desk">
      <TopBar />
      <div className="desk-form" style={{ marginTop: 16 }}>
        <Enter>
          <div className="stack">
            <span className={`pill ${status === "pending" ? "pill-live" : "pill-blocked"}`} style={{ alignSelf: "flex-start" }}>
              {status === "pending" ? "In review" : status === "needs_more" ? "We need a bit more" : "Not approved"}
            </span>
            <h1>{status === "pending" ? "We're checking your details" : status === "needs_more" ? "Almost there" : "We couldn't approve this"}</h1>
            <p className="muted">
              {status === "pending"
                ? "A person on our team looks at every promoter, usually within a day. We'll show the result here."
                : app.reviewNote || "Update your details and send them again."}
            </p>
            <ol className="steps panel" style={{ padding: 18 }}>
              {steps.map((s) => (
                <li key={s.label} className={s.state}>
                  <span className="step-dot" aria-hidden="true">
                    {s.state === "done" && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  {s.label}
                </li>
              ))}
            </ol>
            {status !== "pending" && <Button onClick={() => navigate("/promoter/apply")}>Update my details</Button>}
          </div>
        </Enter>
        <aside className="desk-aside stack">
          <div className="panel" style={{ background: "var(--sun-wash)" }}>
            <p style={{ margin: 0 }}>
              {app.kind === "independent"
                ? "Independent promoters: ticket money is held until each event happens, then paid out the next morning. Fans are refunded automatically if an event is cancelled."
                : "Registered businesses are paid as tickets sell."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------- Onboarding ----------

export function PromoterOnboard() {
  const navigate = useNavigate();
  const { me, refresh } = useAuth();
  const [kind, setKind] = useState<"business" | "independent">(me?.application?.kind ?? "business");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="desk">
      <TopBar back="/promoter" />
      <Enter>
        <Marquee rows={[["Sell out fairly", "Earn on resale", "No touts"]]} size={40} speed={32} />
        <h1 style={{ margin: "10px 0 8px" }}>Sell with Siyangena</h1>
        <p className="muted" style={{ maxWidth: 620 }}>Every fan can see who is behind an event. That's why we check every promoter first, big or small.</p>
      </Enter>
      <div className="desk-form" style={{ marginTop: 8 }}>
      <div>

      {sent ? (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="stack" style={{ marginTop: 22 }}>
          <div className="callout callout-ok stack" style={{ gap: 6 }}>
            <strong>{kind === "business" ? "You're verified" : "We're reviewing your events"}</strong>
            <p>{kind === "business" ? "Your business checks out. You can create your first event now." : "A person on our team looks at your track record, usually within a day. You can set up your event while you wait."}</p>
          </div>
          <Button block onClick={() => navigate("/promoter/create")}>
            Create an event
          </Button>
        </motion.div>
      ) : (
        <Enter delay={0.06}>
          <form
            className="stack"
            style={{ marginTop: 20 }}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const val = (k: string) => String(f.get(k) ?? "").trim() || undefined;
              setBusy(true);
              setError("");
              try {
                await api.apply({
                  kind,
                  displayName: val("pname") ?? "",
                  registrationNumber: val("reg"),
                  pastEvents: val("past"),
                  socials: val("ig"),
                  payoutDetails: val("bank") ?? "",
                });
                await refresh();
                navigate("/promoter");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Couldn't send your application");
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="stack" style={{ gap: 10 }} role="group" aria-label="Promoter type">
              <button type="button" className="choice" aria-pressed={kind === "business"} onClick={() => setKind("business")}>
                <strong>Registered business</strong>
                <span className="muted">You have a company registration number. Payouts go to you as tickets sell.</span>
              </button>
              <button type="button" className="choice" aria-pressed={kind === "independent"} onClick={() => setKind("independent")}>
                <strong>Independent promoter</strong>
                <span className="muted">No company yet? Show us events you've run before. Ticket money is held safely until the night.</span>
              </button>
            </div>

            <div className="field">
              <label htmlFor="pname">{kind === "business" ? "Business name" : "Your name or crew name"}</label>
              <input id="pname" name="pname" className="input" required defaultValue={me?.application?.displayName} placeholder={kind === "business" ? "Sunset Sessions (Pty) Ltd" : "Khaya Nights"} />
            </div>

            {kind === "business" ? (
              <div className="field">
                <label htmlFor="reg">Company registration number</label>
                <input id="reg" name="reg" className="input" required placeholder="2021/123456/07" />
              </div>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="past">Events you've run before</label>
                  <textarea id="past" name="past" className="input" placeholder="Links to past events, posters, ticket pages or socials" />
                </div>
                <div className="field">
                  <label htmlFor="ig">Instagram or TikTok</label>
                  <input id="ig" name="ig" className="input" placeholder="@khayanights" />
                </div>
                <div className="callout callout-sun stack" style={{ gap: 6 }}>
                  <strong>How payouts work for you</strong>
                  <p>Ticket money is held until your event happens, then paid out the next morning. If the event is cancelled, every fan is refunded automatically. After a few events with us, you get paid as tickets sell.</p>
                </div>
              </>
            )}

            <div className="field">
              <label htmlFor="bank">Where should we pay you?</label>
              <input id="bank" name="bank" className="input" required placeholder="Bank and account holder" />
            </div>
            {error && (
              <p role="alert" className="callout callout-blocked">
                {error}
              </p>
            )}
            <Button type="submit" block disabled={busy}>
              {busy ? "Sending" : "Send for review"}
            </Button>
          </form>
        </Enter>
      )}
      </div>
      <aside className="desk-aside stack">
        <div className="panel stack" style={{ gap: 10, background: "var(--sun)" }}>
          <h2 style={{ fontSize: "1.8rem" }}>What you get</h2>
          <p>Tickets that can't be faked or copied, so fans trust your events.</p>
          <p>A fee on every resale, at a cap you set. Touts can't undercut you.</p>
          <p>Live view of every sale and every bad attempt that was stopped.</p>
        </div>
        <div className="panel stack" style={{ gap: 6 }}>
          <h3>Starting out?</h3>
          <p className="muted">Independent promoters get the same tools. Ticket money waits safely until the event happens, and fans are refunded automatically if it's cancelled.</p>
        </div>
      </aside>
      </div>
    </div>
  );
}

// ---------- Create event ----------

const CAP_PRESETS = [
  { id: "face", label: "Face value", mult: 1 },
  { id: "25", label: "+25%", mult: 1.25 },
  { id: "50", label: "+50%", mult: 1.5 },
  { id: "custom", label: "Custom", mult: 0 },
] as const;

export function CreateEvent() {
  const navigate = useNavigate();
  const { refreshDrops } = useApp();
  const [posterUrl, setPosterUrl] = useState("");
  const [name, setName] = useState("");
  const [scene, setScene] = useState<Scene>("longstreet");
  const [poster, setPoster] = useState(false);
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("2026-12-12T19:00");
  const [price, setPrice] = useState("1200");
  const [supply, setSupply] = useState("100");
  const [perFan, setPerFan] = useState("4");
  const [preset, setPreset] = useState<(typeof CAP_PRESETS)[number]["id"]>("50");
  const [customCap, setCustomCap] = useState("1800");
  const [fee, setFee] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const p = Number(price) || 0;
  const mult = CAP_PRESETS.find((c) => c.id === preset)!.mult;
  const cap = preset === "custom" ? Number(customCap) || 0 : Math.round(p * mult);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api.createEvent({
        name,
        venue,
        scene: poster ? undefined : scene,
        city: SCENES.find((x) => x.id === scene)?.city,
        posterUrl: poster && posterUrl ? posterUrl : undefined,
        startsAt: new Date(date).toISOString(),
        priceZar: p,
        supply: Number(supply),
        maxPerFan: Number(perFan),
        resaleCapZar: cap,
        resaleFeePct: Number(fee),
      });
      await refreshDrops();
      navigate(`/promoter/events/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the event");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="desk">
      <TopBar back="/promoter" />
      <Enter>
        <h1 style={{ margin: "10px 0 18px" }}>New event</h1>
      </Enter>
      <div className="desk-form">
      <Enter delay={0.06}>
        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label htmlFor="ename">Event name</label>
            <input id="ename" className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="panel stack">
            <div className="row">
              <h3>Event art</h3>
              <label className="row" style={{ gap: 10, fontWeight: 700 }}>
                Use my own poster
                <Toggle on={poster} label="Use my own poster" onChange={() => setPoster(!poster)} />
              </label>
            </div>
            {poster ? (
              <div className="field">
                <label htmlFor="poster">Poster image link</label>
                <input id="poster" className="input" type="url" placeholder="https://…/poster.jpg" value={posterUrl} onChange={(e) => setPosterUrl(e.target.value)} />
                <p className="faint">Paste a link to your poster for now. Uploads come next.</p>
              </div>
            ) : (
              <div className="scene-grid" role="radiogroup" aria-label="Scene">
                {SCENES.map((s) => (
                  <motion.button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={scene === s.id}
                    className="scene"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setScene(s.id);
                      if (!venue || SCENES.some((x) => venue === `${x.label}, ${x.city}`)) setVenue(`${s.label}, ${s.city}`);
                    }}
                  >
                    <div className="event-art">
                      <CityArt scene={s.id} />
                    </div>
                    <p>{s.label}</p>
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="field" style={{ flex: "2 1 220px" }}>
              <label htmlFor="venue">Venue</label>
              <input id="venue" className="input" required value={venue} onChange={(e) => setVenue(e.target.value)} />
            </div>
            <div className="field" style={{ flex: "1 1 200px" }}>
              <label htmlFor="date">Date and time</label>
              <input id="date" className="input" type="datetime-local" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="eprice">Price (R)</label>
              <input id="eprice" className="input" inputMode="numeric" required value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="supply">Tickets</label>
              <input id="supply" className="input" inputMode="numeric" required value={supply} onChange={(e) => setSupply(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="eperfan">Per fan</label>
              <input id="eperfan" className="input" inputMode="numeric" required value={perFan} onChange={(e) => setPerFan(e.target.value)} />
            </div>
          </div>

          <div className="panel stack">
            <h3>Resale</h3>
            <p className="muted">You decide the most a fan can resell a ticket for. Fans who can't go still get their money back, and touts can't profit.</p>
            <div className="chips" role="radiogroup" aria-label="Resale cap">
              {CAP_PRESETS.map((c) => (
                <motion.button key={c.id} type="button" role="radio" aria-checked={preset === c.id} className="chip" whileTap={{ scale: 0.92 }} onClick={() => setPreset(c.id)}>
                  {c.label}
                </motion.button>
              ))}
            </div>
            {preset === "custom" ? (
              <div className="field">
                <label htmlFor="ccap">Cap per ticket (R)</label>
                <input id="ccap" className="input" inputMode="numeric" value={customCap} onChange={(e) => setCustomCap(e.target.value)} />
              </div>
            ) : (
              <p style={{ fontWeight: 800 }}>Resale capped at {rand(cap)}</p>
            )}
            <div className="field">
              <label htmlFor="efee">Your fee on each resale (%)</label>
              <input id="efee" className="input" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
            </div>
          </div>

          {error && (
            <p role="alert" className="callout callout-blocked">
              {error}
            </p>
          )}
          <Button type="submit" block disabled={busy || !p || cap <= 0}>
            Create event
          </Button>
        </form>
      </Enter>
      <aside className="desk-aside stack">
        <p style={{ fontWeight: 800 }}>How fans will see it</p>
        <div className="event-card">
          <div className="event-art">
            {poster ? (
              posterUrl ? (
                <img className="poster" src={posterUrl} alt="" />
              ) : (
                <div style={{ height: "100%", display: "grid", placeItems: "center", background: "var(--sun-wash)", fontWeight: 800 }}>Your poster</div>
              )
            ) : (
              <CityArt scene={scene} />
            )}
          </div>
          <div className="event-body">
            <div>
              <h3>{name || "Your event"}</h3>
              <p className="faint">
                {venue || "Venue"}, {date ? new Date(date).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" }) : "Date"}, from {rand(p)}
              </p>
            </div>
            <span className="pill pill-live">On sale soon</span>
          </div>
        </div>
        <div className="panel breakdown">
          <div className="row">
            <span>Tickets per fan</span>
            <span className="num">{perFan || "0"}</span>
          </div>
          <div className="row">
            <span>Resale cap</span>
            <span className="num">{rand(cap)}</span>
          </div>
          <div className="row total">
            <span>You earn per resale</span>
            <span className="num">{rand((cap * (Number(fee) || 0)) / 100, true)}</span>
          </div>
        </div>
      </aside>
      </div>
    </div>
  );
}
