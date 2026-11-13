import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { AdminUser, ApplicationStatus, PromoterApplication, Role } from "@drop/shared";
import { Link, useNavigate } from "react-router-dom";
import { Button, Enter, Marquee, TopBar } from "../components/ui";
import { EventArt, salePill } from "./FanHome";
import { useApp } from "../lib/store";
import { api } from "../lib/api";
import { time } from "../lib/format";

const TABS: { id: ApplicationStatus; label: string }[] = [
  { id: "pending", label: "Waiting" },
  { id: "needs_more", label: "Asked for more" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Not approved" },
];

// Siyangena admins review every promoter before their events can go on sale.
export function AdminReview() {
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
        <h1 style={{ margin: "8px 0 6px" }}>Promoter review</h1>
        <p className="muted" style={{ marginBottom: 14 }}>Approve a promoter and their events can go on sale. Ask for more if something is missing; they see your note.</p>
        <div className="chips" role="group" aria-label="Show">
          {TABS.map((t) => (
            <motion.button key={t.id} type="button" className="chip" aria-pressed={tab === t.id} whileTap={{ scale: 0.92 }} onClick={() => setTab(t.id)}>
              {t.label}
            </motion.button>
          ))}
        </div>
      </Enter>
      {error && (
        <p role="alert" className="callout callout-blocked" style={{ marginTop: 14 }}>
          {error}
        </p>
      )}
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
                    <option value="fan">Fan</option>
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
  useEffect(() => {
    api.applications("pending").then(setPending).catch(() => undefined);
    api.users().then(setUsers).catch(() => undefined);
  }, []);
  const onSale = drops.filter((d) => d.state === "open").length;
  const tiles = [
    { label: "Promoters waiting", value: pending.length, to: "/admin/review", bg: "var(--sun)", cta: "Review them" },
    { label: "People", value: users.length, to: "/admin/people", bg: "var(--mint)", cta: "See everyone" },
    { label: "Events", value: drops.length, to: "/admin/events", bg: "#8ec5ff", cta: `${onSale} on sale now` },
    { label: "Verified fans", value: users.filter((u) => u.verified).length, to: "/admin/people", bg: "var(--lilac)", cta: "One person, one wallet" },
  ];
  return (
    <div className="desk">
      <TopBar />
      <Marquee rows={[["Admin", "Real promoters only", "Fans protected", "No touts"]]} size={34} speed={36} />
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
