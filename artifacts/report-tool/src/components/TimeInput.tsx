import React, { useState } from 'react';

interface TimeInputProps {
  label: string;
  value: string;       // HH:MM:SS or HH:MM
  onChange: (v: string) => void;
  format?: 'hms' | 'hm';  // default: hms
  fullWidth?: boolean;
}

export default function TimeInput({ label, value, onChange, format = 'hms', fullWidth }: TimeInputProps) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');

  const startEdit = () => {
    setInputVal(value);
    setEditing(true);
  };

  const commitEdit = () => {
    const v = inputVal.trim();
    if (format === 'hms') {
      if (/^\d{1,2}:\d{2}:\d{2}$/.test(v)) {
        onChange(v.padStart(8, '0').replace(/^(\d):/, '0$1:'));
      }
    } else {
      if (/^\d{1,2}:\d{2}$/.test(v)) {
        onChange(v);
      }
    }
    setEditing(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') setEditing(false);
  };

  const placeholder = format === 'hms' ? 'ЧЧ:ММ:СС' : 'ЧЧ:ММ';

  return (
    <div className={`flex flex-col gap-2 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="flex items-center gap-1.5 px-1">
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 shadow-[0_0_8px_2px_hsl(var(--primary)/0.35)]" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="glass rounded-[18px] flex items-center h-14 px-4 relative overflow-hidden cursor-pointer press-sm"
        onClick={() => !editing && startEdit()}
      >
        <div className="absolute inset-0 pointer-events-none opacity-50"
          style={{ background: 'radial-gradient(70% 120% at 50% 100%, hsl(210 80% 60% / 0.06), transparent)' }} />
        {editing ? (
          <input
            autoFocus
            type="text"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKey}
            placeholder={placeholder}
            onClick={e => e.stopPropagation()}
            className="relative w-full bg-transparent text-foreground text-lg font-semibold tracking-wide outline-none text-center font-mono"
          />
        ) : (
          <span className="relative font-mono text-lg font-semibold text-foreground tracking-wide w-full text-center tabular-nums">
            {value}
          </span>
        )}
      </div>
    </div>
  );
}
