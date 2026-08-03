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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-card border border-border w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-[11px] font-bold uppercase tracking-widest text-foreground">
            Настройка подписи
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-4">
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

function ModalField({
  label, value, onChange, prefix, placeholder
}: {
  label: string; value: string; onChange: (v: string) => void; prefix: string; placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center border border-border bg-input h-9">
        <span className="px-2 text-muted-foreground text-sm font-mono">{prefix}</span>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-foreground text-sm outline-none pr-2 font-mono"
        />
      </div>
    </div>
  );
}
