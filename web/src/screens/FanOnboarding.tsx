import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Button, Enter, TopBar } from "../components/ui";
import { CityArt } from "../components/CityArt";
import { api } from "../lib/api";
import { useApp } from "../lib/store";

export function Welcome() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");

  return (
    <>
      <div className="phone">
        <TopBar />
        <Enter>
          <div className="art-box" style={{ height: 190, margin: "8px 0 22px" }}>
            <CityArt scene="braamfontein" />
          </div>
          <h1>Scalpers have bots. Now fans have agents.</h1>
          <p className="muted" style={{ marginTop: 12, fontSize: "1.1rem" }}>
            Your agent gets you real tickets the moment they go on sale, at prices you set.
          </p>
        </Enter>

        <Enter delay={0.1}>
          <form
            className="stack"
            style={{ marginTop: 26 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (step === "phone") setStep("code");
              else navigate("/verify");
            }}
          >
            {step === "phone" ? (
              <div className="field">
                <label htmlFor="phone">Mobile number</label>
                <input id="phone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="082 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <p className="faint">We set up your ticket wallet for you. No app store, no crypto know-how.</p>
              </div>
            ) : (
              <motion.div className="field" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <label htmlFor="otp">The 6-digit code we sent to {phone || "your phone"}</label>
                <input id="otp" className="input num" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" style={{ letterSpacing: "0.3em", fontSize: "1.4rem" }} />
              </motion.div>
            )}
            <Button type="submit" block>
              {step === "phone" ? "Send my code" : "Continue"}
            </Button>
            <Button type="button" variant="ghost" block onClick={() => navigate("/events")}>
              Browse events first
            </Button>
          </form>
        </Enter>
      </div>
    </>
  );
}

export function Verify() {
  const { fanId } = useApp();
  const navigate = useNavigate();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");

  async function verify() {
    setError("");
    setState("busy");
    try {
      await api.verifyFan(fanId);
      setState("done");
    } catch (e) {
      setState("idle");
      setError(e instanceof Error ? e.message : "Verification didn't go through");
    }
  }

  return (
    <>
      <div className="phone">
        <TopBar back="/event" />
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
            <Button block onClick={() => navigate("/mandate")}>
              Set my limits
            </Button>
          ) : (
            <Button block disabled={state === "busy"} onClick={verify}>
              {state === "busy" ? "Checking…" : "Verify me"}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
