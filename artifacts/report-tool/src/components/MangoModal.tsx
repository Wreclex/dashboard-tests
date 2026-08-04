import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Check, Trash2, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import {
  useGetMangoStatus,
  useGetMangoKpi,
  usePutMangoCredentials,
  usePutMangoToken,
  useDeleteMangoCredentials,
  getGetMangoStatusQueryKey,
  getGetMangoKpiQueryKey,
} from '@workspace/api-client-react';

/** One-liner for the Mango tab DevTools console — copies "jwt_token||operator_groups" to clipboard. */
const TOKEN_SNIPPET = `copy(localStorage.getItem('jwt_token')+'||'+localStorage.getItem(localStorage.getItem('current_member')+'.operator_groups'))`;

interface Props {
  open: boolean;
  onClose: () => void;
  isSignedIn: boolean;
}

function formatTraffic(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `0:${String(m).padStart(2, '0')}`;
}

function errorCodeOf(err: unknown): string | undefined {
  return (err as { data?: { error?: string } } | null | undefined)?.data?.error;
}

export default function MangoModal({ open, onClose, isSignedIn }: Props) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [authFailed, setAuthFailed] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [snippetCopied, setSnippetCopied] = useState(false);

  const statusQuery = useGetMangoStatus({
    query: { enabled: open && isSignedIn, queryKey: getGetMangoStatusQueryKey() },
  });

  const kpiQuery = useGetMangoKpi({
    query: { enabled: false, queryKey: getGetMangoKpiQueryKey() },
  });

  const putCredentials = usePutMangoCredentials();
  const putToken = usePutMangoToken();
  const deleteCredentials = useDeleteMangoCredentials();

  const status = statusQuery.data;
  const kpi = kpiQuery.data;

  useEffect(() => {
    if (open) {
      setError('');
      setEmail('');
      setPassword('');
      setAuthFailed(false);
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
    setError('');
    try {
      await putCredentials.mutateAsync({ data: { email: email.trim(), password } });
      await queryClient.invalidateQueries({ queryKey: getGetMangoStatusQueryKey() });
      queryClient.setQueryData(getGetMangoKpiQueryKey(), null);
      setPassword('');
      setAuthFailed(false);
    } catch (err) {
      const code = errorCodeOf(err);
      if (code === 'auth_failed') {
        setError('Неверный логин или пароль Mango');
      } else if (code === 'mango_login_unavailable') {
        setError('Mango не пускает автоматический вход (возможна капча). Попробуйте позже.');
      } else {
        setError('Не удалось сохранить данные');
      }
    }
  };

  const handleSaveToken = async () => {
    setError('');
    const raw = tokenInput.trim();
    const sep = raw.indexOf('||');
    const token = (sep !== -1 ? raw.slice(0, sep) : raw).trim().replace(/^"+|"+$/g, '');
    const groups = sep !== -1 ? raw.slice(sep + 2).trim().replace(/^"+|"+$/g, '') : undefined;
    if (!token) return;
    try {
      await putToken.mutateAsync({ data: { token, groups } });
      await queryClient.invalidateQueries({ queryKey: getGetMangoStatusQueryKey() });
      queryClient.setQueryData(getGetMangoKpiQueryKey(), null);
      setTokenInput('');
      setAuthFailed(false);
    } catch (err) {
      if (errorCodeOf(err) === 'groups_required') {
        setError('Вставка неполная — скопируйте строку командой выше и вставьте её целиком');
      } else {
        setError('Не удалось сохранить токен');
      }
    }
  };

  const handleDelete = async () => {
    try {
      await deleteCredentials.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: getGetMangoStatusQueryKey() });
      queryClient.setQueryData(getGetMangoKpiQueryKey(), null);
      setAuthFailed(false);
    } catch {
      setError('Не удалось удалить данные');
    }
  };

  const handleCheck = async () => {
    setError('');
    const result = await kpiQuery.refetch();
    if (result.error) {
      setError('Ошибка при проверке данных');
      return;
    }
    // The KPI endpoint always answers with an explicit state instead of
    // blocking on Mango, so read the state rather than an HTTP error code.
    const kpi = result.data;
    if (kpi?.state === 'not_configured') {
      setAuthFailed(true);
    } else if (kpi?.state === 'reauth_required') {
      setAuthFailed(true);
      setError(kpi.message ?? 'Логин или пароль перестали подходить — введите заново');
    } else if (kpi?.state === 'unavailable') {
      setError('Mango Office сейчас не отвечает — попробуйте позже');
    } else if (!kpi?.hasData) {
      setError('Данные ещё собираются из Mango — повторите через несколько секунд');
    }
  };

  const isLoading =
    statusQuery.isLoading || putCredentials.isPending || putToken.isPending ||
    deleteCredentials.isPending || kpiQuery.isFetching;
  const needsCredentials = !status?.isConnected || authFailed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={onClose} />
      <div className="relative z-10 glass rounded-[24px] w-full max-w-md shadow-2xl overflow-hidden">
        <div className="absolute -top-24 -right-24 w-56 h-56 rounded-full opacity-25 pointer-events-none"
          style={{ background: 'radial-gradient(circle, hsl(22 100% 56% / 0.6), transparent)' }} />

        {/* Header */}
        <div className="relative flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-foreground">Mango Office</h2>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-0.5">Интеграция звонков</p>
          </div>
          <button onClick={onClose} className="press-sm w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground hover:text-foreground">
            <X size={15} />
          </button>
        </div>

        <div className="relative px-5 pb-5 flex flex-col gap-4">
          {authFailed && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
              <ShieldAlert size={16} />
              <span className="text-xs font-bold uppercase tracking-wide">Нужен вход заново</span>
            </div>
          )}

          {needsCredentials ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                <span className="text-xs font-semibold text-foreground">
                  Логин и пароль от <a href="https://ccc.mango-office.ru" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">ccc.mango-office.ru</a>
                </span>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  В поле логина укажите именно логин (не email), как на странице входа Mango.
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Сервер сам войдёт в Mango через невидимый браузер и будет автоматически обновлять сессию. Никаких закладок и токенов вручную.
                </p>
                <div className="flex items-center rounded-2xl h-12 px-3 bg-white/[0.04] border border-white/[0.06] focus-within:border-primary/40 focus-within:bg-white/[0.06] transition-colors">
                  <input
                    type="text"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Логин в Mango"
                    autoComplete="username"
                    className="flex-1 bg-transparent text-foreground text-sm outline-none px-1"
                  />
                </div>
                <div className="flex items-center rounded-2xl h-12 px-3 bg-white/[0.04] border border-white/[0.06] focus-within:border-primary/40 focus-within:bg-white/[0.06] transition-colors">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    placeholder="Пароль в Mango"
                    autoComplete="current-password"
                    className="flex-1 bg-transparent text-foreground text-sm outline-none px-1"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <button
                  onClick={handleSave}
                  disabled={isLoading || !email.trim() || !password}
                  className="press-spring h-11 rounded-2xl text-[12px] font-bold text-primary-foreground disabled:opacity-40"
                  style={{ background: 'linear-gradient(180deg, hsl(22 100% 56%), hsl(22 100% 44%))' }}
                >
                  {isLoading ? 'Проверка входа (до 1 мин)...' : 'Подключить Mango'}
                </button>
                <p className="text-[10px] text-muted-foreground/60 text-center leading-relaxed">
                  Данные хранятся в зашифрованном виде и используются только для входа в Mango
                </p>
              </div>

              {/* Manual token paste — works even when headless login is blocked */}
              <div className="flex flex-col gap-3 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                <span className="text-xs font-semibold text-foreground">Или вставьте токен из своего браузера</span>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Надёжнее всего: откройте{' '}
                  <a href="https://ccc.mango-office.ru" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">ccc.mango-office.ru</a>{' '}
                  (войдите), нажмите F12 → Console, вставьте команду ниже и Enter — токен скопируется сам.
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(TOKEN_SNIPPET);
                    setSnippetCopied(true);
                    setTimeout(() => setSnippetCopied(false), 2000);
                  }}
                  className="press-sm flex items-center justify-center gap-2 w-full h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] transition-colors text-[11px] font-semibold text-foreground"
                >
                  {snippetCopied ? '✓ Скопировано' : 'Скопировать команду для консоли'}
                </button>
                <div className="flex items-center rounded-2xl h-12 px-3 bg-white/[0.04] border border-white/[0.06] focus-within:border-primary/40 focus-within:bg-white/[0.06] transition-colors">
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveToken()}
                    placeholder="Вставьте токен сюда..."
                    className="flex-1 bg-transparent text-foreground text-sm outline-none px-1 font-mono"
                  />
                </div>
                <button
                  onClick={handleSaveToken}
                  disabled={isLoading || !tokenInput.trim()}
                  className="press-spring h-11 rounded-2xl text-[12px] font-bold text-primary-foreground disabled:opacity-40"
                  style={{ background: 'linear-gradient(180deg, hsl(22 100% 56%), hsl(22 100% 44%))' }}
                >
                  {putToken.isPending ? 'Сохранение...' : 'Сохранить токен'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Connected state */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center">
                    <Check size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground">Подключено</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Авто-вход и обновление сессии</div>
                  </div>
                </div>
                <button
                  onClick={handleDelete}
                  disabled={isLoading}
                  className="press-sm w-8 h-8 flex items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  title="Отключить"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {kpi?.hasData && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Звонки</span>
                    <span className="text-xl font-bold text-foreground">{kpi.calls}</span>
                  </div>
                  <div className="flex flex-col gap-1 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Трафик</span>
                    <span className="text-xl font-bold text-foreground">{formatTraffic(kpi.trafficSeconds)}</span>
                  </div>
                  {kpi.updatedAt && (
                    <p className="col-span-2 text-[10px] text-muted-foreground text-center">
                      Обновлено:{' '}
                      {new Date(kpi.updatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      {kpi.state === 'refreshing' ? ' · обновляем' : ''}
                    </p>
                  )}
                </div>
              )}

              {error && <p className="text-xs text-destructive text-center">{error}</p>}

              <button
                onClick={handleCheck}
                disabled={isLoading}
                className="press-spring h-11 rounded-2xl text-[12px] font-bold text-primary-foreground disabled:opacity-40"
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
