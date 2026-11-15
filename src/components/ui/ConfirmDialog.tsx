import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle, HelpCircle, X } from 'lucide-react';
import type { SupportedLanguage } from '../../i18n';

export type ConfirmDialogTone = 'danger' | 'warning' | 'info';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  language?: SupportedLanguage;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'warning',
  language = 'th',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    confirmButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isThai = language === 'th';
  const resolvedTitle = title || (isThai ? 'ยืนยันการดำเนินการ' : 'Confirm Action');
  const resolvedConfirmLabel = confirmLabel || (isThai ? 'ยืนยัน' : 'Confirm');
  const resolvedCancelLabel = cancelLabel || (isThai ? 'ยกเลิก' : 'Cancel');

  const confirmButtonClass = tone === 'danger'
    ? 'bg-rose-600 hover:bg-rose-500 text-white'
    : 'bg-sky-600 hover:bg-sky-500 text-white';

  const iconAccentClass = tone === 'danger'
    ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    : tone === 'warning'
      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
      : 'bg-sky-500/15 text-sky-400 border-sky-500/30';

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-[#263642] bg-white dark:bg-[#0c1721] text-gray-900 dark:text-[#e6eef4] shadow-2xl p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${iconAccentClass}`}>
              {tone === 'info' ? <HelpCircle size={18} /> : <AlertTriangle size={18} />}
            </div>
            <h3 id={titleId} className="text-sm font-black tracking-tight">
              {resolvedTitle}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={isThai ? 'ปิด' : 'Close'}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#111e29] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <p id={messageId} className="mt-3 text-xs leading-relaxed text-gray-600 dark:text-[#b7c6d0]">
          {message}
        </p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 rounded-lg text-xs font-bold bg-gray-100 hover:bg-gray-200 dark:bg-[#111e29] dark:hover:bg-[#192b3a] text-gray-700 dark:text-[#dbe8ef] border border-gray-200 dark:border-[#263642] transition-colors cursor-pointer"
          >
            {resolvedCancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-sm ${confirmButtonClass}`}
          >
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
