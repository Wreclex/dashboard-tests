import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { UserDefaults } from '@/hooks/useReportState';

interface Props {
  open: boolean;
  onClose: () => void;
  defaults: UserDefaults;
  onSave: (defaults: UserDefaults) => void;
}

export default function DefaultsModal({ open, onClose, defaults, onSave }: Props) {
  const [trafikPlan, setTrafikPlan] = useState(defaults.trafikPlan);
  const [prihod, setPrihod] = useState(defaults.prihod);
  const [tag1, setTag1] = useState(defaults.tag1);
  const [tag2, setTag2] = useState(defaults.tag2);
  const [mention, setMention] = useState(defaults.mention);

  useEffect(() => {
    if (open) {
      setTrafikPlan(defaults.trafikPlan);
      setPrihod(defaults.prihod);
      setTag1(defaults.tag1);
      setTag2(defaults.tag2);
      setMention(defaults.mention);
    }
  }, [open, defaults]);

  if (!open) return null;

  const handleSave = () => {
    onSave({
      trafikPlan: trafikPlan.trim(),
      prihod: prihod.trim(),
      tag1: tag1.trim(),
      tag2: tag2.trim(),
      mention: mention.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={onClose} />
      <div className="relative z-10 glass rounded-[24px] w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-25 pointer-events-none"
          style={{ background: 'radial-gradient(circle, hsl(270 70% 65% / 0.4), transparent)' }} />
        <div className="relative flex items-center justify-between px-5 py-4">
          <span className="text-sm font-bold tracking-tight text-foreground">
            Настройки по умолчанию
          </span>
          <button onClick={onClose}
            className="press-sm w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground hover:text-foreground hover:bg-white/[0.1] transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="relative px-5 pb-5 flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/80 px-1">
              Тайминги
            </p>
            <DefaultField
              label="Трафик (план)"
              value={trafikPlan}
              onChange={setTrafikPlan}
              placeholder="03:00:00"
              type="text"
            />
            <DefaultField
              label="Приход"
              value={prihod}
              onChange={setPrihod}
              placeholder="08:10"
              type="text"
            />
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/80 px-1">
              Подпись
            </p>
            <DefaultField
              label="Тег 1"
              value={tag1}
              onChange={setTag1}
              prefix="#"
              placeholder="АсланАкперов"
            />
            <DefaultField
              label="Тег 2"
              value={tag2}
              onChange={setTag2}
              prefix="#"
              placeholder="АльфаТаурус"
            />
            <DefaultField
              label="Упоминание"
              value={mention}
              onChange={setMention}
              prefix="@"
              placeholder="DmitriyGysak"
            />
          </div>

          <div className="flex gap-2.5 pt-1">
            <button
              onClick={onClose}
              className="press-sm flex-1 h-11 rounded-full bg-white/[0.05] text-[12px] font-semibold text-muted-foreground hover:bg-white/[0.08] hover:text-foreground transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              className="press-spring flex-1 h-11 rounded-full text-[12px] font-bold text-primary-foreground transition-shadow hover:shadow-[0_8px_24px_hsl(var(--primary)/0.4)]"
              style={{ background: 'linear-gradient(180deg, hsl(22 100% 56%), hsl(22 100% 44%))' }}
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DefaultField({
  label, value, onChange, prefix, placeholder, type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground px-1">
        {label}
      </label>
      <div className="flex items-center rounded-2xl h-12 px-3 bg-white/[0.04] border border-white/[0.06] focus-within:border-primary/40 focus-within:bg-white/[0.06] transition-colors">
        {prefix && (
          <span className="text-muted-foreground/80 text-base font-mono mr-1">{prefix}</span>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-foreground text-sm outline-none px-1 font-mono"
        />
      </div>
    </div>
  );
}
