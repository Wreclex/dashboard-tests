/**
 * Mango Office CCC authentication.
 *
 * Protocol discovered from the Mango CCC dashboard bundle (chunk-D5CTCMDK.js):
 *
 *   POST https://auth.mango-office.ru/auth/vpbx
 *   Body: { username: "<email>", password: "<password>", app: "webcov" }
 *   Success response: { auth_token: "...", jwt_token: "...", refresh_token: "...", result: 0, ... }
 *   Error response:   { result: 1101 }  (wrong credentials)
 *
 * The returned auth_token is used as the Bearer token for subsequent API calls
 * to api2.mangotele.com (KPI reports, etc.).
 */

export const MANGO_AUTH_URL = "https://auth.mango-office.ru/auth/vpbx";

export class MangoAuthError extends Error {
  constructor(message = "Неверный логин или пароль Mango Office") {
    super(message);
    this.name = "MangoAuthError";
  }
}

/**
 * Sign in to Mango CCC and return the auth_token (Bearer token).
 * Throws MangoAuthError on bad credentials or unexpected response.
 */
export async function mangoSignIn(username: string, password: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(MANGO_AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://ccc.mango-office.ru",
        "Referer": "https://ccc.mango-office.ru/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ username, password, app: "webcov" }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new MangoAuthError(
      `Mango sign-in network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    throw new MangoAuthError(`Mango auth server returned HTTP ${res.status}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new MangoAuthError("Mango auth server returned non-JSON response");
  }

  if (body !== null && typeof body === "object") {
    const b = body as Record<string, unknown>;

    // Non-zero result codes indicate errors (e.g. 1101 = wrong credentials).
    if (typeof b.result === "number" && b.result !== 0) {
      throw new MangoAuthError("Неверный логин или пароль Mango Office");
    }

    // Token is stored in auth_token field.
    if (typeof b.auth_token === "string" && b.auth_token.trim()) {
      return b.auth_token.trim();
    }
  }

  throw new MangoAuthError("Mango auth response did not contain an auth_token field");
}
