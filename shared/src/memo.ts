import { MEMO_TYPE } from "./config";
import type { DropMemo } from "./types";

// XRPL Memo as it appears in a transaction.
export interface XrplMemo {
  Memo: {
    MemoType?: string;
    MemoData?: string;
    MemoFormat?: string;
  };
}

function toHex(text: string): string {
  let out = "";
  for (const byte of new TextEncoder().encode(text)) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out.toUpperCase();
}

function fromHex(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

// Build the Memos array for a transaction. Agent and backend both use this,
// so the promoter's sale watcher can always match a payment to its intent.
export function encodeDropMemo(memo: DropMemo): XrplMemo[] {
  return [
    {
      Memo: {
        MemoType: toHex(MEMO_TYPE),
        MemoFormat: toHex("application/json"),
        MemoData: toHex(JSON.stringify(memo)),
      },
    },
  ];
}

// Returns the first Drop memo on a transaction, or null.
export function decodeDropMemo(memos: XrplMemo[] | undefined): DropMemo | null {
  if (!memos) return null;
  const wanted = toHex(MEMO_TYPE);
  for (const m of memos) {
    if (m.Memo?.MemoType?.toUpperCase() !== wanted || !m.Memo.MemoData) continue;
    try {
      return JSON.parse(fromHex(m.Memo.MemoData)) as DropMemo;
    } catch {
      return null;
    }
  }
  return null;
}
