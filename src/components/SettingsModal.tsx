import React from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { SportType } from '../types';
import { SPORT_TEMPLATES } from '../sports';
import { X, Save, Trash2, Download, Upload, Settings, RefreshCw } from 'lucide-react';
import CustomSelect, { Option } from './ui/CustomSelect';
import { t, SupportedLanguage } from '../i18n';
import { motion, AnimatePresence } from 'motion/react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { 
    settings, setSettings, 
    matchInfo, changeSportType,
    events, saveEventsWithHistory,
    clearCurrentEvent, setMatchInfo, showToast,
    teams, setTeams
  } = useScoutContext();

  const [confirmConfig, setConfirmConfig] = React.useState<{ message: string, onConfirm: () => void } | null>(null);
  const [activeTab, setActiveTab] = React.useState<'general' | 'hud' | 'data'>('general');


  const handleClearData = () => {
    setConfirmConfig({
      message: 'ยืนยันการลบข้อมูลทั้งหมด? (การกระทำนี้ไม่สามารถย้อนกลับได้)',
      onConfirm: () => {
        setConfirmConfig({
          message: 'คุณแน่ใจจริงๆ หรือไม่? ข้อมูลทั้งหมดจะหายไป',
          onConfirm: () => {
            saveEventsWithHistory(() => []);
            clearCurrentEvent();
            setMatchInfo(prev => ({ ...prev, currentPoint: 1 }));
            showToast('ล้างข้อมูลสำเร็จ');
            setConfirmConfig(null);
          }
        });
      }
    });
  };

  const sportOptions: Option[] = Object.values(SPORT_TEMPLATES).map(t => ({
    value: t.id,
    label: t.name,
    subLabel: t.thaiName
  }));

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          id="settings-modal" 
          className="fixed inset-0 z-[900] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-10 shrink-0">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
            <Settings size={20} /> {t('settings.title', settings.uiLanguage)}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 transition-colors">
            <X size={20} />
          </button>
        </div>

            {/* Horizontal Tabs for settings */}
            <div className="flex border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-1.5 gap-2 shrink-0">
              <button
                onClick={() => setActiveTab('general')}
                className={`flex-1 py-2 rounded-lg text-sm font-black transition-all border cursor-pointer ${
                  activeTab === 'general'
                    ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                    : 'bg-transparent text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <span className="hidden sm:inline">{settings.uiLanguage === 'th' ? 'ทั่วไป & ทีม (General)' : 'General & Teams'}</span><span className="sm:hidden">{settings.uiLanguage === 'th' ? 'ทั่วไป' : 'General'}</span>
              </button>
              <button
                onClick={() => setActiveTab('hud')}
                className={`flex-1 py-2 rounded-lg text-sm font-black transition-all border cursor-pointer ${
                  activeTab === 'hud'
                    ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                    : 'bg-transparent text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <span className="hidden sm:inline">{settings.uiLanguage === 'th' ? 'HUD & สนาม & วิดีโอ (HUD/Court)' : 'HUD & Court & Video'}</span><span className="sm:hidden">HUD/Court</span>
              </button>
              <button
                onClick={() => setActiveTab('data')}
                className={`flex-1 py-2 rounded-lg text-sm font-black transition-all border cursor-pointer ${
                  activeTab === 'data'
                    ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                    : 'bg-transparent text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <span className="hidden sm:inline">{settings.uiLanguage === 'th' ? 'การนำเข้า/ส่งออกข้อมูล (Backup)' : 'Data & Backup'}</span><span className="sm:hidden">{settings.uiLanguage === 'th' ? 'ข้อมูล' : 'Data'}</span>
              </button>
            </div>

            <div className="p-4 md:p-6 overflow-y-auto flex-1 bg-gray-50/50 dark:bg-gray-950">
              {activeTab === 'general' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  {/* --- COLUMN 1 --- */}
                  <div className="flex flex-col gap-6">
                    {/* Active Sport */}
                    <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                        {settings.uiLanguage === 'th' ? 'ตั้งค่าชนิดกีฬา' : 'Sport Configuration'}
                      </h3>
                      <div className="flex flex-col gap-2 relative z-20">
                        <CustomSelect
                          label={settings.uiLanguage === 'th' ? 'ชนิดกีฬาหลัก' : 'Active Sport Type'}
                          value={matchInfo.sportType || 'volleyball'}
                          onChange={(val) => changeSportType(val as SportType)}
                          options={sportOptions}
                          disabled={events.length > 0}
                          title={events.length > 0 ? (settings.uiLanguage === 'th' ? `ล็อกกีฬาไว้แล้วเพราะมีข้อมูลบันทึกอยู่ ${events.length} รายการ ต้องการเปลี่ยนกีฬา ให้สร้างโปรเจคใหม่` : `Sport locked because ${events.length} events are recorded. Create a new project to change sport.`) : undefined}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {settings.uiLanguage === 'th' 
                            ? 'หมายเหตุ: การเปลี่ยนชนิดกีฬาจะอัปเดตทักษะ พื้นที่ และรายละเอียดในแผงอินพุตด้วย' 
                            : 'Note: Changing the sport will update the Skills, Areas, and Descriptors in the Input Panel.'}
                        </p>
                      </div>
                    </section>

                    {/* Workflow Settings */}
                    <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t('settings.workflow', settings.uiLanguage)}</h3>
                      <div className="flex flex-col gap-3">
                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-150 dark:border-gray-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-gray-250">{t('settings.fastMode', settings.uiLanguage)}</div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th' 
                                ? 'ข้ามการกดยืนยัน และบันทึกผลลัพธ์โดยอัตโนมัติทันที' 
                                : 'Automatically adds Pass and saves Out/Yes without waiting.'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.fastMode} onChange={e => setSettings(p => ({...p, fastMode: e.target.checked}))} className="rounded-lg text-sky-600 w-5 h-5 cursor-pointer" />
                        </label>

                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-150 dark:border-gray-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-gray-250">{t('settings.advancedDetail', settings.uiLanguage)}</div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th'
                                ? 'แสดงตัวเลือกทักษะย่อยเพื่อบันทึกข้อมูลแบบละเอียดสูง'
                                : 'Show extra descriptors (e.g. Attack Type, Height) for detailed logging.'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.advancedDetailMode} onChange={e => setSettings(p => ({...p, advancedDetailMode: e.target.checked}))} className="rounded-lg text-sky-600 w-5 h-5 cursor-pointer" />
                        </label>
                        
                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-150 dark:border-gray-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-gray-250">{t('settings.autoNextPoint', settings.uiLanguage)}</div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th'
                                ? 'เพิ่มคะแนนให้อัตโนมัติเมื่อผลลัพธ์เป็นลูกได้แต้มหรือเสียแต้ม'
                                : 'Automatically increment score when result is +1 or -1.'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.autoNextPoint} onChange={e => setSettings(p => ({...p, autoNextPoint: e.target.checked}))} className="rounded-lg text-sky-600 w-5 h-5 cursor-pointer" />
                        </label>

                        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-150 dark:border-gray-800">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-gray-250">
                              {settings.uiLanguage === 'th' ? 'รูปแบบปุ่มบันทึก (Normal Mode Input Layout)' : 'Normal Mode Input Layout'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th'
                                ? 'เลือกรูปแบบการจัดวางปุ่มบันทึกทักษะสกิลในโหมดปกติ (แบบวงล้อ หรือ แบบตาราง)'
                                : 'Choose the inline skill layout in Normal Mode (Wheel or Grid).'}
                            </div>
                          </div>
                          <select 
                            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm rounded-lg px-2 py-1 text-gray-800 dark:text-gray-200 cursor-pointer"
                            value={settings.skillInputLayout || 'wheel'}
                            onChange={e => setSettings(p => ({...p, skillInputLayout: e.target.value as 'wheel' | 'grid' | 'compact'}))}
                          >
                            <option value="wheel">{t('settings.layoutWheel', settings.uiLanguage)}</option>
                            <option value="grid">{t('settings.layoutGrid', settings.uiLanguage)}</option>
                            <option value="compact">{t('settings.layoutCompact', settings.uiLanguage)}</option>
                          </select>
                        </div>
                      </div>
                    </section>
                  </div>

                  {/* --- COLUMN 2 --- */}
                  <div className="flex flex-col gap-6">
                    {/* Teams Configuration */}
                    <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          {settings.uiLanguage === 'th' ? 'ตั้งค่าข้อมูลทีม' : 'Teams Configuration'}
                        </h3>
                        <button
                          onClick={() => setSettings(p => ({ ...p, flipCourtSide: !p.flipCourtSide }))}
                          className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-700 flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw size={11} className={settings.flipCourtSide ? "text-sky-500" : ""} />
                          {t('settings.flipCourt', settings.uiLanguage)}
                        </button>
                      </div>
                      <div className="flex flex-col gap-3">
                        {teams.map((t, idx) => (
                          <div key={`${t.id || t.code}-${idx}`} className="p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 flex flex-col gap-2">
                            <div className="font-semibold text-xs text-gray-850 dark:text-gray-250">
                              {settings.uiLanguage === 'th' ? `ทีมที่ ${idx + 1}` : `Team ${idx + 1}`}
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder={settings.uiLanguage === 'th' ? 'ตัวย่อทีม (เช่น THA)' : 'Code (e.g. THA)'}
                                value={t.code}
                                onChange={(e) => {
                                  const newTeams = [...teams];
                                  newTeams[idx] = { ...newTeams[idx], code: e.target.value };
                                  setTeams(newTeams);
                                }}
                                className="w-24 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-white uppercase"
                              />
                              <input
                                type="text"
                                placeholder={settings.uiLanguage === 'th' ? 'ชื่อทีม' : 'Name / Thai Name'}
                                value={t.thaiName || t.name}
                                onChange={(e) => {
                                  const newTeams = [...teams];
                                  newTeams[idx] = { ...newTeams[idx], thaiName: e.target.value, name: e.target.value };
                                  setTeams(newTeams);
                                }}
                                className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-white"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {activeTab === 'hud' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  {/* --- COLUMN 1 --- */}
                  <div className="flex flex-col gap-6">
                    {/* Area Precision Settings */}
                    <section className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{settings.uiLanguage === 'th' ? 'พื้นที่และการตอบสนอง (Area & Controls)' : 'Area & Controls'}</h3>
                      <div className="flex flex-col gap-3">
                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-150 dark:border-slate-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-slate-200">{settings.uiLanguage === 'th' ? 'ระดับความละเอียดของพื้นที่ (Area Precision)' : 'Area Precision'}</div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th' ? 'เลือกโหมดปกติ โหมดตารางละเอียด หรือเลือกจิ้มพิกเซลเป้าหมายโดยตรง' : 'Select normal zones, detailed grids, or precise tap coordinates.'}
                            </div>
                          </div>
                          <select 
                            value={settings.areaPrecisionMode || 'normal'} 
                            onChange={e => setSettings(p => ({...p, areaPrecisionMode: e.target.value as any}))} 
                            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-800 dark:text-slate-200 cursor-pointer"
                          >
                            <option value="normal">{settings.uiLanguage === 'th' ? 'ปกติ (Normal Zone)' : 'Normal Zone'}</option>
                            <option value="detailed">{settings.uiLanguage === 'th' ? 'ละเอียด (Detailed Grid)' : 'Detailed Grid'}</option>
                            <option value="point">{settings.uiLanguage === 'th' ? 'จุดพิกเซลแม่นยำ (Point Mode)' : 'Point Mode'}</option>
                          </select>
                        </label>

                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-150 dark:border-slate-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-slate-200">{settings.uiLanguage === 'th' ? 'พื้นที่นอกสนาม (Out-of-bounds)' : 'Show Out-of-bounds'}</div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th' ? 'เปิด/ปิด โหมดบันทึกจุดเสียตำแหน่งนอกขอบสนาม' : 'Toggle logging of actions resulting in out-of-bounds zones.'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.enableOutOfBoundsZones ?? true} onChange={e => setSettings(p => ({...p, enableOutOfBoundsZones: e.target.checked}))} className="rounded text-sky-600 w-5 h-5 cursor-pointer" />
                        </label>

                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-150 dark:border-slate-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-slate-200">{settings.uiLanguage === 'th' ? 'เลื่อนพื้นที่ด้วยลูกศร (Arrow Keys)' : 'Arrow Key Navigation'}</div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th' ? 'เปิด/ปิด การกดปุ่มลูกศรเพื่อเลือกพื้นที่สนามบนคีย์บอร์ด' : 'Navigate interactive court zones using keyboard arrow keys.'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.enableArrowAreaNavigation ?? true} onChange={e => setSettings(p => ({...p, enableArrowAreaNavigation: e.target.checked}))} className="rounded text-sky-600 w-5 h-5 cursor-pointer" />
                        </label>
                        
                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-150 dark:border-slate-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-slate-200">{settings.uiLanguage === 'th' ? 'เลือกพื้นที่ทันทีที่เลื่อนลูกศร' : 'Auto-select on Arrow'}</div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th' ? 'บันทึกพื้นที่ทันทีเมื่อเลื่อนลูกศรชี้พื้นที่เป้าหมาย' : 'Automatically submit the area selection when using arrow keys.'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.areaAutoSelectOnArrow ?? true} onChange={e => setSettings(p => ({...p, areaAutoSelectOnArrow: e.target.checked}))} className="rounded text-sky-600 w-5 h-5 cursor-pointer" />
                        </label>
                      </div>
                    </section>

                    {/* Screen Marking / Gesture Select Settings */}
                    <section className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                        {settings.uiLanguage === 'th' ? 'การลากบันทึกบนหน้าจอ (Screen Marking)' : 'Screen Marking / Gesture Select'}
                      </h3>
                      <div className="flex flex-col gap-3">
                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-150 dark:border-slate-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-slate-200">{t('settings.screenMarking', settings.uiLanguage)}</div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th'
                                ? 'กดคีย์บอร์ดทางลัดค้างไว้ เลื่อนชี้ปุ่มที่ต้องการ แล้วปล่อยปุ่มเพื่อเลือกบันทึกทันที'
                                : 'Hold the activation key, hover any button, and release to select.'}
                            </div>
                          </div>
                          <input 
                            type="checkbox" 
                            checked={settings.enableScreenMarkingMode ?? true} 
                            onChange={e => setSettings(p => ({...p, enableScreenMarkingMode: e.target.checked}))} 
                            className="rounded text-sky-600 w-5 h-5 cursor-pointer" 
                          />
                        </label>

                        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-150 dark:border-slate-800">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-slate-200">
                              {settings.uiLanguage === 'th' ? 'ปุ่มลัดสำหรับเปิดโหมดลาก' : 'Screen Marking Key'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th'
                                ? 'คีย์หลักที่จะต้องกดค้างเพื่อเข้าสู่โหมดใช้งานทางลัด'
                                : 'The key you hold to enter Screen Marking Mode.'}
                            </div>
                          </div>
                          <select 
                            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-sm rounded-md px-2 py-1 text-gray-800 dark:text-slate-200 cursor-pointer"
                            value={settings.screenMarkingKey || 'Alt'}
                            onChange={e => setSettings(p => ({...p, screenMarkingKey: e.target.value}))}
                          >
                            <option value="Alt">Alt</option>
                            <option value="Control">Control</option>
                            <option value="Shift">Shift</option>
                          </select>
                        </div>
                      </div>
                    </section>
                  </div>

                  {/* --- COLUMN 2 --- */}
                  <div className="flex flex-col gap-6">
                    {/* Video Settings */}
                    <section className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t('settings.video', settings.uiLanguage)}</h3>
                      <div className="flex flex-col gap-3">
                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-150 dark:border-slate-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-slate-200">{t('settings.enableGestures', settings.uiLanguage)}</div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th'
                                ? 'ปัดบนวิดีโอเพื่อกรอกเวลา ปรับระดับเสียง และปรับความสว่างหน้าจอ'
                                : 'Swipe on video to scrub time, change volume, and brightness.'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.enableVideoGestures ?? true} onChange={e => setSettings(p => ({...p, enableVideoGestures: e.target.checked}))} className="rounded text-sky-600 w-5 h-5 cursor-pointer" />
                        </label>

                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-150 dark:border-slate-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-slate-200">{t('settings.liveScrub', settings.uiLanguage)}</div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th'
                                ? 'เลื่อนและแสดงภาพวิดีโอทันทีขณะลากกรอ (อาจทำให้เกิดอาการหน่วงได้)'
                                : 'Seek video instantly while dragging (may cause lag).'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.liveScrub ?? false} onChange={e => setSettings(p => ({...p, liveScrub: e.target.checked}))} className="rounded text-sky-600 w-5 h-5 cursor-pointer" />
                        </label>

                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-150 dark:border-slate-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-slate-200">
                              {settings.uiLanguage === 'th' ? 'แสดง Overlay ตอนปัดวิดีโอ' : 'Show Gesture Overlay'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th'
                                ? 'แสดงภาพไอคอนและเวลาเมื่อมีการลากนิ้วบนวิดีโอ'
                                : 'Show icon and scrub time when swiping on video.'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.showGestureOverlay ?? true} onChange={e => setSettings(p => ({...p, showGestureOverlay: e.target.checked}))} className="rounded text-sky-600 w-5 h-5 cursor-pointer" />
                        </label>

                        <div className="p-3 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-150 dark:border-slate-800 flex flex-col gap-2">
                          <div className="font-semibold text-sm text-gray-800 dark:text-slate-200">
                            {settings.uiLanguage === 'th' ? 'ความไวของการปัดเลื่อนวิดีโอ (วินาที/พิกเซล)' : 'Swipe Sensitivity (s/px)'}
                          </div>
                          <CustomSelect 
                            value={String(settings.swipeSensitivity ?? 0.03)} 
                            onChange={val => setSettings(p => ({...p, swipeSensitivity: Number(val)}))}
                            options={[
                              { value: '0.01', label: settings.uiLanguage === 'th' ? '0.01 วินาที / พิกเซล (ละเอียดมาก)' : '0.01s / px (Very Fine)' },
                              { value: '0.03', label: settings.uiLanguage === 'th' ? '0.03 วินาที / พิกเซล (ปกติ)' : '0.03s / px (Default)' },
                              { value: '0.05', label: settings.uiLanguage === 'th' ? '0.05 วินาที / พิกเซล (เร็ว)' : '0.05s / px (Fast)' },
                              { value: '0.1', label: settings.uiLanguage === 'th' ? '0.1 วินาที / พิกเซล (เร็วมาก)' : '0.1s / px (Very Fast)' }
                            ]}
                            placeholder="Select sensitivity"
                          />
                        </div>
                        
                        <div className="p-3 bg-gray-50 dark:bg-gray-850 rounded-lg border border-gray-150 dark:border-gray-700 flex flex-col gap-2">
                          <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">
                            {settings.uiLanguage === 'th' ? 'วินาทีในการดับเบิ้ลแทปกรอเวลา' : 'Double Tap Seek Step'}
                          </div>
                          <CustomSelect 
                            value={String(settings.doubleTapSeekStep ?? 3)} 
                            onChange={val => setSettings(p => ({...p, doubleTapSeekStep: Number(val)}))}
                            options={[
                              { value: '3', label: '3s' },
                              { value: '5', label: '5s' },
                              { value: '10', label: '10s' }
                            ]}
                            placeholder="Select seek step"
                          />
                        </div>
                      </div>
                    </section>

                    {/* Scout HUD Settings */}
                    <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t('settings.scoutHud', settings.uiLanguage)}</h3>
                      <div className="flex flex-col gap-3">
                        <div className="p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-150 dark:border-gray-800 flex flex-col gap-2">
                          <div className="font-semibold text-sm text-gray-800 dark:text-gray-250">
                            {settings.uiLanguage === 'th' ? 'โหมดประสบการณ์ (HUD Experience)' : 'HUD Experience Mode'}
                          </div>
                          <div className="text-xs text-gray-500 mb-1">
                            {settings.uiLanguage === 'th'
                              ? 'สลับโหมดการแสดงผล HUD (Auto: จะเลือกให้เหมาะกับอุปกรณ์อัตโนมัติ)'
                              : 'Switch HUD layout. Auto will pick the best mode for your device.'}
                          </div>
                          <CustomSelect 
                            value={settings.hudExperienceMode ?? 'auto'} 
                            onChange={val => setSettings(p => ({...p, hudExperienceMode: val as 'auto' | 'pro' | 'phone'}))}
                            options={[
                              { value: 'auto', label: 'Auto (Recommended)' },
                              { value: 'pro', label: 'Pro HUD Mode (Desktop/Tablet)' },
                              { value: 'phone', label: 'Phone Scout Mode (Mobile)' }
                            ]}
                            placeholder="Select mode"
                          />
                        </div>

                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-150 dark:border-gray-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-gray-250">{t('settings.hudMode', settings.uiLanguage)}</div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th'
                                ? 'แสดงปุ่มทางลัดสำหรับเข้าสู่โหมด Scout HUD เต็มจอ'
                                : 'Show Fullscreen Game Scouting Mode button.'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.enableScoutHUDMode ?? true} onChange={e => setSettings(p => ({...p, enableScoutHUDMode: e.target.checked}))} className="rounded-lg text-sky-600 w-5 h-5 cursor-pointer" />
                        </label>

                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-150 dark:border-gray-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-gray-250">{t('settings.hudTopStats', settings.uiLanguage)}</div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th'
                                ? 'แสดงคะแนนและแผงรายงานข้อมูลสถิติด้านบนของหน้าจอ HUD'
                                : 'Display match stats at the top of the HUD.'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.hudShowTopStats ?? true} onChange={e => setSettings(p => ({...p, hudShowTopStats: e.target.checked}))} className="rounded-lg text-sky-600 w-5 h-5 cursor-pointer" />
                        </label>

                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-150 dark:border-gray-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-gray-250">{t('settings.hudActionStatus', settings.uiLanguage)}</div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th'
                                ? 'แสดงแถบสถานะเพื่อดูความก้าวหน้าการป้อนคำสั่งปัจจุบัน'
                                : 'Display current action chips.'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.hudShowActionStatus ?? true} onChange={e => setSettings(p => ({...p, hudShowActionStatus: e.target.checked}))} className="rounded-lg text-sky-600 w-5 h-5 cursor-pointer" />
                        </label>

                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-150 dark:border-gray-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-gray-250">{t('settings.hudVideoControls', settings.uiLanguage)}</div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th'
                                ? 'แสดงแถบควบคุมวิดีโอและปุ่มเล่น/หยุดชั่วคราวกรอเวลาด้านล่าง'
                                : 'Display play/pause and seek buttons in HUD.'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.hudShowVideoControls ?? true} onChange={e => setSettings(p => ({...p, hudShowVideoControls: e.target.checked}))} className="rounded-lg text-sky-600 w-5 h-5 cursor-pointer" />
                        </label>
                        
                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-150 dark:border-gray-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-gray-250">{t('settings.hudAutoHide', settings.uiLanguage)}</div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th'
                                ? 'ซ่อนแผงและปุ่มควบคุมทั้งหมดใน HUD โดยอัตโนมัติเมื่อไม่ขยับเมาส์'
                                : 'Hide HUD controls when mouse is inactive.'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.hudAutoHideControls ?? false} onChange={e => setSettings(p => ({...p, hudAutoHideControls: e.target.checked}))} className="rounded-lg text-sky-600 w-5 h-5 cursor-pointer" />
                        </label>

                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-150 dark:border-gray-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-gray-250">{t('settings.hudLargeButtons', settings.uiLanguage)}</div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th'
                                ? 'ขยายขนาดปุ่มควบคุมต่าง ๆ ให้ใหญ่ขึ้นเพื่อความสะดวกในการใช้บนมือถือ/แท็บเล็ต'
                                : 'Enlarge buttons for better touch experience.'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.hudMobileLargeButtons ?? true} onChange={e => setSettings(p => ({...p, hudMobileLargeButtons: e.target.checked}))} className="rounded-lg text-sky-600 w-5 h-5 cursor-pointer" />
                        </label>

                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-150 dark:border-gray-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-gray-250">
                              {settings.uiLanguage === 'th' ? 'ไฟแสดงผลการกดยืนยัน (Visual Feedback)' : 'Visual Game Feedback'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th'
                                ? 'แสดงแสงไฟกะพริบบนปุ่มเมื่อกดยืนยันบันทึกข้อมูลเพื่อความแม่นยำ'
                                : 'Show visual flashes when buttons are clicked.'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.hudEnableGameFeedback ?? true} onChange={e => setSettings(p => ({...p, hudEnableGameFeedback: e.target.checked}))} className="rounded-lg text-sky-600 w-5 h-5 cursor-pointer" />
                        </label>

                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-150 dark:border-gray-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-gray-250">
                              {settings.uiLanguage === 'th' ? 'เสียงตอบรับ (Sound Feedback)' : 'Sound Feedback'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th'
                                ? 'เปิดเสียงติ๊กเมื่อมีการกดปุ่มหรือลากบันทึกผล'
                                : 'Play a tick sound when buttons are clicked or swiped.'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.hudEnableSoundFeedback ?? false} onChange={e => setSettings(p => ({...p, hudEnableSoundFeedback: e.target.checked}))} className="rounded-lg text-green-600 w-5 h-5 cursor-pointer" />
                        </label>

                        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-150 dark:border-gray-800 cursor-pointer">
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-gray-250">
                              {settings.uiLanguage === 'th' ? 'การสั่นตอบรับ (Haptic Feedback)' : 'Haptic Feedback'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {settings.uiLanguage === 'th'
                                ? 'สั่นอุปกรณ์เมื่อมีการกดปุ่ม (รองรับเฉพาะบางเบราว์เซอร์และมือถือ)'
                                : 'Vibrate device when buttons are clicked (on supported devices).'}
                            </div>
                          </div>
                          <input type="checkbox" checked={settings.hudEnableHapticFeedback ?? true} onChange={e => setSettings(p => ({...p, hudEnableHapticFeedback: e.target.checked}))} className="rounded-lg text-amber-600 w-5 h-5 cursor-pointer" />
                        </label>

                        <div className="p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-150 dark:border-gray-850 flex flex-col gap-2">
                          <div className="font-semibold text-sm text-gray-800 dark:text-gray-250">
                            {settings.uiLanguage === 'th' ? 'โหมดตอบสนองปุ่มวงกลม (Pro HUD Interaction)' : 'Pro HUD Interaction Style'}
                          </div>
                          <div className="text-xs text-gray-500 mb-1">
                            {settings.uiLanguage === 'th'
                              ? 'สลับโหมดกดค้างปล่อยกับโหมดคลิกเพื่อเปิดปุ่ม (สำหรับคอมพิวเตอร์/แท็บเล็ต Pro HUD จะเปิดโหมดกดค้างไว้เสมอ ส่วนมือถือจะถูกบังคับใช้โหมดคลิกเพื่อความแม่นยำ)'
                              : 'Switch hold vs click behavior. Desktop/Tablet Pro HUD defaults to Hold, and mobile phone defaults to Tap & Click.'}
                          </div>
                          <CustomSelect 
                            value={settings.hudInteractionStyle ?? 'click'} 
                            onChange={val => setSettings(p => ({...p, hudInteractionStyle: val as 'hold' | 'click'}))}
                            options={[
                              { value: 'click', label: settings.uiLanguage === 'th' ? 'จิ้มเลือก / เปิดค้าง (คลิกทีละปุ่ม)' : 'Click / Tap mode' },
                              { value: 'hold', label: settings.uiLanguage === 'th' ? 'กดค้างแล้วลากปล่อย (Hold & Release)' : 'Hold & Release mode' }
                            ]}
                            placeholder="Select mode"
                          />
                        </div>

                        <div className="p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-150 dark:border-gray-850 flex flex-col gap-2">
                          <div className="font-semibold text-sm text-gray-800 dark:text-gray-250">
                            {settings.uiLanguage === 'th' ? 'ความหนาแน่นปุ่ม Phone Scout (Density)' : 'Phone Scout Density'}
                          </div>
                          <div className="text-xs text-gray-500 mb-1">
                            {settings.uiLanguage === 'th'
                              ? 'ปรับเปลี่ยนความหนาแน่น/ขนาดปุ่มเมื่อใช้งานโหมดมือถือ (แบบกระชับเหมาะสำหรับจอเล็ก / แบบสบายตาเหมาะสำหรับจอใหญ่)'
                              : 'Adjust button spacing/sizes in Phone Scout: Compact vs Comfortable.'}
                          </div>
                          <CustomSelect 
                            value={settings.phoneScoutDensity ?? 'comfortable'} 
                            onChange={val => setSettings(p => ({...p, phoneScoutDensity: val as 'compact' | 'comfortable'}))}
                            options={[
                              { value: 'comfortable', label: settings.uiLanguage === 'th' ? 'สบายตา (Comfortable)' : 'Comfortable (Standard)' },
                              { value: 'compact', label: settings.uiLanguage === 'th' ? 'กะทัดรัด (Compact)' : 'Compact (Dense grid)' }
                            ]}
                            placeholder="Select density"
                          />
                        </div>

                        <div className="p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-150 dark:border-gray-850 flex flex-col gap-2">
                          <div className="font-semibold text-sm text-gray-800 dark:text-gray-250">
                            {settings.uiLanguage === 'th' ? 'ความทึบแสงของแผง HUD (Overlay Opacity)' : 'HUD Overlay Opacity'}
                          </div>
                          <CustomSelect 
                            value={String(settings.hudOverlayOpacity ?? 0.85)} 
                            onChange={val => setSettings(p => ({...p, hudOverlayOpacity: Number(val)}))}
                            options={[
                              { value: '0.5', label: settings.uiLanguage === 'th' ? '50% (โปร่งแสงมาก)' : '50% (More Transparent)' },
                              { value: '0.75', label: '75%' },
                              { value: '0.85', label: settings.uiLanguage === 'th' ? '85% (ปกติ)' : '85% (Default)' },
                              { value: '1', label: settings.uiLanguage === 'th' ? '100% (ทึบแสง)' : '100% (Solid)' }
                            ]}
                            placeholder={settings.uiLanguage === 'th' ? 'เลือกความทึบแสง' : 'Select opacity'}
                          />
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {activeTab === 'data' && (
                <div className="max-w-md mx-auto py-6">
                  {/* Data Management */}
                  <section className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 text-center">
                      {t('settings.dataManagement', settings.uiLanguage)}
                    </h3>
                    <div className="flex flex-col gap-3">
                      <button onClick={handleClearData} className="flex items-center justify-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg font-bold hover:bg-red-100 transition-colors cursor-pointer border border-red-200 dark:border-red-900/50">
                        <Trash2 size={18} /> {t('settings.clearData', settings.uiLanguage)}
                      </button>
                    </div>
                  </section>
                </div>
              )}
            </div>
      </motion.div>

      {confirmConfig && (
        <div className="absolute inset-0 z-[1100] bg-black/60 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-sm shadow-2xl flex flex-col items-center text-center border border-gray-200 dark:border-gray-800">
            <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-gray-100">
              {settings.uiLanguage === 'th' ? 'ยืนยันการทำรายการ' : 'Confirmation'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">{confirmConfig.message}</p>
            <div className="flex w-full gap-3">
              <button 
                onClick={() => setConfirmConfig(null)}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg font-medium transition-colors"
              >
                {settings.uiLanguage === 'th' ? 'ยกเลิก' : 'Cancel'}
              </button>
              <button 
                onClick={confirmConfig.onConfirm}
                className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium transition-colors"
              >
                {settings.uiLanguage === 'th' ? 'ยืนยัน' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SettingsIcon(props: any) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
}
