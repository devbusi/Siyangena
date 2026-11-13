import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { AdminUser, ApplicationStatus, ChangeRequest, Drop, PromoterApplication, Role } from "@drop/shared";
import { Link, useNavigate } from "react-router-dom";
import { Button, Enter, Marquee, TopBar } from "../components/ui";
import { EventArt, salePill } from "./FanHome";
import { useApp } from "../lib/store";
import { api } from "../lib/api";
import { dateLong, rand, time } from "../lib/format";

const TABS: { id: ApplicationStatus; label: string }[] = [
  { id: "pending", label: "Waiting" },
  { id: "needs_more", label: "Asked for more" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Not approved" },
];

// Siyangena admins review every promoter before their events can go on sale.
// Events waiting for a check before they can go on sale.
function EventReviews() {
  const [list, setList] = useState<Drop[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = () => {
    api.eventsInReview().then(setList).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load events"));
  };
  useEffect(load, []);
  async function decide(id: string, decision: "approved" | "needs_more") {
    setBusy(id + decision);
    setError("");
    try {
      await api.reviewEvent(id, decision, notes[id]);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="stack" style={{ marginTop: 18 }}>
      {error && <p className="callout callout-blocked">{error}</p>}
      {list === null ? (
        <p className="muted">Loading</p>
      ) : list.length === 0 ? (
        <p className="callout">No events waiting.</p>
      ) : (
        list.map((d) => (
          <article key={d.id} className="panel stack" style={{ gap: 10 }}>
            <div className="list-card">
              <div>
                <h3 style={{ fontSize: "1.4rem" }}>{d.name}</h3>
                <p className="faint">
                  {d.promoterName ?? "Promoter"}, {d.venue}
                  {d.city ? `, ${d.city}` : ""}, {dateLong(d.startsAt)}
                </p>
              </div>
              <span className="pill" style={{ background: d.review?.status === "pending" ? "var(--sun)" : "var(--coral-wash)" }}>
                {d.review?.status === "pending" ? "Waiting" : "Asked for changes"}
              </span>
            </div>
            <div className="breakdown">
              <div className="row">
                <span>Price</span>
                <strong>{rand(d.priceZar)}</strong>
              </div>
              <div className="row">
                <span>Tickets</span>
                <strong>
                  {d.supply}, up to {d.maxPerFan} per person
                </strong>
              </div>
              <div className="row">
                <span>Resale cap and fee</span>
                <strong>
                  {rand(d.resaleCapZar)}, {d.resaleFeePct}%
                </strong>
              </div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-start" }}>
              <Link to={`/promoter/events/${d.id}`}>See the event page</Link>
            </div>
            {d.review?.status === "pending" && (
              <>
                <div className="field">
                  <label htmlFor={`en-${d.id}`}>Note to the promoter (needed to ask for changes)</label>
                  <input id={`en-${d.id}`} className="input" value={notes[d.id] ?? ""} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} placeholder="The venue address is missing a street number" />
                </div>
                <div className="row" style={{ gap: 8, justifyContent: "flex-start" }}>
                  <Button disabled={busy !== ""} onClick={() => decide(d.id, "approved")}>
                    Approve event
                  </Button>
                  <Button variant="ghost" disabled={busy !== "" || !(notes[d.id] ?? "").trim()} onClick={() => decide(d.id, "needs_more")}>
                    Ask for changes
                  </Button>
                </div>
              </>
            )}
          </article>
        ))
      )}
    </div>
  );
}

// Promoters changing their public name, registration number or bank account.
function ChangeReviews() {
  const [list, setList] = useState<ChangeRequest[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = () => {
    api.changeRequests().then(setList).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load changes"));
  };
  useEffect(load, []);
  async function decide(userId: string, decision: "approved" | "rejected") {
    setBusy(userId);
    setError("");
    try {
      await api.reviewChange(userId, decision);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save");
    } finally {
      setBusy("");
    }
  }
  const rows = (c: ChangeRequest) =>
    [
      { label: "Public name", from: c.current?.displayName, to: c.displayName },
      { label: "Registration number", from: c.current?.registrationNumber, to: c.registrationNumber },
      { label: "Bank account", from: c.current?.payoutDetails, to: c.payoutDetails },
    ].filter((r) => r.to !== undefined);
  return (
    <div className="stack" style={{ marginTop: 18 }}>
      {error && <p className="callout callout-blocked">{error}</p>}
      {list === null ? (
        <p className="muted">Loading</p>
      ) : list.length === 0 ? (
        <p className="callout">No changes waiting.</p>
      ) : (
        list.map((c) => (
          <article key={c.userId} className="panel stack" style={{ gap: 10 }}>
            <div className="list-card">
              <div>
                <h3 style={{ fontSize: "1.4rem" }}>{c.current?.displayName ?? "Promoter"}</h3>
                <p className="faint">
                  {c.email ? `${c.email}, ` : ""}asked {time(c.createdAt)}
                </p>
              </div>
              <span className="pill" style={{ background: "var(--sun)" }}>
                Change
              </span>
            </div>
            <div className="breakdown">
              {rows(c).map((r) => (
                <div key={r.label} className="row" style={{ alignItems: "flex-start" }}>
                  <span>{r.label}</span>
                  <strong style={{ textAlign: "right" }}>
                    {r.from || "None"} to {r.to || "None"}
                  </strong>
                </div>
              ))}
            </div>
            <p className="muted">Check a new bank account belongs to the promoter before approving. Payouts go there from then on.</p>
            <div className="row" style={{ gap: 8, justifyContent: "flex-start" }}>
              <Button disabled={busy !== ""} onClick={() => decide(c.userId, "approved")}>
                Approve change
              </Button>
              <Button variant="ghost" disabled={busy !== ""} onClick={() => decide(c.userId, "rejected")}>
                Don't approve
              </Button>
            </div>
          </article>
        ))
      )}
    </div>
  );
}

export function AdminReview() {
  const [what, setWhat] = useState<"promoters" | "events" | "changes">("promoters");
  const [tab, setTab] = useState<ApplicationStatus>("pending");
  const [apps, setApps] = useState<PromoterApplication[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    api.applications(tab).then(setApps).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load applications"));
  };
  useEffect(load, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function review(userId: string, decision: ApplicationStatus) {
    setBusy(userId + decision);
    setError("");
    try {
      await api.review(userId, decision, notes[userId]);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="desk">
      <TopBar />
      
      <Enter>
        <h1 style={{ margin: "8px 0 6px" }}>Review</h1>
        <p className="muted" style={{ marginBottom: 14 }}>Approve promoters, then each of their events, before anything goes on sale. Ask for more if something is missing; they see your note.</p>
        <div className="chips" role="group" aria-label="What to review" style={{ marginBottom: 10 }}>
          {(
            [
              ["promoters", "Promoters"],
              ["events", "Events"],
              ["changes", "Detail changes"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className="chip" aria-pressed={what === id} onClick={() => setWhat(id)}>
              {label}
            </button>
          ))}
        </div>
        {what === "promoters" && (
        <div className="chips" role="group" aria-label="Show">
          {TABS.map((t) => (
            <motion.button key={t.id} type="button" className="chip" aria-pressed={tab === t.id} whileTap={{ scale: 0.92 }} onClick={() => setTab(t.id)}>
              {t.label}
            </motion.button>
          ))}
        </div>
        )}
      </Enter>
      {what === "events" && <EventReviews />}
      {what === "changes" && <ChangeReviews />}
      {what === "promoters" && error && (
        <p role="alert" className="callout callout-blocked" style={{ marginTop: 14 }}>
          {error}
        </p>
      )}
      {what === "promoters" && (
      <div className="stack" style={{ marginTop: 18 }}>
        {apps === null ? (
          <p className="muted">Loading</p>
        ) : apps.length === 0 ? (
          <p className="callout">Nothing here right now.</p>
        ) : (
          <AnimatePresence>
            {apps.map((a) => (
              <motion.article key={a.userId} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="panel stack" style={{ gap: 10 }}>
                <div className="list-card">
                  <div>
                    <h3 style={{ fontSize: "1.4rem" }}>{a.displayName}</h3>
                    <p className="faint">
                      {a.kind === "business" ? "Registered business" : "Independent promoter"}
                      {a.email ? `, ${a.email}` : ""}
                      {a.createdAt ? `, sent ${time(a.createdAt)}` : ""}
                    </p>
                  </div>
                  <span className={`pill ${a.status === "approved" ? "pill-ok" : a.status === "pending" ? "pill-live" : "pill-blocked"}`}>{TABS.find((t) => t.id === a.status)?.label}</span>
                </div>
                <div className="breakdown">
                  {a.registrationNumber && (
                    <div className="row">
                      <span>Registration number</span>
                      <strong>{a.registrationNumber}</strong>
                    </div>
                  )}
                  {a.pastEvents && (
                    <div className="row" style={{ alignItems: "flex-start" }}>
                      <span>Past events</span>
                      <strong style={{ textAlign: "right", maxWidth: "60%" }}>{a.pastEvents}</strong>
                    </div>
                  )}
                  {a.socials && (
                    <div className="row">
                      <span>Socials</span>
                      <strong>{a.socials}</strong>
                    </div>
                  )}
                  <div className="row">
                    <span>Payouts to</span>
                    <strong>{a.payoutDetails}</strong>
                  </div>
                </div>
                {a.status !== "approved" && (
                  <>
                    <div className="field">
                      <label htmlFor={`note-${a.userId}`}>Note to the promoter (optional)</label>
                      <input
                        id={`note-${a.userId}`}
                        className="input"
                        placeholder="Add a link to a past event's ticket page"
                        value={notes[a.userId] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [a.userId]: e.target.value }))}
                      />
                    </div>
                    <div className="tag-row">
                      <Button className="btn-sm" disabled={!!busy} onClick={() => review(a.userId, "approved")}>
                        Approve
                      </Button>
                      <Button variant="ghost" className="btn-sm" disabled={!!busy} onClick={() => review(a.userId, "needs_more")}>
                        Ask for more
                      </Button>
                      <Button variant="ghost" className="btn-sm" disabled={!!busy} onClick={() => review(a.userId, "rejected")}>
                        Don't approve
                      </Button>
                    </div>
                  </>
                )}
              </motion.article>
            ))}
          </AnimatePresence>
        )}
      </div>
      )}
    </div>
  );
}

const mask = (v?: string) => (v ? `${v.slice(0, 3)} ••• ${v.slice(-3)}` : "None");

// Not in the menu: reached from the admin Overview only, and the server checks the admin role.
export function AdminPeople() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [shown, setShown] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = () => {
    api.users().then(setUsers).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load people"));
  };
  useEffect(load, []);
  async function changeRole(userId: string, role: Role) {
    setError("");
    const who = users.find((u) => u.id === userId);
    if (!window.confirm(`Make ${who?.fullName || who?.email || "this person"} a ${role}?`)) return;
    try {
      await api.setRole(userId, role);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save");
    }
  }
  return (
    <div className="desk">
      <TopBar />
      <Enter>
        <h1 style={{ margin: "8px 0 16px" }}>People</h1>
        <p className="muted">Everyone with an account. Only admins can open this page. Role changes ask you to confirm first.</p>
      </Enter>
      {error && (
        <p role="alert" className="callout callout-blocked" style={{ marginTop: 14 }}>
          {error}
        </p>
      )}
      
      <div className="panel" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Name", "Email", "Phone", "Role", "Verified"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "10px 8px", borderBottom: "2.5px solid #000", textTransform: "uppercase", fontSize: 13 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ padding: "10px 8px", borderBottom: "2px solid #000", fontWeight: 700 }}>{u.fullName || "No name"}</td>
                <td style={{ padding: "10px 8px", borderBottom: "2px solid #000" }}>{u.email}</td>
                <td style={{ padding: "10px 8px", borderBottom: "2px solid #000", whiteSpace: "nowrap" }}>
                  {shown === u.id ? u.phone || "None" : mask(u.phone)}{" "}
                  {u.phone && (
                    <button type="button" className="account-out" style={{ padding: "3px 8px", fontSize: "0.7rem" }} onClick={() => setShown(shown === u.id ? null : u.id)}>
                      {shown === u.id ? "Hide" : "Show"}
                    </button>
                  )}
                </td>
                <td style={{ padding: "10px 8px", borderBottom: "2px solid #000" }}>
                  <label className="sr-only" htmlFor={`role-${u.id}`}>
                    Role for {u.email}
                  </label>
                  <select id={`role-${u.id}`} className="input" style={{ minHeight: 40, width: "auto" }} value={u.role} onChange={(e) => changeRole(u.id, e.target.value as Role)}>
                    <option value="fan">Ticket holder</option>
                    <option value="promoter">Promoter</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td style={{ padding: "10px 8px", borderBottom: "2px solid #000" }}>{u.verified ? "Yes" : "Not yet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminOverview() {
  const { drops } = useApp();
  const navigate = useNavigate();
  const [pending, setPending] = useState<PromoterApplication[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [payoutsWaiting, setPayoutsWaiting] = useState(0);
  const [eventsWaiting, setEventsWaiting] = useState(0);
  const [changesWaiting, setChangesWaiting] = useState(0);
  useEffect(() => {
    api.eventsInReview().then((l) => setEventsWaiting(l.filter((d) => d.review?.status === "pending").length)).catch(() => undefined);
    api.changeRequests().then((l) => setChangesWaiting(l.length)).catch(() => undefined);
    api.applications("pending").then(setPending).catch(() => undefined);
    api.users().then(setUsers).catch(() => undefined);
    api.allPayouts().then((l) => setPayoutsWaiting(l.filter((p) => p.status === "requested").length)).catch(() => undefined);
  }, []);
  const onSale = drops.filter((d) => d.state === "open").length;
  const tiles = [
    { label: "Waiting for review", value: pending.length + eventsWaiting + changesWaiting, to: "/admin/review", bg: "var(--sun)", cta: `${pending.length} promoters, ${eventsWaiting} events, ${changesWaiting} changes` },
    { label: "People", value: users.length, to: "/admin/people", bg: "var(--mint)", cta: "See everyone" },
    { label: "Events", value: drops.length, to: "/admin/events", bg: "#8ec5ff", cta: `${onSale} on sale now` },
    { label: "Payouts to make", value: payoutsWaiting, to: "/admin/payouts", bg: "var(--lilac)", cta: "Pay promoters" },
  ];
  return (
    <div className="desk">
      <TopBar />
      <Marquee rows={[["Admin", "Real promoters only", "Ticket holders protected", "No touts"]]} size={34} speed={36} />
      <Enter>
        <h1 style={{ margin: "8px 0 6px" }}>Overview</h1>
        <p className="muted">You approve every promoter before their events can go on sale, and look after everyone's roles.</p>
      </Enter>
      <div className="kpis">
        {tiles.map((t) => (
          <button key={t.label} type="button" className="kpi kpi-link" style={{ background: t.bg }} onClick={() => navigate(t.to)}>
            <p style={{ fontWeight: 800 }}>{t.label}</p>
            <p className="stat-value num">{t.value}</p>
            <p className="faint">{t.cta}</p>
          </button>
        ))}
      </div>
      {pending.length > 0 && (
        <div className="panel list-card">
          <div>
            <strong>{pending.length === 1 ? "1 promoter is" : `${pending.length} promoters are`} waiting for you</strong>
            <p className="faint">Oldest first: {pending[0].displayName}</p>
          </div>
          <Button onClick={() => navigate("/admin/review")}>Review now</Button>
        </div>
      )}
    </div>
  );
}

export function AdminEvents() {
  const { drops } = useApp();
  return (
    <div className="desk">
      <TopBar />
      <Enter>
        <h1 style={{ margin: "8px 0 16px" }}>All events</h1>
      </Enter>
      {drops.length === 0 ? (
        <p className="callout">No events yet. They show up here as soon as a promoter creates one.</p>
      ) : (
        <div className="event-grid wide">
          {drops.map((d) => (
            <Link key={d.id} to={`/promoter/events/${d.id}`} className="event-card">
              <div className="event-art">
                <EventArt drop={d} />
              </div>
              <div className="event-body">
                <div>
                  <h3>{d.name}</h3>
                  <p className="faint">
                    {d.promoterName ?? "Siyangena"}, {d.city || d.venue}, {d.sold} of {d.supply} sold
                  </p>
                </div>
                <span className={`pill ${salePill(d).tone}`}>{salePill(d).label}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
