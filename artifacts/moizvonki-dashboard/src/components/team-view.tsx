import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RefreshCw, AlertCircle, PhoneCall, Clock, Users, Activity } from 'lucide-react';
import {
  useGetMoizvonkiTeamKpi,
  getGetMoizvonkiTeamKpiQueryKey,
} from '@workspace/api-client-react';
import type { MangoOperator } from '@workspace/api-client-react';

function formatDuration(seconds: number) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Manager/admin team summary: one row per operator from the shared Mango
 * connection, with a multiselect filter — totals are recomputed over the
 * selected employees only.
 */
const TRACKED_MEMBERS_STORAGE_KEY = 'moizvonki:tracked-team-members';

function readTrackedMembers(): Set<number> | null {
  try {
    const stored = window.localStorage.getItem(TRACKED_MEMBERS_STORAGE_KEY);
    if (stored === null) return null; // Existing managers begin by tracking everyone.
    const values: unknown = JSON.parse(stored);
    return Array.isArray(values)
      ? new Set(values.filter((value): value is number => Number.isInteger(value) && value > 0))
      : null;
  } catch {
    return null;
  }
}

export function TeamView({ shiftHours }: { shiftHours: number }) {
  // null means "all" until the manager makes their first explicit choice.
  const [selected, setSelected] = useState<Set<number> | null>(readTrackedMembers);

  const { data, isLoading, error, isFetching, refetch } = useGetMoizvonkiTeamKpi({
    query: {
      queryKey: getGetMoizvonkiTeamKpiQueryKey(),
      retry: false,
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      // The server answers from its snapshot; keep polling only while it is
      // actually refreshing Mango in the background.
      refetchInterval: (query) => (query.state.data?.state === 'refreshing' ? 4000 : false),
    },
  });

  const members: MangoOperator[] = useMemo(() => data?.members ?? [], [data]);
  const allMemberIds = useMemo(() => members.map((member) => member.memberId), [members]);

  useEffect(() => {
    if (selected !== null) {
      window.localStorage.setItem(TRACKED_MEMBERS_STORAGE_KEY, JSON.stringify([...selected]));
    }
  }, [selected]);

  const visible = useMemo(
    () => (selected === null ? members : members.filter((m) => selected.has(m.memberId))),
    [members, selected],
  );

  const totals = useMemo(
    () => ({
      calls: visible.reduce((s, m) => s + m.calls, 0),
      traffic: visible.reduce((s, m) => s + m.trafficSeconds, 0),
    }),
    [visible],
  );
  const density = shiftHours > 0 && visible.length > 0 ? totals.calls / shiftHours : 0;

  const toggle = (memberId: number) => {
    setSelected((prev) => {
      const next = new Set(prev === null ? members.map((m) => m.memberId) : prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const isChecked = (memberId: number) => selected === null || selected.has(memberId);
  const selectedCount = selected === null ? members.length : visible.length;
  const selectAll = () => setSelected(new Set(allMemberIds));
  const clearAll = () => setSelected(new Set());
  const state = data?.state;
  const hasData = Boolean(data?.hasData);
  const updatedAt = data?.updatedAt ? new Date(data.updatedAt) : null;
  const updatedLabel = updatedAt
    ? `Обновлено в ${updatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
    : null;

  /** Nothing to show yet — explain why instead of spinning forever. */
  const emptyReason =
    error
      ? 'Не удалось получить показатели команды. Проверьте соединение и повторите.'
      : state === 'not_configured'
        ? 'Общее подключение Mango не настроено. Подключите Mango Office в настройках.'
        : state === 'reauth_required'
          ? `Mango не принял сохранённый вход${data?.message ? `: ${data.message}` : ''}. Войдите заново в настройках Mango.`
          : state === 'unavailable'
            ? 'Mango Office временно недоступен. Данные появятся автоматически, как только сервис ответит.'
            : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold tracking-tight">Команда сегодня</h3>
          {selected !== null && (
            <Badge variant="secondary" className="font-medium">
              Отслеживаются: {selectedCount} из {members.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {updatedLabel && (
            <span className="text-xs text-muted-foreground">
              {updatedLabel}
              {state === 'reauth_required'
                ? ' · нужен повторный вход'
                : state === 'unavailable'
                  ? ' · Mango не отвечает'
                  : state === 'refreshing'
                    ? ' · обновляем'
                    : ''}
            </span>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <p className="text-sm">Загружаем показатели команды из Mango...</p>
        </div>
      ) : !hasData && emptyReason ? (
        <Card className="border-destructive/30">
          <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
            <p className="text-sm text-muted-foreground max-w-md">{emptyReason}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Повторить</Button>
          </CardContent>
        </Card>
      ) : !hasData ? (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-3 text-center text-muted-foreground">
            <RefreshCw className="w-6 h-6 animate-spin" />
            <p className="text-sm max-w-md">Собираем показатели команды из Mango — это может занять до минуты.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Totals over the selected employees */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-l-4 border-l-chart-3 bg-[hsl(var(--chart-3))]/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-[hsl(var(--chart-3))]">Звонков всего</CardTitle>
                <div className="w-8 h-8 rounded-full bg-[hsl(var(--chart-3))]/20 flex items-center justify-center">
                  <PhoneCall className="w-4 h-4 text-[hsl(var(--chart-3))]" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-mono tracking-tight">{totals.calls}</div>
                <p className="text-xs text-muted-foreground mt-1 font-medium">
                  {visible.length} сотрудн.
                </p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-primary bg-primary/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-primary">Трафик всего</CardTitle>
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-mono tracking-tight">{formatDuration(totals.traffic)}</div>
                <p className="text-xs text-muted-foreground mt-1 font-medium">Суммарно по выбранным</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-chart-2 bg-[hsl(var(--chart-2))]/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-[hsl(var(--chart-2))]">Плотность</CardTitle>
                <div className="w-8 h-8 rounded-full bg-[hsl(var(--chart-2))]/20 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-[hsl(var(--chart-2))]" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-mono tracking-tight">{density.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground mt-1 font-medium">Звонков/час на сотрудника</p>
              </CardContent>
            </Card>
          </div>

          {/* The manager chooses which team members are included in the
              tracked KPI summary. This preference persists on this device. */}
          <Card>
            <CardHeader className="space-y-3 border-b py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Кого отслеживать</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    В сводке учитываются только отмеченные сотрудники. Выбор сохраняется для этого руководителя в браузере.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll} disabled={members.length === 0 || selectedCount === members.length}>
                    Выделить всех
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearAll} disabled={selectedCount === 0}>
                    Снять все
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {members.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">В Mango пока нет доступных операторов.</p>
              ) : (
              <ul className="divide-y">
                {members.map((m) => (
                  <li key={m.memberId}>
                    <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                      <Checkbox
                        checked={isChecked(m.memberId)}
                        onCheckedChange={() => toggle(m.memberId)}
                        aria-label={`Отслеживать ${m.memberName}`}
                      />
                      <span className="flex-1 font-medium text-sm">{m.memberName}</span>
                      <span className="font-mono text-sm tabular-nums text-muted-foreground w-20 text-right">
                        {m.calls} зв.
                      </span>
                      <span className="font-mono text-sm tabular-nums w-24 text-right">
                        {formatDuration(m.trafficSeconds)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
