import { accounts } from "../application-logic/account-logic/Accounts";

// SMS placeholder for the MVP: tickets arrived, ticket sold, resale ticket bought.
// Messages are printed to the backend log. Plug an SMS provider in here later.

const appUrl = () => (process.env.APP_URL || "").replace(/\/$/, "");

export function ticketsLink(): string {
  return appUrl() ? `${appUrl()}/#/tickets` : "the Siyangena app";
}

export function notify(fanId: string, body: string) {
  const phone = accounts.cachedProfile(fanId)?.phone;
  if (!phone) return;
  console.log(`[sms to ${phone}] ${body}`);
}
