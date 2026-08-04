import { ClerkProvider, Show } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import ClerkTokenProvider from '@/components/ClerkTokenProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { Radio, LogIn, RefreshCw, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import DashboardPage from './pages/dashboard';
import SignInPage from './pages/sign-in';
import SignUpPage from './pages/sign-up';
import { Onboarding } from './components/onboarding';
import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';
import type { TeamMember } from '@workspace/api-client-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dashboard data is refreshed explicitly by the user. Avoid a request
      // storm when Clerk refreshes a session or the preview regains focus.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    },
  },
});

// REQUIRED — resolves key from window.location.hostname; do not inline env var
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — empty in dev (intentional), auto-set in prod; do NOT gate on NODE_ENV
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

function SignedOutLanding() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
          <Radio className="w-8 h-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Дашборд звонков</h1>
          <p className="text-muted-foreground text-sm">
            Войдите, чтобы увидеть свои показатели и показатели команды.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setLocation('/sign-in')}>
          <LogIn className="w-4 h-4" />
          Войти
        </Button>
      </div>
    </div>
  );
}

/**
 * Signed-in gate: resolves the team profile (registering the user on first
 * login), then routes to onboarding (claim your Mango operator) or the
 * dashboard itself.
 */
function DashboardGate() {
  const { data: me, isLoading, error, refetch } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false },
  });
  const [skipped, setSkipped] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-muted/20 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground animate-pulse">
          <RefreshCw className="w-8 h-8 animate-spin" />
          <p className="text-sm font-medium">Загружаем профиль...</p>
        </div>
      </div>
    );
  }

  if (error || !me) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 gap-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Не удалось загрузить профиль пользователя.</p>
        <Button variant="outline" onClick={() => refetch()}>Повторить</Button>
      </div>
    );
  }

  if (!me.mangoMemberId && !skipped) {
    return <Onboarding onDone={() => setSkipped(true)} />;
  }

  return <DashboardPage me={me as TeamMember} />;
}

function Home() {
  return (
    <>
      <Show when="signed-in">
        <DashboardGate />
      </Show>
      <Show when="signed-out">
        <SignedOutLanding />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkTokenProvider />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={Home} />
            {/* REQUIRED — /*? optional wildcard matches Clerk's OAuth sub-paths */}
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
