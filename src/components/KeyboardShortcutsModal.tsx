import React from 'react';
import { X, Keyboard } from 'lucide-react';
import { useScoutContext } from '../context/ScoutContext';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const { settings } = useScoutContext();
  if (!isOpen) return null;

  const isThai = settings.uiLanguage === 'th';

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
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {isThai ? 'แป้นพิมพ์ลัด (Keyboard Shortcuts)' : 'Keyboard Shortcuts'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {isThai ? 'กดปุ่มบนคีย์บอร์ดเพื่อบันทึกข้อมูลอย่างรวดเร็ว' : 'Press keys on your keyboard for rapid data entry'}
              </p>
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
        <div className="p-6 overflow-y-auto custom-scrollbar bg-gray-50 dark:bg-gray-900/50">
          
          <div className="space-y-6">
            
            {/* Global Controls */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <div className="w-1.5 h-4 bg-sky-500 rounded-full"></div>
                {isThai ? 'การควบคุมทั่วไป (Global Controls)' : 'Global Controls'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'บันทึกเหตุการณ์ (Save Event)' : 'Save Event'}</span>
                  <kbd className="px-2 py-1 bg-sky-100 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 rounded text-xs font-mono text-sky-700 dark:text-sky-300 font-bold">Enter</kbd>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'ล้างข้อมูลปัจจุบัน (Clear Current)' : 'Clear Current Action'}</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Esc</kbd>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'ย้อนกลับ (Undo 1 Step)' : 'Undo 1 Step'}</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Backspace</kbd>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'ล้างเหตุการณ์ทั้งแรลลี่ (Clear Rally)' : 'Clear Entire Rally'}</span>
                  <div className="flex gap-1 items-center">
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Ctrl</kbd>
                    <span className="text-gray-400">+</span>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Backspace</kbd>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'เปิดโหมดวาดหน้าจอ (Screen Marking)' : 'Toggle Screen Marking'}</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Alt / Option</kbd>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'เลือกทีม 1 หรือ 2 (Team 1/2)' : 'Select Team 1/2'}</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">1 / 2</kbd>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'เปิด/ปิด โหมด HUD เต็มจอ' : 'Toggle Fullscreen HUD Mode'}</span>
                  <div className="flex gap-1 items-center">
                    <kbd className="px-2 py-1 bg-sky-100 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 rounded text-xs font-mono text-sky-700 dark:text-sky-300 font-bold">Ctrl</kbd>
                    <span className="text-gray-400">+</span>
                    <kbd className="px-2 py-1 bg-sky-100 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 rounded text-xs font-mono text-sky-700 dark:text-sky-300 font-bold">H</kbd>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Classic Mode */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-emerald-500 rounded-full"></div>
                  {isThai ? 'โหมดคลาสสิก (Classic Mode)' : 'Classic Mode'}
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">{isThai ? 'ทักษะ (Skills)' : 'Skills'}</div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'ลำดับทักษะ 1-10' : 'Skill slots 1-10'}</span>
                      <div className="flex gap-1 items-center">
                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Q</kbd>
                        <span className="text-xs text-gray-400">...</span>
                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">P</kbd>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">{isThai ? 'พื้นที่ (Areas)' : 'Areas'}</div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'ลำดับพื้นที่ 1-9' : 'Area slots 1-9'}</span>
                      <div className="flex gap-1 items-center">
                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">A</kbd>
                        <span className="text-xs text-gray-400">...</span>
                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">L</kbd>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">{isThai ? 'ผลลัพธ์ (Results)' : 'Results'}</div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'ได้แต้ม (Yes)' : 'Yes / Point Won'}</span>
                      <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Z</kbd>
                    </div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'เสียแต้ม (Out)' : 'Out / Point Lost'}</span>
                      <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">X</kbd>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'เล่นต่อ (Pass)' : 'Pass / Play Con.'}</span>
                      <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">C</kbd>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pro HUD Mode */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2">
                  <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold px-2 py-1 rounded-md">PRO</div>
                </div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-amber-500 rounded-full"></div>
                  {isThai ? 'โหมด Pro HUD (กดค้าง)' : 'Pro HUD Mode (Hold Keys)'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  {isThai ? 'กดคีย์ค้าง เลื่อนเมาส์ไปยังตัวเลือก แล้วปล่อยคีย์เพื่อเลือก' : 'Hold the key, move the pointer to a target, then release the key to select.'}
                </p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'เลือกทักษะ (Skill Wheel)' : 'Skill Wheel'}</span>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Q</kbd>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'เลือกพื้นที่ (Area Menu)' : 'Area Menu'}</span>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">W</kbd>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'เลือกผลลัพธ์ (Result Rail)' : 'Result Rail'}</span>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">E</kbd>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'ฟาวล์ (Foul)' : 'Foul'}</span>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">R / F</kbd>
                  </div>
                  
                  <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3">
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">{isThai ? 'เลื่อนพื้นที่ (Area Nav)' : 'Area Navigation'}</div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'เลื่อนขึ้น / ลง / ซ้าย / ขวา' : 'Move Selection'}</span>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">↑</kbd>
                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">↓</kbd>
                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">←</kbd>
                        <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">→</kbd>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'ยืนยันพื้นที่ (Confirm)' : 'Confirm Selection'}</span>
                      <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Space / Enter</kbd>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Video Controls */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <div className="w-1.5 h-4 bg-purple-500 rounded-full"></div>
                {isThai ? 'ควบคุมวิดีโอ (Video Controls)' : 'Video Controls'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'เล่น / พัก (Play / Pause)' : 'Play / Pause'}</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Space</kbd>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'ข้าม 3 วิ (Skip 3s)' : 'Skip 3s'}</span>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">A / ←</kbd>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">D / →</kbd>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'ข้าม 1 วิ (Skip 1s)' : 'Skip 1s'}</span>
                  <div className="flex gap-1 items-center">
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Shift</kbd>
                    <span className="text-gray-400">+</span>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">← / →</kbd>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'คืนค่าความเร็วปกติ (1.0x)' : 'Normal Speed (1.0x)'}</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">0</kbd>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'ลดความเร็ว (Speed Down)' : 'Decrease Speed'}</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">,</kbd>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{isThai ? 'เพิ่มความเร็ว (Speed Up)' : 'Increase Speed'}</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">.</kbd>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
