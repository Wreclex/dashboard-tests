import { ClerkProvider, Show } from '@clerk/react';
import ClerkTokenProvider from '@/components/ClerkTokenProvider';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { dark } from '@clerk/themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import MainApp from '@/pages/MainApp';
import SignInPage from '@/pages/SignInPage';
import SignUpPage from '@/pages/SignUpPage';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

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

const clerkAppearance = {
  theme: dark,
  cssLayerName: 'clerk' as const,
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#e87c2a',
    colorForeground: '#dedede',
    colorMutedForeground: '#878787',
    colorBackground: '#1a1a1a',
    colorInput: '#242424',
    colorInputForeground: '#dedede',
    colorNeutral: '#2b2b2b',
    colorDanger: '#e53e3e',
    fontFamily: 'Inter, sans-serif',
    borderRadius: '2px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#1a1a1a] border border-[#2b2b2b] w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#dedede]',
    headerSubtitle: 'text-[#878787]',
    socialButtonsBlockButtonText: 'text-[#dedede]',
    formFieldLabel: 'text-[#878787]',
    footerActionLink: 'text-[#e87c2a]',
    footerActionText: 'text-[#878787]',
    dividerText: 'text-[#878787]',
    identityPreviewEditButton: 'text-[#e87c2a]',
    formFieldSuccessText: 'text-green-400',
    alertText: 'text-[#dedede]',
    logoBox: 'flex items-center justify-center py-2',
    logoImage: 'h-10',
    socialButtonsBlockButton: 'border-[#2b2b2b] bg-[#242424] hover:bg-[#2a2a2a]',
    formButtonPrimary: 'bg-[#e87c2a] hover:bg-[#d06a1e] text-white',
    formFieldInput: 'bg-[#242424] border-[#2b2b2b] text-[#dedede] focus:border-[#e87c2a]',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[#2b2b2b]',
    alert: 'bg-[#2a1f1f] border-[#5c2020]',
    otpCodeFieldInput: 'bg-[#242424] border-[#2b2b2b] text-[#dedede]',
    formFieldRow: 'gap-2',
    main: 'gap-4',
  },
};

// The app requires a signed-in user — signed-out visitors get the sign-in screen.
function Home() {
  return (
    <>
      <Show when="signed-in">
        <MainApp />
      </Show>
      <Show when="signed-out">
        <SignInPage />
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
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkTokenProvider />
        <Switch>
          <Route path="/" component={Home} />
          {/* REQUIRED — /*? optional wildcard matches Clerk's OAuth sub-paths */}
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route component={NotFound} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}
