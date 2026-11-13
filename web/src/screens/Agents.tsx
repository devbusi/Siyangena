import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { MyAgent } from "@drop/shared";
import { Button, Enter, TopBar } from "../components/ui";
import { api } from "../lib/api";
import { dateLong, rand } from "../lib/format";
import { useApp } from "../lib/store";

// What the agent is doing right now, in plain words, with a colour for the pill.
function statusOf(a: MyAgent): { label: string; bg: string } {
  const { mandate, running, eventState } = a;
  if (mandate.status === "filled" || mandate.bought >= mandate.quantity) return { label: "Done, tickets bought", bg: "var(--mint, #56db9c)" };
  if (eventState === "cancelled") return { label: "Event cancelled", bg: "#fff" };
  if (eventState === "sold_out" || eventState === "closed") return { label: "Sale over", bg: "#fff" };
  if (running) return { label: eventState === "open" ? "Buying now" : "In the queue", bg: "var(--sun)" };
  return { label: "Not sent in yet", bg: "var(--lilac, #c9b8ff)" };
}

export function Agents() {
  const { tick } = useApp();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<MyAgent[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .myAgents()
      .then((list) => {
        setAgents(list);
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load your agents"));
  }, [tick]);

  return (
    <div className="phone">
      <TopBar />
      <Enter>
        <h1 style={{ margin: "10px 0 6px" }}>My agents</h1>
        <p className="muted" style={{ marginBottom: 18 }}>
          One agent per event. It buys for you within the limits you set, from your wallet.
        </p>
      </Enter>
      {error && !agents ? (
        <p style={{ fontWeight: 700 }}>{error}</p>
      ) : !agents ? (
        <p className="muted">Loading your agents</p>
      ) : agents.length === 0 ? (
        <div className="callout stack" style={{ gap: 10 }}>
          <strong>No agents yet</strong>
          <p className="muted">Open an event and press Add an agent. It waits in the queue and buys the second sales open.</p>
          <Button onClick={() => navigate("/events")}>Find an event</Button>
        </div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {agents.map((a) => {
            const s = statusOf(a);
            const left = a.mandate.status === "filled" ? 0 : Math.max(0, a.mandate.quantity - a.mandate.bought);
            // Limits only matter while the event can still sell.
            const open = a.eventState === "scheduled" || a.eventState === "open";
            return (
              <Enter key={a.eventId}>
                <div className="panel stack" style={{ gap: 10 }}>
                  <div className="row" style={{ justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div>
                      <strong style={{ fontSize: "1.1rem" }}>{a.eventName}</strong>
                      <p className="faint">
                        {a.venue}, {dateLong(a.startsAt)}
                      </p>
                    </div>
                    <span className="pill" style={{ background: s.bg, whiteSpace: "nowrap" }}>
                      {s.label}
                    </span>
                  </div>
                  <p>
                    Bought {a.mandate.bought} of {a.mandate.quantity}, up to {rand(a.mandate.ceilingZar)} each.
                    {left > 0 ? ` ${left} still to get.` : ""}
                  </p>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    {left === 0 ? (
                      <Button className="btn-sm" onClick={() => navigate("/tickets")}>
                        See my tickets
                      </Button>
                    ) : (
                      <>
                        <Button className="btn-sm" onClick={() => navigate(`/events/${a.eventId}/live`)}>
                          Watch my agent
                        </Button>
                        {open && (
                          <Button variant="ghost" className="btn-sm" onClick={() => navigate(`/events/${a.eventId}/agent`)}>
                            Change limits
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </Enter>
            );
          })}
          <p className="faint" style={{ textAlign: "center" }}>
            Want another? <Link to="/events">Pick an event</Link> and add an agent.
          </p>
        </div>
      )}
    </div>
  );
}
