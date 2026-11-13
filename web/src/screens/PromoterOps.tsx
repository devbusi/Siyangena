import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import jsQR from "jsqr";
import type { CheckinResult, DoorStats, Payout, PayoutSummary } from "@drop/shared";
import { Button, Enter, TopBar } from "../components/ui";
import { api, type CancelPreview } from "../lib/api";
import { dateLong, rand } from "../lib/format";
import { useApp } from "../lib/store";
import { useEvent } from "./EventPage";

// ---------- Cancel an event ----------

export function CancelEvent() {
  const { id } = useParams();
  const [drop, refreshDrop] = useEvent(id);
  const { refreshDrops } = useApp();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<CancelPreview | null>(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (id) api.cancelPreview(id).then(setPreview).catch((e) => setError(e instanceof Error ? e.message : "Couldn't work out the refunds"));
  }, [id]);

  const cancelled = drop?.state === "cancelled";
  useEffect(() => {
    if (!cancelled || drop?.cancel?.done) return;
    const t = setInterval(refreshDrop, 2000);
    return () => clearInterval(t);
  }, [cancelled, drop?.cancel?.done]); // eslint-disable-line react-hooks/exhaustive-deps

  async function go() {
    setBusy(true);
    setError("");
    try {
      await api.cancelEvent(id!, reason.trim());
      refreshDrop();
      refreshDrops();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel the event");
    } finally {
      setBusy(false);
    }
  }

  const c = drop?.cancel;
  return (
    <div className="desk">
      <TopBar back={`/promoter/events/${id}`} />
      <div className="desk-form" style={{ marginTop: 14 }}>
        <Enter>
          <div className="stack" style={{ gap: 16 }}>
            <h1 style={{ fontSize: "clamp(2.4rem, 6vw, 4.4rem)" }}>{cancelled ? `${drop?.name} is cancelled` : `Cancel ${drop?.name ?? "this event"}?`}</h1>
            {cancelled && c && (
              <div className="stack" style={{ gap: 12 }}>
                <p style={{ fontSize: "1.15rem", maxWidth: 640 }}>Ticket holders were told: "{c.reason}"</p>
                <p className="muted">
                  {rand(c.refundedZar)} of {rand(c.totalZar)} is back with ticket holders. Tickets for this event no longer get anyone in at the door.
                </p>
                <div>
                  <Button variant="ghost" onClick={() => navigate(`/promoter/events/${id}`)}>
                    Back to the event
                  </Button>
                </div>
              </div>
            )}
            {!cancelled && drop && (drop.state === "closed" || new Date(drop.startsAt).getTime() <= Date.now()) && (
              <p className="callout">Sales are closed for this event, so it can't be cancelled here.</p>
            )}
            {!cancelled && drop && drop.state !== "closed" && new Date(drop.startsAt).getTime() > Date.now() && (
              <>
                <p style={{ fontSize: "1.15rem", maxWidth: 640 }}>Every ticket holder gets their money back automatically, straight to their wallet. You can't undo this.</p>
                <div className="panel stack" style={{ gap: 8 }}>
                  <div className="row">
                    <span>People holding tickets</span>
                    <strong className="num">{preview ? preview.holders : "…"}</strong>
                  </div>
                  <div className="row">
                    <span>Tickets refunded at face value</span>
                    <strong className="num">{preview ? rand(preview.faceZar) : "…"}</strong>
                  </div>
                  <div className="row">
                    <span>Resale buyers get back what they paid, extra</span>
                    <strong className="num">{preview ? rand(preview.resaleExtraZar) : "…"}</strong>
                  </div>
                  <div className="row" style={{ borderTop: "2.5px dashed #000", paddingTop: 8 }}>
                    <strong>Total going back to ticket holders</strong>
                    <strong className="num">{preview ? rand(preview.totalZar) : "…"}</strong>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="why">Tell ticket holders why (they'll see this)</label>
                  <textarea id="why" className="input" style={{ minHeight: 96 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="The venue has flooded. We're so sorry, and we'll be back in the new year." />
                </div>
                <div className="field">
                  <label htmlFor="confirm">Type CANCEL to confirm</label>
                  <input id="confirm" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
                </div>
                {error && (
                  <p role="alert" className="callout callout-blocked">
                    {error}
                  </p>
                )}
                <div className="row" style={{ gap: 10, flexWrap: "wrap", justifyContent: "flex-start" }}>
                  <Button style={{ background: "var(--coral)", color: "#000" }} disabled={busy || confirm !== "CANCEL" || reason.trim().length < 5} onClick={go}>
                    {busy ? "Cancelling" : "Cancel and refund everyone"}
                  </Button>
                  <Button variant="ghost" onClick={() => navigate(`/promoter/events/${id}`)}>
                    Keep the event
                  </Button>
                </div>
              </>
            )}
          </div>
        </Enter>
        <aside className="desk-aside stack">
          <p style={{ fontWeight: 800 }}>{cancelled ? "Refunds" : "After you confirm"}</p>
          <div className="panel stack" style={{ background: "#8ec5ff", gap: 10 }}>
            <h3>{c?.done ? "Everyone's been refunded" : "Refunding ticket holders"}</h3>
            <p className="stat-value num" style={{ fontSize: "3.6rem" }}>
              {c ? `${c.refunded} of ${c.holders}` : preview ? `0 of ${preview.holders}` : "…"}
            </p>
            <div className="meter" aria-hidden="true">
              <motion.div initial={false} animate={{ width: `${c ? (c.holders ? (c.refunded / c.holders) * 100 : 100) : 0}%` }} />
            </div>
            <p>Each ticket holder gets an alert with your message. Their tickets stop working at the door.</p>
          </div>
          {cancelled && (
            <Button variant="ghost" onClick={() => navigate("/promoter/payouts")}>
              See payouts
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------- Door scanner ----------

type Scan = CheckinResult & { key: number };

export function DoorScanner() {
  const { id } = useParams();
  const [drop] = useEvent(id);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const lastCode = useRef("");
  const busy = useRef(false);
  const [camera, setCamera] = useState<"off" | "on" | "blocked">("off");
  const [result, setResult] = useState<Scan | null>(null);
  const [stats, setStats] = useState<DoorStats | null>(null);
  const [manual, setManual] = useState("");

  const loadStats = () => {
    if (id) api.doorStats(id).then(setStats).catch(() => undefined);
  };
  useEffect(loadStats, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function check(code: string) {
    if (busy.current || !id) return;
    busy.current = true;
    try {
      const r = await api.checkIn(id, code);
      setResult({ ...r, key: Date.now() });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : "Couldn't check that ticket", key: Date.now() });
    } finally {
      busy.current = false;
      loadStats();
    }
  }

  // Camera: read frames, decode QR codes, and check each new code once.
  useEffect(() => {
    if (camera !== "on") return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = () => {
          const v = video.current;
          const c = canvas.current;
          if (v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, c.width, c.height);
              const img = ctx.getImageData(0, 0, c.width, c.height);
              const found = jsQR(img.data, img.width, img.height);
              if (found?.data && found.data !== lastCode.current) {
                lastCode.current = found.data;
                void check(found.data);
                setTimeout(() => (lastCode.current = ""), 4000);
              }
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setCamera("blocked");
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [camera]); // eslint-disable-line react-hooks/exhaustive-deps

  const toCome = stats ? Math.max(0, stats.sold - stats.checkedIn) : 0;

  return (
    <div className="phone">
      <TopBar back={`/promoter/events/${id}`} />
      <div className="row" style={{ marginTop: 4 }}>
        <h1 style={{ fontSize: "2.4rem" }}>Door</h1>
        <span className="pill" style={{ background: "var(--sun)" }}>
          {drop?.name ?? "Event"}
        </span>
      </div>

      <div style={{ position: "relative", height: 300, border: "3px solid #000", borderRadius: 22, background: "#222", overflow: "hidden", marginTop: 14 }}>
        <video ref={video} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: camera === "on" ? "block" : "none" }} />
        <canvas ref={canvas} style={{ display: "none" }} />
        <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "45%", width: 190, height: 190, transform: "translate(-50%, -50%)", borderRadius: 10, border: "3px dashed rgba(255,255,255,.6)" }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 14, display: "grid", placeItems: "center", gap: 8 }}>
          {camera === "on" ? (
            <p style={{ color: "#fff", fontWeight: 700 }}>Point the camera at the ticket</p>
          ) : (
            <Button variant="sun" onClick={() => setCamera("on")}>
              {camera === "blocked" ? "Camera blocked: try again" : "Start scanning"}
            </Button>
          )}
        </div>
      </div>

      {result && (
        <motion.div
          key={result.key}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 22 }}
          style={{ marginTop: 14, background: result.ok ? "var(--mint)" : "var(--coral)", border: "3px solid #000", borderRadius: 22, padding: "16px 18px", display: "flex", gap: 14, alignItems: "center" }}
          role="status"
        >
          <span style={{ width: 56, height: 56, border: "2.5px solid #000", borderRadius: "50%", display: "grid", placeItems: "center", background: "#fff", flex: "none" }} aria-hidden="true">
            {result.ok ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            )}
          </span>
          <div>
            <p style={{ fontWeight: 900, fontStretch: "62%", textTransform: "uppercase", fontSize: "2.2rem", lineHeight: 0.95 }}>{result.ok ? "Let them in" : result.reason === "used" ? "Already used" : "Don't let in"}</p>
            <p style={{ fontWeight: 700 }}>
              {result.ok ? `${result.fanName ?? "Ticket holder"}, ticket ${result.ticket} of ${result.of}` : `${result.fanName ? `${result.fanName}. ` : ""}${result.message}`}
            </p>
          </div>
        </motion.div>
      )}

      <form
        className="row"
        style={{ gap: 8, marginTop: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) void check(manual.trim());
          setManual("");
        }}
      >
        <input className="input" style={{ flex: 1 }} placeholder="Or type the code, e.g. K7Q4-M2PX" value={manual} onChange={(e) => setManual(e.target.value)} aria-label="Ticket code" />
        <Button type="submit" variant="ghost" className="btn-sm">
          Check
        </Button>
      </form>

      <div className="row" style={{ fontWeight: 800, marginTop: 16 }}>
        <span>{stats?.checkedIn ?? 0} in</span>
        <span>{toCome} to come</span>
        <span>{stats?.turnedAway ?? 0} turned away</span>
      </div>
      <p className="faint" style={{ marginTop: 10 }}>
        Each code changes every minute and is checked against the ledger, so screenshots and copies don't get in.
      </p>
    </div>
  );
}

// ---------- Payouts ----------

function when(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" }) : "";
}

export function PromoterPayouts() {
  const { tick } = useApp();
  const [s, setS] = useState<PayoutSummary | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    api.payouts().then(setS).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load payouts"));
  };
  useEffect(load, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const paidToYou = s ? Number(s.paidZar) : 0;
  return (
    <div className="desk">
      <TopBar />
      <Enter>
        <h1 style={{ margin: "10px 0 18px", fontSize: "clamp(2.6rem, 7vw, 5rem)" }}>Payouts</h1>
      </Enter>
      {!s ? (
        <p className="muted">{error || "Loading your payouts"}</p>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi" style={{ background: "var(--mint)" }}>
              <p style={{ fontWeight: 800 }}>Paid to you</p>
              <p className="stat-value num">{rand(paidToYou)}</p>
            </div>
            <div className="kpi" style={{ background: "var(--sun)" }}>
              <p style={{ fontWeight: 800 }}>Resale fees</p>
              <p className="stat-value num">{rand(s.feesZar)}</p>
              <p className="faint">{s.resales} resales</p>
            </div>
            <div className="kpi">
              <p style={{ fontWeight: 800 }}>Held until the event</p>
              <p className="stat-value num">{rand(s.heldZar)}</p>
              <p className="faint">{s.kind === "business" ? "Registered business: paid as tickets sell" : "Independent: paid the morning after"}</p>
            </div>
            <div className="kpi">
              <p style={{ fontWeight: 800 }}>Refunded to ticket holders</p>
              <p className="stat-value num">{rand(s.refundedZar)}</p>
            </div>
          </div>

          <div className="desk-form" style={{ alignItems: "flex-start" }}>
            <div className="panel" style={{ overflowX: "auto" }}>
              <h2 style={{ marginBottom: 8 }}>By event</h2>
              {s.events.length === 0 ? (
                <p className="muted">No events yet. Your earnings show here once tickets sell.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Sales</th>
                      <th>Resale fees</th>
                      <th>Refunded</th>
                      <th>Paid or on its way</th>
                      <th>Next payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.events.map((e) => (
                      <tr key={e.eventId}>
                        <td>
                          <strong>{e.name}</strong>
                          <br />
                          <span className="faint">{dateLong(e.startsAt)}</span>
                        </td>
                        <td className="num">{rand(e.salesZar)}</td>
                        <td className="num">{rand(e.feesZar)}</td>
                        <td className="num">{rand(e.refundedZar)}</td>
                        <td className="num">{rand(Number(e.paidZar) + Number(e.requestedZar))}</td>
                        <td>{e.state === "cancelled" ? "Cancelled" : e.held ? `${rand(Number(e.netZar) - Number(e.paidZar) - Number(e.requestedZar))} the morning after` : Number(e.availableZar) > 0 ? `${rand(e.availableZar)} sending now` : "Up to date"}</td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <aside className="desk-aside stack">
              <div className="panel stack" style={{ background: "var(--lilac)", gap: 8 }}>
                <h2>Next payout</h2>
                <p className="stat-value num" style={{ fontSize: "3.4rem" }}>
                  {rand(Number(s.heldZar) + Number(s.availableZar) + Number(s.requestedZar))}
                </p>
                <p>
                  {s.kind === "business"
                    ? "Paid automatically as tickets sell."
                    : s.nextPayoutAt
                      ? `Paid automatically on ${new Date(s.nextPayoutAt).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}, the morning after your event.`
                      : "Paid automatically the morning after each event."}{" "}
                  {s.bank ? `To ${s.bank}.` : "Add your bank details in your account."}
                </p>
                {error && <p style={{ fontWeight: 700 }}>{error}</p>}
              </div>
              {s.kind === "independent" && (
                <p className="callout">Ticket money is held safely until the morning after your event. If it's cancelled, every ticket holder is refunded automatically.</p>
              )}
            </aside>
          </div>

          <div className="panel" style={{ marginTop: 16, overflowX: "auto" }}>
            <h2 style={{ marginBottom: 8 }}>History</h2>
            {s.history.length === 0 ? (
              <p className="muted">No payouts yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Event</th>
                    <th>Amount</th>
                    <th>To</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {s.history.map((p) => (
                    <tr key={p.id}>
                      <td>{when(p.createdAt)}</td>
                      <td>{p.eventName}</td>
                      <td className="num">{rand(p.amountZar)}</td>
                      <td>{p.bank ?? "Your bank"}</td>
                      <td>
                        {p.status === "paid" ? (
                          <>
                            Paid {when(p.paidAt)}, ref {p.reference}
                            {p.explorerUrl && (
                              <>
                                {" "}
                                <a href={p.explorerUrl} target="_blank" rel="noreferrer">
                                  Ledger receipt
                                </a>
                              </>
                            )}
                          </>
                        ) : (
                          "Sending"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Admin: pay promoters (by bank transfer) and mark each payout paid.
export function AdminPayouts() {
  const [list, setList] = useState<Payout[] | null>(null);
  const [busy, setBusy] = useState("");
  const load = () => {
    api.allPayouts().then(setList).catch(() => setList([]));
  };
  useEffect(load, []);

  const [error, setError] = useState("");
  async function paid(id: string) {
    setBusy(id);
    setError("");
    try {
      await api.markPayoutPaid(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send it");
    } finally {
      setBusy("");
    }
  }

  const waiting = (list ?? []).filter((p) => p.status === "requested");
  return (
    <div className="desk">
      <TopBar />
      <Enter>
        <h1 style={{ margin: "10px 0 6px" }}>Payouts</h1>
        <p className="muted" style={{ marginBottom: 18 }}>
          Payouts run automatically: as soon as an event's money is due, it moves from the platform wallet to the bank wallet on the ledger and a bank transfer goes to the promoter. Anything that didn't go through shows here to send again.
        </p>
      </Enter>
      {!list ? (
        <p className="muted">Loading payouts</p>
      ) : list.length === 0 ? (
        <p className="callout">No payouts yet. They appear here as events earn money.</p>
      ) : (
        <div className="panel" style={{ overflowX: "auto" }}>
          <p style={{ fontWeight: 800, marginBottom: 8 }}>{waiting.length ? `${waiting.length} still sending` : "All sent"}</p>
          {error && <p className="callout callout-blocked">{error}</p>}
          <table className="table">
            <thead>
              <tr>
                <th>Requested</th>
                <th>Promoter</th>
                <th>Event</th>
                <th>Amount</th>
                <th>To</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>{when(p.createdAt)}</td>
                  <td>{p.promoterName ?? p.promoterId}</td>
                  <td>{p.eventName}</td>
                  <td className="num">{rand(p.amountZar)}</td>
                  <td>{p.bank ?? "No bank details"}</td>
                  <td>
                    {p.status === "paid" ? (
                      <>
                        Paid {when(p.paidAt)}, ref {p.reference}
                        {p.explorerUrl && (
                          <>
                            {" "}
                            <a href={p.explorerUrl} target="_blank" rel="noreferrer">
                              Ledger receipt
                            </a>
                          </>
                        )}
                      </>
                    ) : (
                      <Button className="btn-sm" disabled={busy === p.id} onClick={() => paid(p.id)}>
                        {busy === p.id ? "Sending" : "Send again"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
