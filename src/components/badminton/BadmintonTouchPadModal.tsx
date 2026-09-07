import React from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Target, RotateCcw } from 'lucide-react';
import BadmintonTouchCourt, { type BadmintonTouchCourtProps } from './BadmintonTouchCourt';

export interface BadmintonTouchPadModalProps extends BadmintonTouchCourtProps {
  isOpen: boolean;
  onClose: () => void;
  onClear?: () => void;
}

export default function BadmintonTouchPadModal({
  isOpen,
  onClose,
  onClear,
  uiLanguage = 'th',
  ...touchCourtProps
}: BadmintonTouchPadModalProps) {
  if (!isOpen) return null;
  const isThai = uiLanguage === 'th';

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 select-none"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-xl max-h-[92dvh] bg-slate-950 border border-emerald-500/50 rounded-2xl shadow-2xl p-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-emerald-400" />
            <span className="font-black text-sm text-white">
              {isThai ? 'สัมผัสเลือกจุดตกในสนามแบดมินตัน' : 'Badminton High-Precision Touch Pad'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                title={isThai ? 'ล้างจุดที่เลือก' : 'Clear selection'}
                className="px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold border border-gray-700 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>{isThai ? 'ล้างจุด' : 'Clear'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-1 shadow-md cursor-pointer"
            >
              <Check size={15} />
              <span>{isThai ? 'เสร็จสิ้น' : 'Done'}</span>
            </button>
          </div>
        </div>

        {/* Enlarged Court */}
        <div className="flex-1 overflow-y-auto flex items-center justify-center p-1">
          <BadmintonTouchCourt
            {...touchCourtProps}
            uiLanguage={uiLanguage}
            showControls={true}
            compact={false}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
