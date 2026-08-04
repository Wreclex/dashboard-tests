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
  Settings2,
  CalendarDays,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

import { ConnectionSettings } from '../components/connection-settings';
import { CsvUploadDialog } from '../components/csv-upload';
import { MetricsChart } from '../components/metrics-chart';

import {
  useGetMoizvonkiStatus,
  useGetMoizvonkiMetrics,
  useGetMoizvonkiSettings,
  useRefreshMoizvonkiMetrics,
  getGetMoizvonkiStatusQueryKey,
  getGetMoizvonkiMetricsQueryKey,
  getGetMoizvonkiHistoryQueryKey,
  getGetMoizvonkiSettingsQueryKey
} from '@workspace/api-client-react';

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

export default function DashboardPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const { data: status, isLoading: isStatusLoading } = useGetMoizvonkiStatus({ 
    query: { queryKey: getGetMoizvonkiStatusQueryKey() } 
  });

  const { data: settings } = useGetMoizvonkiSettings({
    query: { queryKey: getGetMoizvonkiSettingsQueryKey() }
  });

  // Автообновление по интервалу из настроек (по умолчанию 15 минут).
  const refetchIntervalMs = (settings?.refreshIntervalMinutes ?? 15) * 60_000;

  const { data: metrics, isLoading: isMetricsLoading, error: metricsError } = useGetMoizvonkiMetrics({
    query: {
      queryKey: getGetMoizvonkiMetricsQueryKey(),
      retry: false,
      refetchInterval: refetchIntervalMs
    }
  });

  const refreshMetrics = useRefreshMoizvonkiMetrics();

  const handleRefresh = () => {
    refreshMetrics.mutate(undefined, {
      onSuccess: () => {
        toast({ title: 'Обновлено', description: 'Данные успешно синхронизированы.' });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMetricsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiHistoryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiStatusQueryKey() });
      },
      onError: (err: any) => {
        const status = err?.response?.status;
        let msg = 'Произошла неизвестная ошибка.';
        if (status === 400) msg = 'Подключение не настроено.';
        if (status === 401) msg = 'Сессия отклонена. Проверьте настройки авторизации.';
        if (status === 502) msg = 'Сбой сбора данных со стороны сервера «Мои Звонки».';
        
        toast({ title: 'Ошибка обновления', description: msg, variant: 'destructive' });
      }
    });
  };

  const isConfigured = status?.isConfigured;
  const isMetricsEmpty = metricsError && (metricsError as any)?.response?.status === 404;
  
  if (isStatusLoading) {
    return (
      <div className="min-h-screen bg-muted/20 p-6 lg:p-10 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground animate-pulse">
          <RefreshCw className="w-8 h-8 animate-spin" />
          <p className="text-sm font-medium">Загрузка дашборда...</p>
        </div>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full space-y-8 text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
            <PhoneCall className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Мои Звонки</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Ваш персональный дашборд аналитики звонков. Для начала работы необходимо настроить подключение к личному кабинету.
            </p>
          </div>
          
          <Card className="border-border shadow-sm text-left">
            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="mt-0.5 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-primary text-xs font-bold">1</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Подключите аккаунт</h3>
                    <p className="text-xs text-muted-foreground mt-1">Авторизация по логину/паролю или через сессионные cookies для автоматического сбора.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="mt-0.5 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-primary text-xs font-bold">2</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Ручная загрузка (резерв)</h3>
                    <p className="text-xs text-muted-foreground mt-1">Если автоматика не подходит, вы можете регулярно загружать CSV отчеты вручную.</p>
                  </div>
                </div>
              </div>
              
              <div className="pt-2 flex flex-col gap-2">
                <Button className="w-full gap-2" onClick={() => setIsSettingsOpen(true)}>
                  Настроить подключение <ArrowRight className="w-4 h-4" />
                </Button>
                <div className="flex items-center justify-center">
                  <CsvUploadDialog />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <ConnectionSettings open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Top Navigation / Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <PhoneCall className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-semibold leading-none tracking-tight">Мои Звонки</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                {status?.lastError ? (
                  <span className="text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Ошибка сбора</span>
                ) : (
                  <span className="text-green-600 dark:text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Активно</span>
                )}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 hidden sm:flex"
              onClick={handleRefresh}
              disabled={refreshMetrics.isPending}
            >
              <RefreshCw className={`w-4 h-4 ${refreshMetrics.isPending ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              className="sm:hidden"
              onClick={handleRefresh}
              disabled={refreshMetrics.isPending}
            >
              <RefreshCw className={`w-4 h-4 ${refreshMetrics.isPending ? 'animate-spin' : ''}`} />
            </Button>
            <div className="h-4 w-px bg-border mx-1"></div>
            <ConnectionSettings />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Date and actions row */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Сводка за сегодня</h2>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4" />
              {format(new Date(), 'd MMMM yyyy', { locale: ru })}
              {metrics?.updatedAt && (
                <span className="ml-2 pl-2 border-l">
                  Обновлено в {format(new Date(metrics.updatedAt), 'HH:mm')}
                </span>
              )}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {metrics?.source && <SourceBadge source={metrics.source} />}
            <CsvUploadDialog />
          </div>
        </div>

        {/* Metrics Grid */}
        {isMetricsLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="w-24 h-4 bg-muted rounded"></div>
                  <div className="w-8 h-8 bg-muted rounded-full"></div>
                </CardHeader>
                <CardContent>
                  <div className="w-16 h-8 bg-muted rounded mb-2"></div>
                  <div className="w-32 h-3 bg-muted rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : isMetricsEmpty || !metrics ? (
          <Card className="border-dashed bg-muted/20 shadow-none">
            <CardContent className="flex flex-col items-center justify-center p-10 text-center space-y-4">
              <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                <Activity className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Нет данных за сегодня</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  Звонки еще не зафиксированы или данные не были синхронизированы. Нажмите «Обновить» или загрузите CSV.
                </p>
              </div>
              <Button onClick={handleRefresh} disabled={refreshMetrics.isPending} className="mt-2">
                Синхронизировать сейчас
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="hover-elevate transition-colors border-l-4 border-l-primary">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Трафик</CardTitle>
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-mono tracking-tight text-foreground">
                  {formatDuration(metrics.trafficSeconds)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Общая длительность разговоров
                </p>
              </CardContent>
            </Card>
            
            <Card className="hover-elevate transition-colors border-l-4 border-l-chart-3">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Кол-во звонков</CardTitle>
                <div className="w-8 h-8 rounded-full bg-[hsl(var(--chart-3))]/10 flex items-center justify-center">
                  <PhoneCall className="w-4 h-4 text-[hsl(var(--chart-3))]" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-mono tracking-tight text-foreground">
                  {metrics.calls}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Успешных соединений
                </p>
              </CardContent>
            </Card>
            
            <Card className="hover-elevate transition-colors border-l-4 border-l-chart-2">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Плотность работы</CardTitle>
                <div className="w-8 h-8 rounded-full bg-[hsl(var(--chart-2))]/10 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-[hsl(var(--chart-2))]" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-mono tracking-tight text-foreground">
                  {metrics.density.toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Звонков в час (смена {metrics.shiftHours}ч)
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* History Chart */}
        <MetricsChart />

      </main>
    </div>
  );
}
