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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-card border border-border w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-[11px] font-bold uppercase tracking-widest text-foreground">
            Настройки по умолчанию
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-5">
          {/* Timing defaults */}
          <div className="flex flex-col gap-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
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

          {/* Signature defaults */}
          <div className="flex flex-col gap-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
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
        </div>

        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-9 border border-border text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            className="flex-1 h-9 bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity"
          >
            Сохранить
          </button>
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
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center border border-border bg-input h-9">
        {prefix && (
          <span className="px-2 text-muted-foreground text-sm font-mono">{prefix}</span>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-foreground text-sm outline-none px-2 font-mono"
        />
      </div>
    </div>
  );
}
