import { useState, useCallback } from 'react';
import { useUser, useClerk, Show } from '@clerk/react';
import { useLocation } from 'wouter';
import CounterField from '@/components/CounterField';
import TimeInput from '@/components/TimeInput';
import SignatureModal from '@/components/SignatureModal';
import TelegramModal from '@/components/TelegramModal';
import DefaultsModal from '@/components/DefaultsModal';
import { useReportState, buildPreviewText, formatDate } from '@/hooks/useReportState';
import { useGetSheetCounts, getGetSheetCountsQueryKey } from '@workspace/api-client-react';
import { Settings, Send, RotateCcw, Copy, Check, LogIn, LogOut, SlidersHorizontal, RefreshCw } from 'lucide-react';

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
  const [copied, setCopied] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');

  const { refetch: fetchSheetCounts } = useGetSheetCounts({
    query: { enabled: false, queryKey: getGetSheetCountsQueryKey() },
  });

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-[0.08]"
          style={{ background: 'radial-gradient(circle, #e87c2a, transparent)' }} />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-[0.05]"
          style={{ background: 'radial-gradient(circle, #e87c2a, transparent)' }} />
      </div>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
          Report Tool
        </span>
        <div className="flex items-center gap-3">
          <Show when="signed-in">
            <span className="text-[11px] text-muted-foreground uppercase tracking-widest truncate max-w-[180px]">
              {user?.firstName || user?.emailAddresses?.[0]?.emailAddress}
            </span>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut size={11} />
              Выйти
            </button>
          </Show>
          <Show when="signed-out">
            <button
              onClick={() => setLocation('/sign-in')}
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
            >
              <LogIn size={11} />
              Войти
            </button>
          </Show>
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex items-start justify-center p-4 pt-6">
        <div className="w-full max-w-[960px]">
          {/* Tab bar */}
          <div className="flex border-b border-border">
            {TABS.map((t, i) => (
              <button
                key={t}
                onClick={() => setTab(i)}
                className={`px-6 py-3 text-[11px] font-bold uppercase tracking-widest transition-colors relative ${
                  tab === i
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
                {tab === i && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
                )}
              </button>
            ))}
          </div>

          {/* Two-panel layout */}
          <div className="flex flex-col md:flex-row gap-0 border border-t-0 border-border">
            {/* Left: Input panel */}
            <div className="flex-[3] p-5 border-r border-border min-w-0">
              {/* Main counters */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                    Основные показатели
                  </p>
                  <Show when="signed-in">
                    <button
                      onClick={handleSyncSheet}
                      disabled={syncStatus === 'loading'}
                      className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest transition-colors ${
                        syncStatus === 'ok'
                          ? 'text-green-500'
                          : syncStatus === 'err'
                          ? 'text-destructive'
                          : 'text-muted-foreground/60 hover:text-primary'
                      }`}
                    >
                      <RefreshCw size={9} className={syncStatus === 'loading' ? 'animate-spin' : ''} />
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
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 mb-3">
                  Тайминги и коэффициенты
                </p>
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
                    className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 hover:text-muted-foreground transition-colors mb-3"
                  >
                    <span className={`w-3 h-3 border ${state.financesEnabled ? 'bg-primary border-primary' : 'border-border'} flex items-center justify-center flex-shrink-0`}>
                      {state.financesEnabled && <Check size={8} className="text-primary-foreground" />}
                    </span>
                    Финансы
                  </button>

                  {state.financesEnabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <MoneyField label="Поступления" value={state.postupleniya} onChange={v => updateField('postupleniya', v)} fullWidth />
                      <MoneyField label="Итого факт" value={state.itogoFact} onChange={v => updateField('itogoFact', v)} />
                      <MoneyField label="Итого план" value={state.itogoPlan} onChange={v => updateField('itogoPlan', v)} />
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">% выполнения</span>
                        <div className="h-10 border border-border bg-card flex items-center justify-center">
                          <span className="font-mono text-sm text-foreground">{state.vypolnenie}%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Preview panel */}
            <div className="flex-[2] flex flex-col min-w-0">
              {/* Toolbar */}
              <div className="flex items-center gap-0 border-b border-border px-3 py-2">
                <button
                  onClick={() => setPreviewActive(p => !p)}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors px-2 py-1"
                >
                  <span className={`w-2 h-2 rounded-full ${previewActive ? 'bg-green-500' : 'bg-muted'}`} />
                  Превью
                </button>
                <span className="text-border/40 mx-1">|</span>
                <button
                  onClick={() => setTgOpen(true)}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors px-2 py-1"
                >
                  <Send size={11} />
                  TG
                </button>
                <span className="text-border/40 mx-1">|</span>
                <button
                  onClick={() => setSigOpen(true)}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors px-2 py-1"
                >
                  <Settings size={11} />
                  Подпись
                </button>
                <span className="text-border/40 mx-1">|</span>
                <button
                  onClick={() => setDefaultsOpen(true)}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors px-2 py-1"
                >
                  <SlidersHorizontal size={11} />
                  Умолч.
                </button>
                <span className="text-border/40 mx-1">|</span>
                <button
                  onClick={resetState}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                >
                  <RotateCcw size={11} />
                  Сбросить
                </button>
              </div>

              {/* Preview text */}
              <div className="flex-1 p-4 min-h-[220px]">
                {previewActive ? (
                  <pre className="font-mono text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                    {previewText}
                  </pre>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground/40 text-[10px] uppercase tracking-widest">
                    Превью отключено
                  </div>
                )}
              </div>

              {/* Copy button */}
              <button
                onClick={handleCopy}
                className="flex items-center justify-center gap-2 h-11 bg-card hover:bg-card/80 border-t border-border text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all"
              >
                {copied ? (
                  <>
                    <Check size={12} className="text-green-500" />
                    <span className="text-green-500">Скопировано!</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    Копировать
                  </>
                )}
              </button>
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
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="h-10 border border-border bg-card flex items-center px-3 cursor-pointer" onClick={startEdit}>
        {editing ? (
          <input autoFocus type="number" value={val} onChange={e => setVal(e.target.value)}
            onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            className="w-full bg-transparent text-foreground font-mono text-sm outline-none" />
        ) : (
          <span className="font-mono text-sm text-foreground w-full text-center">{value}</span>
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
    <div className={`flex flex-col gap-1 ${fullWidth ? 'col-span-2' : ''}`}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="h-10 border border-border bg-card flex items-center px-3 cursor-pointer" onClick={startEdit}>
        {editing ? (
          <input autoFocus type="number" value={val} onChange={e => setVal(e.target.value)}
            onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            className="w-full bg-transparent text-foreground font-mono text-sm outline-none" />
        ) : (
          <span className="font-mono text-sm text-foreground w-full text-center">{value === 0 ? '0' : value.toLocaleString('ru-RU')}</span>
        )}
      </div>
    </div>
  );
}
