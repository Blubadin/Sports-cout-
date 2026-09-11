import React from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { SportType } from '../types';
import { SPORT_TEMPLATES } from '../sports';
import { 
  X, Save, Trash2, Download, Upload, Settings, RefreshCw, Gamepad2, ShieldCheck,
  Sliders, Users, Layout, Video, Database, Check, Sun, Moon, Contrast
} from 'lucide-react';
import CustomSelect, { Option } from './ui/CustomSelect';
import { t, SupportedLanguage } from '../i18n';
import { motion, AnimatePresence } from 'motion/react';
import ControllerSettingsPanel from './controller/ControllerSettingsPanel';
import { useWorkspace } from '../context/WorkspaceContext';
import { createPilotDiagnosticReport } from '../utils/pilotDiagnostics';
import { sanitizeFileName } from '../utils/security';
import { SPORTSCOUT_APP_VERSION } from '../appMetadata';
import { FEATURE_FLAGS } from '../featureFlags';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsCategory = 'general' | 'scouting' | 'video' | 'data' | 'advanced';

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { projects, activeProjectId, saveStatus } = useWorkspace();
  const { 
    settings, setSettings, 
    matchInfo, changeSportType,
    events, saveEventsWithHistory,
    clearCurrentEvent, setMatchInfo, showToast,
    teams, setTeams
  } = useScoutContext();

  const isThai = settings.uiLanguage === 'th';
  const [confirmConfig, setConfirmConfig] = React.useState<{ message: string, onConfirm: () => void } | null>(null);
  const [activeTab, setActiveTab] = React.useState<SettingsCategory>('general');

  const handleSaveTeamAsDefault = () => {
    localStorage.setItem('sportscout_default_teams', JSON.stringify(teams));
    showToast(isThai ? 'บันทึกรายชื่อทีมปัจจุบันเป็นค่าเริ่มต้นของระบบแล้ว' : 'Saved current teams as default');
  };

  const handleClearData = () => {
    setConfirmConfig({
      message: isThai ? 'ยืนยันการลบข้อมูลทั้งหมดในโปรเจกต์นี้? (การกระทำนี้ไม่สามารถย้อนกลับได้)' : 'Clear all events in this project? This action cannot be undone.',
      onConfirm: () => {
        setConfirmConfig({
          message: isThai ? 'คุณแน่ใจจริงๆ หรือไม่? ข้อมูลการบันทึกทั้งหมดจะหายไป' : 'Are you completely sure? All scout data will be cleared.',
          onConfirm: () => {
            saveEventsWithHistory(() => []);
            clearCurrentEvent();
            setMatchInfo(prev => ({ ...prev, currentPoint: 1 }));
            showToast(isThai ? 'ล้างข้อมูลสำเร็จ' : 'Data cleared successfully');
            setConfirmConfig(null);
          }
        });
      }
    });
  };

  const handleExportDiagnostics = async () => {
    const storageEstimate = await navigator.storage?.estimate?.().catch(() => undefined);
    const report = createPilotDiagnosticReport({
      projects,
      activeProjectId,
      saveStatus,
      storageEstimate,
    });
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = sanitizeFileName(`sportscout-diagnostic-${new Date().toISOString().slice(0, 10)}.json`);
    anchor.click();
    URL.revokeObjectURL(url);
    showToast(isThai ? 'ส่งออกข้อมูลวินิจฉัยแล้ว' : 'Diagnostic report exported');
  };

  const sportOptions: Option[] = Object.values(SPORT_TEMPLATES).map(t => ({
    value: t.id,
    label: t.name,
    subLabel: t.thaiName
  }));

  const tabs: { id: SettingsCategory; labelTh: string; labelEn: string; icon: any }[] = [
    { id: 'general', labelTh: 'ทั่วไป & ธีม', labelEn: 'General', icon: Sliders },
    { id: 'scouting', labelTh: 'การสเกาต์ & สนาม', labelEn: 'Scouting', icon: Users },
    { id: 'video', labelTh: 'วิดีโอ & ไทม์ไลน์', labelEn: 'Video', icon: Video },
    { id: 'data', labelTh: 'ข้อมูล & สำรอง', labelEn: 'Data', icon: Database },
    { id: 'advanced', labelTh: 'ขั้นสูง & คอนโทรลเลอร์', labelEn: 'Advanced', icon: Gamepad2 },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          id="settings-modal" 
          className="fixed inset-0 z-[900] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800"
          >
            {/* Top Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-10 shrink-0">
              <h2 className="text-lg font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Settings size={20} className="text-sky-500" /> {t('settings.title', settings.uiLanguage)}
              </h2>
              <button
                onClick={onClose}
                aria-label={isThai ? 'ปิดการตั้งค่า' : 'Close settings'}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl text-gray-500 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* 5 Category Tabs Header */}
            <div className="grid grid-cols-2 sm:grid-cols-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-1.5 gap-1 shrink-0">
              {tabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      isActive
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Icon size={14} className={isActive ? 'text-white' : 'text-gray-400'} />
                    <span className="truncate">{isThai ? tab.labelTh : tab.labelEn}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Body Contents */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-gray-50/50 dark:bg-gray-950 custom-scrollbar">
              
              {/* TAB 1: GENERAL & THEME */}
              {activeTab === 'general' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    {/* Theme & Language */}
                    <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
                      <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider">
                        {isThai ? 'ภาษาและรูปแบบภาพ (Theme & Language)' : 'Theme & Language'}
                      </h3>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                          {isThai ? 'ภาษาอินเตอร์เฟส' : 'UI Language'}
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setSettings(p => ({ ...p, uiLanguage: 'th' }))}
                            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              settings.uiLanguage === 'th' ? 'bg-sky-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                          >
                            ภาษาไทย
                          </button>
                          <button
                            type="button"
                            onClick={() => setSettings(p => ({ ...p, uiLanguage: 'en' }))}
                            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              settings.uiLanguage === 'en' ? 'bg-sky-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                          >
                            English (US)
                          </button>
                        </div>
                      </div>

                      {/* Display Theme */}
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                          {isThai ? 'ธีมการแสดงผล (Theme)' : 'Display Theme'}
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => setSettings(p => ({ ...p, theme: 'light', darkMode: false }))}
                            className={`py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              (settings.theme || (settings.darkMode ? 'dark' : 'light')) === 'light'
                                ? 'bg-sky-600 text-white shadow-sm ring-2 ring-sky-400/50'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                          >
                            <Sun size={14} className="text-amber-400" />
                            <span>{isThai ? 'สว่าง' : 'Light'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSettings(p => ({ ...p, theme: 'dark', darkMode: true }))}
                            className={`py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              (settings.theme || (settings.darkMode ? 'dark' : 'light')) === 'dark'
                                ? 'bg-sky-600 text-white shadow-sm ring-2 ring-sky-400/50'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                          >
                            <Moon size={14} className="text-sky-300" />
                            <span>{isThai ? 'มืด' : 'Dark'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSettings(p => ({ ...p, theme: 'monochrome', darkMode: true }))}
                            className={`py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              settings.theme === 'monochrome'
                                ? 'bg-sky-600 text-white shadow-sm ring-2 ring-sky-400/50'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                          >
                            <Contrast size={14} className="text-gray-300" />
                            <span>{isThai ? 'ขาวดำ' : 'Mono'}</span>
                          </button>
                        </div>
                      </div>
                    </section>

                    {/* Workspace Experience */}
                    {FEATURE_FLAGS.workstation && (
                      <section className="border border-sky-200 bg-sky-50/70 p-4 rounded-xl dark:border-sky-900/70 dark:bg-sky-950/20">
                        <div className="mb-3 flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                              {isThai ? 'รูปแบบพื้นที่ทำงาน' : 'Workspace experience'}
                            </h3>
                            <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                              {isThai
                                ? 'Classic ใช้หน้าตาเดิม ส่วน Workstation Beta จัดวิดีโอ คำสั่ง และข้อมูลสำหรับเดสก์ท็อป'
                                : 'Classic keeps standard layout. Workstation Beta provides dense layout for analysis.'}
                            </p>
                          </div>
                          <span className="shrink-0 border border-sky-300 px-2 py-1 text-xs font-bold text-sky-700 dark:border-sky-800 dark:text-sky-300 rounded">Beta</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setSettings(current => ({ ...current, workspaceExperience: 'classic' }))}
                            className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors ${(settings.workspaceExperience || 'classic') === 'classic'
                              ? 'bg-sky-600 text-white shadow-sm'
                              : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700'}`}
                          >
                            Classic
                          </button>
                          <button
                            type="button"
                            onClick={() => setSettings(current => ({ ...current, workspaceExperience: 'workstation' }))}
                            className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors ${settings.workspaceExperience === 'workstation'
                              ? 'bg-sky-600 text-white shadow-sm'
                              : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700'}`}
                          >
                            Workstation Beta
                          </button>
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: SCOUTING & SPORT */}
              {activeTab === 'scouting' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    {/* Sport selection */}
                    <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
                      <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider">
                        {isThai ? 'ตั้งค่าชนิดกีฬา' : 'Sport Configuration'}
                      </h3>
                      <CustomSelect
                        label={isThai ? 'ชนิดกีฬาหลัก' : 'Active Sport Type'}
                        value={matchInfo.sportType || 'volleyball'}
                        onChange={(val) => changeSportType(val as SportType)}
                        options={sportOptions}
                        disabled={events.length > 0}
                        title={events.length > 0 ? (isThai ? `ล็อกกีฬาไว้แล้วเพราะมีข้อมูลบันทึกอยู่ ${events.length} รายการ` : `Sport locked: ${events.length} events recorded.`) : undefined}
                      />
                      <p className="text-xs text-gray-500">
                        {isThai ? 'หมายเหตุ: การเปลี่ยนชนิดกีฬาจะอัปเดตทักษะและพื้นที่ตามชนิดกีฬานั้นๆ' : 'Note: Changing sport updates court zones and skill sets.'}
                      </p>
                    </section>

                    {/* Teams Configuration */}
                    <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
                      <div className="flex justify-between items-center">
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider">
                          {isThai ? 'ทีมในการแข่งขันปัจจุบัน' : 'Current Project Teams'}
                        </h3>
                        <button
                          onClick={() => setSettings(p => ({ ...p, flipCourtSide: !p.flipCourtSide }))}
                          className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-700 flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw size={11} className={settings.flipCourtSide ? "text-sky-500" : ""} />
                          {t('settings.flipCourt', settings.uiLanguage)}
                        </button>
                      </div>

                      <div className="space-y-3">
                        {teams.map((t, idx) => (
                          <div key={`${t.id || t.code}-${idx}`} className="p-3 bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col gap-2">
                            <div className="font-bold text-xs text-gray-700 dark:text-gray-300">
                              {isThai ? `ทีมที่ ${idx + 1} (${idx === 0 ? 'Team A' : 'Team B'})` : `Team ${idx + 1}`}
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Code"
                                value={t.code}
                                onChange={(e) => {
                                  const newTeams = [...teams];
                                  newTeams[idx] = { ...newTeams[idx], code: e.target.value.toUpperCase() };
                                  setTeams(newTeams);
                                }}
                                className="w-24 px-3 py-1.5 text-xs font-bold bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg uppercase"
                              />
                              <input
                                type="text"
                                placeholder="Team Name"
                                value={t.thaiName || t.name}
                                onChange={(e) => {
                                  const newTeams = [...teams];
                                  newTeams[idx] = { ...newTeams[idx], thaiName: e.target.value, name: e.target.value };
                                  setTeams(newTeams);
                                }}
                                className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg"
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={handleSaveTeamAsDefault}
                        className="w-full mt-2 py-2.5 px-3 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Save size={14} />
                        {isThai ? 'บันทึกคู่นี้เป็นค่าเริ่มต้นของระบบ (Save as Default)' : 'Save as System Default Teams'}
                      </button>
                    </section>
                  </div>

                  <div className="space-y-6">
                    {/* Workflow Automations */}
                    <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
                      <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider">
                        {t('settings.workflow', settings.uiLanguage)}
                      </h3>
                      <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer">
                        <div>
                          <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.fastMode', settings.uiLanguage)}</div>
                          <div className="text-xs text-gray-500">{isThai ? 'ข้ามการกดยืนยัน และบันทึกผลลัพธ์โดยอัตโนมัติทันที' : 'Automatically save without waiting.'}</div>
                        </div>
                        <input type="checkbox" checked={settings.fastMode} onChange={e => setSettings(p => ({...p, fastMode: e.target.checked}))} className="rounded text-sky-600 w-5 h-5 cursor-pointer" />
                      </label>

                      <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer">
                        <div>
                          <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.advancedDetail', settings.uiLanguage)}</div>
                          <div className="text-xs text-gray-500">{isThai ? 'แสดงตัวเลือกทักษะย่อยเพื่อบันทึกข้อมูลแบบละเอียดสูง' : 'Show extra descriptors for detailed logging.'}</div>
                        </div>
                        <input type="checkbox" checked={settings.advancedDetailMode} onChange={e => setSettings(p => ({...p, advancedDetailMode: e.target.checked}))} className="rounded text-sky-600 w-5 h-5 cursor-pointer" />
                      </label>
                      
                      <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer">
                        <div>
                          <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.autoNextPoint', settings.uiLanguage)}</div>
                          <div className="text-xs text-gray-500">{isThai ? 'เพิ่มคะแนนให้อัตโนมัติเมื่อผลลัพธ์เป็นลูกได้แต้มหรือเสียแต้ม' : 'Automatically increment score on point end.'}</div>
                        </div>
                        <input type="checkbox" checked={settings.autoNextPoint} onChange={e => setSettings(p => ({...p, autoNextPoint: e.target.checked}))} className="rounded text-sky-600 w-5 h-5 cursor-pointer" />
                      </label>
                    </section>

                    {/* Court Spatial Mapping & Marking */}
                    <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
                      <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider">
                        {isThai ? 'ความละเอียดและการนำทางพิกัดสนาม' : 'Court Spatial Mapping'}
                      </h3>
                      <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer">
                        <div>
                          <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{isThai ? 'ระดับความละเอียดของพื้นที่ (Area Precision)' : 'Area Precision'}</div>
                          <div className="text-xs text-gray-500">{isThai ? 'เลือกโหมดปกติ โหมดตารางละเอียด หรือเลือกจิ้มพิกเซลเป้าหมาย' : 'Select normal zones, detailed grids, or point mode.'}</div>
                        </div>
                        <select 
                          value={settings.areaPrecisionMode || 'normal'} 
                          onChange={e => setSettings(p => ({...p, areaPrecisionMode: e.target.value as any}))}
                          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-xs font-bold text-gray-800 dark:text-gray-200 cursor-pointer"
                        >
                          <option value="normal">{isThai ? 'ปกติ (Normal Zone)' : 'Normal Zone'}</option>
                          <option value="detailed">{isThai ? 'ละเอียด (Detailed Grid)' : 'Detailed Grid'}</option>
                          <option value="point">{isThai ? 'จุดพิกัด (Point Mode)' : 'Point Mode'}</option>
                        </select>
                      </label>

                      <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer">
                        <div>
                          <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{isThai ? 'พื้นที่นอกสนาม (Out-of-bounds)' : 'Show Out-of-bounds'}</div>
                          <div className="text-xs text-gray-500">{isThai ? 'เปิด/ปิด บันทึกจุดเสียตำแหน่งนอกขอบสนาม' : 'Toggle logging out-of-bounds zones.'}</div>
                        </div>
                        <input type="checkbox" checked={settings.enableOutOfBoundsZones ?? true} onChange={e => setSettings(p => ({...p, enableOutOfBoundsZones: e.target.checked}))} className="rounded text-sky-600 w-5 h-5 cursor-pointer" />
                      </label>

                      <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer">
                        <div>
                          <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{isThai ? 'เลื่อนพื้นที่ด้วยลูกศร (Arrow Keys)' : 'Arrow Key Navigation'}</div>
                          <div className="text-xs text-gray-500">{isThai ? 'เลือกพื้นที่สนามด้วยปุ่มลูกศรบนคีย์บอร์ด' : 'Navigate court zones using arrow keys.'}</div>
                        </div>
                        <input type="checkbox" checked={settings.enableArrowAreaNavigation ?? true} onChange={e => setSettings(p => ({...p, enableArrowAreaNavigation: e.target.checked}))} className="rounded text-sky-600 w-5 h-5 cursor-pointer" />
                      </label>

                      <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer">
                        <div>
                          <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.screenMarking', settings.uiLanguage)}</div>
                          <div className="text-xs text-gray-500">{isThai ? 'กดคีย์บอร์ดทางลัดค้างไว้ เลื่อนชี้ปุ่มที่ต้องการ แล้วปล่อยปุ่ม' : 'Hold key, hover button, release to select.'}</div>
                        </div>
                        <input 
                          type="checkbox" 
                          checked={settings.enableScreenMarkingMode ?? true} 
                          onChange={e => setSettings(p => ({...p, enableScreenMarkingMode: e.target.checked}))} 
                          className="rounded text-sky-600 w-5 h-5 cursor-pointer" 
                        />
                      </label>
                    </section>
                  </div>
                </div>
              )}

              {/* TAB 3: VIDEO & TIMELINE */}
              {activeTab === 'video' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider">{t('settings.video', settings.uiLanguage)}</h3>
                    <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.enableGestures', settings.uiLanguage)}</div>
                        <div className="text-xs text-gray-500">{isThai ? 'ปัดบนวิดีโอเพื่อกรอกเวลา ปรับระดับเสียง และปรับความสว่าง' : 'Swipe on video to scrub time.'}</div>
                      </div>
                      <input type="checkbox" checked={settings.enableVideoGestures ?? true} onChange={e => setSettings(p => ({...p, enableVideoGestures: e.target.checked}))} className="rounded text-sky-600 w-5 h-5 cursor-pointer" />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.liveScrub', settings.uiLanguage)}</div>
                        <div className="text-xs text-gray-500">{isThai ? 'เลื่อนและแสดงภาพวิดีโอทันทีขณะลากกรอ' : 'Seek video instantly while dragging.'}</div>
                      </div>
                      <input type="checkbox" checked={settings.liveScrub ?? false} onChange={e => setSettings(p => ({...p, liveScrub: e.target.checked}))} className="rounded text-sky-600 w-5 h-5 cursor-pointer" />
                    </label>
                  </section>

                  <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider">{isThai ? 'Timeline & Scrubber Markers' : 'Timeline Markers'}</h3>
                    <div className="p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 flex flex-col gap-2">
                      <div className="font-semibold text-xs text-gray-800 dark:text-gray-200">
                        {isThai ? 'วินาทีในการดับเบิ้ลแทปกรอเวลา' : 'Double Tap Seek Step'}
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
                  </section>
                </div>
              )}

              {/* TAB 4: DATA & BACKUP */}
              {activeTab === 'data' && (
                <div className="max-w-xl mx-auto py-4 space-y-6">
                  <section className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider text-center">
                      {t('settings.dataManagement', settings.uiLanguage)}
                    </h3>
                    <div className="flex flex-col gap-3">
                      <button onClick={handleExportDiagnostics} className="flex items-center justify-center gap-2 p-3 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 rounded-xl font-bold hover:bg-sky-100 transition-colors cursor-pointer border border-sky-200 dark:border-sky-900/50">
                        <ShieldCheck size={18} /> {isThai ? 'ส่งออกข้อมูลวินิจฉัยเพื่อการสนับสนุน (Diagnostic Export)' : 'Export Diagnostic Report'}
                      </button>
                      <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        {isThai
                          ? 'รายงานนี้มีเฉพาะเวอร์ชัน จำนวนโปรเจกต์/เหตุการณ์ สถานะบันทึก และพื้นที่จัดเก็บ โดยไม่รวมข้อมูลส่วนตัว'
                          : 'Contains only system metadata, project counts, and storage diagnostic metrics.'}
                      </p>
                      <button onClick={handleClearData} className="flex items-center justify-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl font-bold hover:bg-red-100 transition-colors cursor-pointer border border-red-200 dark:border-red-900/50">
                        <Trash2 size={18} /> {t('settings.clearData', settings.uiLanguage)}
                      </button>
                      <div className="pt-2 text-center text-[11px] font-mono text-gray-400">SPORTSCOUT {SPORTSCOUT_APP_VERSION}</div>
                    </div>
                  </section>
                </div>
              )}

              {/* TAB 5: ADVANCED & CONTROLLER */}
              {activeTab === 'advanced' && (
                <div className="space-y-4">
                  {/* Scout HUD Settings */}
                  <section className="bg-white dark:bg-gray-900 p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-2.5">
                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider">{t('settings.scoutHud', settings.uiLanguage)}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer hover:border-sky-500/50 transition-colors">
                        <div>
                          <div className="font-semibold text-xs text-gray-800 dark:text-gray-200">{t('settings.hudMode', settings.uiLanguage)}</div>
                          <div className="text-[11px] text-gray-500">{isThai ? 'แสดงปุ่มทางลัดสำหรับเข้าสู่โหมด Scout HUD เต็มจอ' : 'Show Fullscreen Scouting Mode button.'}</div>
                        </div>
                        <input type="checkbox" checked={settings.enableScoutHUDMode ?? true} onChange={e => setSettings(p => ({...p, enableScoutHUDMode: e.target.checked}))} className="rounded text-sky-600 w-4 h-4 cursor-pointer" />
                      </label>

                      <label className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer hover:border-sky-500/50 transition-colors">
                        <div>
                          <div className="font-semibold text-xs text-gray-800 dark:text-gray-200">{t('settings.hudTopStats', settings.uiLanguage)}</div>
                          <div className="text-[11px] text-gray-500">{isThai ? 'แสดงคะแนนและแผงรายงานข้อมูลสถิติด้านบนของหน้าจอ HUD' : 'Display match stats at top.'}</div>
                        </div>
                        <input type="checkbox" checked={settings.hudShowTopStats ?? true} onChange={e => setSettings(p => ({...p, hudShowTopStats: e.target.checked}))} className="rounded text-sky-600 w-4 h-4 cursor-pointer" />
                      </label>

                      <label className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer hover:border-sky-500/50 transition-colors">
                        <div>
                          <div className="font-semibold text-xs text-gray-800 dark:text-gray-200">{isThai ? 'แสดงเวลาคลิปบน HUD' : 'Show Video Time on HUD'}</div>
                          <div className="text-[11px] text-gray-500">{isThai ? 'แสดงเวลาปัจจุบันของวิดีโอบนแถบด้านบน (หรือคลิกที่ตัวเลขเวลาเพื่อซ่อน)' : 'Show video timestamp at top bar (or click time to hide).'}</div>
                        </div>
                        <input type="checkbox" checked={settings.hudShowVideoTime ?? true} onChange={e => setSettings(p => ({...p, hudShowVideoTime: e.target.checked}))} className="rounded text-sky-600 w-4 h-4 cursor-pointer" />
                      </label>

                      <label className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer hover:border-sky-500/50 transition-colors">
                        <div>
                          <div className="font-semibold text-xs text-gray-800 dark:text-gray-200">{isThai ? 'แสดงแถบควบคุมวิดีโอด้านล่าง' : 'Show Video Controls'}</div>
                          <div className="text-[11px] text-gray-500">{isThai ? 'แสดงแถบเลื่อนเวลาและปุ่ม Play/Pause ด้านล่างของ HUD' : 'Show video playback bar and controls at bottom of HUD.'}</div>
                        </div>
                        <input type="checkbox" checked={settings.hudShowVideoControls ?? true} onChange={e => setSettings(p => ({...p, hudShowVideoControls: e.target.checked}))} className="rounded text-sky-600 w-4 h-4 cursor-pointer" />
                      </label>

                      <div className="p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 space-y-2 md:col-span-2">
                        <label className="flex items-center justify-between cursor-pointer">
                          <div>
                            <div className="font-semibold text-xs text-gray-800 dark:text-gray-200">{isThai ? 'เปิดใช้งาน AI Auto-Tracking ผู้เล่น' : 'Enable AI Player Auto-Tracking'}</div>
                            <div className="text-[11px] text-gray-500">{isThai ? 'แสดงหมุดผู้เล่น 4 คน (P1-P4) และความเร็ว/ระยะทางบนสนามแบดมินตันใน HUD' : 'Display 4 player pins (P1-P4) and speed/distance on Badminton HUD court.'}</div>
                          </div>
                          <input type="checkbox" checked={settings.aiTrackingEnabled ?? false} onChange={e => setSettings(p => ({...p, aiTrackingEnabled: e.target.checked}))} className="rounded text-sky-600 w-4 h-4 cursor-pointer" />
                        </label>

                        {settings.aiTrackingEnabled && (
                          <div className="pt-2 border-t border-gray-200 dark:border-gray-800 flex flex-wrap items-center gap-4 text-xs">
                            <span className="font-bold text-gray-500">{isThai ? 'โหมดประมวลผล:' : 'Engine:'}</span>
                            <label className="flex items-center gap-1.5 cursor-pointer text-gray-700 dark:text-gray-300">
                              <input
                                type="radio"
                                name="aiMode"
                                value="browser"
                                checked={(settings.aiTrackingMode ?? 'browser') === 'browser'}
                                onChange={() => setSettings(p => ({...p, aiTrackingMode: 'browser'}))}
                                className="text-sky-600 cursor-pointer"
                              />
                              <span className="font-medium">{isThai ? '⚡ ในเบราว์เซอร์ทันที (ไม่ต้องเปิด Python)' : '⚡ In-Browser (No Python)'}</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-gray-700 dark:text-gray-300">
                              <input
                                type="radio"
                                name="aiMode"
                                value="server"
                                checked={settings.aiTrackingMode === 'server'}
                                onChange={() => setSettings(p => ({...p, aiTrackingMode: 'server'}))}
                                className="text-sky-600 cursor-pointer"
                              />
                              <span className="font-medium">{isThai ? '🐍 Python Backend (localhost:8000)' : '🐍 Python Backend (localhost:8000)'}</span>
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Gamepad controller - Full Width */}
                  <div className="w-full">
                    <ControllerSettingsPanel
                      language={(settings.uiLanguage ?? 'th') as SupportedLanguage}
                      controllerEnabled={settings.controllerV1Enabled ?? false}
                      onControllerEnabledChange={(enabled) => setSettings((previous) => ({
                        ...previous,
                        controllerV1Enabled: enabled,
                      }))}
                    />
                  </div>
                </div>
              )}

            </div>
          </motion.div>

          {confirmConfig && (
            <div className="absolute inset-0 z-[1100] bg-black/60 flex items-center justify-center backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-sm shadow-2xl flex flex-col items-center text-center border border-gray-200 dark:border-gray-800">
                <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-gray-100">
                  {isThai ? 'ยืนยันการทำรายการ' : 'Confirmation'}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">{confirmConfig.message}</p>
                <div className="flex w-full gap-3">
                  <button 
                    onClick={() => setConfirmConfig(null)}
                    className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg font-medium transition-colors cursor-pointer"
                  >
                    {isThai ? 'ยกเลิก' : 'Cancel'}
                  </button>
                  <button 
                    onClick={confirmConfig.onConfirm}
                    className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium transition-colors cursor-pointer"
                  >
                    {isThai ? 'ยืนยัน' : 'Confirm'}
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
