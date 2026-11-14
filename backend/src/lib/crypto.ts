import crypto from "crypto";

// Wallet seeds are encrypted with AES-256-GCM before they are stored.
// WALLET_ENCRYPTION_KEY is 64 hex characters (32 bytes). Make one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

function key(): Buffer {
  const hex = process.env.WALLET_ENCRYPTION_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("WALLET_ENCRYPTION_KEY must be 64 hex characters");
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(blob: string): string {
  const [iv, tag, data] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
