import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Pure-policy regression checks. The route and DB transaction own persistence;
 * this file pins down the rules the team flow depends on:
 *  - an invitation is a role pre-assignment keyed on email, so status must
 *    never read as active after expiry / revocation / acceptance, and
 *  - re-inviting the same address must first retire EVERY open row, including
 *    expired ones — the partial unique index counts them as open, so skipping
 *    them made a second invitation after 14 days fail permanently.
 */
type InvitationRow = {
  email: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
};

function status(input: Omit<InvitationRow, "email">, now: Date) {
  if (input.revokedAt) return "revoked";
  if (input.acceptedAt) return "accepted";
  if (input.expiresAt <= now) return "expired";
  return "pending";
}

/** Mirrors the partial unique index: unaccepted AND unrevoked, expiry ignored. */
function occupiesActiveEmailSlot(row: InvitationRow) {
  return row.acceptedAt === null && row.revokedAt === null;
}

/** Mirrors the revoke-before-insert step of POST /admin/invitations. */
function retireOpenInvitations(rows: InvitationRow[], email: string, now: Date): InvitationRow[] {
  return rows.map((row) =>
    row.email === email && occupiesActiveEmailSlot(row) ? { ...row, revokedAt: now } : row,
  );
}

describe("team invitation policy", () => {
  it("only treats a future, unaccepted, unrevoked invitation as pending", () => {
    const now = new Date("2026-08-04T12:00:00Z");
    assert.equal(status({ expiresAt: new Date("2026-08-05T12:00:00Z"), acceptedAt: null, revokedAt: null }, now), "pending");
    assert.equal(status({ expiresAt: new Date("2026-08-03T12:00:00Z"), acceptedAt: null, revokedAt: null }, now), "expired");
    assert.equal(status({ expiresAt: new Date("2026-08-05T12:00:00Z"), acceptedAt: new Date(), revokedAt: null }, now), "accepted");
    assert.equal(status({ expiresAt: new Date("2026-08-05T12:00:00Z"), acceptedAt: null, revokedAt: new Date() }, now), "revoked");
  });

  it("an expired invitation still occupies the unique active-email slot", () => {
    const expired: InvitationRow = {
      email: "kolya@company.ru",
      expiresAt: new Date("2026-07-01T00:00:00Z"),
      acceptedAt: null,
      revokedAt: null,
    };
    assert.equal(status(expired, new Date("2026-08-04T12:00:00Z")), "expired");
    assert.equal(occupiesActiveEmailSlot(expired), true);
  });

  it("re-inviting after expiry frees the slot instead of colliding", () => {
    const now = new Date("2026-08-04T12:00:00Z");
    const rows: InvitationRow[] = [
      { email: "kolya@company.ru", expiresAt: new Date("2026-07-01T00:00:00Z"), acceptedAt: null, revokedAt: null },
      { email: "kolya@company.ru", expiresAt: new Date("2026-06-01T00:00:00Z"), acceptedAt: null, revokedAt: null },
      { email: "other@company.ru", expiresAt: new Date("2026-09-01T00:00:00Z"), acceptedAt: null, revokedAt: null },
    ];

    const after = retireOpenInvitations(rows, "kolya@company.ru", now);
    const stillOpen = after.filter((row) => row.email === "kolya@company.ru" && occupiesActiveEmailSlot(row));
    assert.equal(stillOpen.length, 0, "no open row may remain for the re-invited address");
    // Someone else's pending assignment must survive untouched.
    assert.equal(after.filter((row) => row.email === "other@company.ru" && occupiesActiveEmailSlot(row)).length, 1);
  });

  it("does not disturb an already accepted assignment when re-inviting", () => {
    const now = new Date("2026-08-04T12:00:00Z");
    const accepted: InvitationRow = {
      email: "kolya@company.ru",
      expiresAt: new Date("2026-07-01T00:00:00Z"),
      acceptedAt: new Date("2026-06-20T00:00:00Z"),
      revokedAt: null,
    };
    const [row] = retireOpenInvitations([accepted], "kolya@company.ru", now);
    assert.equal(row!.revokedAt, null);
    assert.equal(status(row!, now), "accepted");
  });
});
