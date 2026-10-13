import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/components/app-shell';
import { CheckInPage, ClassesPage, DashboardPage, ReportsPage, SessionPage } from '@/pages/workspace-pages';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
      refetchOnWindowFocus: true,
    },
  },
});

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  const [location] = useLocation();
  const standalone = location === '/check-in';
  return (
    <RoutedErrorBoundary>
      {standalone ? (
        <Switch>
          <Route path="/check-in" component={CheckInPage} />
          <Route component={NotFound} />
        </Switch>
      ) : (
        <AppShell>
          <Switch>
            <Route path="/" component={DashboardPage} />
            <Route path="/classes" component={ClassesPage} />
            <Route path="/sessions/:sessionId" component={SessionPage} />
            <Route path="/reports" component={ReportsPage} />
            <Route component={NotFound} />
          </Switch>
        </AppShell>
      )}
    </RoutedErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
