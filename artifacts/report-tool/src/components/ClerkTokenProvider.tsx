/**
 * Registers Clerk's getToken() as the auth-token getter for the generated
 * API client.  This ensures every request to /api/* carries an
 * `Authorization: Bearer <clerk-session-token>` header, which is required
 * when the frontend and API server are served from different path-based
 * artifact origins behind the shared proxy.
 *
 * Mount this once inside <ClerkProvider>, before any component that calls
 * the API.
 */
import { useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { setAuthTokenGetter } from '@workspace/api-client-react';

export default function ClerkTokenProvider() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);

  return null;
}
