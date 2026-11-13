import { accounts } from "../application-logic/account-logic/Accounts";

// Text messages for the moments that matter: tickets arrived, ticket sold, resale ticket bought.
// Sends through Twilio when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM are set.
// Otherwise it prints the message to the log, so the flow can be tested without an SMS account.

const appUrl = () => (process.env.APP_URL || "").replace(/\/$/, "");

export function ticketsLink(): string {
  return appUrl() ? `${appUrl()}/#/tickets` : "the Siyangena app";
}

export async function sendSms(fanId: string, body: string) {
  const phone = accounts.cachedProfile(fanId)?.phone;
  if (!phone) return;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    console.log(`[sms to ${phone}] ${body}`);
    return;
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phone, From: from, Body: body }).toString(),
    });
    if (!res.ok) console.error(`SMS to ${phone} failed: ${res.status} ${await res.text()}`);
  } catch (error) {
    console.error(`SMS to ${phone} failed:`, error instanceof Error ? error.message : error);
  }
}

// Fire and forget: an SMS problem never blocks a sale.
export function notify(fanId: string, body: string) {
  sendSms(fanId, body).catch(() => undefined);
}
