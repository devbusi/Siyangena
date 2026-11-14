import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ACTIVE, EVENT_CATEGORIES, type EventCategory, type PromoterStats } from "@drop/shared";
import { Button, Enter, FeedRow, Marquee, TopBar } from "../components/ui";
import { CityArt, SCENES, type Scene } from "../components/CityArt";
import { api } from "../lib/api";
import { MOCK } from "../lib/config";
import { mockDemo } from "../lib/mock";
import { describe, rand, time } from "../lib/format";
import { useApp } from "../lib/store";
import { useAuth } from "../lib/auth";
import { EventAdvert, useEvent } from "./EventPage";
import { EventArt, salePill } from "./FanHome";
import { dateLong } from "../lib/format";
import { SA_PLACES } from "../lib/places";
import type { Demand, Drop, PayoutSummary } from "@drop/shared";

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
  const cancelled = drop?.state === "cancelled";
  const reviewed = !drop?.review || drop.review.status === "approved";
  const [view, setView] = useState<"control" | "fan">("control");
  const [editingRules, setEditingRules] = useState(false);
  const [editingEvent, setEditingEvent] = useState(false);
  const refunding = cancelled && drop?.cancel && !drop.cancel.done;
  // Refunds run in the background: keep the progress moving.
  useEffect(() => {
    if (!refunding) return;
    const t = setInterval(refreshDrop, 2000);
    return () => clearInterval(t);
  }, [refunding]); // eslint-disable-line react-hooks/exhaustive-deps
  const { me } = useAuth();
  // Admins can look, but only the promoter who owns the event can change it.
  const owner = Boolean(drop && me && drop.promoterId === me.id);
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
      <TopBar back={me?.role === "admin" ? "/admin/events" : "/promoter/events"} />
      <Marquee rows={[[drop ? drop.name : "Your event", "Verified ticket holders only", "Resale at your price", "Live"]]} size={34} speed={36} />
      {!drop ? (
        <Enter>
          <div className="stack" style={{ maxWidth: 520, margin: "40px auto", textAlign: "center" }}>
            <h1>Your first event</h1>
            <p className="muted">Get verified, then create an event. Agents buy within each person's limits and resale stays at your price.</p>
            <Button onClick={() => navigate("/promoter/onboard")}>Get verified</Button>
          </div>
        </Enter>
      ) : (
        <>
          <Enter>
            <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
              <div>
                {(() => {
                  const pill = promoterPill(drop);
                  return (
                    <span className={`pill ${pill.tone}`} style={pill.bg ? { background: pill.bg } : undefined}>
                      {pill.label}
                    </span>
                  );
                })()}
                <h1 style={{ marginTop: 10, fontSize: "clamp(2.6rem, 6vw, 4.2rem)" }}>{drop.name}</h1>
                <p className="hero-meta">{drop.venue}</p>
              </div>
              {owner && (cancelled || !reviewed) ? null : owner ? (
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <Button variant="ghost" onClick={() => navigate(`/promoter/events/${id}/door`)}>
                  Door scanner
                </Button>
                {(drop.state === "scheduled" || open || drop.state === "sold_out") && new Date(drop.startsAt).getTime() > Date.now() && (
                  <Button variant="ghost" onClick={() => navigate(`/promoter/events/${id}/cancel`)}>
                    Cancel event
                  </Button>
                )}
                {open ? (
                  <Button variant="ghost" disabled={busy} onClick={() => run(() => api.closeSales(id!))}>
                    Close sales
                  </Button>
                ) : (
                  drop.state !== "sold_out" && drop.state !== "closed" && (
                    <Button variant="sun" disabled={busy} onClick={() => run(() => api.openSales(id!))}>
                      Open sales
                    </Button>
                  )
                )}
              </div>
              ) : (
                <span className="pill">View only</span>
              )}
            </div>
            {owner && drop.review && drop.review.status !== "approved" && !cancelled && (
              <div className="panel stack" style={{ marginTop: 12, gap: 10, background: drop.review.status === "needs_more" ? "var(--coral-wash)" : "var(--sun-wash)" }}>
                <p style={{ fontWeight: 800 }}>{drop.review.status === "pending" ? "We're checking this event" : "This event needs changes"}</p>
                <ol className="steps" style={{ padding: 0 }}>
                  <li className="done">
                    <span className="step-dot" aria-hidden="true" />
                    Event sent
                  </li>
                  <li className={drop.review.status === "pending" ? "now" : "done"}>
                    <span className="step-dot" aria-hidden="true" />
                    Venue, date and prices checked
                  </li>
                  <li className="todo">
                    <span className="step-dot" aria-hidden="true" />
                    Approved: open sales whenever you're ready
                  </li>
                </ol>
                {drop.review.status === "pending" ? (
                  <p className="muted">A person on our team checks every event, usually within a few hours. Nobody can see it until it's approved.</p>
                ) : (
                  <>
                    <p>
                      <strong>What to change:</strong> {drop.review.note}
                    </p>
                    <p className="muted">Update the rules below if that's what's needed, then send it back.</p>
                    <div>
                      <Button className="btn-sm" disabled={busy} onClick={() => run(() => api.resubmitEvent(id!), "Sent for review")}>
                        Send it for review again
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
            {cancelled && drop.cancel && (
              <div className="panel stack" style={{ marginTop: 12, background: "#8ec5ff", gap: 8 }}>
                <p style={{ fontWeight: 800 }}>{drop.cancel.done ? "Everyone's been refunded" : "Refunding ticket holders"}</p>
                <p className="stat-value num">
                  {drop.cancel.refunded} of {drop.cancel.holders}
                </p>
                <div className="meter" aria-hidden="true">
                  <motion.div initial={false} animate={{ width: `${drop.cancel.holders ? (drop.cancel.refunded / drop.cancel.holders) * 100 : 100}%` }} />
                </div>
                <p>
                  {rand(drop.cancel.refundedZar)} of {rand(drop.cancel.totalZar)} back with ticket holders. They were told: "{drop.cancel.reason}"
                </p>
              </div>
            )}
            {!owner && (
              <p className="callout" style={{ marginTop: 12 }}>
                You're seeing this as an admin. Only {drop.promoterName ?? "the promoter"} can open sales or change these rules.
              </p>
            )}
          </Enter>

          {reviewed && (
            <div className="chips" role="radiogroup" aria-label="View" style={{ marginTop: 14 }}>
              <button type="button" role="radio" aria-checked={view === "control"} className="chip" onClick={() => setView("control")}>
                Control room
              </button>
              <button type="button" role="radio" aria-checked={view === "fan"} className="chip" onClick={() => setView("fan")}>
                Public page
              </button>
            </div>
          )}
          {!reviewed && owner && !cancelled && (
            <div className="row" style={{ marginTop: 14, gap: 8, justifyContent: "flex-start" }}>
              {!editingEvent && <EditIcon label="Edit event details" onClick={() => setEditingEvent(true)} withText />}
            </div>
          )}
          {!reviewed && editingEvent ? (
            <EditEventForm
              drop={drop}
              needsChanges={drop.review?.status === "needs_more"}
              onCancel={() => setEditingEvent(false)}
              onSaved={() => {
                setEditingEvent(false);
                refreshDrop();
                refreshDrops();
              }}
            />
          ) : !reviewed || view === "fan" ? (
            <EventAdvert drop={drop} />
          ) : (
          <>
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
                    run(() => api.updateEvent(id!, { resaleCapZar: capN, resaleFeePct: Number(fee), maxPerFan: Number(perFan) }), "Saved. New sales follow these rules.").then(() => setEditingRules(false));
                  }}
                >
                  <div className="row">
                    <h2 style={{ fontSize: "1.8rem" }}>{owner ? "Your rules" : "Rules"}</h2>
                    {owner && !editingRules && <EditIcon label="Edit rules" onClick={() => setEditingRules(true)} />}
                  </div>
                  <fieldset disabled={!owner || !editingRules} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 14 }}>
                  <div className="field">
                    <label htmlFor="perfan">Tickets per person</label>
                    <input id="perfan" className="input" inputMode="numeric" value={perFan} onChange={(e) => setPerFan(e.target.value)} />
                    <p className="faint">Counts every ticket a person holds or has reserved, across agents and resale.</p>
                  </div>
                  <div className="field">
                    <label htmlFor="cap">Resale cap per ticket</label>
                    <input id="cap" className="input" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} />
                    <p className="faint">
                      {face ? (capN <= face ? "Ticket holders can only resell at face value or less." : `Up to ${Math.round((capN / face - 1) * 100)}% over face value of ${rand(face)}.`) : ""}
                    </p>
                  </div>
                  <div className="field">
                    <label htmlFor="fee">Your fee on each resale (%)</label>
                    <input id="fee" className="input" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
                    <p className="faint">The buyer pays it. On a {rand(capN || face)} resale you earn {rand(((capN || face) * (Number(fee) || 0)) / 100, true)}.</p>
                  </div>
                  </fieldset>
                  {owner && editingRules && (
                    <div className="row" style={{ gap: 8 }}>
                      <Button type="submit" style={{ flex: 1 }} disabled={busy}>
                        Save rules
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setEditingRules(false);
                          setCap(String(Number(drop.resaleCapZar)));
                          setFee(String(drop.resaleFeePct));
                          setPerFan(String(drop.maxPerFan));
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
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
                      <span>Ticket sales</span>
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
                          const who = e.fanId && e.fanId.length < 12 ? `${e.fanId[0].toUpperCase()}${e.fanId.slice(1)}: ` : e.fanId ? "A ticket holder: " : "";
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
        </>
      )}
    </div>
  );
}

// ---------- Promoter home: apply, wait for review, or run events ----------

// A round pencil button: details stay locked until it's pressed.
function EditIcon({ label, onClick, withText }: { label: string; onClick: () => void; withText?: boolean }) {
  return (
    <button type="button" className={withText ? "btn btn-ghost btn-sm" : "plus-btn"} aria-label={label} title={label} onClick={onClick} style={withText ? { gap: 8 } : { width: 40, height: 40 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 20h4L19 9l-4-4L4 16v4z" />
        <path d="M14 6l4 4" />
      </svg>
      {withText && label}
    </button>
  );
}

// Change an event while it's in review. Supply was fixed on the ledger at creation.
function EditEventForm({ drop, needsChanges, onCancel, onSaved }: { drop: Drop; needsChanges: boolean; onCancel: () => void; onSaved: () => void }) {
  const toLocal = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [name, setName] = useState(drop.name);
  const [category, setCategory] = useState<EventCategory>(drop.category ?? "Music");
  const [venue, setVenue] = useState(drop.venue);
  const [city, setCity] = useState(drop.city ?? "");
  const [date, setDate] = useState(toLocal(drop.startsAt));
  const [price, setPrice] = useState(String(Number(drop.priceZar)));
  const [perFan, setPerFan] = useState(String(drop.maxPerFan));
  const [cap, setCap] = useState(String(Number(drop.resaleCapZar)));
  const [fee, setFee] = useState(String(drop.resaleFeePct));
  const [poster, setPoster] = useState(drop.posterUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(resubmit: boolean) {
    setBusy(true);
    setError("");
    try {
      await api.editEvent(drop.id, {
        name: name.trim(),
        category,
        venue: venue.trim(),
        city: city.trim(),
        startsAt: new Date(date).toISOString(),
        priceZar: Number(price),
        maxPerFan: Number(perFan),
        resaleCapZar: Number(cap),
        resaleFeePct: Number(fee),
        posterUrl: poster.trim(),
        resubmit,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the event");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="panel stack"
      style={{ marginTop: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        void save(needsChanges);
      }}
    >
      <h2 style={{ fontSize: "1.8rem" }}>Edit event</h2>
      <div className="field">
        <label htmlFor="ed-name">Event name</label>
        <input id="ed-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="chips" role="radiogroup" aria-label="Category">
        {EVENT_CATEGORIES.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={category === c} className="chip" onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="form-row">
        <div className="field" style={{ flex: "2 1 220px" }}>
          <label htmlFor="ed-venue">Venue</label>
          <input id="ed-venue" className="input" required value={venue} onChange={(e) => setVenue(e.target.value)} />
        </div>
        <div className="field" style={{ flex: "1 1 180px" }}>
          <label htmlFor="ed-city">City or town</label>
          <input id="ed-city" className="input" list="sa-places-edit" value={city} onChange={(e) => setCity(e.target.value)} />
          <datalist id="sa-places-edit">
            {SA_PLACES.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div className="field" style={{ flex: "1 1 200px" }}>
          <label htmlFor="ed-date">Date and time</label>
          <input id="ed-date" className="input" type="datetime-local" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="ed-price">Price (R)</label>
          <input id="ed-price" className="input" inputMode="numeric" required value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="ed-perfan">Per person</label>
          <input id="ed-perfan" className="input" inputMode="numeric" required value={perFan} onChange={(e) => setPerFan(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="ed-cap">Resale cap (R)</label>
          <input id="ed-cap" className="input" inputMode="numeric" required value={cap} onChange={(e) => setCap(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="ed-fee">Resale fee (%)</label>
          <input id="ed-fee" className="input" inputMode="decimal" required value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="ed-poster">Poster image link (optional)</label>
        <input id="ed-poster" className="input" type="url" value={poster} onChange={(e) => setPoster(e.target.value)} placeholder="https://…/poster.jpg" />
      </div>
      <p className="faint">{drop.supply} tickets. The number of tickets was fixed on the ledger when you created the event, so it can't change.</p>
      {error && <p className="callout callout-blocked">{error}</p>}
      <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-start" }}>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving" : needsChanges ? "Save and send for review" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// What the promoter sees on an event card: review first, then sales.
export function promoterPill(d: Drop): { label: string; tone: string; bg?: string } {
  if (d.state === "cancelled") return { label: "Cancelled", tone: "", bg: "var(--coral)" };
  if (d.review?.status === "pending") return { label: "In review", tone: "", bg: "var(--sun)" };
  if (d.review?.status === "needs_more") return { label: "Needs changes", tone: "", bg: "var(--coral-wash)" };
  return salePill(d);
}

type Filter = "all" | "review" | "scheduled" | "open" | "sold_out" | "closed" | "cancelled";
const FILTERS: { id: Filter; label: string; test: (d: Drop) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "review", label: "In review", test: (d) => Boolean(d.review && d.review.status !== "approved") && d.state !== "cancelled" },
  { id: "scheduled", label: "Not on sale yet", test: (d) => d.state === "scheduled" && (!d.review || d.review.status === "approved") },
  { id: "open", label: "On sale", test: (d) => d.state === "open" },
  { id: "sold_out", label: "Sold out", test: (d) => d.state === "sold_out" },
  { id: "closed", label: "Sales closed", test: (d) => d.state === "closed" },
  { id: "cancelled", label: "Cancelled", test: (d) => d.state === "cancelled" },
];

// Slush-style filter: one pill with an arrow; the options pop out beside it.
function FilterMenu({ value, options, onChange }: { value: string; options: { id: string; label: string; count?: number }[]; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value) ?? options[0];
  return (
    <div className="filter-menu" style={{ marginTop: 14 }}>
      <button type="button" className="btn btn-ghost btn-sm filter-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Show: {current.label}
        {current.count !== undefined ? ` (${current.count})` : ""}
        <motion.svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" animate={{ rotate: open ? 90 : 0 }}>
          <path d="M9 5l7 7-7 7" />
        </motion.svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="filter-options"
            role="menu"
            initial={{ opacity: 0, x: -10, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
          >
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="menuitemradio"
                aria-checked={o.id === value}
                className="plus-item"
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                {o.label}
                {o.count !== undefined && <span className="num">{o.count}</span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EventCards({ list }: { list: Drop[] }) {
  return (
    <div className="event-grid wide" style={{ marginTop: 16 }}>
      {list.map((d) => {
        const pill = promoterPill(d);
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
              <span className={`pill ${pill.tone}`} style={pill.bg ? { background: pill.bg } : undefined}>
                {pill.label}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function useMyEvents(enabled: boolean) {
  const { tick } = useApp();
  const [mine, setMine] = useState<Drop[] | null>(null);
  useEffect(() => {
    if (enabled) api.myEvents().then(setMine).catch(() => setMine([]));
  }, [enabled, tick]);
  return mine;
}

// Overview: what needs the promoter now, at a glance.
export function PromoterHome() {
  const { me } = useAuth();
  const { tick } = useApp();
  const navigate = useNavigate();
  const app = me?.application;
  const approved = me?.role === "admin" || app?.status === "approved";
  const mine = useMyEvents(approved);
  const [money, setMoney] = useState<PayoutSummary | null>(null);
  const [demand, setDemand] = useState<Demand | null>(null);

  useEffect(() => {
    if (!approved) return;
    api.payouts().then(setMoney).catch(() => setMoney(null));
    api.demand({}).then(setDemand).catch(() => setDemand(null));
  }, [approved, tick]);

  if (!me) return null;
  if (!app && me.role !== "admin") return <Navigate to="/promoter/apply" replace />;
  if (!approved) return <ReviewStatus />;

  const list = mine ?? [];
  const live = list.filter((d) => d.state !== "cancelled");
  const sold = live.reduce((n, d) => n + d.sold, 0);
  const supply = live.reduce((n, d) => n + d.supply, 0);
  const inReview = list.filter((d) => d.review && d.review.status !== "approved" && d.state !== "cancelled");
  const next = live
    .filter((d) => new Date(d.startsAt).getTime() > Date.now())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  return (
    <div className="desk">
      <TopBar />
      <Marquee rows={[["Overview", "Sell out fairly", "Earn on resale", "No touts"]]} size={34} speed={36} />
      <Enter>
        <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
          <div>
            <span className="pill pill-ok">Approved promoter</span>
            <h1 style={{ marginTop: 10, fontSize: "clamp(2.6rem, 6vw, 4.2rem)" }}>{app?.displayName ?? me.fullName}</h1>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="ghost" onClick={() => navigate("/promoter/events")}>
              All events
            </Button>
            <Button onClick={() => navigate("/promoter/create")}>New event</Button>
          </div>
        </div>
      </Enter>

      <div className="kpis">
        <button type="button" className="kpi kpi-link" style={{ background: "var(--sun)" }} onClick={() => navigate("/promoter/events")}>
          <p style={{ fontWeight: 800 }}>Tickets sold</p>
          <p className="stat-value num">{sold}</p>
          <p className="faint">of {supply} across {live.length} {live.length === 1 ? "event" : "events"}</p>
        </button>
        <button type="button" className="kpi kpi-link" style={{ background: "var(--mint)" }} onClick={() => navigate("/promoter/payouts")}>
          <p style={{ fontWeight: 800 }}>Earned</p>
          <p className="stat-value num">{money ? rand(money.earnedZar) : "…"}</p>
          <p className="faint">{money ? `Ticket sales and ${rand(money.feesZar)} in resale fees` : ""}</p>
        </button>
        <button type="button" className="kpi kpi-link" style={{ background: "var(--lilac)" }} onClick={() => navigate("/promoter/payouts")}>
          <p style={{ fontWeight: 800 }}>Next payout</p>
          <p className="stat-value num">{money ? rand(Number(money.heldZar) + Number(money.availableZar) + Number(money.requestedZar)) : "…"}</p>
          <p className="faint">
            {!money
              ? ""
              : money.kind === "business"
                ? "Paid automatically as you sell"
                : money.nextPayoutAt
                  ? `Automatically on ${new Date(money.nextPayoutAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}`
                  : "Automatically, the morning after"}
          </p>
        </button>
        <button type="button" className="kpi kpi-link" style={{ background: "#8ec5ff" }} onClick={() => navigate("/promoter/events?filter=open")}>
          <p style={{ fontWeight: 800 }}>On sale now</p>
          <p className="stat-value num">{live.filter((d) => d.state === "open").length}</p>
          <p className="faint">{inReview.length ? `${inReview.length} in review` : "Nothing waiting for review"}</p>
        </button>
      </div>

      {mine === null ? (
        <p className="muted">Loading your events</p>
      ) : list.length === 0 ? (
        <div className="callout stack" style={{ gap: 8, maxWidth: 620 }}>
          <strong>No events yet</strong>
          <p className="muted">Create your first event. You set the price, how many tickets each person can buy and the resale cap. We check it, then you open sales.</p>
          <Button onClick={() => navigate("/promoter/create")}>Create an event</Button>
        </div>
      ) : (
        <div className="desk-form" style={{ alignItems: "flex-start" }}>
          <div className="stack">
            <h2>Needs you</h2>
            {inReview.filter((d) => d.review?.status === "needs_more").map((d) => (
              <div key={d.id} className="panel row" style={{ background: "var(--coral-wash)", flexWrap: "wrap" }}>
                <div>
                  <strong>{d.name} needs changes</strong>
                  <p className="faint">{d.review?.note}</p>
                </div>
                <Button className="btn-sm" onClick={() => navigate(`/promoter/events/${d.id}`)}>
                  Fix it
                </Button>
              </div>
            ))}
            {live
              .filter((d) => d.state === "scheduled" && (!d.review || d.review.status === "approved"))
              .map((d) => (
                <div key={d.id} className="panel row" style={{ flexWrap: "wrap" }}>
                  <div>
                    <strong>{d.name} is approved</strong>
                    <p className="faint">Open sales whenever you're ready.</p>
                  </div>
                  <Button variant="sun" className="btn-sm" onClick={() => navigate(`/promoter/events/${d.id}`)}>
                    Open sales
                  </Button>
                </div>
              ))}
            {inReview.filter((d) => d.review?.status === "needs_more").length === 0 && !live.some((d) => d.state === "scheduled" && (!d.review || d.review.status === "approved")) && (
              <p className="muted">Nothing needs you right now.</p>
            )}
            {next && (
              <>
                <h2 style={{ marginTop: 10 }}>Next up</h2>
                <Link to={`/promoter/events/${next.id}`} className="panel next-up">
                  <div className="next-up-art">
                    <EventArt drop={next} />
                  </div>
                  <div className="stack" style={{ gap: 6, flex: 1, minWidth: 0 }}>
                    {(() => {
                      const pill = promoterPill(next);
                      return (
                        <span className={`pill ${pill.tone}`} style={{ justifySelf: "start", alignSelf: "flex-start", ...(pill.bg ? { background: pill.bg } : {}) }}>
                          {pill.label}
                        </span>
                      );
                    })()}
                    <h3 style={{ fontSize: "1.6rem" }}>{next.name}</h3>
                    <p className="faint">
                      {dateLong(next.startsAt)}, {next.venue}
                    </p>
                    <div className="meter" aria-hidden="true">
                      <div style={{ width: `${next.supply ? (next.sold / next.supply) * 100 : 0}%` }} />
                    </div>
                    <p style={{ fontWeight: 700 }}>
                      {next.sold} of {next.supply} sold
                    </p>
                  </div>
                </Link>
              </>
            )}
          </div>
          <aside className="desk-aside stack">
            <div className="panel stack" style={{ background: "var(--lilac)", gap: 6 }}>
              <h3>What people are asking for</h3>
              {demand && demand.top.length > 0 ? (
                demand.top.map((t) => (
                  <div key={`${t.query}-${t.city ?? ""}`} className="row">
                    <span>
                      {t.query}
                      {t.city ? `, ${t.city}` : ""}
                    </span>
                    <strong className="num">{t.fans}</strong>
                  </div>
                ))
              ) : (
                <p>No wishes yet. As people add who they want to see, the top asks show here.</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

// Every event, filtered by where it's at.
export function PromoterEvents() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const approved = me?.role === "admin" || me?.application?.status === "approved";
  const mine = useMyEvents(approved);
  const filter = (params.get("filter") as Filter) || "all";
  const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0];
  const list = (mine ?? []).filter(f.test).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  if (me && !approved) return <Navigate to="/promoter" replace />;
  return (
    <div className="desk">
      <TopBar />
      <Enter>
        <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
          <h1 style={{ fontSize: "clamp(2.6rem, 6vw, 4.2rem)" }}>Events</h1>
          <Button onClick={() => navigate("/promoter/create")}>New event</Button>
        </div>
      </Enter>
      <FilterMenu
        value={filter}
        options={FILTERS.map((x) => ({ id: x.id, label: x.label, count: mine ? (mine ?? []).filter(x.test).length : undefined }))}
        onChange={(id) => setParams(id === "all" ? {} : { filter: id })}
      />
      {mine === null ? (
        <p className="muted" style={{ marginTop: 20 }}>
          Loading your events
        </p>
      ) : list.length === 0 ? (
        <p className="callout" style={{ marginTop: 20, maxWidth: 620 }}>
          {filter === "all" ? "No events yet. Create one and we'll check it before it goes on sale." : `No events ${f.label.toLowerCase()} right now.`}
        </p>
      ) : (
        <EventCards list={list} />
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
                ? "Independent promoters: ticket money is held until each event happens, then paid out the next morning. Ticket holders are refunded automatically if an event is cancelled."
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="desk">
      <TopBar back="/promoter" />
      <Enter>
        <Marquee rows={[["Sell out fairly", "Earn on resale", "No touts"]]} size={40} speed={32} />
        <h1 style={{ margin: "10px 0 8px" }}>Sell with Siyangena</h1>
        <p className="muted" style={{ maxWidth: 620 }}>Anyone buying can see who is behind an event. That's why we check every promoter first, big or small.</p>
      </Enter>
      <div className="desk-form" style={{ marginTop: 8 }}>
      <div>

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
                  <p>Ticket money is held until your event happens, then paid out the next morning. If the event is cancelled, every ticket holder is refunded automatically. After a few events with us, you get paid as tickets sell.</p>
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
      </div>
      <aside className="desk-aside stack">
        <div className="panel stack" style={{ gap: 10, background: "var(--sun)" }}>
          <h2 style={{ fontSize: "1.8rem" }}>What you get</h2>
          <p>Tickets that can't be faked or copied, so people trust your events.</p>
          <p>A fee on every resale, at a cap you set. Touts can't undercut you.</p>
          <p>Live view of every sale and every bad attempt that was stopped.</p>
        </div>
        <div className="panel stack" style={{ gap: 6 }}>
          <h3>Starting out?</h3>
          <p className="muted">Independent promoters get the same tools. Ticket money waits safely until the event happens, and ticket holders are refunded automatically if it's cancelled.</p>
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
  const [category, setCategory] = useState<EventCategory>("Music");
  const [scene, setScene] = useState<Scene>("longstreet");
  const [poster, setPoster] = useState(false);
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("");
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
  const [demand, setDemand] = useState<Demand | null>(null);
  // How many fans on Siyangena want an event like this one, as it's being typed.
  useEffect(() => {
    const t = setTimeout(() => {
      api
        .demand({ name, city, scene: poster ? undefined : scene, priceZar: p || undefined })
        .then(setDemand)
        .catch(() => setDemand(null));
    }, 350);
    return () => clearTimeout(t);
  }, [name, city, scene, poster, p]);
  const mult = CAP_PRESETS.find((c) => c.id === preset)!.mult;
  const cap = preset === "custom" ? Number(customCap) || 0 : Math.round(p * mult);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api.createEvent({
        name,
        category,
        venue,
        scene: poster ? undefined : scene,
        city: city.trim() || undefined,
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

          <div className="field">
            <label>What kind of event</label>
            <div className="chips" role="radiogroup" aria-label="Category">
              {EVENT_CATEGORIES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={category === c} className="chip" onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
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
              <input id="venue" className="input" required placeholder="The Venue, 12 Main Road" value={venue} onChange={(e) => setVenue(e.target.value)} />
            </div>
            <div className="field" style={{ flex: "1 1 200px" }}>
              <label htmlFor="city">City or town</label>
              <input id="city" className="input" required list="sa-places" placeholder="Polokwane" value={city} onChange={(e) => setCity(e.target.value)} />
              <datalist id="sa-places">
                {SA_PLACES.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
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
              <label htmlFor="eperfan">Per person</label>
              <input id="eperfan" className="input" inputMode="numeric" required value={perFan} onChange={(e) => setPerFan(e.target.value)} />
            </div>
          </div>

          <div className="panel stack">
            <h3>Resale</h3>
            <p className="muted">You decide the most anyone can resell a ticket for. People who can't go still get their money back, and touts can't profit.</p>
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
            {busy ? "Creating" : "Create and send for review"}
          </Button>
          <p className="faint">We check every event before anyone can see it, usually within a few hours. Then you open sales.</p>
        </form>
      </Enter>
      <aside className="desk-aside stack">
        <div className="panel stack" style={{ background: "var(--lilac)", gap: 8 }}>
          <p style={{ fontWeight: 800 }}>People waiting for this</p>
          <p className="stat-value num" style={{ fontSize: "3.2rem" }}>
            {demand?.matching ?? 0}
          </p>
          <p>
            {demand?.matching
              ? `${demand.matching === 1 ? "person has" : "people have"} a wish that fits this event. They get an alert the moment you create it.`
              : "People with a matching wish get an alert the moment you create it."}
          </p>
          {demand && demand.top.length > 0 && (
            <div className="stack" style={{ gap: 4, marginTop: 4 }}>
              <p style={{ fontWeight: 800 }}>Most asked for{city ? ` in ${city}` : ""}</p>
              {demand.top.map((t) => (
                <div key={`${t.query}-${t.city ?? ""}`} className="row">
                  <span>
                    {t.query}
                    {t.city ? `, ${t.city}` : ""}
                  </span>
                  <strong className="num">{t.fans}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
        <p style={{ fontWeight: 800 }}>How people will see it</p>
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
                {city || venue || "City"}, {date ? new Date(date).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" }) : "Date"}, from {rand(p)}
              </p>
            </div>
            <span className="pill pill-live">On sale soon</span>
          </div>
        </div>
        <div className="panel breakdown">
          <div className="row">
            <span>Tickets per person</span>
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
