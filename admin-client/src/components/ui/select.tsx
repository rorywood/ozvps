import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
}

export function Select({ value, onChange, options, className = "" }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm bg-white/5 border border-white/10 rounded-md text-white hover:bg-white/8 focus:outline-none focus:ring-1 focus:ring-[hsl(210_100%_50%)/50] transition-colors"
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-white/40 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[140px] bg-[hsl(215_21%_11%)] border border-white/10 rounded-lg shadow-xl overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left text-white/80 hover:bg-white/8 hover:text-white transition-colors"
            >
              <span>{opt.label}</span>
              {opt.value === value && <Check className="h-3.5 w-3.5 text-[hsl(210_100%_60%)] flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
