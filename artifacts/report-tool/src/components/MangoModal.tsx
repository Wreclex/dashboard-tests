import { useEffect, useState } from 'react';
import { X, Check, Trash2, ShieldAlert, Bookmark } from 'lucide-react';
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

/**
 * Bookmarklet that runs on ccc.mango-office.ru.
 *
 * Reads auth_token + refresh_token directly from localStorage (they are always
 * written there after a successful Mango login) and displays them in an overlay.
 * The user copies the combined string and pastes it here.
 *
 * Combined format: "<auth_token>||<refresh_token>"
 * If refresh_token is absent, just "<auth_token>"
 */
/**
 * Core extraction script. Uses a native prompt() dialog (cannot be blocked by
 * the page's Content-Security-Policy, unlike injected DOM overlays) and scans
 * both localStorage and sessionStorage for token-like keys instead of assuming
 * exact key names.
 */
const EXTRACT_SCRIPT = `(function(){
function scan(s){var o={};try{for(var i=0;i<s.length;i++){var k=s.key(i);if(/token/i.test(k))o[k]=s.getItem(k);}}catch(e){}return o;}
var ls=scan(localStorage),ss=scan(sessionStorage);
var t=ls.auth_token||ss.auth_token,r=ls.refresh_token||ss.refresh_token;
if(!t){var ks=Object.keys(ls).concat(Object.keys(ss));alert('Токен не найден. Ключи с token: '+(ks.join(', ')||'нет')+'. Проверьте, что вы вошли на ccc.mango-office.ru и открыли закладку именно на этой вкладке.');return;}
prompt('Скопируйте (Ctrl+C / Cmd+C) и вставьте в Report Tool:',r?t+'||'+r:t);
})()`.replace(/\n/g, '');

const BOOKMARKLET = `javascript:${EXTRACT_SCRIPT}`;
/** Fallback: paste into DevTools console if the bookmarklet does nothing. */
const CONSOLE_SNIPPET = EXTRACT_SCRIPT;

/** Parse a pasted token string — supports "token||refresh" or bare token. */
function parseTokenInput(raw: string): { token: string; refresh?: string } {
  const trimmed = raw.trim();
  const sep = trimmed.indexOf('||');
  if (sep !== -1) {
    return { token: trimmed.slice(0, sep).trim(), refresh: trimmed.slice(sep + 2).trim() };
  }
  return { token: trimmed };
}

export default function MangoModal({ open, onClose, isSignedIn }: Props) {
  const queryClient = useQueryClient();
  const [tokenInput, setTokenInput] = useState('');
  const [error, setError] = useState('');
  const [tokenExpired, setTokenExpired] = useState(false);
  const [snippetCopied, setSnippetCopied] = useState(false);

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
    if (!tokenInput.trim()) { setError('Вставьте токен'); return; }
    const parsed = parseTokenInput(tokenInput);
    if (!parsed.token) { setError('Некорректный токен'); return; }
    setError('');
    try {
      await putToken.mutateAsync({ data: parsed });
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
      if (errorCode === 'token_expired') { setTokenExpired(true); setError('Токен истёк — обновите через закладку'); }
      else if (result.error) setError('Ошибка при проверке данных');
    } catch (err) {
      const errorCode = (err as { data?: { error?: string } })?.data?.error;
      setTokenExpired(errorCode === 'token_expired');
      setError(errorCode === 'token_expired' ? 'Токен истёк — обновите через закладку' : 'Ошибка при проверке данных');
    }
  };

  const isLoading = statusQuery.isLoading || putToken.isPending || deleteToken.isPending || kpiQuery.isFetching;
  const needsToken = !status?.isConnected || tokenExpired;

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
          {tokenExpired && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
              <ShieldAlert size={16} />
              <span className="text-xs font-bold uppercase tracking-wide">Токен истёк — обновите</span>
            </div>
          )}

          {needsToken ? (
            <div className="flex flex-col gap-3">
              {/* Step 1 — bookmarklet */}
              <div className="flex flex-col gap-3 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-black flex items-center justify-center flex-shrink-0">1</span>
                  <span className="text-xs font-semibold text-foreground">Перетащите закладку в браузер</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Откройте{' '}
                  <a href="https://ccc.mango-office.ru" target="_blank" rel="noreferrer"
                    className="text-primary underline underline-offset-2">ccc.mango-office.ru</a>,
                  войдите и нажмите закладку — токен будет прочитан прямо из браузера.
                </p>
                <a
                  href={BOOKMARKLET}
                  draggable
                  onClick={e => e.preventDefault()}
                  className="flex items-center justify-center gap-2 w-full h-10 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors cursor-grab active:cursor-grabbing text-xs font-bold text-primary select-none"
                >
                  <Bookmark size={13} />
                  Получить токен Mango
                </a>
                <p className="text-[10px] text-muted-foreground/60 text-center">
                  Зажмите и перетащите в панель закладок
                </p>
                <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Закладка не сработала? Скопируйте команду, откройте на странице Mango
                    консоль (F12 → Console), вставьте её и нажмите Enter:
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(CONSOLE_SNIPPET);
                      setSnippetCopied(true);
                      setTimeout(() => setSnippetCopied(false), 2000);
                    }}
                    className="press-sm flex items-center justify-center gap-2 w-full h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] transition-colors text-[11px] font-semibold text-foreground"
                  >
                    {snippetCopied ? '✓ Скопировано' : 'Скопировать команду для консоли'}
                  </button>
                </div>
              </div>

              {/* Step 2 — paste */}
              <div className="flex flex-col gap-3 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-black flex items-center justify-center flex-shrink-0">2</span>
                  <span className="text-xs font-semibold text-foreground">Вставьте скопированный токен</span>
                </div>
                <div className="flex items-center rounded-2xl h-12 px-3 bg-white/[0.04] border border-white/[0.06] focus-within:border-primary/40 focus-within:bg-white/[0.06] transition-colors">
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    placeholder="Вставьте сюда..."
                    className="flex-1 bg-transparent text-foreground text-sm outline-none px-1 font-mono"
                  />
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <button
                  onClick={handleSave}
                  disabled={isLoading || !tokenInput.trim()}
                  className="press-spring h-11 rounded-2xl text-[12px] font-bold text-primary-foreground disabled:opacity-40"
                  style={{ background: 'linear-gradient(180deg, hsl(22 100% 56%), hsl(22 100% 44%))' }}
                >
                  {isLoading ? 'Сохранение...' : 'Сохранить токен'}
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
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Авто-обновление токена</div>
                  </div>
                </div>
                <button
                  onClick={handleDelete}
                  disabled={isLoading}
                  className="press-sm w-8 h-8 flex items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  title="Удалить"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {kpi && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Звонки</span>
                    <span className="text-xl font-bold text-foreground">{kpi.calls}</span>
                  </div>
                  <div className="flex flex-col gap-1 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Трафик</span>
                    <span className="text-xl font-bold text-foreground">{formatTraffic(kpi.trafficSeconds)}</span>
                  </div>
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
