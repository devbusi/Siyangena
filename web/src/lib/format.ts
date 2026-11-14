import type { DropEvent, DropEventType } from "@drop/shared";

export function rand(value: number | string, cents = false): string {
  const n = Number(value) || 0;
  const fixed = cents && n % 1 !== 0 ? n.toFixed(2) : Math.round(n).toString();
  const [whole, frac] = fixed.split(".");
  return "R" + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? "." + frac : "");
}

export function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function dateLong(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export type Tone = "ok" | "blocked" | "decided" | "info";

const COPY: Record<DropEventType, { title: string; tone: Tone }> = {
  "drop.opened": { title: "Tickets are on sale", tone: "info" },
  "drop.sold_out": { title: "Sold out", tone: "info" },
  "drop.cancelled": { title: "Event cancelled, refunding ticket holders", tone: "blocked" },
  "sale.intent": { title: "Agent reserved tickets", tone: "decided" },
  "sale.paid": { title: "Payment confirmed", tone: "ok" },
  "sale.ticket_sent": { title: "Tickets landed in the wallet", tone: "ok" },
  "sale.refunded": { title: "Payment refunded", tone: "blocked" },
  "agent.action": { title: "Agent decided", tone: "decided" },
  "mandate.blocked": { title: "Stopped at the limit", tone: "blocked" },
  "resale.listed": { title: "Listed for resale", tone: "decided" },
  "resale.sign_requested": { title: "Buyer and seller agents are signing", tone: "decided" },
  "resale.settled": { title: "Resale complete", tone: "ok" },
  "resale.refused": { title: "Resale refused by the promoter", tone: "blocked" },
  "ledger.rejected": { title: "Rejected", tone: "blocked" },
};

const TOOL_TITLE: Record<string, string> = {
  buy_ticket: "Agent bought tickets",
  accept_resale: "Agent bought a resale ticket",
  list_for_resale: "Agent listed a ticket",
  sign_my_resales: "Agent signed the swap",
  get_mandate: "Agent read your limits",
  browse_resale: "Agent checked resale",
};

// Turn a backend event into app copy. The ledger stays invisible: no tokens, no hashes.
export function describe(event: DropEvent): { title: string; detail: string; tone: Tone } {
  const base = COPY[event.type] ?? { title: event.type, tone: "info" as Tone };
  if (event.type === "agent.action") {
    const blocked = /blocked/i.test(event.detail ?? "");
    return {
      title: blocked ? "Agent was stopped" : (event.tool && TOOL_TITLE[event.tool]) || base.title,
      detail: event.detail ?? "",
      tone: blocked ? "blocked" : "decided",
    };
  }
  return { title: base.title, detail: friendlyDetail(event), tone: base.tone };
}

function friendlyDetail(event: DropEvent): string {
  switch (event.type) {
    case "drop.opened":
      return "Verified ticket holders only. Agents are buying now.";
    case "sale.paid":
      return "Confirmed in seconds.";
    case "sale.ticket_sent":
      return "Straight from the promoter, guaranteed real.";
    case "mandate.blocked":
      return "Over the limits its human set, so it couldn't go ahead.";
    case "resale.refused":
      return "Above the promoter's resale cap, so the sale can't go through.";
    case "resale.settled":
      return "Ticket and payment swapped in one step.";
    case "ledger.rejected":
      return "Tickets only change hands through Siyangena.";
    case "sale.refunded":
      return "The money went straight back.";
    default:
      return "";
  }
}
