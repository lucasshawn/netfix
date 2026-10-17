'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Info, X } from 'lucide-react';

interface InfoTooltipProps {
  title: string;
  explanation: string;
  source?: string;
  action?: string;
  align?: 'left' | 'right' | 'center';
}

export function InfoTooltip({
  title,
  explanation,
  source,
  action,
  align = 'left',
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const alignClass =
    align === 'right'
      ? 'right-0'
      : align === 'center'
      ? 'left-1/2 -translate-x-1/2'
      : 'left-0';

  return (
    <span
      ref={containerRef}
      className="relative inline-flex items-center align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`Explain ${title}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((prev) => !prev);
        }}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-800 hover:bg-sky-500/30 text-sky-400 border border-slate-700 hover:border-sky-400/60 transition cursor-help ml-1 shrink-0"
      >
        <Info className="w-2.5 h-2.5" />
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute z-50 top-6 ${alignClass} w-72 sm:w-80 bg-slate-900 border border-sky-500/50 shadow-2xl rounded-xl p-3.5 text-left text-xs normal-case tracking-normal font-normal text-slate-200 space-y-2`}
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-1.5">
            <div className="font-semibold text-sky-300 text-xs flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 text-sky-400" />
              <span>{title}</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              className="text-slate-400 hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-slate-300 leading-relaxed text-[11px]">
            {explanation}
          </p>

          {source && (
            <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-2 text-[11px]">
              <span className="font-semibold text-emerald-400 block mb-0.5">
                📊 Where this number comes from:
              </span>
              <span className="text-slate-300 leading-snug">{source}</span>
            </div>
          )}

          {action && (
            <div className="bg-sky-950/40 border border-sky-500/30 rounded-lg p-2 text-[11px]">
              <span className="font-semibold text-amber-300 block mb-0.5">
                💡 What you can do about it:
              </span>
              <span className="text-slate-200 leading-snug">{action}</span>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
