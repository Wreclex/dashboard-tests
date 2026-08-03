/**
 * Mango Office CCC token refresh.
 *
 * Protocol from the Mango CCC dashboard bundle (chunk-D5CTCMDK.js):
 *   POST https://auth.mango-office.ru/refresh
 *   Body (form-encoded): refresh_token=<token>&app=webcov
 *   Success: { result: 1000, auth_token: "...", refresh_token: "..." }
 *   Error:   { result: 1103, message: "Token not found" }
 *
 * The auth_token (Bearer token for api2.mangotele.com) and refresh_token are
 * obtained by the user running a bookmarklet on ccc.mango-office.ru that reads
 * them directly from localStorage.
 */

export const MANGO_AUTH_BASE = "https://auth.mango-office.ru/";
export const MANGO_REFRESH_URL = `${MANGO_AUTH_BASE}refresh`;

/** Result code for success in the Mango auth API. */
export const MANGO_RESULT_OK = 1000;

export class MangoAuthError extends Error {
  constructor(message = "Токен Mango истёк — обновите через закладку") {
    super(message);
    this.name = "MangoAuthError";
  }
}

export type RefreshResult = { authToken: string; refreshToken: string };

/**
 * Use a refresh_token to obtain a new auth_token + refresh_token pair.
 * Throws MangoAuthError if the refresh token is expired or invalid.
 */
export async function mangoRefresh(refreshToken: string): Promise<RefreshResult> {
  const params = new URLSearchParams({ refresh_token: refreshToken, app: "webcov" });

  let res: Response;
  try {
    res = await fetch(MANGO_REFRESH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": "https://ccc.mango-office.ru",
        "Referer": "https://ccc.mango-office.ru/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new MangoAuthError(
      `Mango refresh network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    throw new MangoAuthError(`Mango refresh returned HTTP ${res.status}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new MangoAuthError("Mango refresh returned non-JSON response");
  }

  if (body !== null && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.result === "number" && b.result !== MANGO_RESULT_OK) {
      throw new MangoAuthError("Токен Mango истёк — обновите через закладку");
    }
    if (typeof b.auth_token === "string" && b.auth_token.trim()) {
      return {
        authToken: b.auth_token.trim(),
        refreshToken: typeof b.refresh_token === "string" ? b.refresh_token.trim() : refreshToken,
      };
    }
  }

  throw new MangoAuthError("Mango refresh response did not contain an auth_token field");
}
