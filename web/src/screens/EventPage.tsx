
import { useNavigate } from "react-router-dom";
import { Button, CoinField, Enter, Ticker, TopBar } from "../components/ui";
import { useApp } from "../lib/store";
import { dateLong, rand } from "../lib/format";

const PROMISES = [
  { title: "Checked promoter", body: "Sunset Sessions is a verified promoter, so every ticket traces back to them." },
  { title: "One verified person, one wallet", body: "Bots can't fake an ID check, so they can't buy here." },
  { title: "Resale stays fair", body: "Fans resell through Siyangena only, capped at the promoter's price." },
  { title: "Fakes can't reach you", body: "Your wallet only accepts the real ticket for this event." },
];

export function EventPage() {
  const { drop } = useApp();
  const navigate = useNavigate();

  const onSale = drop?.state === "open";
  const left = drop ? drop.supply - drop.sold : 0;

  return (
    <>
      <div className="phone">
        <TopBar />
        <Ticker
          items={[
            onSale ? "Tickets on sale now" : "Tickets go on sale at 18:00",
            "Verified fans only",
            `Resale capped at ${rand(drop?.resaleCapZar ?? drop?.priceZar ?? 0)}`,
            "No fakes, no scalpers",
          ]}
        />

        <Enter>
          <section aria-labelledby="event-title">
            <CoinField height={210} />
            <div className="row" style={{ marginTop: 16 }}>
              <span className={`pill ${onSale ? "pill-live" : ""}`}>{onSale ? `${left} tickets left` : "Limited tickets"}</span>
              <span className="faint">{drop ? dateLong(drop.startsAt) : "Sat 12 Dec, 19:00"}</span>
            </div>
            <h1 id="event-title" className="hero-title">
              {drop?.name ?? "Sunset Sessions Live"}
            </h1>
            <p className="hero-meta">{drop?.venue ?? "Long Street, Cape Town"}</p>
          </section>
        </Enter>

        <Enter delay={0.08}>
          <div className="price-row">
            <div className="panel">
              <p className="faint">Ticket</p>
              <p className="stat-value num">{rand(drop?.priceZar ?? 1200)}</p>
            </div>
            <div className="panel">
              <p className="faint">Per fan</p>
              <p className="stat-value num">{drop?.maxPerFan ?? 4} max</p>
            </div>
            <div className="panel">
              <p className="faint">Resale cap</p>
              <p className="stat-value num">{rand(drop?.resaleCapZar ?? drop?.priceZar ?? 0)}</p>
            </div>
          </div>
          <p className="faint" style={{ margin: "-8px 0 18px" }}>
            The promoter sets the limit per fan and the resale cap for this event.
          </p>
        </Enter>

        <Enter delay={0.14}>
          <h2 style={{ margin: "6px 0 12px" }}>Why this ticket is safe</h2>
          <ul className="promise-list">
            {PROMISES.map((p) => (
              <li key={p.title}>
                <span className="promise-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span>
                  <strong>{p.title}</strong>
                  <br />
                  <span className="muted">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </Enter>
      </div>

      <div className="bottom-bar">
        <div className="bottom-bar-inner stack" style={{ gap: 8 }}>
          <Button block onClick={() => navigate("/verify")}>
            Get my agent ready
          </Button>
          <p className="faint" style={{ textAlign: "center" }}>
            Your agent buys the moment tickets go on sale, within limits you set.
          </p>
        </div>
      </div>
    </>
  );
}
