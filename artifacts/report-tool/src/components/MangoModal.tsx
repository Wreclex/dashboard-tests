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

// Bookmarklet: patches fetch + XHR on the Mango page to intercept
// the Authorization header, then shows an overlay with the token.
const BOOKMARKLET = `javascript:(function(){if(window.__mangoCapture){alert('Перехватчик уже активен — выполните любое действие на странице');return;}window.__mangoCapture=true;function show(t){var d=document.getElementById('__mc');if(d)d.remove();var o=document.createElement('div');o.id='__mc';o.style.cssText='position:fixed;top:16px;right:16px;background:#111;color:#f3f4f6;padding:20px;border-radius:16px;z-index:2147483647;width:360px;box-shadow:0 20px 60px rgba(0,0,0,.8);font-family:system-ui,sans-serif;border:1px solid rgba(255,255,255,.12)';o.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><b style="font-size:13px">🔑 Токен найден</b><button onclick="document.getElementById(\\'__mc\\').remove()" style="background:none;border:none;color:#9ca3af;cursor:pointer;font-size:20px;line-height:1">&times;</button></div><textarea id="__mcv" readonly style="width:100%;height:68px;background:#1f2937;color:#d1d5db;border:1px solid #374151;border-radius:8px;padding:8px;font-size:10px;font-family:monospace;resize:none;box-sizing:border-box">'+t+'</textarea><button onclick="navigator.clipboard.writeText(document.getElementById(\\'__mcv\\').value).then(function(){var b=document.querySelector(\\'#__mc button:last-child\\');b.textContent=\\'✓ Скопировано!\\';b.style.background=\\'#16a34a\\'})" style="margin-top:10px;width:100%;padding:10px;background:#f97316;border:none;border-radius:10px;color:#fff;font-weight:700;cursor:pointer;font-size:13px">Скопировать токен</button><p style="margin:8px 0 0;font-size:11px;color:#6b7280">Вставьте в поле «Bearer Token» в Report Tool</p>';document.body.appendChild(o);}var _f=window.fetch;window.fetch=function(){var a=arguments;var h=a[1]&&a[1].headers;var v=null;if(h instanceof Headers){v=h.get('Authorization')||h.get('authorization');}else if(h&&typeof h==='object'){v=h['Authorization']||h['authorization'];}if(v&&v.indexOf('Bearer ')===0)show(v.replace('Bearer ',''));return _f.apply(this,a);};var _s=XMLHttpRequest.prototype.setRequestHeader;XMLHttpRequest.prototype.setRequestHeader=function(k,v){if(k.toLowerCase()==='authorization'&&typeof v==='string'&&v.indexOf('Bearer ')===0)show(v.replace('Bearer ',''));return _s.apply(this,arguments);};var b=document.createElement('div');b.style.cssText='position:fixed;bottom:16px;right:16px;background:#1f2937;color:#d1d5db;padding:10px 14px;border-radius:10px;z-index:2147483646;font-size:12px;font-family:system-ui,sans-serif;border:1px solid rgba(255,255,255,.1)';b.textContent='⏳ Ожидаю токен Mango...';document.body.appendChild(b);setTimeout(function(){b.remove();},6000);})()`;

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
    if (!tokenInput.trim()) { setError('Введите токен'); return; }
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
      if (errorCode === 'token_expired') { setTokenExpired(true); setError('Токен истёк — обновите'); }
      else if (result.error) setError('Ошибка при проверке данных');
    } catch (err) {
      const errorCode = (err as { data?: { error?: string } })?.data?.error;
      setTokenExpired(errorCode === 'token_expired');
      setError(errorCode === 'token_expired' ? 'Токен истёк — обновите' : 'Ошибка при проверке данных');
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
            <>
              {/* Step 1 — bookmarklet */}
              <div className="flex flex-col gap-3 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-black flex items-center justify-center flex-shrink-0">1</span>
                  <span className="text-xs font-semibold text-foreground">Перетащите закладку в браузер</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Перетащите кнопку ниже в панель закладок. Затем откройте&nbsp;
                  <a href="https://ccc.mango-office.ru" target="_blank" rel="noreferrer"
                    className="text-primary underline underline-offset-2">ccc.mango-office.ru</a>,
                  войдите в систему и нажмите закладку — токен появится автоматически.
                </p>
                {/* Draggable bookmarklet anchor */}
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
                  Зажмите и перетащите кнопку в строку закладок
                </p>
              </div>

              {/* Step 2 — paste token */}
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
                    placeholder="Вставьте токен сюда..."
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
            </>
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
