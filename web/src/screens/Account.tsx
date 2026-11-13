import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Enter, TopBar } from "../components/ui";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";

const ROLE_COPY: Record<string, { title: string; body: string }> = {
  fan: { title: "Ticket holder", body: "Buy tickets, add an agent with your own limits, and resell fairly if you can't go." },
  promoter: { title: "Promoter", body: "Create events, set your rules and watch sales live. Every promoter and every event is checked before it goes on sale." },
  admin: { title: "Admin", body: "Review promoters and events, pay promoters, and look after everyone's roles." },
};

// South African mobile numbers in one shape: +27 then nine digits.
function normalisePhone(v: string) {
  const d = v.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("27")) return `+${d}`;
  if (d.startsWith("0")) return `+27${d.slice(1)}`;
  return `+${d}`;
}

export function Account() {
  const { me, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const app = me?.application;
  const [display, setDisplay] = useState("");
  const [reg, setReg] = useState("");
  const [bank, setBank] = useState("");
  const [socials, setSocials] = useState("");
  const [past, setPast] = useState("");
  const [pSaved, setPSaved] = useState("");
  const [pError, setPError] = useState("");

  useEffect(() => {
    if (!me) return;
    setName(me.fullName ?? "");
    setPhone(me.phone ?? "");
    if (me.application) {
      setDisplay(me.application.displayName ?? "");
      setReg(me.application.registrationNumber ?? "");
      setBank(me.application.payoutDetails ?? "");
      setSocials(me.application.socials ?? "");
      setPast(me.application.pastEvents ?? "");
    }
  }, [me?.id, me?.application?.displayName, me?.application?.payoutDetails]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return null;
  const role = ROLE_COPY[me.role];
  const pending = me.changeRequest?.status === "pending" ? me.changeRequest : null;

  async function saveMe(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await api.updateProfile({ fullName: name.trim(), phone: normalisePhone(phone) });
      await refresh();
      setSaved("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that");
    } finally {
      setBusy(false);
    }
  }

  async function savePromoter(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setPError("");
    setPSaved("");
    try {
      const next = await api.updatePromoterDetails({ displayName: display.trim(), registrationNumber: reg.trim(), payoutDetails: bank.trim(), socials: socials.trim(), pastEvents: past.trim() });
      await refresh();
      setPSaved(next.changeRequest?.status === "pending" ? "Saved. Your new name, registration number or bank account goes live once an admin approves it." : "Saved");
    } catch (err) {
      setPError(err instanceof Error ? err.message : "Couldn't save that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="phone">
      <TopBar />
      <Enter>
        <h1 style={{ margin: "10px 0 16px" }}>{me.fullName || "Your account"}</h1>
      </Enter>
      <Enter delay={0.05}>
        <div className="stack">
          <div className="panel stack" style={{ gap: 6, background: me.role === "admin" ? "var(--lilac)" : me.role === "promoter" ? "var(--mint)" : "var(--sun)" }}>
            <span className="pill" style={{ alignSelf: "flex-start" }}>
              {role.title}
            </span>
            <p>{role.body}</p>
          </div>

          <form className="panel stack" onSubmit={saveMe}>
            <h3>Your details</h3>
            <div className="field">
              <label htmlFor="acc-name">Full name</label>
              <input id="acc-name" className="input" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="acc-phone">Mobile, for ticket texts</label>
              <input id="acc-phone" className="input" inputMode="tel" placeholder="082 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="row">
              <span className="muted">Email</span>
              <strong>{me.email}</strong>
            </div>
            <div className="row">
              <span className="muted">Verified</span>
              <strong>{me.verified ? "Yes" : "Not yet"}</strong>
            </div>
            <div className="row">
              <span className="muted">Ticket wallet</span>
              <strong>{me.walletReady ? "Ready" : "Not set up"}</strong>
            </div>
            {error && <p className="callout callout-blocked">{error}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? "Saving" : saved || "Save my details"}
            </Button>
          </form>

          {me.role === "fan" && !me.verified && (
            <Button block onClick={() => navigate("/verify?next=/account")}>
              Verify me
            </Button>
          )}

          {me.role === "promoter" && !app && (
            <Button block onClick={() => navigate("/promoter/apply")}>
              Apply as a promoter
            </Button>
          )}
          {me.role === "promoter" && app && app.status !== "approved" && (
            <div className="panel stack" style={{ gap: 8 }}>
              <strong>Promoter application</strong>
              <p className="muted">{app.status === "pending" ? "Being reviewed. You can still change anything." : app.reviewNote || "Needs an update."}</p>
              <Button variant="ghost" className="btn-sm" onClick={() => navigate("/promoter/apply")}>
                Update my application
              </Button>
            </div>
          )}
          {me.role === "promoter" && app?.status === "approved" && (
            <form className="panel stack" onSubmit={savePromoter}>
              <h3>Promoter details</h3>
              {pending && (
                <p className="callout">
                  Waiting for an admin to approve your change to{" "}
                  {[pending.displayName !== undefined && "your public name", pending.registrationNumber !== undefined && "registration number", pending.payoutDetails !== undefined && "bank account"].filter(Boolean).join(", ")}
                  . Until then your events and payouts use your current details.
                </p>
              )}
              {me.changeRequest?.status === "rejected" && <p className="callout callout-blocked">Your last change wasn't approved{me.changeRequest.note ? `: ${me.changeRequest.note}` : "."}</p>}
              <p className="muted">Your public name, registration number and bank account need an admin's approval to change. Socials and past events change straight away.</p>
              <div className="field">
                <label htmlFor="pd-name">Public name</label>
                <input id="pd-name" className="input" required value={display} onChange={(e) => setDisplay(e.target.value)} />
              </div>
              {app.kind === "business" && (
                <div className="field">
                  <label htmlFor="pd-reg">Company registration number</label>
                  <input id="pd-reg" className="input" value={reg} onChange={(e) => setReg(e.target.value)} />
                </div>
              )}
              <div className="field">
                <label htmlFor="pd-bank">Bank account for payouts</label>
                <input id="pd-bank" className="input" required value={bank} onChange={(e) => setBank(e.target.value)} placeholder="FNB, 62123456789" />
              </div>
              <div className="field">
                <label htmlFor="pd-soc">Socials</label>
                <input id="pd-soc" className="input" value={socials} onChange={(e) => setSocials(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="pd-past">Past events</label>
                <textarea id="pd-past" className="input" style={{ minHeight: 80 }} value={past} onChange={(e) => setPast(e.target.value)} />
              </div>
              {pError && <p className="callout callout-blocked">{pError}</p>}
              {pSaved && <p style={{ fontWeight: 700 }}>{pSaved}</p>}
              <Button type="submit" disabled={busy}>
                Save promoter details
              </Button>
            </form>
          )}

          <Button
            variant="ghost"
            block
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            Sign out
          </Button>
        </div>
      </Enter>
    </div>
  );
}
