import { useState, useCallback } from 'react';
import { useUser, useClerk, Show } from '@clerk/react';
import { useLocation } from 'wouter';
import CounterField from '@/components/CounterField';
import TimeInput from '@/components/TimeInput';
import SignatureModal from '@/components/SignatureModal';
import TelegramModal from '@/components/TelegramModal';
import DefaultsModal from '@/components/DefaultsModal';
import AutoReportModal from '@/components/AutoReportModal';
import { useReportState, buildPreviewText, formatDate } from '@/hooks/useReportState';
import { useGetSheetCounts, getGetSheetCountsQueryKey } from '@workspace/api-client-react';
import { Settings, Send, RotateCcw, Copy, Check, LogIn, LogOut, SlidersHorizontal, RefreshCw, Clock3 } from 'lucide-react';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

const TABS = ['ПЛАН', 'ПРЕДВ. ОТЧЁТ', 'ОТЧЁТ'] as const;

export default function MainApp() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const userId = user?.id ?? null;

  const { state, updateField, resetState, signature, saveSignature, userDefaults, saveUserDefaults } =
    useReportState(userId);

  const [tab, setTab] = useState(0);
  const [previewActive, setPreviewActive] = useState(true);
  const [sigOpen, setSigOpen] = useState(false);
  const [tgOpen, setTgOpen] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');

  // Strip leading "#" from tag1 to get the bare manager name for sheet filtering
  const sheetName = signature.tag1.replace(/^#/, '').trim() || undefined;

  const { refetch: fetchSheetCounts } = useGetSheetCounts(
    { name: sheetName },
    { query: { enabled: false, queryKey: getGetSheetCountsQueryKey({ name: sheetName }) } },
  );

  const handleSyncSheet = useCallback(async () => {
    setSyncStatus('loading');
    try {
      const { data, error } = await fetchSheetCounts();
      if (error || !data) { setSyncStatus('err'); setTimeout(() => setSyncStatus('idle'), 2500); return; }
      updateField('pzm', data.pzm);
      updateField('psm', data.psm);
      updateField('pstl', data.pstl);
      updateField('vstl', data.vstl);
      updateField('dozh', data.dozh);
      setSyncStatus('ok');
      setTimeout(() => setSyncStatus('idle'), 2500);
    } catch {
      setSyncStatus('err');
      setTimeout(() => setSyncStatus('idle'), 2500);
    }
  }, [fetchSheetCounts, updateField]);

  const today = formatDate(new Date());
  const previewText = buildPreviewText(tab, state, signature, today);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(previewText);
    } catch {
      const el = document.createElement('textarea');
      el.value = previewText;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [previewText]);

  const handleSignOut = () => signOut({ redirectUrl: basePath || '/' });

  const initials = (() => {
    const fn = user?.firstName ?? '';
    const ln = user?.lastName ?? '';
    const name = (fn + ' ' + ln).trim();
    if (name) return name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
    const email = user?.emailAddresses?.[0]?.emailAddress ?? '';
    return email.slice(0, 2).toUpperCase();
  })();

  const userName = user?.firstName || user?.emailAddresses?.[0]?.emailAddress;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col relative overflow-hidden">
      {/* Multi-stop radial gradient depth — deep purple/blue nodes */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-15%] left-[-10%] w-[55vw] h-[55vw] rounded-full opacity-[0.35]"
          style={{ background: 'radial-gradient(circle, hsl(270 70% 50% / 0.5), transparent 65%)' }} />
        <div className="absolute top-[20%] right-[-15%] w-[50vw] h-[50vw] rounded-full opacity-[0.3]"
          style={{ background: 'radial-gradient(circle, hsl(220 80% 55% / 0.45), transparent 65%)' }} />
        <div className="absolute bottom-[-20%] left-[20%] w-[60vw] h-[60vw] rounded-full opacity-[0.28]"
          style={{ background: 'radial-gradient(circle, hsl(22 100% 50% / 0.35), transparent 70%)' }} />
        <div className="absolute bottom-[10%] right-[-10%] w-[45vw] h-[45vw] rounded-full opacity-[0.22]"
          style={{ background: 'radial-gradient(circle, hsl(280 60% 45% / 0.4), transparent 70%)' }} />
      </div>

      {/* iOS-style blurred nav bar */}
      <div className="glass-nav relative z-20 flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-[9px] flex items-center justify-center shadow-[0_4px_14px_hsl(var(--primary)/0.45)]"
            style={{ background: 'linear-gradient(180deg, hsl(22 100% 56%), hsl(22 100% 44%))' }}>
            <span className="text-[11px] font-black text-primary-foreground tracking-tight">R</span>
          </div>
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            Report Tool
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <Show when="signed-in">
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-[12px] font-semibold text-foreground/90 truncate max-w-[160px]">
                  {userName}
                </span>
                <span className="text-[9px] text-muted-foreground uppercase tracking-[0.16em]">
                  Смена
                </span>
              </div>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-primary-foreground border border-white/10 shadow-[0_2px_10px_rgba(0,0,0,0.4)]"
                style={{ background: 'linear-gradient(180deg, hsl(22 100% 56%), hsl(22 100% 44%))' }}>
                {initials}
              </div>
              <button
                onClick={handleSignOut}
                className="press-sm flex items-center gap-1.5 h-9 px-3 rounded-full bg-white/[0.06] text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-white/[0.1] transition-colors"
              >
                <LogOut size={12} />
                <span className="hidden sm:inline">Выйти</span>
              </button>
            </div>
          </Show>
          <Show when="signed-out">
            <button
              onClick={() => setLocation('/sign-in')}
              className="press-sm flex items-center gap-1.5 h-9 px-4 rounded-full text-[11px] font-bold text-primary-foreground shadow-[0_4px_14px_hsl(var(--primary)/0.4)]"
              style={{ background: 'linear-gradient(180deg, hsl(22 100% 56%), hsl(22 100% 44%))' }}
            >
              <LogIn size={12} />
              Войти
            </button>
          </Show>
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex items-start justify-center p-4 pt-6 pb-8">
        <div className="w-full max-w-[980px] flex flex-col gap-5">
          {/* iOS-style pill segmented control */}
          <div className="flex justify-center">
            <div className="glass-pill rounded-full p-1 flex relative">
              {TABS.map((t, i) => (
                <button
                  key={t}
                  onClick={() => setTab(i)}
                  className="relative px-5 sm:px-7 py-2 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors duration-300 rounded-full z-10"
                  style={{ color: tab === i ? 'hsl(0 0% 100%)' : 'hsl(240 8% 62%)' }}
                >
                  {t}
                </button>
              ))}
              {/* animated active indicator */}
              <div
                className="absolute top-1 bottom-1 rounded-full transition-all duration-[400ms] z-0"
                style={{
                  left: `calc(${tab * (100 / TABS.length)}% + 4px)`,
                  width: `calc(${100 / TABS.length}% - 8px)`,
                  background: 'linear-gradient(180deg, hsl(22 100% 56%), hsl(22 100% 46%))',
                  boxShadow: '0 4px 16px hsl(22 100% 50% / 0.5), 0 1px 0 0 hsl(0 0% 100% / 0.2) inset',
                }}
              />
            </div>
          </div>

          {/* Two-panel floating glass cards */}
          <div className="flex flex-col md:flex-row gap-5">
            {/* Left: Input panel */}
            <div className="glass rounded-[20px] p-5 flex-[3] min-w-0">
              {/* Main counters — bold section title with accent line */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-1 h-5 rounded-full bg-primary shadow-[0_0_10px_2px_hsl(var(--primary)/0.5)]" />
                    <p className="text-[13px] font-bold tracking-tight text-foreground">
                      Основные показатели
                    </p>
                  </div>
                  <Show when="signed-in">
                    <button
                      onClick={handleSyncSheet}
                      disabled={syncStatus === 'loading'}
                      className={`press-sm flex items-center gap-1.5 h-7 px-3 rounded-full text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
                        syncStatus === 'ok'
                          ? 'bg-green-500/15 text-green-400'
                          : syncStatus === 'err'
                          ? 'bg-destructive/15 text-destructive'
                          : 'bg-white/[0.05] text-muted-foreground hover:text-primary hover:bg-primary/10'
                      }`}
                    >
                      <RefreshCw size={11} className={syncStatus === 'loading' ? 'animate-spin' : ''} />
                      {syncStatus === 'ok' ? 'Синхр.' : syncStatus === 'err' ? 'Ошибка' : 'Sheets'}
                    </button>
                  </Show>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <CounterField label="ПЗМ" value={state.pzm} onChange={v => updateField('pzm', v)} />
                  <CounterField label="ПСМ" value={state.psm} onChange={v => updateField('psm', v)} />
                  <CounterField label="ПСТЛ" value={state.pstl} onChange={v => updateField('pstl', v)} />
                  <CounterField label="ВСТЛ" value={state.vstl} onChange={v => updateField('vstl', v)} />
                  <CounterField label="ДОЖ" value={state.dozh} onChange={v => updateField('dozh', v)} fullWidth />
                </div>
              </div>

              {/* Timings */}
              <div>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-1 h-5 rounded-full bg-primary/70 shadow-[0_0_10px_2px_hsl(var(--primary)/0.35)]" />
                  <p className="text-[13px] font-bold tracking-tight text-foreground">
                    Тайминги и коэффициенты
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <TimeInput
                    label="Трафик (план)"
                    value={state.trafikPlan}
                    onChange={v => updateField('trafikPlan', v)}
                    fullWidth
                  />

                  {(tab === 1 || tab === 2) && (
                    <TimeInput
                      label="Трафик (текущий)"
                      value={state.trafikCurrent}
                      onChange={v => updateField('trafikCurrent', v)}
                      fullWidth
                    />
                  )}

                  {(tab === 1 || tab === 2) && (
                    <NumberField
                      label="КЗ"
                      value={state.kz}
                      onChange={v => updateField('kz', v)}
                    />
                  )}

                  {tab === 2 && (
                    <>
                      <TimeInput
                        label="Приход"
                        value={state.prihod}
                        onChange={v => updateField('prihod', v)}
                        format="hm"
                      />
                      <TimeInput
                        label="Уход"
                        value={state.uhod}
                        onChange={v => updateField('uhod', v)}
                        format="hm"
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Finances (ОТЧЁТ only) */}
              {tab === 2 && (
                <div className="mt-5">
                  <button
                    onClick={() => updateField('financesEnabled', !state.financesEnabled)}
                    className="flex items-center gap-2.5 mb-4 press-sm transition-transform"
                  >
                    <span className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all ${
                      state.financesEnabled
                        ? 'bg-primary shadow-[0_2px_12px_hsl(var(--primary)/0.5)]'
                        : 'bg-white/[0.06] border border-white/[0.08]'
                    }`}>
                      {state.financesEnabled && <Check size={12} className="text-primary-foreground" />}
                    </span>
                    <div className="flex items-center gap-2.5">
                      <div className="w-1 h-5 rounded-full bg-primary/50" />
                      <p className="text-[13px] font-bold tracking-tight text-foreground">
                        Финансы
                      </p>
                    </div>
                  </button>

                  {state.financesEnabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <MoneyField label="Поступления" value={state.postupleniya} onChange={v => updateField('postupleniya', v)} fullWidth />
                      <MoneyField label="Итого факт" value={state.itogoFact} onChange={v => updateField('itogoFact', v)} />
                      <MoneyField label="Итого план" value={state.itogoPlan} onChange={v => updateField('itogoPlan', v)} />
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground px-1">
                          % выполнения
                        </span>
                        <div className="glass rounded-[18px] h-14 flex items-center justify-center relative overflow-hidden">
                          <div className="absolute inset-0 opacity-50"
                            style={{ background: 'radial-gradient(70% 120% at 50% 100%, hsl(var(--primary)/0.12), transparent)' }} />
                          <span className="relative font-mono text-base font-bold text-primary tabular-nums">{state.vypolnenie}%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Preview panel */}
            <div className="glass rounded-[20px] flex-[2] flex flex-col min-w-0 overflow-hidden">
              {/* Rounded pill toolbar */}
              <div className="flex items-center gap-1.5 p-3 border-b border-white/[0.05] flex-wrap">
                <button
                  onClick={() => setPreviewActive(p => !p)}
                  className={`press-sm flex items-center gap-1.5 h-8 px-3 rounded-full text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
                    previewActive
                      ? 'bg-green-500/15 text-green-400'
                      : 'bg-white/[0.05] text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${previewActive ? 'bg-green-400 shadow-[0_0_6px_2px_hsl(140_60%_50%/0.5)]' : 'bg-muted-foreground/50'}`} />
                  Превью
                </button>
                <button
                  onClick={() => setTgOpen(true)}
                  className="press-sm flex items-center gap-1.5 h-8 px-3 rounded-full text-[10px] font-bold uppercase tracking-[0.14em] bg-white/[0.05] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  <Send size={11} />
                  TG
                </button>
                <Show when="signed-in">
                  <button
                    onClick={() => setAutoOpen(true)}
                    className="press-sm flex items-center gap-1.5 h-8 px-3 rounded-full text-[10px] font-bold uppercase tracking-[0.14em] bg-white/[0.05] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Clock3 size={11} />
                    Авто
                  </button>
                </Show>
                <button
                  onClick={() => setSigOpen(true)}
                  className="press-sm flex items-center gap-1.5 h-8 px-3 rounded-full text-[10px] font-bold uppercase tracking-[0.14em] bg-white/[0.05] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  <Settings size={11} />
                  Подпись
                </button>
                <button
                  onClick={() => setDefaultsOpen(true)}
                  className="press-sm flex items-center gap-1.5 h-8 px-3 rounded-full text-[10px] font-bold uppercase tracking-[0.14em] bg-white/[0.05] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  <SlidersHorizontal size={11} />
                  Умолч.
                </button>
                <button
                  onClick={resetState}
                  className="press-sm flex items-center gap-1.5 h-8 px-3 rounded-full text-[10px] font-bold uppercase tracking-[0.14em] bg-white/[0.05] text-muted-foreground hover:text-foreground hover:bg-white/[0.08] transition-colors ml-auto"
                >
                  <RotateCcw size={11} />
                  Сбросить
                </button>
              </div>

              {/* Preview text */}
              <div className="flex-1 p-4 min-h-[220px]">
                {previewActive ? (
                  <pre className="font-mono text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {previewText}
                  </pre>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground/40 text-[10px] uppercase tracking-[0.18em]">
                    Превью отключено
                  </div>
                )}
              </div>

              {/* Copy button — full-width pill with gradient */}
              <div className="p-3 pt-0">
                <button
                  onClick={handleCopy}
                  className="press-spring w-full flex items-center justify-center gap-2 h-12 rounded-2xl text-[12px] font-bold uppercase tracking-[0.14em] transition-shadow"
                  style={copied
                    ? { background: 'linear-gradient(180deg, hsl(140 60% 45%), hsl(140 60% 35%))', color: 'hsl(0 0% 100%)' }
                    : { background: 'linear-gradient(180deg, hsl(22 100% 56%), hsl(22 100% 44%))', color: 'hsl(0 0% 100%)', boxShadow: '0 6px 20px hsl(22 100% 50% / 0.35)' }
                  }
                >
                  {copied ? (
                    <>
                      <Check size={14} />
                      Скопировано!
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      Копировать
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <SignatureModal
        open={sigOpen}
        onClose={() => setSigOpen(false)}
        signature={signature}
        onSave={saveSignature}
      />
      <TelegramModal
        open={tgOpen}
        onClose={() => setTgOpen(false)}
        previewText={previewText}
      />
      <DefaultsModal
        open={defaultsOpen}
        onClose={() => setDefaultsOpen(false)}
        defaults={userDefaults}
        onSave={saveUserDefaults}
      />
      <AutoReportModal
        open={autoOpen}
        onClose={() => setAutoOpen(false)}
        state={state}
        signature={signature}
        selectedReportType={tab}
      />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const startEdit = () => { setVal(String(value)); setEditing(true); };
  const commit = () => {
    const n = parseFloat(val);
    if (!isNaN(n)) onChange(n);
    setEditing(false);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 px-1">
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 shadow-[0_0_8px_2px_hsl(var(--primary)/0.35)]" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      </div>
      <div className="glass rounded-[18px] h-14 flex items-center px-4 cursor-pointer press-sm relative overflow-hidden"
        onClick={startEdit}>
        <div className="absolute inset-0 pointer-events-none opacity-50"
          style={{ background: 'radial-gradient(70% 120% at 50% 100%, hsl(210 80% 60% / 0.06), transparent)' }} />
        {editing ? (
          <input autoFocus type="number" value={val} onChange={e => setVal(e.target.value)}
            onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            className="relative w-full bg-transparent text-foreground text-lg font-semibold outline-none text-center font-mono" />
        ) : (
          <span className="relative font-mono text-lg font-semibold text-foreground w-full text-center tabular-nums">{value}</span>
        )}
      </div>
    </div>
  );
}

function MoneyField({ label, value, onChange, fullWidth }: { label: string; value: number; onChange: (v: number) => void; fullWidth?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const startEdit = () => { setVal(String(value)); setEditing(true); };
  const commit = () => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 0) onChange(n);
    setEditing(false);
  };
  return (
    <div className={`flex flex-col gap-2 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="flex items-center gap-1.5 px-1">
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 shadow-[0_0_8px_2px_hsl(var(--primary)/0.35)]" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      </div>
      <div className="glass rounded-[18px] h-14 flex items-center px-4 cursor-pointer press-sm relative overflow-hidden"
        onClick={startEdit}>
        <div className="absolute inset-0 pointer-events-none opacity-50"
          style={{ background: 'radial-gradient(70% 120% at 50% 100%, hsl(140 60% 50% / 0.05), transparent)' }} />
        {editing ? (
          <input autoFocus type="number" value={val} onChange={e => setVal(e.target.value)}
            onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            className="relative w-full bg-transparent text-foreground text-lg font-semibold outline-none text-center font-mono" />
        ) : (
          <span className="relative font-mono text-lg font-semibold text-foreground w-full text-center tabular-nums">
            {value === 0 ? '0' : value.toLocaleString('ru-RU')}
          </span>
        )}
      </div>
    </div>
  );
}
