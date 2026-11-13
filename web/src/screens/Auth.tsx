import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { Button, Coin, Enter, Marquee, Stickers, TopBar } from "../components/ui";
import { WalletArt } from "../components/WalletArt";
import { EventArt, salePill } from "./FanHome";
import { useApp } from "../lib/store";
import { dateLong } from "../lib/format";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

function homeFor(role?: string) {
  return role === "admin" ? "/admin" : role === "promoter" ? "/promoter" : "/events";
}

export function Landing() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const { drops } = useApp();
  const featured = drops.slice(0, 3);
  return (
    <div className="phone">
      <TopBar />
      <Enter className="wide">
        <div className="hero-marquee">
          <Marquee rows={[["Real tickets", "No scalpers", "Siyangena"], ["Your agent", "Your limits", "Fair resale"]]} size={58} />
          <Stickers
            items={[
              { x: "calc(100% - 118px)", y: "calc(100% + 18px)", size: 84, tilt: -16 },
              { x: "calc(100% - 96px)", y: "calc(100% + 116px)", size: 62, tilt: 18, face: "#56db9c" },
            ]}
          />
        </div>
      </Enter>

      <section className="landing-hero wide">
        <Enter delay={0.05}>
          <h1>Ziwaphi vandag? Siyangena.</h1>
          <p style={{ margin: "16px 0 0", position: "relative", zIndex: 2 }}>
            <span className="tile tired-tile">Tired of missing out the second sales open?</span>
          </p>
          <p className="muted" style={{ marginTop: 16, maxWidth: 560 }}>
            Scalpers have bots. Now fans have agents. Buy real tickets at face value, or add an agent that buys the moment sales open, within limits you set.
          </p>
          <div className="tag-row" style={{ marginTop: 22 }}>
            {me ? (
              <Button onClick={() => navigate(homeFor(me.role))}>{me.role === "fan" ? "Find tickets" : "Go to my dashboard"}</Button>
            ) : (
              <>
                <Button onClick={() => navigate("/signup")}>Create my account</Button>
                <Button variant="lilac" onClick={() => navigate("/events")}>
                  Browse events
                </Button>
              </>
            )}
          </div>
        </Enter>
        <Enter delay={0.1}>
          <WalletArt />
        </Enter>
      </section>

      <section className="wide">
        <h2 className="section-title">How it works</h2>
        <div className="landing-steps">
          {[
            { t: "Verify once", d: "One real person gets one ticket wallet. Bots and ticket farms can't get in.", bg: "#8ec5ff" },
            { t: "Buy or add an agent", d: "Buy at face value yourself, or let your agent buy the second sales open, within your limits.", bg: "var(--sun)" },
            { t: "Show up", d: "Your ticket is real and in your name. No screenshots, no fakes, no drama at the door.", bg: "var(--mint)" },
          ].map((s) => (
            <div key={s.t} className="landing-step" style={{ background: s.bg }}>
              <h3>{s.t}</h3>
              <p style={{ fontSize: "1.1rem" }}>{s.d}</p>
            </div>
          ))}
        </div>
        <div className="landing-pair" style={{ marginTop: 14 }}>
          <div className="landing-step" style={{ background: "var(--lilac)" }}>
            <h3>Can't go?</h3>
            <p style={{ fontSize: "1.1rem" }}>Resell to a verified fan at the promoter's cap. You get your money back, and nobody profits off you.</p>
          </div>
          <div className="landing-step" style={{ background: "var(--coral)" }}>
            <h3>Fakes fail</h3>
            <p style={{ fontSize: "1.1rem" }}>A copy, a screenshot or a ticket sold off the app never gets through the door.</p>
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="wide">
          <div className="row" style={{ flexWrap: "wrap" }}>
            <h2 className="section-title">Events near you</h2>
            <Button variant="ghost" className="btn-sm" onClick={() => navigate("/events")}>
              See all events
            </Button>
          </div>
          <div className="landing-events">
            {featured.map((d) => (
              <Link key={d.id} to={`/events/${d.id}`} className="event-card">
                <div className="event-art">
                  <EventArt drop={d} />
                </div>
                <div className="event-body">
                  <div>
                    <h3>{d.name}</h3>
                    <p className="faint">
                      {d.city || d.venue}, {dateLong(d.startsAt)}
                    </p>
                  </div>
                  <span className={`pill ${salePill(d).tone}`}>{salePill(d).label}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="landing-promoter wide" style={{ marginTop: 48 }}>
        <div>
          <h2 style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)" }}>Promoters: sell out fairly</h2>
          <p style={{ marginTop: 10, fontSize: "1.15rem" }}>Set the price, the limit per fan and the resale cap. Earn a fee on every resale, from Musina to Gqeberha.</p>
        </div>
        <Button variant="sun" onClick={() => navigate(me ? "/promoter" : "/signup?as=promoter")}>
          Sell with Siyangena
        </Button>
      </section>
    </div>
  );
}

export function SignUp() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState<"fan" | "promoter">(params.get("as") === "promoter" ? "promoter" : "fan");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const result = await signUp({ email: email.trim(), password, fullName, role });
      if (result.needsConfirm) setConfirm(true);
      else navigate(`/setup?next=${role === "promoter" ? "/promoter" : params.get("next") || "/events"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create your account");
    } finally {
      setBusy(false);
    }
  }

  if (confirm) {
    return (
      <div className="phone">
        <TopBar back="/" />
        <Enter>
          <h1 style={{ marginTop: 12 }}>Check your email</h1>
          <p className="muted" style={{ marginTop: 12 }}>
            We sent a link to {email}. Open it to confirm your account, then sign in.
          </p>
          <Button block style={{ marginTop: 24 }} onClick={() => navigate("/signin")}>
            Go to sign in
          </Button>
        </Enter>
      </div>
    );
  }

  return (
    <div className="phone">
      <TopBar back="/" />
      <Enter>
        <h1 style={{ marginTop: 12 }}>Create your account</h1>
      </Enter>
      <Enter delay={0.06}>
        <form className="stack" style={{ marginTop: 20 }} onSubmit={submit}>
          <div className="stack" style={{ gap: 8 }} role="group" aria-label="Account type">
            <button type="button" className="choice" aria-pressed={role === "fan"} onClick={() => setRole("fan")}>
              <strong>I'm here for tickets</strong>
              <span className="muted">Buy real tickets, add an agent, resell fairly.</span>
            </button>
            <button type="button" className="choice" aria-pressed={role === "promoter"} onClick={() => setRole("promoter")}>
              <strong>I run events</strong>
              <span className="muted">Sell tickets, set your rules, earn on resale. We check every promoter first.</span>
            </button>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="first">First name</label>
              <input id="first" className="input" required autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="last">Last name</label>
              <input id="last" className="input" required autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="faint">At least 8 characters.</p>
          </div>
          {error && (
            <p role="alert" className="callout callout-blocked">
              {error}
            </p>
          )}
          <Button type="submit" block disabled={busy}>
            {busy ? "Creating your account" : "Create my account"}
          </Button>
          <p className="faint" style={{ textAlign: "center" }}>
            Already have one? <Link to="/signin">Sign in</Link>
          </p>
        </form>
      </Enter>
    </div>
  );
}

export function SignIn() {
  const { signIn, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      const me = await refresh();
      const next = params.get("next");
      if (me && !me.walletReady) navigate(`/setup?next=${next || homeFor(me.role)}`);
      else navigate(next || homeFor(me?.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign you in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="phone">
      <TopBar back="/" />
      <Enter>
        <h1 style={{ marginTop: 12 }}>Welcome back</h1>
      </Enter>
      <Enter delay={0.06}>
        <form className="stack" style={{ marginTop: 20 }} onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="callout callout-blocked">
              {error}
            </p>
          )}
          <Button type="submit" block disabled={busy}>
            {busy ? "Signing in" : "Sign in"}
          </Button>
          <p className="faint" style={{ textAlign: "center" }}>
            New here? <Link to="/signup">Create an account</Link>
          </p>
        </form>
      </Enter>
    </div>
  );
}

// First sign-in: the server creates and funds the ticket wallet. Takes a few seconds.
export function Setup() {
  const { refresh, signedIn, ready } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!signedIn) {
      navigate("/signin");
      return;
    }
    let cancelled = false;
    api
      .setup()
      .then(async () => {
        const me = await refresh();
        if (cancelled) return;
        setDone(true);
        setTimeout(() => navigate(params.get("next") || homeFor(me?.role)), 900);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't set up your account"));
    return () => {
      cancelled = true;
    };
  }, [ready, signedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="phone">
      <TopBar />
      <div className="agent-stage" style={{ marginTop: 40 }}>
        <div className="orb" aria-hidden="true">
          <motion.div
            style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}
            animate={done ? { rotateY: 0, scale: [1, 1.15, 1] } : { rotateY: [0, 360] }}
            transition={done ? { duration: 0.5 } : { duration: 1.6, repeat: Infinity, ease: "linear" }}
          >
            <Coin size={120} face={done ? "#56db9c" : "#ffd43b"} />
          </motion.div>
        </div>
        <h1 className="orb-status" aria-live="polite">
          {error ? "That didn't work" : done ? "You're all set" : "Setting up your ticket wallet"}
        </h1>
        <p className="muted" style={{ marginTop: 8 }}>
          {error || (done ? "Taking you in." : "This takes a few seconds, once.")}
        </p>
        {error && (
          <Button style={{ marginTop: 20 }} onClick={() => window.location.reload()}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

export function Verify() {
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/events";
  const [state, setState] = useState<"idle" | "busy" | "done">(me?.verified ? "done" : "idle");
  const [error, setError] = useState("");

  async function verify() {
    setError("");
    setState("busy");
    try {
      await api.verify();
      await refresh();
      setState("done");
    } catch (e) {
      setState("idle");
      setError(e instanceof Error ? e.message : "Verification didn't go through");
    }
  }

  return (
    <>
      <div className="phone">
        <TopBar back={next} />
        <Enter>
          <h1 style={{ marginTop: 12 }}>Verify once. Use it for every event.</h1>
          <p className="muted" style={{ marginTop: 12 }}>
            One real person, one ticket wallet. That's what keeps bots out.
          </p>
        </Enter>
        <Enter delay={0.08}>
          <div className="stack" style={{ marginTop: 24 }}>
            {[
              { t: "Your ID", d: "Smart ID card or passport" },
              { t: "A quick selfie", d: "Proves it's really you, not a bot farm" },
            ].map((s) => (
              <div key={s.t} className="panel row">
                <div>
                  <strong>{s.t}</strong>
                  <p className="faint">{s.d}</p>
                </div>
                {state === "done" ? <span className="pill pill-ok">Done</span> : <span className="pill pill-quiet">Next</span>}
              </div>
            ))}
            {state === "done" && (
              <motion.div className="callout callout-ok" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 18 }}>
                <strong>You're verified</strong>
                <p className="muted">You won't need to do this again, for any event on Siyangena.</p>
              </motion.div>
            )}
            <p className="faint">For this test version the ID and selfie check is simulated. Your verified status is recorded for real.</p>
            {error && (
              <p role="alert" className="callout callout-blocked">
                {error}
              </p>
            )}
          </div>
        </Enter>
      </div>
      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          {state === "done" ? (
            <Button block onClick={() => navigate(next)}>
              Continue
            </Button>
          ) : (
            <Button block disabled={state === "busy"} onClick={verify}>
              {state === "busy" ? "Checking" : "Verify me"}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
