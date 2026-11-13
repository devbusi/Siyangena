import { ACTIVE } from "@drop/shared";

// Prices are shown in ZAR and settled in RLUSD (or XRP on Devnet) at a fixed demo rate.
// Settle amounts are rounded to 6 decimals, which is exact in XRP drops.

const DECIMALS = 6;

export function formatAmount(value: number, decimals = DECIMALS): string {
  const fixed = value.toFixed(decimals);
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

export function zarToSettle(zar: number): string {
  return formatAmount(zar / ACTIVE.fxZarPerUnit);
}

export function settleToZar(amount: number | string): string {
  return formatAmount(Number(amount) * ACTIVE.fxZarPerUnit, 2);
}

export function zar(value: number): string {
  return formatAmount(value, 2);
}

export function addAmounts(a: string, b: string): string {
  return formatAmount(Number(a) + Number(b));
}

// Ledger amounts can be formatted differently from what we asked for ("66.666667" vs "66.6666670").
export function sameAmount(a: string | number, b: string | number): boolean {
  return Math.abs(Number(a) - Number(b)) < 1e-6;
}
