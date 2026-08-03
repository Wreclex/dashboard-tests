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
      // validate HH:MM:SS
      if (/^\d{1,2}:\d{2}:\d{2}$/.test(v)) {
        onChange(v.padStart(8, '0').replace(/^(\d):/, '0$1:'));
      }
    } else {
      // validate HH:MM
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
    <div className={`flex flex-col gap-1 ${fullWidth ? 'col-span-2' : ''}`}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="h-10 border border-border bg-card flex items-center px-3">
        {editing ? (
          <input
            autoFocus
            type="text"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKey}
            placeholder={placeholder}
            className="w-full bg-transparent text-foreground font-mono text-sm outline-none"
          />
        ) : (
          <span
            onClick={startEdit}
            className="font-mono text-sm text-foreground cursor-pointer w-full text-center"
          >
            {value}
          </span>
        )}
      </div>
    </div>
  );
}
