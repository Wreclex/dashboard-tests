import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  PhoneCall, 
  Clock, 
  Activity, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  CalendarDays,
  ArrowRight,
  Phone,
  Radio,
  PlugZap,
  ServerCrash,
  Settings2
} from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

import { ConnectionSettings } from '../components/connection-settings';
import { CsvUploadDialog } from '../components/csv-upload';
import { MetricsChart } from '../components/metrics-chart';
import { TeamView } from '../components/team-view';

import {
  useGetMoizvonkiStatus,
  useGetMoizvonkiMetrics,
  useRefreshMoizvonkiMetrics,
  useGetMoizvonkiMangoStatus,
  useGetMoizvonkiMangoKpi,
  useGetMoizvonkiSettings,
  getGetMoizvonkiStatusQueryKey,
  getGetMoizvonkiMetricsQueryKey,
  getGetMoizvonkiHistoryQueryKey,
  getGetMoizvonkiMangoStatusQueryKey,
  getGetMoizvonkiMangoKpiQueryKey,
  getGetMoizvonkiSettingsQueryKey
} from '@workspace/api-client-react';
import type { TeamMember } from '@workspace/api-client-react';
import { useClerk } from '@clerk/react';
import { LogOut, Users, UserRound } from 'lucide-react';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function formatDuration(seconds: number) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SourceBadge({ source }: { source: string }) {
  if (source === 'http') {
    return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-none font-medium px-2 py-0.5">Cookies</Badge>;
  }
  if (source === 'browser') {
    return <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-none font-medium px-2 py-0.5">Браузер</Badge>;
  }
  if (source === 'csv') {
    return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-none font-medium px-2 py-0.5">CSV</Badge>;
  }
  return <Badge variant="outline">{source}</Badge>;
}

export default function DashboardPage({ me }: { me: TeamMember }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { signOut } = useClerk();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('mz');
  const isManager = me.role === 'manager' || me.role === 'admin';
  const [view, setView] = useState<'mine' | 'team'>(isManager ? 'team' : 'mine');

  const { data: settings } = useGetMoizvonkiSettings({ query: { queryKey: getGetMoizvonkiSettingsQueryKey() } });

  const { data: statusMz, isLoading: isStatusMzLoading } = useGetMoizvonkiStatus({ 
    query: { queryKey: getGetMoizvonkiStatusQueryKey() } 
  });

  const { data: statusMango, isLoading: isStatusMangoLoading } = useGetMoizvonkiMangoStatus({
    query: {
      queryKey: getGetMoizvonkiMangoStatusQueryKey(),
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  });

  const { data: metricsMz, isLoading: isMetricsMzLoading, error: metricsMzError, isFetching: isMzFetching } = useGetMoizvonkiMetrics({
    query: { 
      queryKey: getGetMoizvonkiMetricsQueryKey(),
      retry: false,
      enabled: Boolean(statusMz?.isConfigured),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  });

  const { data: kpiMango, isLoading: isKpiMangoLoading, error: kpiMangoError, isFetching: isMangoFetching } = useGetMoizvonkiMangoKpi({
    query: {
      queryKey: getGetMoizvonkiMangoKpiQueryKey(),
      retry: false,
      // TeamView owns the team request. Do not fetch the personal KPI in
      // parallel while a manager is looking at the team tab.
      enabled: view === 'mine' && Boolean(statusMango?.isConnected && me.mangoMemberId),
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  });

  const refreshMz = useRefreshMoizvonkiMetrics();

  const handleRefresh = () => {
    // 1. Invalidate Mango immediately (it's a live query)
    queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMangoStatusQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMangoKpiQueryKey() });
    
    // 2. Trigger MZ refresh mutation
    refreshMz.mutate(undefined, {
      onSuccess: () => {
        toast({ title: 'Обновлено', description: 'Синхронизация завершена.' });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMetricsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiHistoryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiStatusQueryKey() });
      },
      onError: (err: any) => {
        const status = err?.response?.status;
        let msg = 'Произошла неизвестная ошибка при обновлении Мои Звонки.';
        if (status === 400) msg = 'Подключение Мои Звонки не настроено.';
        if (status === 401) msg = 'Сессия Мои Звонки отклонена.';
        if (status === 502) msg = 'Сбой сбора со стороны Мои Звонки.';
        toast({ title: 'Ошибка обновления', description: msg, variant: 'destructive' });
      }
    });
  };

  const openSettings = (tab: string) => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  const isConfiguredMz = statusMz?.isConfigured;
  const isConfiguredMango = statusMango?.isConnected;
  const isLoadingStatuses = isStatusMzLoading || isStatusMangoLoading;
  
  const isRefreshing = refreshMz.isPending || isMzFetching || isMangoFetching;

  // Computations
  const mzCalls = metricsMz?.calls ?? 0;
  const mzTraffic = metricsMz?.trafficSeconds ?? 0;
  const mangoCalls = kpiMango?.calls ?? 0;
  const mangoTraffic = kpiMango?.trafficSeconds ?? 0;

  const totalCalls = mzCalls + mangoCalls;
  const totalTraffic = mzTraffic + mangoTraffic;
  const shiftHours = settings?.shiftHours ?? 9.5;
  const density = shiftHours > 0 ? totalCalls / shiftHours : 0;

  if (isLoadingStatuses) {
    return (
      <div className="min-h-screen bg-muted/20 p-6 lg:p-10 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground animate-pulse">
          <RefreshCw className="w-8 h-8 animate-spin" />
          <p className="text-sm font-medium">Сбор данных со всех телефоний...</p>
        </div>
      </div>
    );
  }

  if (!isConfiguredMz && !isConfiguredMango) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6">
        <div className="max-w-2xl w-full space-y-8 text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-2">
            <Radio className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Дашборд звонков</h1>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-lg mx-auto">
              Единая сводка по вашей активности. Вы можете подключить одну или обе поддерживаемые телефонии для автоматического сбора статистики.
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 gap-4 text-left">
            <Card className="border-border shadow-sm hover-elevate transition-all">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Phone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Мои Звонки</h3>
                    <p className="text-xs text-muted-foreground">Cookies / Логин</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  Подключение к moizvonki.ru для агрегации истории и общей аналитики.
                </p>
                <Button className="w-full" variant="outline" onClick={() => openSettings('mz')}>
                  Настроить
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm hover-elevate transition-all border-t-4 border-t-teal-500">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                    <PlugZap className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Mango Office</h3>
                    <p className="text-xs text-muted-foreground">Живые данные</p>
                  </div>
                </div>
                {isManager ? (
                  <>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      Единое подключение для всей команды — живые KPI каждого сотрудника в течение дня.
                    </p>
                    <Button className="w-full bg-teal-50 text-teal-700 hover:bg-teal-100 border-teal-200" variant="outline" onClick={() => openSettings('mango')}>
                      Подключить
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Общее подключение Mango настраивает руководитель или администратор — сотрудникам вводить данные Mango не нужно.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        <ConnectionSettings open={settingsOpen} onOpenChange={setSettingsOpen} defaultTab={settingsTab} role={me.role} />
      </div>
    );
  }

  // Error handling parsing
  const mzErrorStatus = (metricsMzError as any)?.response?.status;
  const mzNeedsReauth = mzErrorStatus === 401 || mzErrorStatus === 400;
  
  const mangoErrorStatus = (kpiMangoError as any)?.response?.status;
  const mangoNeedsReauth = mangoErrorStatus === 401;
  const mangoIsDown = mangoErrorStatus === 502;

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Radio className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-semibold leading-none tracking-tight">Дашборд звонков</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                {me.mangoMemberName ?? me.displayName ?? me.email ?? 'Личный кабинет'}
                <span className="text-muted-foreground/60">•</span>
                {me.role === 'admin' ? 'Администратор' : me.role === 'manager' ? 'Руководитель' : 'Сотрудник'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 hidden sm:flex"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              className="sm:hidden"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <div className="h-4 w-px bg-border mx-1"></div>
            <Button variant="outline" size="icon" onClick={() => openSettings('settings')}>
              <Settings2 className="w-4 h-4 text-muted-foreground" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              title="Выйти"
              onClick={() => signOut({ redirectUrl: basePath || '/' })}
            >
              <LogOut className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {isManager && (
          <div className="flex gap-2">
            <Button
              variant={view === 'team' ? 'default' : 'outline'}
              size="sm"
              className="gap-2"
              onClick={() => setView('team')}
            >
              <Users className="w-4 h-4" />
              Команда
            </Button>
            <Button
              variant={view === 'mine' ? 'default' : 'outline'}
              size="sm"
              className="gap-2"
              onClick={() => setView('mine')}
            >
              <UserRound className="w-4 h-4" />
              Мои показатели
            </Button>
          </div>
        )}

        {isManager && view === 'team' ? (
          <TeamView shiftHours={settings?.shiftHours ?? 9.5} />
        ) : (
        <>
        {/* Date and Summary */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Сводка за сегодня</h2>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4" />
              {format(new Date(), 'd MMMM yyyy', { locale: ru })}
              {(metricsMz?.updatedAt) && (
                <span className="ml-2 pl-2 border-l">
                  Синхронизировано: {format(new Date(metricsMz.updatedAt), 'HH:mm')}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CsvUploadDialog />
          </div>
        </div>

        {/* Aggregated KPI Grid */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="hover-elevate transition-colors border-l-4 border-l-primary bg-primary/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-primary">Суммарный трафик</CardTitle>
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <Clock className="w-4 h-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-mono tracking-tight text-foreground">
                {formatDuration(totalTraffic)}
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-medium">
                Мои Звонки + Mango
              </p>
            </CardContent>
          </Card>
          
          <Card className="hover-elevate transition-colors border-l-4 border-l-chart-3 bg-[hsl(var(--chart-3))]/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-[hsl(var(--chart-3))]">Всего звонков</CardTitle>
              <div className="w-8 h-8 rounded-full bg-[hsl(var(--chart-3))]/20 flex items-center justify-center">
                <PhoneCall className="w-4 h-4 text-[hsl(var(--chart-3))]" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-mono tracking-tight text-foreground">
                {totalCalls}
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-medium">
                Успешных соединений
              </p>
            </CardContent>
          </Card>
          
          <Card className="hover-elevate transition-colors border-l-4 border-l-chart-2 bg-[hsl(var(--chart-2))]/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-[hsl(var(--chart-2))]">Плотность работы</CardTitle>
              <div className="w-8 h-8 rounded-full bg-[hsl(var(--chart-2))]/20 flex items-center justify-center">
                <Activity className="w-4 h-4 text-[hsl(var(--chart-2))]" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-mono tracking-tight text-foreground">
                {density.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-medium">
                Звонков/час (Смена {shiftHours}ч)
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Source Breakdowns */}
        <h3 className="text-lg font-semibold mt-10 tracking-tight">Источники данных</h3>
        <div className="grid gap-4 md:grid-cols-2">
          
          {/* MZ Source Card */}
          <Card className="overflow-hidden">
            <div className="h-1 w-full bg-blue-500" />
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded flex items-center justify-center">
                    <Phone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <CardTitle className="text-base">Мои Звонки</CardTitle>
                </div>
                {!isConfiguredMz ? (
                  <Badge variant="outline" className="text-muted-foreground">Отключено</Badge>
                ) : mzNeedsReauth ? (
                  <Badge variant="destructive" className="flex gap-1 items-center"><AlertCircle className="w-3 h-3"/> Ошибка</Badge>
                ) : metricsMz?.source ? (
                  <SourceBadge source={metricsMz.source} />
                ) : (
                  <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-900/10">Активно</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!isConfiguredMz ? (
                <div className="py-6 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">Не настроено подключение к сервису.</p>
                  <Button variant="outline" size="sm" onClick={() => openSettings('mz')}>Настроить интеграцию</Button>
                </div>
              ) : mzNeedsReauth ? (
                <div className="py-6 text-center space-y-3 bg-destructive/5 rounded-lg border border-destructive/10">
                  <ServerCrash className="w-6 h-6 text-destructive mx-auto" />
                  <p className="text-sm font-medium text-destructive">Требуется повторная авторизация</p>
                  <Button variant="outline" size="sm" onClick={() => openSettings('mz')}>Исправить</Button>
                </div>
              ) : isMetricsMzLoading ? (
                <div className="py-6 flex justify-center"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : mzErrorStatus === 404 ? (
                 <div className="py-6 text-center text-sm text-muted-foreground bg-muted/20 rounded-lg">
                   Нет звонков за сегодня
                 </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Звонков</p>
                    <p className="text-2xl font-mono font-semibold">{mzCalls}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Трафик</p>
                    <p className="text-2xl font-mono font-semibold">{formatDuration(mzTraffic)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mango Source Card */}
          <Card className="overflow-hidden">
            <div className="h-1 w-full bg-teal-500" />
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-teal-100 dark:bg-teal-900/30 rounded flex items-center justify-center">
                    <PlugZap className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <CardTitle className="text-base">Mango Office</CardTitle>
                </div>
                {!isConfiguredMango ? (
                  <Badge variant="outline" className="text-muted-foreground">Отключено</Badge>
                ) : mangoNeedsReauth ? (
                  <Badge variant="destructive" className="flex gap-1 items-center"><AlertCircle className="w-3 h-3"/> Сессия истекла</Badge>
                ) : mangoIsDown ? (
                  <Badge variant="destructive" className="flex gap-1 items-center"><ServerCrash className="w-3 h-3"/> Сбой сети</Badge>
                ) : isKpiMangoLoading ? (
                  <Badge variant="outline" className="flex gap-1 items-center text-muted-foreground"><RefreshCw className="w-3 h-3 animate-spin"/> Live</Badge>
                ) : (
                  <Badge variant="outline" className="text-teal-600 border-teal-200 bg-teal-50 dark:bg-teal-900/10 flex gap-1 items-center shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
                    Live
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!isConfiguredMango ? (
                <div className="py-6 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">Получайте живые данные прямо из АТС.</p>
                  <Button variant="outline" size="sm" onClick={() => openSettings('mango')} className="text-teal-700 hover:text-teal-800 border-teal-200 hover:bg-teal-50">
                    Подключить Mango
                  </Button>
                </div>
              ) : mangoNeedsReauth ? (
                <div className="py-6 text-center space-y-3 bg-destructive/5 rounded-lg border border-destructive/10">
                  <p className="text-sm font-medium text-destructive">Сессия истекла</p>
                  <Button variant="outline" size="sm" onClick={() => openSettings('mango')}>Войти заново</Button>
                </div>
              ) : mangoIsDown ? (
                <div className="py-6 text-center space-y-3 bg-muted/20 rounded-lg">
                  <p className="text-sm text-muted-foreground">Сервер Mango Office временно недоступен</p>
                </div>
              ) : isKpiMangoLoading && !kpiMango ? (
                <div className="py-6 flex flex-col items-center gap-2 text-muted-foreground">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span className="text-[11px]">Идет запрос к АТС...</span>
                </div>
              ) : mangoErrorStatus === 404 ? (
                 <div className="py-6 text-center text-sm text-muted-foreground bg-muted/20 rounded-lg">
                   Нет звонков в Манго сегодня
                 </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Звонков</p>
                    <p className="text-2xl font-mono font-semibold">{mangoCalls}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Трафик</p>
                    <p className="text-2xl font-mono font-semibold">{formatDuration(mangoTraffic)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        <MetricsChart />
        </>
        )}

      </main>

      <ConnectionSettings open={settingsOpen} onOpenChange={setSettingsOpen} defaultTab={settingsTab} role={me.role} />
    </div>
  );
}
