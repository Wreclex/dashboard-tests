/**
 * Registers Clerk's getToken() as the auth-token getter for the generated
 * API client, so every request to /api/* carries an
 * `Authorization: Bearer <clerk-session-token>` header.
 *
 * Mount once inside <ClerkProvider>, before any component that calls the API.
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
