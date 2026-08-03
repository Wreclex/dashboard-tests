import { useEffect, useState } from 'react';
import { Show } from '@clerk/react';
import { Minus, Plus, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAutoReportScheduleQueryKey,
  getListTelegramChannelsQueryKey,
  useCreateAutoReportSchedule,
  useDeleteAutoReportSchedule,
  useGetAutoReportSchedule,
  useListTelegramChannels,
  useSaveUserReportState,
} from '@workspace/api-client-react';
import type { ReportState, SignatureConfig } from '@/hooks/useReportState';

interface Props {
  open: boolean;
  onClose: () => void;
  state: ReportState;
  signature: SignatureConfig;
  selectedReportType: number;
}

const TYPES = ['ПЛАН', 'ПРЕДВ.', 'ОТЧЁТ'];

export default function AutoReportModal({ open, onClose, state, signature, selectedReportType }: Props) {
  const queryClient = useQueryClient();
  const [channelId, setChannelId] = useState<number | null>(null);
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [reportType, setReportType] = useState(selectedReportType);
  const [error, setError] = useState('');
  const scheduleQuery = useGetAutoReportSchedule({
    query: { enabled: open, queryKey: getGetAutoReportScheduleQueryKey() },
  });
  const { data: channels = [] } = useListTelegramChannels({
    query: { enabled: open, queryKey: getListTelegramChannelsQueryKey() },
  });
  const saveState = useSaveUserReportState();
  const saveSchedule = useCreateAutoReportSchedule();
  const deactivate = useDeleteAutoReportSchedule();
  const schedule = scheduleQuery.data;

  useEffect(() => {
    if (!open) return;
    setError('');
    setReportType(schedule?.reportType ?? selectedReportType);
    setIntervalMinutes(schedule?.intervalMinutes ?? 5);
    setChannelId(schedule?.channelId ?? null);
  }, [open, schedule?.channelId, schedule?.intervalMinutes, schedule?.reportType, selectedReportType]);

  if (!open) return null;
  const isSaving = saveState.isPending || saveSchedule.isPending;
  const lastSent = schedule?.lastSentAt
    ? new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(schedule.lastSentAt))
    : null;

  const activate = async () => {
    if (!channelId) {
      setError('Выберите Telegram-канал');
      return;
    }
    setError('');
    try {
      await saveState.mutateAsync({ data: { state, signature } });
      await saveSchedule.mutateAsync({
        data: { channelId, intervalMinutes, reportType, isActive: true },
      });
      await queryClient.invalidateQueries({ queryKey: getGetAutoReportScheduleQueryKey() });
    } catch {
      setError('Не удалось включить автоотчёт');
    }
  };

  const stop = async () => {
    setError('');
    try {
      await deactivate.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: getGetAutoReportScheduleQueryKey() });
    } catch {
      setError('Не удалось отключить автоотчёт');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={onClose} />
      <div className="relative z-10 glass rounded-[24px] w-full max-w-md shadow-2xl overflow-hidden">
        <div className="absolute -top-24 -right-24 w-56 h-56 rounded-full opacity-25 pointer-events-none"
          style={{ background: 'radial-gradient(circle, hsl(22 100% 56% / 0.6), transparent)' }} />
        <div className="relative flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-foreground">Автоотчёт</h2>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-0.5">Отправка во время смены</p>
          </div>
          <button onClick={onClose} className="press-sm w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground hover:text-foreground">
            <X size={15} />
          </button>
        </div>

        <Show when="signed-out">
          <div className="relative px-5 py-10 text-center text-xs text-muted-foreground uppercase tracking-[0.16em]">
            Войдите, чтобы включить автоотчёт
          </div>
        </Show>
        <Show when="signed-in">
          <div className="relative px-5 pb-5 flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground px-1">Telegram-канал</span>
              <select value={channelId ?? ''} onChange={e => setChannelId(Number(e.target.value) || null)}
                className="h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-foreground text-sm px-4 outline-none focus:border-primary/40">
                <option value="">Выберите канал</option>
                {channels.map(channel => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
              </select>
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground px-1">Интервал отправки</span>
              <div className="flex items-center justify-between rounded-2xl bg-white/[0.04] border border-white/[0.06] p-1.5">
                <button onClick={() => setIntervalMinutes(v => Math.max(1, v - 1))} disabled={intervalMinutes === 1} className="w-10 h-10 rounded-xl bg-white/[0.06] text-muted-foreground hover:text-foreground disabled:opacity-30"><Minus size={15} className="mx-auto" /></button>
                <span className="font-mono text-lg font-bold text-foreground">{intervalMinutes} <span className="text-xs text-muted-foreground">мин.</span></span>
                <button onClick={() => setIntervalMinutes(v => Math.min(10, v + 1))} disabled={intervalMinutes === 10} className="w-10 h-10 rounded-xl bg-white/[0.06] text-muted-foreground hover:text-foreground disabled:opacity-30"><Plus size={15} className="mx-auto" /></button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground px-1">Тип отчёта</span>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                {TYPES.map((type, index) => <button key={type} onClick={() => setReportType(index)} className={`h-10 rounded-xl text-[10px] font-bold tracking-wide transition-colors ${reportType === index ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{type}</button>)}
              </div>
            </div>

            {schedule?.isActive && <p className="text-xs text-green-400 text-center">Активен{lastSent ? ` · последняя отправка: ${lastSent}` : ''}</p>}
            {error && <p className="text-xs text-destructive text-center">{error}</p>}
            {channels.length === 0 && <p className="text-xs text-muted-foreground text-center">Сначала добавьте канал через кнопку TG</p>}

            {schedule?.isActive ? (
              <button onClick={stop} disabled={deactivate.isPending} className="press-sm h-12 rounded-2xl text-[12px] font-bold text-destructive bg-destructive/10 border border-destructive/20 disabled:opacity-40">
                {deactivate.isPending ? 'Отключение...' : 'Отключить'}
              </button>
            ) : (
              <button onClick={activate} disabled={isSaving || channels.length === 0} className="press-spring h-12 rounded-2xl text-[12px] font-bold text-primary-foreground disabled:opacity-40" style={{ background: 'linear-gradient(180deg, hsl(22 100% 56%), hsl(22 100% 44%))' }}>
                {isSaving ? 'Включение...' : 'Включить автоотчёт'}
              </button>
            )}
          </div>
        </Show>
      </div>
    </div>
  );
}