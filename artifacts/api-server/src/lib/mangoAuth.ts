/**
 * Mango Office CCC authentication.
 *
 * Signs in with email + password to obtain a short-lived Bearer token.
 * The token is used for subsequent KPI API calls in the same request.
 */

export const MANGO_AUTH_URL = "https://api2.mangotele.com/v2/auth/sign-in";

export class MangoAuthError extends Error {
  constructor(message = "Mango Office sign-in failed — check your email and password") {
    super(message);
    this.name = "MangoAuthError";
  }
}

/**
 * Sign in to Mango CCC and return the Bearer token string.
 * Throws MangoAuthError on bad credentials or unexpected response.
 */
export async function mangoSignIn(email: string, password: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(MANGO_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new MangoAuthError(
      `Mango sign-in network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (res.status === 401 || res.status === 403 || res.status === 400) {
    throw new MangoAuthError("Неверный логин или пароль Mango Office");
  }

  if (!res.ok) {
    throw new MangoAuthError(`Mango sign-in returned HTTP ${res.status}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new MangoAuthError("Mango sign-in returned non-JSON response");
  }

  // The response contains a `token` field (JWT or opaque string).
  if (
    body !== null &&
    typeof body === "object" &&
    "token" in body &&
    typeof (body as Record<string, unknown>).token === "string"
  ) {
    const token = ((body as Record<string, unknown>).token as string).trim();
    if (token) return token;
  }

  throw new MangoAuthError("Mango sign-in response did not contain a token field");
}
