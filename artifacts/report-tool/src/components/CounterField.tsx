import React, { useState, useRef } from 'react';

interface CounterFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  fullWidth?: boolean;
}

export default function CounterField({ label, value, onChange, fullWidth }: CounterFieldProps) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const decrement = () => onChange(Math.max(0, value - 1));
  const increment = () => onChange(value + 1);

  const startEdit = () => {
    setInputVal(String(value));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitEdit = () => {
    const n = parseInt(inputVal, 10);
    if (!isNaN(n) && n >= 0) onChange(n);
    setEditing(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') setEditing(false);
  };

  return (
    <div className={`flex flex-col gap-2 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="flex items-center gap-1.5 px-1">
        <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_2px_hsl(var(--primary)/0.5)]" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="glass rounded-[18px] flex items-stretch h-16 px-2.5 py-2 relative overflow-hidden">
        {/* subtle accent glow */}
        <div className="absolute inset-0 pointer-events-none opacity-60"
          style={{ background: 'radial-gradient(80% 120% at 50% 100%, hsl(var(--primary)/0.08), transparent)' }} />
        <button
          type="button"
          onClick={decrement}
          className="press-spring relative w-11 h-11 my-auto flex items-center justify-center rounded-full bg-white/[0.06] text-foreground/80 hover:bg-white/[0.1] hover:text-primary text-xl font-medium select-none flex-shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
          aria-label={`Уменьшить ${label}`}
        >
          <span className="leading-none -mt-0.5">−</span>
        </button>
        <div className="flex-1 flex items-center justify-center relative">
          {editing ? (
            <input
              ref={inputRef}
              type="number"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKey}
              className="w-full text-center bg-transparent text-foreground text-3xl font-bold outline-none tabular-nums tracking-tight"
              min={0}
            />
          ) : (
            <span
              onClick={startEdit}
              className="text-3xl font-bold text-foreground cursor-pointer select-none tabular-nums tracking-tight"
            >
              {value}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={increment}
          className="press-spring relative w-11 h-11 my-auto flex items-center justify-center rounded-full bg-primary/15 text-primary hover:bg-primary/25 text-xl font-medium select-none flex-shrink-0 shadow-[0_2px_12px_hsl(var(--primary)/0.25)]"
          aria-label={`Увеличить ${label}`}
        >
          <span className="leading-none -mt-0.5">+</span>
        </button>
      </div>
    </div>
  );
}
