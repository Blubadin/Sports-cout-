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
        <div className="p-6 overflow-y-auto custom-scrollbar bg-white dark:bg-gray-800">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            
            {/* Action Group 1 */}
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">
                {isThai ? 'ทีม (Teams)' : 'Teams'}
              </h3>
              <ul className="space-y-2">
                <li className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'ทีมที่ 1 (ซ้าย)' : 'Team 1 (Left)'}
                  </span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold min-w-[28px] text-center">1</kbd>
                </li>
                <li className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'ทีมที่ 2 (ขวา)' : 'Team 2 (Right)'}
                  </span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold min-w-[28px] text-center">2</kbd>
                </li>
              </ul>
            </div>

            {/* Action Group 2 */}
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">
                {isThai ? 'ผลลัพธ์ (Results)' : 'Results'}
              </h3>
              <ul className="space-y-2">
                <li className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'ได้แต้ม (Yes)' : 'Point Won (Yes)'}
                  </span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold min-w-[28px] text-center">Z</kbd>
                </li>
                <li className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'เสียแต้ม (Out)' : 'Point Lost (Out)'}
                  </span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold min-w-[28px] text-center">X</kbd>
                </li>
                <li className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'เล่นต่อ (Pass)' : 'Play Continuous (Pass)'}
                  </span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold min-w-[28px] text-center">C</kbd>
                </li>
              </ul>
            </div>

            {/* Action Group 3 */}
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">
                {isThai ? 'ทักษะ (Skills)' : 'Skills'}
              </h3>
              <ul className="space-y-2">
                <li className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'เรียงตามลำดับทักษะ (1-10)' : 'Order of skills (1-10)'}
                  </span>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Q</kbd>
                    <span className="text-sm text-gray-400">{isThai ? 'ถึง' : 'to'}</span>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">P</kbd>
                  </div>
                </li>
                <li className="col-span-2 mt-1">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    {isThai 
                      ? 'ตัวอย่าง (วอลเลย์บอล): Q = เสิร์ฟ, W = รับเสิร์ฟ, E = เซต, R = ตบ, T = บล็อก, Y = รับตบ, U = รับล่าง' 
                      : 'Example (Volleyball): Q = Serve, W = Receive, E = Set, R = Spike, T = Block, Y = Dig, U = Underhand'}
                  </p>
                </li>
              </ul>
            </div>

            {/* Action Group 4 */}
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">
                {isThai ? 'พื้นที่ (Areas)' : 'Areas'}
              </h3>
              <ul className="space-y-2">
                <li className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'เรียงตามลำดับพื้นที่โซน' : 'Order of zone areas'}
                  </span>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">A</kbd>
                    <span className="text-sm text-gray-400">{isThai ? 'ถึง' : 'to'}</span>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">L</kbd>
                  </div>
                </li>
                <li className="col-span-2 mt-1">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    {isThai ? '* บางกีฬาที่กำหนดคีย์พิเศษจะระบุไว้ที่ปุ่มโดยตรง' : '* Some sports with special custom keys are shown directly on the buttons'}
                  </p>
                </li>
              </ul>
            </div>

            {/* Action Group 5 */}
            <div className="md:col-span-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">
                {isThai ? 'การควบคุม (Controls) - โหมด Normal และ Pro HUD' : 'Controls - Normal & Pro HUD Mode'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'บันทึกเหตุการณ์ (Save / Commit)' : 'Save / Commit Event'}
                  </span>
                  <kbd className="px-2 py-1 bg-sky-100 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 rounded text-xs font-mono text-sky-700 dark:text-sky-300 font-bold">Enter</kbd>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'ล้างข้อมูลปัจจุบัน (Clear Current)' : 'Clear Current Action'}
                  </span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Esc</kbd>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'ย้อนกลับ 1 ขั้น (Undo Action)' : 'Undo 1 Step (Backspace)'}
                  </span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Backspace</kbd>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'ล้างเหตุการณ์ทั้งแรลลี่ (Clear Rally)' : 'Clear Entire Rally'}
                  </span>
                  <div className="flex gap-1 items-center">
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Ctrl/Cmd</kbd>
                    <span className="text-sm text-gray-400">+</span>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Backspace</kbd>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'เปิดโหมดลากบนหน้าจอ (Screen Marking)' : 'Toggle Screen Marking (Draw)'}
                  </span>
                  <div className="flex gap-1 items-center">
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">{isThai ? 'กดค้าง' : 'Hold'}</kbd>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Alt / Option</kbd>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-2 border-t border-gray-100 dark:border-gray-700 pt-2 col-span-2">
                  <span className="text-sm font-bold text-sky-600 dark:text-sky-400">
                    {isThai ? 'คีย์ลัดเฉพาะโหมด Pro HUD (Pro HUD Hotkeys)' : 'Pro HUD Mode Specific Hotkeys'}
                  </span>
                </div>
                <div className="flex justify-between items-center col-span-2 grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400 pl-2">
                  <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/30 p-1.5 rounded-lg">
                    <span>{isThai ? 'Q : เลือกทักษะ (Skill Wheel)' : 'Q : Select Skill (Skill Wheel)'}</span>
                    <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded font-bold font-mono">Q</kbd>
                  </div>
                  <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/30 p-1.5 rounded-lg">
                    <span>{isThai ? 'W : เลือกพื้นที่สนาม (Area Pad)' : 'W : Select Court Area (Area Pad)'}</span>
                    <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded font-bold font-mono">W</kbd>
                  </div>
                  <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/30 p-1.5 rounded-lg">
                    <span>{isThai ? 'E : เลือกผลลัพธ์ (Result Rail)' : 'E : Select Result (Result Rail)'}</span>
                    <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded font-bold font-mono">E</kbd>
                  </div>
                  <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/30 p-1.5 rounded-lg">
                    <span>{isThai ? '1 / 2 : เลือกทีม (Team)' : '1 / 2 : Select Team'}</span>
                    <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded font-bold font-mono">1 / 2</kbd>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Group 5.5 - Court Navigation */}
            <div className="md:col-span-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">
                {isThai ? 'การควบคุมสนามเชิงพื้นที่ (Court & Arrow Navigation)' : 'Court & Arrow Navigation'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'เลื่อนตำแหน่งพื้นที่ (Arrow Key Navigation)' : 'Move Selection (Arrow Keys)'}
                  </span>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">↑</kbd>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">↓</kbd>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">←</kbd>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">→</kbd>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'ยืนยันเลือกพื้นที่ทางลูกศร (หากไม่ได้เปิด Auto-select)' : 'Confirm Arrow Selection (If Auto-select is off)'}
                  </span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Space / Enter</kbd>
                </div>
                <div className="flex justify-between items-center mt-2 col-span-2">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    {isThai 
                      ? '* ในโหมดละเอียด (Detailed Court Grid) ปุ่มลูกศรจะขยับกริดพิกัด x, y ไปยังช่องข้างเคียง (เช่น จาก A1 ไป A2 หรือ B1) ช่วยให้ไม่ต้องเล็งพิกเซลด้วยเมาส์' 
                      : '* In Detailed Court Grid mode, arrow keys move the coordinate grid x, y to adjacent cells (e.g., from A1 to A2 or B1), eliminating the need to aim pixel-perfect with a mouse'}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Group 6 - Video Controls */}
            <div className="md:col-span-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">
                {isThai ? 'ควบคุมวิดีโอ (Video Controls)' : 'Video Controls'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'เล่น / พัก (Play / Pause)' : 'Play / Pause'}
                  </span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold min-w-[28px] text-center">Space</kbd>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'เดินหน้า / ถอยหลัง 3 วิ (Skip 3s)' : 'Skip 3s Forward / Backward'}
                  </span>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">←</kbd>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">→</kbd>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'เดินหน้า / ถอยหลัง 1 วิ (Skip 1s)' : 'Skip 1s Forward / Backward'}
                  </span>
                  <div className="flex gap-1 items-center">
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">Shift</kbd>
                    <span className="text-sm text-gray-400">+</span>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">← / →</kbd>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'ลดความเร็ววิดีโอ (Speed Down)' : 'Decrease Speed'}
                  </span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">,</kbd>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'เพิ่มความเร็ววิดีโอ (Speed Up)' : 'Increase Speed'}
                  </span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">.</kbd>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isThai ? 'คืนค่าความเร็วปกติ (Normal Speed)' : 'Restore Normal Speed'}
                  </span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 font-bold">0</kbd>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
