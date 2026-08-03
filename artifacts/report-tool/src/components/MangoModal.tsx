import { useEffect, useState } from 'react';
import { X, Check, Trash2, ShieldAlert } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMangoStatusQueryKey,
  getGetMangoKpiQueryKey,
  useGetMangoStatus,
  useGetMangoKpi,
  usePutMangoToken,
  useDeleteMangoToken,
} from '@workspace/api-client-react';

interface Props {
  open: boolean;
  onClose: () => void;
  isSignedIn: boolean;
}

function formatTraffic(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function MangoModal({ open, onClose, isSignedIn }: Props) {
  const queryClient = useQueryClient();
  const [tokenInput, setTokenInput] = useState('');
  const [error, setError] = useState('');
  const [tokenExpired, setTokenExpired] = useState(false);

  const statusQuery = useGetMangoStatus({
    query: { enabled: open && isSignedIn, queryKey: getGetMangoStatusQueryKey() },
  });

  const kpiQuery = useGetMangoKpi({
    query: { enabled: false, queryKey: getGetMangoKpiQueryKey() },
  });

  const putToken = usePutMangoToken();
  const deleteToken = useDeleteMangoToken();

  const status = statusQuery.data;
  const kpi = kpiQuery.data;

  const isExpired = tokenExpired;

  useEffect(() => {
    if (open) {
      setError('');
      setTokenInput('');
      setTokenExpired(false);
    }
  }, [open]);

  if (!open) return null;
  if (!isSignedIn) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={onClose} />
        <div className="relative z-10 glass rounded-[24px] w-full max-w-md shadow-2xl overflow-hidden">
          <div className="relative flex items-center justify-between px-5 py-4">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-foreground">Mango Office</h2>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-0.5">Интеграция звонков</p>
            </div>
            <button onClick={onClose} className="press-sm w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground hover:text-foreground">
              <X size={15} />
            </button>
          </div>
          <div className="relative px-5 pb-5 text-center text-xs text-muted-foreground leading-relaxed">
            Войдите, чтобы подключить Mango Office и синхронизировать звонки.
          </div>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    if (!tokenInput.trim()) {
      setError('Введите токен');
      return;
    }
    setError('');
    try {
      await putToken.mutateAsync({ data: { token: tokenInput.trim() } });
      await queryClient.invalidateQueries({ queryKey: getGetMangoStatusQueryKey() });
      setTokenInput('');
      setTokenExpired(false);
    } catch {
      setError('Не удалось сохранить токен');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteToken.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: getGetMangoStatusQueryKey() });
      queryClient.setQueryData(getGetMangoKpiQueryKey(), null);
      setTokenExpired(false);
    } catch {
      setError('Не удалось удалить токен');
    }
  };

  const handleCheck = async () => {
    setError('');
    try {
      const result = await kpiQuery.refetch();
      const errorCode = (result.error as { data?: { error?: string } } | null)?.data?.error;
      if (errorCode === 'token_expired') {
        setTokenExpired(true);
        setError('Токен истёк — обновите');
      } else if (result.error) {
        setError('Ошибка при проверке данных');
      }
    } catch (err) {
      const errorCode = (err as { data?: { error?: string } })?.data?.error;
      setTokenExpired(errorCode === 'token_expired');
      setError(errorCode === 'token_expired' ? 'Токен истёк — обновите' : 'Ошибка при проверке данных');
    }
  };

  const isLoading = statusQuery.isLoading || putToken.isPending || deleteToken.isPending || kpiQuery.isFetching;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={onClose} />
      <div className="relative z-10 glass rounded-[24px] w-full max-w-md shadow-2xl overflow-hidden">
        <div className="absolute -top-24 -right-24 w-56 h-56 rounded-full opacity-25 pointer-events-none"
          style={{ background: 'radial-gradient(circle, hsl(22 100% 56% / 0.6), transparent)' }} />
        
        <div className="relative flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-foreground">Mango Office</h2>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-0.5">
              Интеграция звонков
            </p>
          </div>
          <button onClick={onClose} className="press-sm w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground hover:text-foreground">
            <X size={15} />
          </button>
        </div>

        <div className="relative px-5 pb-5 flex flex-col gap-5">
          {isExpired && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
              <ShieldAlert size={16} />
              <span className="text-xs font-bold uppercase tracking-wide">Токен истёк — обновите</span>
            </div>
          )}

          {(!status?.isConnected || isExpired) ? (
            <div className="flex flex-col gap-4">
              <div className="text-xs text-muted-foreground leading-relaxed space-y-2">
                <p>Для подключения необходимо получить Bearer токен авторизации.</p>
                <ol className="list-decimal list-inside space-y-1 ml-1 text-[11px]">
                  <li>Откройте Mango Office в браузере</li>
                  <li>Откройте DevTools (F12) - вкладка Network</li>
                  <li>Сделайте любое действие (например, обновите страницу)</li>
                  <li>Найдите любой XHR запрос, скопируйте значение заголовка Authorization (вместе со словом Bearer)</li>
                </ol>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground px-1">
                  Bearer Token
                </label>
                <div className="flex items-center rounded-2xl h-12 px-3 bg-white/[0.04] border border-white/[0.06] focus-within:border-primary/40 focus-within:bg-white/[0.06] transition-colors">
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    placeholder="Bearer eyJhbGci..."
                    className="flex-1 bg-transparent text-foreground text-sm outline-none px-1 font-mono"
                  />
                </div>
              </div>

              {error && <p className="text-xs text-destructive text-center">{error}</p>}

              <button
                onClick={handleSave}
                disabled={isLoading}
                className="press-spring h-12 mt-2 rounded-2xl text-[12px] font-bold text-primary-foreground disabled:opacity-40"
                style={{ background: 'linear-gradient(180deg, hsl(22 100% 56%), hsl(22 100% 44%))' }}
              >
                {isLoading ? 'Сохранение...' : 'Сохранить токен'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center">
                    <Check size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground">Подключено</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Токен активен</div>
                  </div>
                </div>
                <button
                  onClick={handleDelete}
                  disabled={isLoading}
                  className="press-sm w-8 h-8 flex items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  title="Удалить токен"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {kpi && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      Звонки
                    </span>
                    <span className="text-xl font-bold text-foreground">
                       {kpi.calls}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      Трафик
                    </span>
                    <span className="text-xl font-bold text-foreground flex items-baseline gap-1.5">
                      {formatTraffic(kpi.trafficSeconds)}
                      <span className="text-xs font-normal text-muted-foreground">({kpi.trafficSeconds}с)</span>
                    </span>
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-destructive text-center">{error}</p>}

              <button
                onClick={handleCheck}
                disabled={isLoading}
                className="press-spring h-12 mt-2 rounded-2xl text-[12px] font-bold text-primary-foreground disabled:opacity-40"
                style={{ background: 'linear-gradient(180deg, hsl(22 100% 56%), hsl(22 100% 44%))' }}
              >
                {isLoading ? 'Загрузка...' : 'Проверить данные за сегодня'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
