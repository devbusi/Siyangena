import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AlertItem, AlertKind, Wish } from "@drop/shared";
import { Button, Enter, TopBar } from "../components/ui";
import { api } from "../lib/api";
import { dateLong, rand } from "../lib/format";
import { useApp } from "../lib/store";
import { useAuth } from "../lib/auth";

const DOT: Record<AlertKind, string> = {
  new_event: "var(--sun)",
  sale_open: "var(--sun)",
  resale: "var(--lilac)",
  tickets: "var(--mint)",
  sold: "var(--mint)",
  limit: "var(--coral)",
  cancelled: "var(--coral)",
};

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

// The one or two things you can do about each alert, right there.
function actionsFor(a: AlertItem): { label: string; to: string; primary?: boolean }[] {
  const id = a.eventId;
  switch (a.kind) {
    case "new_event":
    case "sale_open":
      return id
        ? [
            { label: "Buy tickets", to: `/events/${id}/buy`, primary: true },
            { label: "Send my agent in", to: `/events/${id}/agent` },
          ]
        : [];
    case "resale":
      return id ? [{ label: "See the ticket", to: `/events/${id}`, primary: true }] : [];
    case "tickets":
      return [{ label: "See tickets", to: "/tickets", primary: true }];
    case "sold":
    case "cancelled":
      return [{ label: "See wallet", to: "/wallet", primary: true }];
    case "limit":
      return id ? [{ label: "Change my limit", to: `/events/${id}/agent`, primary: true }] : [];
    default:
      return [];
  }
}

export function Alerts() {
  const { tick } = useApp();
  const navigate = useNavigate();
  const [list, setList] = useState<AlertItem[] | null>(null);

  useEffect(() => {
    api
      .alerts()
      .then((items) => {
        setList(items);
        if (items.some((a) => !a.read)) api.readAlerts().catch(() => undefined);
      })
      .catch(() => setList([]));
  }, [tick]);

  return (
    <div className="phone">
      <TopBar />
      <Enter>
        <h1 style={{ margin: "10px 0 6px" }}>Alerts</h1>
        <p className="muted" style={{ marginBottom: 18 }}>
          New events you wished for, sales opening, tickets landing and anything your agent needs from you.
        </p>
      </Enter>
      {!list ? (
        <p className="muted">Loading your alerts</p>
      ) : list.length === 0 ? (
        <div className="callout stack" style={{ gap: 10 }}>
          <strong>Nothing yet</strong>
          <p className="muted">Add who you want to see to your wishlist and you'll hear the moment they're on Siyangena.</p>
          <Button onClick={() => navigate("/wishlist")}>Open my wishlist</Button>
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {list.map((a) => (
            <div key={a.id} className="panel" style={{ display: "flex", gap: 12, padding: "12px 14px", background: a.read ? "#fff" : "#fff8df" }}>
              <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: "50%", border: "2.5px solid #000", background: DOT[a.kind], marginTop: 4, flex: "none" }} />
              <div className="stack" style={{ flex: 1, gap: 6 }}>
                <strong>{a.title}</strong>
                <p style={{ fontSize: "0.95rem" }}>{a.body}</p>
                <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span className="faint" style={{ marginRight: "auto" }}>
                    {ago(a.at)}
                  </span>
                  {actionsFor(a).map((x) => (
                    <Button key={x.label} className="btn-sm" variant={x.primary ? "primary" : "ghost"} onClick={() => navigate(x.to)}>
                      {x.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <p className="faint" style={{ textAlign: "center" }}>
            Alerts also come to your phone by SMS.
          </p>
        </div>
      )}
    </div>
  );
}

// Who you want to see. Siyangena tells you when they're listed, and when sales open.
export function Wishlist() {
  const { signedIn } = useAuth();
  const { tick } = useApp();
  const navigate = useNavigate();
  const [wishes, setWishes] = useState<Wish[] | null>(null);
  const [query, setQuery] = useState("");
  const [max, setMax] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Wish | null>(null);

  useEffect(() => {
    if (!signedIn) {
      setWishes([]);
      return;
    }
    api.wishes().then(setWishes).catch(() => setWishes([]));
  }, [signedIn, tick]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!signedIn) {
      navigate("/signin?next=/wishlist");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const maxZar = Number(max.replace(/[^\d.]/g, ""));
      const w = await api.addWish({ query, ...(city.trim() ? { city: city.trim() } : {}), ...(maxZar > 0 ? { maxZar } : {}) });
      setSaved(w);
      setWishes((list) => [w, ...(list ?? [])]);
      setQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setWishes((list) => (list ?? []).filter((w) => w.id !== id));
    await api.removeWish(id).catch(() => undefined);
  }

  return (
    <div className="phone">
      <TopBar />
      <Enter>
        <h1 style={{ margin: "10px 0 8px" }}>Who do you want to see?</h1>
        <p className="muted">Events that fit show here straight away. When a new one is listed, or sales open, you get an alert.</p>
      </Enter>
      <Enter delay={0.06}>
        <form className="panel stack" style={{ marginTop: 18 }} onSubmit={add}>
          <div className="field">
            <label htmlFor="wish">Artist, event or vibe</label>
            <input id="wish" className="input" required minLength={2} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Amapiano in Joburg" />
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="wmax">Max per ticket</label>
              <input id="wmax" className="input" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} placeholder="R500" />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="wcity">City</label>
              <input id="wcity" className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Anywhere" />
            </div>
          </div>
          <Button type="submit" block disabled={busy}>
            {busy ? "Saving" : "Add to wishlist"}
          </Button>
          {error && <p style={{ fontWeight: 700 }}>{error}</p>}
          {saved && (
            <p style={{ fontWeight: 700 }}>
              {saved.matches > 0
                ? `Saved. ${saved.matches === 1 ? "1 event fits" : `${saved.matches} events fit`} already, below.`
                : "Saved. Nothing fits yet. We'll alert you when it does."}
            </p>
          )}
        </form>
      </Enter>
      <div className="stack" style={{ marginTop: 18, gap: 10 }}>
        {(wishes ?? []).map((w) => (
          <div key={w.id} className="panel stack" style={{ gap: 6 }}>
            <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
              <strong>{w.query}</strong>
              <span className="pill" style={{ background: w.matches ? "var(--mint)" : "#fff" }}>
                {w.matches ? `${w.matches} on now` : "Watching"}
              </span>
            </div>
            <p className="muted">
              {w.city || "Anywhere"}
              {w.maxZar ? `, up to ${rand(w.maxZar)} a ticket` : ""}
            </p>
            {w.events.map((e) => (
              <div key={e.id} className="stack" style={{ gap: 8, borderTop: "2px dashed #000", paddingTop: 10, marginTop: 4 }}>
                <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                  <Link to={`/events/${e.id}`} style={{ fontWeight: 800, color: "inherit" }}>
                    {e.name}
                  </Link>
                  <span className="pill">{e.state === "open" ? "On sale" : "Soon"}</span>
                </div>
                <p className="faint">
                  {e.city || e.venue}, {dateLong(e.startsAt)}, {rand(e.priceZar)}
                </p>
                <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-start" }}>
                  <Button className="btn-sm" onClick={() => navigate(`/events/${e.id}/buy`)}>
                    Buy tickets
                  </Button>
                  <Button variant="lilac" className="btn-sm" onClick={() => navigate(`/events/${e.id}/agent`)}>
                    Send my agent in
                  </Button>
                </div>
              </div>
            ))}
            <div className="row" style={{ gap: 8, justifyContent: "flex-start" }}>
              <Button variant="ghost" className="btn-sm" onClick={() => remove(w.id)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
        <p className="faint" style={{ textAlign: "center" }}>
          Your agent only buys on Siyangena, where every ticket is real and capped. Promoters see what fans are asking for, so the events you want come here.
        </p>
      </div>
    </div>
  );
}
