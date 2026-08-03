/**
 * AES-256-GCM encryption for bot tokens stored at rest.
 *
 * Requires the BOT_TOKEN_ENCRYPTION_KEY env var — a 32-byte key expressed as
 * 64 hex characters.  Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Stored format (base64-encoded): <12-byte IV> | <16-byte auth-tag> | <ciphertext>
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { logger } from "./logger";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.BOT_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "BOT_TOKEN_ENCRYPTION_KEY is required but not set. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
        "and set it as a secret.",
    );
  }
  if (raw.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      "BOT_TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).",
    );
  }
  return Buffer.from(raw, "hex");
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // iv (12) | tag (16) | ciphertext
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptToken(stored: string): string {
  const key = getKey();
  const buf = Buffer.from(stored, "base64");
  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error("Invalid encrypted token format");
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}
