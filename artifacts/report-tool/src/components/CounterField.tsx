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
    <div className={`flex flex-col gap-1 ${fullWidth ? 'col-span-2' : ''}`}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="flex items-stretch h-10 border border-border bg-card">
        <button
          type="button"
          onClick={decrement}
          className="w-10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors text-lg font-light select-none flex-shrink-0"
          aria-label={`Уменьшить ${label}`}
        >
          −
        </button>
        <div className="flex-1 flex items-center justify-center border-x border-border">
          {editing ? (
            <input
              ref={inputRef}
              type="number"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKey}
              className="w-full text-center bg-transparent text-foreground text-sm font-mono outline-none"
              min={0}
            />
          ) : (
            <span
              onClick={startEdit}
              className="text-sm font-mono text-foreground cursor-pointer select-none w-full text-center"
            >
              {value}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={increment}
          className="w-10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors text-lg font-light select-none flex-shrink-0"
          aria-label={`Увеличить ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
