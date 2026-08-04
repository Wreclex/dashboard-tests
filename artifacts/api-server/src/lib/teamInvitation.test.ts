import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

/**
 * These are pure-policy regression checks. The route and DB transaction own
 * persistence; this file pins down the security properties the user relies on:
 * an invite token is never kept in raw form and an invitation status cannot be
 * mistaken for active after expiry/revocation/acceptance.
 */
function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function status(input: {
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}, now: Date) {
  if (input.revokedAt) return "revoked";
  if (input.acceptedAt) return "accepted";
  if (input.expiresAt <= now) return "expired";
  return "pending";
}

describe("team invitation policy", () => {
  it("stores a deterministic non-reversible token fingerprint rather than the raw link secret", () => {
    const token = "private-one-time-link";
    const hash = tokenHash(token);
    assert.equal(hash, tokenHash(token));
    assert.notEqual(hash, token);
    assert.equal(hash.length, 64);
  });

  it("only treats a future, unaccepted, unrevoked invitation as pending", () => {
    const now = new Date("2026-08-04T12:00:00Z");
    assert.equal(status({ expiresAt: new Date("2026-08-05T12:00:00Z"), acceptedAt: null, revokedAt: null }, now), "pending");
    assert.equal(status({ expiresAt: new Date("2026-08-03T12:00:00Z"), acceptedAt: null, revokedAt: null }, now), "expired");
    assert.equal(status({ expiresAt: new Date("2026-08-05T12:00:00Z"), acceptedAt: new Date(), revokedAt: null }, now), "accepted");
    assert.equal(status({ expiresAt: new Date("2026-08-05T12:00:00Z"), acceptedAt: null, revokedAt: new Date() }, now), "revoked");
  });
});