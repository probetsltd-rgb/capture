import "server-only";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

// Application-layer encryption for OAuth access tokens stored in
// channel_connections (PLANS.md Phase 5.2) — this repo has no existing
// pgcrypto/pgsodium usage, so this mirrors the node:crypto convention
// already established in lib/upload-token.ts rather than introducing a new
// dependency. AES-256-GCM: authenticated encryption, so a tampered
// ciphertext fails to decrypt rather than silently returning garbage.
//
// TOKEN_ENCRYPTION_KEY must be exactly 32 bytes, hex-encoded (64 hex
// chars) — generate with `openssl rand -hex 32`. Stored format is
// `iv:authTag:ciphertext`, each hex-encoded, so it's safely storable as
// plain `text` in Postgres.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended for GCM

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted token — expected iv:authTag:ciphertext");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
