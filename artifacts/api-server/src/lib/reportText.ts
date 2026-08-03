export interface StoredReportState {
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

export interface StoredSignature {
  tag1: string;
  tag2: string;
  mention: string;
}

export function formatReportDate(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatMoney(value: number): string {
  return `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")}\u00a0р`;
}

export function buildReportText(
  reportType: number,
  state: StoredReportState,
  signature: StoredSignature,
  date: string,
): string {
  const tags = `#${signature.tag1} #${signature.tag2}\n@${signature.mention}`;
  const counters = `1 ПЗМ ${state.pzm}\n2 ПСМ ${state.psm}\n3 ПСТЛ ${state.pstl}\n4 ВСТЛ ${state.vstl}`;

  if (reportType === 0) {
    return `ПЛАН ${date}\n\n${counters}\n5 ДОЖ ${state.dozh}\n\nТРАФИК: ${state.trafikPlan}\n\n${tags}`;
  }
  if (reportType === 1) {
    return `ПРЕДВАРИТЕЛЬНЫЙ ОТЧЁТ ${date}\n\n${counters}\n5 ДОЖАТИЕ ${state.dozh}\n\nТРАФИК: ${state.trafikCurrent}/${state.trafikPlan}\nКЗ:  ${state.kz}\n\n${tags}`;
  }

  const financeText = state.financesEnabled
    ? `\nПОСТУПЛЕНИЯ: ${formatMoney(state.postupleniya)}\nИТОГО: ${formatMoney(state.itogoFact)} / ${formatMoney(state.itogoPlan)}\n% выполнения плана: ${state.vypolnenie}%`
    : "";
  return `Отчёт ${date}\n\n${counters}\n5 ДОЖАТИЕ ${state.dozh}\n\nПриход: ${state.prihod}\nУход: ${state.uhod}\n\nТРАФИК:   ${state.trafikCurrent}/ ${state.trafikPlan} \nКЗ: ${state.kz}${financeText}\n\n${tags}`;
}