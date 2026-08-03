import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { SignatureConfig } from '@/hooks/useReportState';

interface Props {
  open: boolean;
  onClose: () => void;
  signature: SignatureConfig;
  onSave: (sig: SignatureConfig) => void;
}

export default function SignatureModal({ open, onClose, signature, onSave }: Props) {
  const [tag1, setTag1] = useState(signature.tag1);
  const [tag2, setTag2] = useState(signature.tag2);
  const [mention, setMention] = useState(signature.mention);

  useEffect(() => {
    if (open) {
      setTag1(signature.tag1);
      setTag2(signature.tag2);
      setMention(signature.mention);
    }
  }, [open, signature]);

  if (!open) return null;

  const handleSave = () => {
    onSave({ tag1: tag1.trim(), tag2: tag2.trim(), mention: mention.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={onClose} />
      <div className="relative z-10 glass rounded-[24px] w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-30 pointer-events-none"
          style={{ background: 'radial-gradient(circle, hsl(var(--primary)/0.4), transparent)' }} />
        <div className="relative flex items-center justify-between px-5 py-4">
          <span className="text-sm font-bold tracking-tight text-foreground">
            Настройка подписи
          </span>
          <button onClick={onClose}
            className="press-sm w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground hover:text-foreground hover:bg-white/[0.1] transition-colors">
            <X size={15} />
          </button>
        </div>
        <div className="relative px-5 pb-5 flex flex-col gap-3">
          <ModalField
            label="Тег 1"
            value={tag1}
            onChange={setTag1}
            prefix="#"
            placeholder="АсланАкперов"
          />
          <ModalField
            label="Тег 2"
            value={tag2}
            onChange={setTag2}
            prefix="#"
            placeholder="АльфаТаурус"
          />
          <ModalField
            label="Упоминание"
            value={mention}
            onChange={setMention}
            prefix="@"
            placeholder="DmitriyGysak"
          />
          <div className="flex gap-2.5 pt-3">
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

function ModalField({
  label, value, onChange, prefix, placeholder
}: {
  label: string; value: string; onChange: (v: string) => void; prefix: string; placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground px-1">
        {label}
      </label>
      <div className="flex items-center rounded-2xl h-12 px-3 bg-white/[0.04] border border-white/[0.06] focus-within:border-primary/40 focus-within:bg-white/[0.06] transition-colors">
        <span className="text-muted-foreground/80 text-base font-mono mr-1">{prefix}</span>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-foreground text-sm outline-none font-mono"
        />
      </div>
    </div>
  );
}
