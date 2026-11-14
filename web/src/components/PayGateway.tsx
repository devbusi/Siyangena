import { useState } from "react";
import { motion } from "motion/react";
import type { BankTransfer } from "@drop/shared";
import { api } from "../lib/api";
import { rand } from "../lib/format";
import { Button } from "./ui";

export const SA_BANKS = ["Absa", "Capitec", "FNB", "Nedbank", "Standard Bank", "TymeBank", "Discovery Bank", "African Bank"];

function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section
        className="sheet stack"
        role="dialog"
        aria-label={label}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        style={{ gap: 12 }}
      >
        {children}
      </motion.section>
    </motion.div>
  );
}

function Receipt({ t, onClose }: { t: BankTransfer; onClose: () => void }) {
  const out = t.kind === "cashout";
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="panel stack" style={{ background: "var(--mint)", gap: 6 }}>
        <p style={{ fontWeight: 900, fontStretch: "62%", textTransform: "uppercase", fontSize: "2rem", lineHeight: 0.95 }}>{out ? "On its way" : "Money added"}</p>
        <p style={{ fontWeight: 700 }}>
          {rand(t.amountZar)} {out ? "to" : "from"} {t.method}
        </p>
        <p>Reference {t.reference}</p>
        {out && <p>Your bank usually shows it within a few minutes on instant payment, or by the next working day.</p>}
      </div>
      {t.explorerUrl && (
        <a href={t.explorerUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 800 }}>
          See it on the ledger
        </a>
      )}
      <Button block onClick={onClose}>
        Done
      </Button>
    </div>
  );
}

// Test checkout: card or instant EFT. The money itself moves on the ledger.
export function AddMoney({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(500);
  const [method, setMethod] = useState<"card" | "eft">("card");
  const [card, setCard] = useState("4242 4242 4242 4242");
  const [expiry, setExpiry] = useState("12/29");
  const [cvc, setCvc] = useState("123");
  const [bank, setBank] = useState("FNB");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<BankTransfer | null>(null);

  async function pay() {
    setBusy(true);
    setError("");
    try {
      const t = await api.deposit({ amountZar: amount, method, ...(method === "card" ? { cardNumber: card } : { bank }) });
      setDone(t);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The payment didn't go through");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet label="Add money" onClose={onClose}>
      <div className="row">
        <h2>Add money</h2>
        <span className="pill" style={{ background: "var(--sun)" }}>
          Siyangena Pay, test
        </span>
      </div>
      {done ? (
        <Receipt t={done} onClose={onClose} />
      ) : (
        <>
          <div className="chips" role="radiogroup" aria-label="Amount">
            {[200, 500, 1000, 2500].map((a) => (
              <button key={a} type="button" role="radio" aria-checked={amount === a} className="chip" onClick={() => setAmount(a)}>
                {rand(a)}
              </button>
            ))}
          </div>
          <div className="chips" role="radiogroup" aria-label="Pay with">
            <button type="button" role="radio" aria-checked={method === "card"} className="chip" onClick={() => setMethod("card")}>
              Card
            </button>
            <button type="button" role="radio" aria-checked={method === "eft"} className="chip" onClick={() => setMethod("eft")}>
              Instant EFT
            </button>
          </div>
          {method === "card" ? (
            <div className="stack" style={{ gap: 8 }}>
              <div className="field">
                <label htmlFor="cardno">Card number</label>
                <input id="cardno" className="input" inputMode="numeric" autoComplete="off" value={card} onChange={(e) => setCard(e.target.value)} />
              </div>
              <div className="row" style={{ gap: 8 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="exp">Expiry</label>
                  <input id="exp" className="input" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="cvc">CVC</label>
                  <input id="cvc" className="input" inputMode="numeric" value={cvc} onChange={(e) => setCvc(e.target.value)} />
                </div>
              </div>
              <p className="faint">Test cards: 4242 4242 4242 4242 is approved, 4000 0000 0000 0002 is declined.</p>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="eftbank">Your bank</label>
              <select id="eftbank" className="input" value={bank} onChange={(e) => setBank(e.target.value)}>
                {SA_BANKS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
              <p className="faint">In the test version you approve the payment here instead of in your banking app.</p>
            </div>
          )}
          {error && (
            <p role="alert" className="callout callout-blocked">
              {error}
            </p>
          )}
          <Button block disabled={busy} onClick={pay}>
            {busy ? "Waiting for your bank" : `Pay ${rand(amount)}`}
          </Button>
          <p className="faint">The money lands in your Siyangena wallet as a real payment on the test ledger.</p>
        </>
      )}
    </Sheet>
  );
}

export function CashOut({ max, onClose, onDone }: { max: number; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [bank, setBank] = useState("FNB");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<BankTransfer | null>(null);
  const n = Number(amount.replace(/[^\d.]/g, "")) || 0;

  async function send() {
    setBusy(true);
    setError("");
    try {
      const t = await api.cashOut({ amountZar: n, bank, accountNumber: account });
      setDone(t);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cash out didn't go through");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet label="Cash out" onClose={onClose}>
      <div className="row">
        <h2>Cash out</h2>
        <span className="pill" style={{ background: "var(--sun)" }}>
          Siyangena Pay, test
        </span>
      </div>
      {done ? (
        <Receipt t={done} onClose={onClose} />
      ) : (
        <>
          <p className="muted">Send money from your Siyangena wallet to your bank account. You can cash out up to {rand(max)}.</p>
          <div className="field">
            <label htmlFor="outamt">Amount (R)</label>
            <input id="outamt" className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(Math.floor(max))} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="outbank">Bank</label>
              <select id="outbank" className="input" value={bank} onChange={(e) => setBank(e.target.value)}>
                {SA_BANKS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="outacc">Account number</label>
              <input id="outacc" className="input" inputMode="numeric" value={account} onChange={(e) => setAccount(e.target.value)} />
            </div>
          </div>
          {error && (
            <p role="alert" className="callout callout-blocked">
              {error}
            </p>
          )}
          <Button block disabled={busy || n <= 0 || n > max || account.replace(/\D/g, "").length < 6} onClick={send}>
            {busy ? "Sending" : n > 0 ? `Cash out ${rand(n)}` : "Cash out"}
          </Button>
          <p className="faint">Your wallet pays Siyangena on the test ledger, then a test bank transfer goes to your account.</p>
        </>
      )}
    </Sheet>
  );
}
