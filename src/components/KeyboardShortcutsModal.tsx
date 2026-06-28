import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 shadow-2xl">
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl flex flex-col max-h-[85vh] shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-lg">
              <Keyboard size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">แป้นพิมพ์ลัด (Keyboard Shortcuts)</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">กดปุ่มบนคีย์บอร์ดเพื่อบันทึกข้อมูลอย่างรวดเร็ว</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar bg-white dark:bg-gray-800">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            
            {/* Action Group 1 */}
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">ทีม (Teams)</h3>
              <ul className="space-y-2">
                <li className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">ทีมที่ 1 (ซ้าย)</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold min-w-[28px] text-center">1</kbd>
                </li>
                <li className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">ทีมที่ 2 (ขวา)</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold min-w-[28px] text-center">2</kbd>
                </li>
              </ul>
            </div>

            {/* Action Group 2 */}
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">ผลลัพธ์ (Results)</h3>
              <ul className="space-y-2">
                <li className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">ได้แต้ม (Yes)</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold min-w-[28px] text-center">Z</kbd>
                </li>
                <li className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">เสียแต้ม (Out)</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold min-w-[28px] text-center">X</kbd>
                </li>
                <li className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">เล่นต่อ (Pass)</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold min-w-[28px] text-center">C</kbd>
                </li>
              </ul>
            </div>

            {/* Action Group 3 */}
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">ทักษะ (Skills)</h3>
              <ul className="space-y-2">
                <li className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">เรียงตามลำดับทักษะ (1-10)</span>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Q</kbd>
                    <span className="text-sm text-gray-400">ถึง</span>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">P</kbd>
                  </div>
                </li>
                <li className="col-span-2 mt-1">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    ตัวอย่าง (วอลเลย์บอล): Q = เสิร์ฟ, W = รับเสิร์ฟ, E = เซต, R = ตบ, T = บล็อก, Y = รับตบ, U = รับล่าง
                  </p>
                </li>
              </ul>
            </div>

            {/* Action Group 4 */}
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">พื้นที่ (Areas)</h3>
              <ul className="space-y-2">
                <li className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">เรียงตามลำดับพื้นที่โซน</span>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">A</kbd>
                    <span className="text-sm text-gray-400">ถึง</span>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">L</kbd>
                  </div>
                </li>
                <li className="col-span-2 mt-1">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    * บางกีฬาที่กำหนดคีย์พิเศษจะระบุไว้ที่ปุ่มโดยตรง
                  </p>
                </li>
              </ul>
            </div>

            {/* Action Group 5 */}
            <div className="md:col-span-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">การควบคุม (Controls)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">บันทึกเหตุการณ์ (Save)</span>
                  <kbd className="px-2 py-1 bg-sky-100 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 rounded text-xs font-mono text-sky-700 dark:text-sky-300 font-bold">Enter</kbd>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">ล้างข้อมูลปัจจุบัน (Clear Current)</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Esc</kbd>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">ย้อนกลับ 1 ขั้น (Undo Action)</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Backspace</kbd>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">ล้างเหตุการณ์ทั้งแรลลี่ (Clear Rally)</span>
                  <div className="flex gap-1 items-center">
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Ctrl/Cmd</kbd>
                    <span className="text-sm text-gray-400">+</span>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Backspace</kbd>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
