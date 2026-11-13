import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { AdminUser, ApplicationStatus, PromoterApplication, Role } from "@drop/shared";
import { Button, Enter, Marquee, TopBar } from "../components/ui";
import { api } from "../lib/api";
import { time } from "../lib/format";

const TABS: { id: ApplicationStatus; label: string }[] = [
  { id: "pending", label: "Waiting" },
  { id: "needs_more", label: "Asked for more" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Not approved" },
];

// Siyangena admins review every promoter before their events can go on sale.
export function AdminHome() {
  const [tab, setTab] = useState<ApplicationStatus>("pending");
  const [apps, setApps] = useState<PromoterApplication[] | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    api.applications(tab).then(setApps).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load applications"));
    api.users().then(setUsers).catch(() => undefined);
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

  async function changeRole(userId: string, role: Role) {
    setError("");
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
      <Marquee rows={[["Promoter review", "Real promoters only", "Fans protected"]]} size={34} speed={36} />
      <Enter>
        <h1 style={{ margin: "8px 0 16px" }}>Promoter review</h1>
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

      <h2 style={{ margin: "32px 0 12px" }}>People</h2>
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
                <td style={{ padding: "10px 8px", borderBottom: "2px solid #000" }}>{u.phone || "None"}</td>
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
