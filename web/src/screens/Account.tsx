import { useNavigate } from "react-router-dom";
import { Button, Enter, TopBar } from "../components/ui";
import { useAuth } from "../lib/auth";

const ROLE_COPY: Record<string, { title: string; body: string }> = {
  fan: { title: "Fan", body: "Buy tickets, add an agent with your own limits, and resell fairly if you can't go." },
  promoter: { title: "Promoter", body: "Create events, set your rules and watch sales live. Every promoter is checked before their events go on sale." },
  admin: { title: "Admin", body: "Review promoters and look after everyone's roles." },
};

export function Account() {
  const { me, signOut } = useAuth();
  const navigate = useNavigate();
  if (!me) return null;
  const role = ROLE_COPY[me.role];
  const app = me.application;
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
          <div className="panel breakdown">
            <div className="row">
              <span>Email</span>
              <strong>{me.email}</strong>
            </div>
            <div className="row">
              <span>Mobile</span>
              <strong>{me.phone ?? "Not added"}</strong>
            </div>
            <div className="row">
              <span>Verified</span>
              <strong>{me.verified ? "Yes" : "Not yet"}</strong>
            </div>
            <div className="row">
              <span>Ticket wallet</span>
              <strong>{me.walletReady ? "Ready" : "Not set up"}</strong>
            </div>
          </div>
          {me.role === "fan" && !me.verified && (
            <Button block onClick={() => navigate("/verify?next=/account")}>
              Verify me
            </Button>
          )}
          {me.role === "promoter" && (
            <div className="panel stack" style={{ gap: 8 }}>
              <strong>Promoter application</strong>
              {app ? (
                <>
                  <p className="muted">
                    {app.displayName}, {app.kind === "business" ? "registered business" : "independent promoter"}.{" "}
                    {app.status === "approved" ? "Approved." : app.status === "pending" ? "Being reviewed." : app.reviewNote || "Needs an update."}
                  </p>
                  {app.status !== "approved" && (
                    <Button variant="ghost" className="btn-sm" onClick={() => navigate("/promoter/apply")}>
                      Update my details
                    </Button>
                  )}
                </>
              ) : (
                <Button className="btn-sm" onClick={() => navigate("/promoter/apply")}>
                  Apply now
                </Button>
              )}
            </div>
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
