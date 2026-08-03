import { useState, useEffect, useCallback } from 'react';

export interface ReportState {
  pzm: number;
  psm: number;
  pstl: number;
  vstl: number;
  dozh: number;
  trafikPlan: string;
  trafikCurrent: string;
  kz: number;
  prihod: string;
  uhod: string;
  postupleniya: number;
  itogoFact: number;
  itogoPlan: number;
  vypolnenie: number;
  financesEnabled: boolean;
}

export interface SignatureConfig {
  tag1: string;
  tag2: string;
  mention: string;
}

export interface TelegramChannel {
  id: string;
  name: string;
  chatId: string;
  botToken: string;
}

export interface TelegramConfig {
  channels: TelegramChannel[];
}

function getCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function defaultState(): ReportState {
  return {
    pzm: 0,
    psm: 0,
    pstl: 0,
    vstl: 0,
    dozh: 0,
    trafikPlan: '03:00:00',
    trafikCurrent: '00:00:00',
    kz: 0,
    prihod: '08:10',
    uhod: getCurrentTime(),
    postupleniya: 0,
    itogoFact: 0,
    itogoPlan: 0,
    vypolnenie: 0,
    financesEnabled: false,
  };
}

const DEFAULT_SIGNATURE: SignatureConfig = {
  tag1: 'АсланАкперов',
  tag2: 'АльфаТаурус',
  mention: 'DmitriyGysak',
};

const STATE_KEY_PREFIX = 'report-tool-state';
const SIGNATURE_KEY_PREFIX = 'report-tool-signature';
const TG_CONFIG_KEY = 'report-tool-tg-config';

function getStateKey(userId: string | null): string {
  return `${STATE_KEY_PREFIX}-${userId ?? 'anonymous'}`;
}

function getSignatureKey(userId: string | null): string {
  return `${SIGNATURE_KEY_PREFIX}-${userId ?? 'anonymous'}`;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {}
  return fallback;
}

function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function useReportState(userId: string | null) {
  const stateKey = getStateKey(userId);
  const sigKey = getSignatureKey(userId);

  const [state, setState] = useState<ReportState>(() =>
    loadFromStorage<ReportState>(stateKey, defaultState())
  );
  const [signature, setSignatureState] = useState<SignatureConfig>(() =>
    loadFromStorage<SignatureConfig>(sigKey, DEFAULT_SIGNATURE)
  );
  const [tgConfig, setTgConfigState] = useState<TelegramConfig>(() =>
    loadFromStorage<TelegramConfig>(TG_CONFIG_KEY, { channels: [] })
  );

  // Reload when user changes (login/logout)
  useEffect(() => {
    setState(loadFromStorage<ReportState>(stateKey, defaultState()));
    setSignatureState(loadFromStorage<SignatureConfig>(sigKey, DEFAULT_SIGNATURE));
  }, [stateKey, sigKey]);

  // Auto-save state
  useEffect(() => {
    saveToStorage(stateKey, state);
  }, [stateKey, state]);

  const updateField = useCallback(<K extends keyof ReportState>(key: K, value: ReportState[K]) => {
    setState(prev => {
      const next = { ...prev, [key]: value };
      // Auto-calc vypolnenie when financial fields change
      if (key === 'itogoFact' || key === 'itogoPlan') {
        const fact = key === 'itogoFact' ? (value as number) : prev.itogoFact;
        const plan = key === 'itogoPlan' ? (value as number) : prev.itogoPlan;
        next.vypolnenie = plan > 0 ? Math.round((fact / plan) * 100) : 0;
      }
      return next;
    });
  }, []);

  const resetState = useCallback(() => {
    setState(prev => ({
      ...defaultState(),
      trafikPlan: prev.trafikPlan,
      prihod: prev.prihod,
      financesEnabled: prev.financesEnabled,
    }));
  }, []);

  const saveSignature = useCallback((sig: SignatureConfig) => {
    setSignatureState(sig);
    saveToStorage(sigKey, sig);
  }, [sigKey]);

  const saveTgConfig = useCallback((cfg: TelegramConfig) => {
    setTgConfigState(cfg);
    saveToStorage(TG_CONFIG_KEY, cfg);
  }, []);

  return {
    state,
    updateField,
    resetState,
    signature,
    saveSignature,
    tgConfig,
    saveTgConfig,
  };
}

export function formatDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

export function formatMoney(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0р';
}

export function buildPreviewText(
  tab: number,
  state: ReportState,
  signature: SignatureConfig,
  date: string
): string {
  const { pzm, psm, pstl, vstl, dozh, trafikPlan, trafikCurrent, kz,
          prihod, uhod, postupleniya, itogoFact, itogoPlan, vypolnenie, financesEnabled } = state;
  const { tag1, tag2, mention } = signature;

  const tags = `#${tag1} #${tag2}\n@${mention}`;
  const counters = `1 ПЗМ ${pzm}\n2 ПСМ ${psm}\n3 ПСТЛ ${pstl}\n4 ВСТЛ ${vstl}`;

  if (tab === 0) {
    return `ПЛАН ${date}\n\n${counters}\n5 ДОЖ ${dozh}\n\nТРАФИК: ${trafikPlan}\n\n${tags}`;
  }
  if (tab === 1) {
    return `ПРЕДВАРИТЕЛЬНЫЙ ОТЧЁТ ${date}\n\n${counters}\n5 ДОЖАТИЕ ${dozh}\n\nТРАФИК: ${trafikCurrent}/${trafikPlan}\nКЗ:  ${kz}\n\n${tags}`;
  }
  // tab === 2: ОТЧЁТ
  const finStr = financesEnabled
    ? `\nПОСТУПЛЕНИЯ: ${formatMoney(postupleniya)}\nИТОГО: ${formatMoney(itogoFact)} / ${formatMoney(itogoPlan)}\n% выполнения плана: ${vypolnenie}%`
    : '';
  return `Отчёт ${date}\n\n${counters}\n5 ДОЖАТИЕ ${dozh}\n\nПриход: ${prihod}\nУход: ${uhod}\n\nТРАФИК:   ${trafikCurrent}/ ${trafikPlan} \nКЗ: ${kz}${finStr}\n\n${tags}`;
}
