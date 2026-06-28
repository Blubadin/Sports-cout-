import React from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { SportType } from '../types';
import { SPORT_TEMPLATES } from '../sports';
import { X, Save, Trash2, Download, Upload, Settings, RefreshCw } from 'lucide-react';
import CustomSelect, { Option } from './ui/CustomSelect';
import { t, SupportedLanguage } from '../i18n';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { 
    settings, setSettings, 
    matchInfo, changeSportType,
    events, setEvents,
    clearCurrentEvent, setMatchInfo, showToast,
    teams, setTeams
  } = useScoutContext();

  const [confirmConfig, setConfirmConfig] = React.useState<{ message: string, onConfirm: () => void } | null>(null);

  if (!isOpen) return null;

  const handleExportData = () => {
    if (events.length === 0) return showToast('ไม่มีข้อมูลให้ Export');
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(events, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `scout_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showToast('ขนาดไฟล์เกิน 5MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          if (content.length > 5 * 1024 * 1024) throw new Error("File too large");

          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            // Basic validation
            const isValid = parsed.every(row => {
              if (typeof row !== 'object' || row === null) return false;
              if (row.id && typeof row.id !== 'string') return false;
              if (row.sportType && !['volleyball', 'football', 'badminton', 'basketball'].includes(row.sportType)) return false;
              if (row.resultText && !['+1', '0', '-1'].includes(row.resultText)) return false;
              if (row.actions && !Array.isArray(row.actions)) return false;
              
              // Validate actions array deeply
              if (row.actions.length > 0) {
                 const actionsValid = row.actions.every((action: any) => {
                   if (typeof action !== 'object' || action === null) return false;
                   if (action.resultCode && !['Yes', 'Out', 'Pass'].includes(action.resultCode)) return false;
                   return true;
                 });
                 if (!actionsValid) return false;
              }
              
              return true;
            });

            if (!isValid) {
              showToast('โครงสร้างข้อมูลในไฟล์ไม่ถูกต้อง หรือ resultCode ผิดพลาด');
              return;
            }

            setConfirmConfig({
              message: `พบข้อมูล ${parsed.length} รายการ ยืนยันการแทนที่ข้อมูลปัจจุบัน?`,
              onConfirm: () => {
                setEvents(parsed);
                showToast('Import สำเร็จ');
                setConfirmConfig(null);
              }
            });
          } else {
            showToast('รูปแบบไฟล์ไม่ถูกต้อง ต้องเป็น Array ของ EventRow');
          }
        } catch (err) {
          showToast('ไม่สามารถอ่านไฟล์ได้ หรือโครงสร้าง JSON ผิดพลาด');
        }
      };
      reader.readAsText(file);
    }
    // reset input
    e.target.value = '';
  };

  const handleClearData = () => {
    setConfirmConfig({
      message: 'ยืนยันการลบข้อมูลทั้งหมด? (การกระทำนี้ไม่สามารถย้อนกลับได้)',
      onConfirm: () => {
        setConfirmConfig({
          message: 'คุณแน่ใจจริงๆ หรือไม่? ข้อมูลทั้งหมดจะหายไป',
          onConfirm: () => {
            setEvents([]);
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
    <div id="settings-modal" className="fixed inset-0 z-[900] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
            <Settings size={20} /> {t('settings.title', settings.uiLanguage)}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-6">
          {/* Active Sport */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              {settings.uiLanguage === 'th' ? 'ตั้งค่าชนิดกีฬา' : 'Sport Configuration'}
            </h3>
            <div className="flex flex-col gap-2 relative z-20">
              <CustomSelect
                label={settings.uiLanguage === 'th' ? 'ชนิดกีฬาหลัก' : 'Active Sport Type'}
                value={matchInfo.sportType || 'volleyball'}
                onChange={(val) => changeSportType(val as SportType)}
                options={sportOptions}
              />
              <p className="text-xs text-gray-500 mt-1">
                {settings.uiLanguage === 'th' 
                  ? 'หมายเหตุ: การเปลี่ยนชนิดกีฬาจะอัปเดตทักษะ พื้นที่ และรายละเอียดในแผงอินพุตด้วย' 
                  : 'Note: Changing the sport will update the Skills, Areas, and Descriptors in the Input Panel.'}
              </p>
            </div>
          </section>

          {/* Teams Configuration */}
          <section>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                {settings.uiLanguage === 'th' ? 'ตั้งค่าข้อมูลทีม' : 'Teams Configuration'}
              </h3>
              <button
                onClick={() => setSettings(p => ({ ...p, flipCourtSide: !p.flipCourtSide }))}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600 flex items-center gap-1"
              >
                <RefreshCw size={12} className={settings.flipCourtSide ? "text-sky-500" : ""} />
                {t('settings.flipCourt', settings.uiLanguage)}
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {teams.map((t, idx) => (
                <div key={t.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col gap-2">
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">
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
                      className="w-24 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-white uppercase"
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
                      className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-white"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Workflow Settings */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('settings.workflow', settings.uiLanguage)}</h3>
            <div className="flex flex-col gap-3">
              <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.fastMode', settings.uiLanguage)}</div>
                  <div className="text-xs text-gray-500">
                    {settings.uiLanguage === 'th' 
                      ? 'ข้ามการกดยืนยัน และบันทึกผลลัพธ์โดยอัตโนมัติทันที' 
                      : 'Automatically adds Pass and saves Out/Yes without waiting.'}
                  </div>
                </div>
                <input type="checkbox" checked={settings.fastMode} onChange={e => setSettings(p => ({...p, fastMode: e.target.checked}))} className="rounded text-sky-600 w-5 h-5" />
              </label>

              <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.advancedDetail', settings.uiLanguage)}</div>
                  <div className="text-xs text-gray-500">
                    {settings.uiLanguage === 'th'
                      ? 'แสดงตัวเลือกทักษะย่อยเพื่อบันทึกข้อมูลแบบละเอียดสูง'
                      : 'Show extra descriptors (e.g. Attack Type, Height) for detailed logging.'}
                  </div>
                </div>
                <input type="checkbox" checked={settings.advancedDetailMode} onChange={e => setSettings(p => ({...p, advancedDetailMode: e.target.checked}))} className="rounded text-purple-600 w-5 h-5" />
              </label>
              
              <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.autoNextPoint', settings.uiLanguage)}</div>
                  <div className="text-xs text-gray-500">
                    {settings.uiLanguage === 'th'
                      ? 'เพิ่มคะแนนให้อัตโนมัติเมื่อผลลัพธ์เป็นลูกได้แต้มหรือเสียแต้ม'
                      : 'Automatically increment score when result is +1 or -1.'}
                  </div>
                </div>
                <input type="checkbox" checked={settings.autoNextPoint} onChange={e => setSettings(p => ({...p, autoNextPoint: e.target.checked}))} className="rounded text-blue-600 w-5 h-5" />
              </label>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div>
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.skillLayout', settings.uiLanguage)}</div>
                  <div className="text-xs text-gray-500">
                    {settings.uiLanguage === 'th'
                      ? 'เลือกรูปแบบการจัดวางปุ่มทักษะสกิล (แบบวงล้อ หรือ ตาราง)'
                      : 'Choose the inline skill layout (Wheel or Grid).'}
                  </div>
                </div>
                <select 
                  className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-sm rounded-md px-2 py-1 text-gray-800 dark:text-gray-200"
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

          {/* Screen Marking / Gesture Select Settings */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              {settings.uiLanguage === 'th' ? 'การลากบันทึกบนหน้าจอ (Screen Marking)' : 'Screen Marking / Gesture Select'}
            </h3>
            <div className="flex flex-col gap-3">
              <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.screenMarking', settings.uiLanguage)}</div>
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
                  className="rounded text-sky-600 w-5 h-5" 
                />
              </label>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div>
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">
                    {settings.uiLanguage === 'th' ? 'ปุ่มลัดสำหรับเปิดโหมดลาก' : 'Screen Marking Key'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {settings.uiLanguage === 'th'
                      ? 'คีย์หลักที่จะต้องกดค้างเพื่อเข้าสู่โหมดใช้งานทางลัด'
                      : 'The key you hold to enter Screen Marking Mode.'}
                  </div>
                </div>
                <select 
                  className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-sm rounded-md px-2 py-1 text-gray-800 dark:text-gray-200"
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

          {/* Video Settings */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('settings.video', settings.uiLanguage)}</h3>
            <div className="flex flex-col gap-3">
              <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.enableGestures', settings.uiLanguage)}</div>
                  <div className="text-xs text-gray-500">
                    {settings.uiLanguage === 'th'
                      ? 'ปัดบนวิดีโอเพื่อกรอกเวลา ปรับระดับเสียง และปรับความสว่างหน้าจอ'
                      : 'Swipe on video to scrub time, change volume, and brightness.'}
                  </div>
                </div>
                <input type="checkbox" checked={settings.enableVideoGestures ?? true} onChange={e => setSettings(p => ({...p, enableVideoGestures: e.target.checked}))} className="rounded text-sky-600 w-5 h-5" />
              </label>

              <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.liveScrub', settings.uiLanguage)}</div>
                  <div className="text-xs text-gray-500">
                    {settings.uiLanguage === 'th'
                      ? 'เลื่อนและแสดงภาพวิดีโอทันทีขณะลากกรอ (อาจทำให้เกิดอาการหน่วงได้)'
                      : 'Seek video instantly while dragging (may cause lag).'}
                  </div>
                </div>
                <input type="checkbox" checked={settings.liveScrub ?? false} onChange={e => setSettings(p => ({...p, liveScrub: e.target.checked}))} className="rounded text-sky-600 w-5 h-5" />
              </label>

              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col gap-2">
                <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">
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
              
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col gap-2">
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
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('settings.scoutHud', settings.uiLanguage)}</h3>
            <div className="flex flex-col gap-3">
              <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.hudMode', settings.uiLanguage)}</div>
                  <div className="text-xs text-gray-500">
                    {settings.uiLanguage === 'th'
                      ? 'แสดงปุ่มทางลัดสำหรับเข้าสู่โหมด Scout HUD เต็มจอ'
                      : 'Show Fullscreen Game Scouting Mode button.'}
                  </div>
                </div>
                <input type="checkbox" checked={settings.enableScoutHUDMode ?? true} onChange={e => setSettings(p => ({...p, enableScoutHUDMode: e.target.checked}))} className="rounded text-sky-600 w-5 h-5" />
              </label>

              <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.hudTopStats', settings.uiLanguage)}</div>
                  <div className="text-xs text-gray-500">
                    {settings.uiLanguage === 'th'
                      ? 'แสดงคะแนนและแผงรายงานข้อมูลสถิติด้านบนของหน้าจอ HUD'
                      : 'Display match stats at the top of the HUD.'}
                  </div>
                </div>
                <input type="checkbox" checked={settings.hudShowTopStats ?? true} onChange={e => setSettings(p => ({...p, hudShowTopStats: e.target.checked}))} className="rounded text-sky-600 w-5 h-5" />
              </label>

              <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.hudActionStatus', settings.uiLanguage)}</div>
                  <div className="text-xs text-gray-500">
                    {settings.uiLanguage === 'th'
                      ? 'แสดงแถบสถานะเพื่อดูความก้าวหน้าการป้อนคำสั่งปัจจุบัน'
                      : 'Display current action chips.'}
                  </div>
                </div>
                <input type="checkbox" checked={settings.hudShowActionStatus ?? true} onChange={e => setSettings(p => ({...p, hudShowActionStatus: e.target.checked}))} className="rounded text-sky-600 w-5 h-5" />
              </label>

              <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.hudVideoControls', settings.uiLanguage)}</div>
                  <div className="text-xs text-gray-500">
                    {settings.uiLanguage === 'th'
                      ? 'แสดงแถบควบคุมวิดีโอและปุ่มเล่น/หยุดชั่วคราวกรอเวลาด้านล่าง'
                      : 'Display play/pause and seek buttons in HUD.'}
                  </div>
                </div>
                <input type="checkbox" checked={settings.hudShowVideoControls ?? true} onChange={e => setSettings(p => ({...p, hudShowVideoControls: e.target.checked}))} className="rounded text-sky-600 w-5 h-5" />
              </label>
              
              <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.hudAutoHide', settings.uiLanguage)}</div>
                  <div className="text-xs text-gray-500">
                    {settings.uiLanguage === 'th'
                      ? 'ซ่อนแผงและปุ่มควบคุมทั้งหมดใน HUD โดยอัตโนมัติเมื่อไม่ขยับเมาส์'
                      : 'Hide HUD controls when mouse is inactive.'}
                  </div>
                </div>
                <input type="checkbox" checked={settings.hudAutoHideControls ?? false} onChange={e => setSettings(p => ({...p, hudAutoHideControls: e.target.checked}))} className="rounded text-sky-600 w-5 h-5" />
              </label>

              <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t('settings.hudLargeButtons', settings.uiLanguage)}</div>
                  <div className="text-xs text-gray-500">
                    {settings.uiLanguage === 'th'
                      ? 'ขยายขนาดปุ่มควบคุมต่าง ๆ ให้ใหญ่ขึ้นเพื่อความสะดวกในการใช้บนมือถือ/แท็บเล็ต'
                      : 'Enlarge buttons for better touch experience.'}
                  </div>
                </div>
                <input type="checkbox" checked={settings.hudMobileLargeButtons ?? true} onChange={e => setSettings(p => ({...p, hudMobileLargeButtons: e.target.checked}))} className="rounded text-sky-600 w-5 h-5" />
              </label>

              <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">
                    {settings.uiLanguage === 'th' ? 'ไฟแสดงผลการกดยืนยัน (Visual Feedback)' : 'Visual Game Feedback'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {settings.uiLanguage === 'th'
                      ? 'แสดงแสงไฟกะพริบบนปุ่มเมื่อกดยืนยันบันทึกข้อมูลเพื่อความแม่นยำ'
                      : 'Show visual flashes when buttons are clicked.'}
                  </div>
                </div>
                <input type="checkbox" checked={settings.hudEnableGameFeedback ?? true} onChange={e => setSettings(p => ({...p, hudEnableGameFeedback: e.target.checked}))} className="rounded text-sky-600 w-5 h-5" />
              </label>

              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col gap-2">
                <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">
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

          {/* Data Management */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('settings.dataManagement', settings.uiLanguage)}</h3>
            <div className="flex flex-col gap-2">
              <button onClick={handleExportData} className="flex items-center justify-center gap-2 p-2.5 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 rounded-lg font-medium hover:bg-sky-100 transition-colors">
                <Download size={18} /> {t('settings.exportData', settings.uiLanguage)}
              </button>
              
              <label className="flex items-center justify-center gap-2 p-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors cursor-pointer border border-gray-300 dark:border-gray-600">
                <Upload size={18} /> {t('settings.importData', settings.uiLanguage)}
                <input type="file" accept=".json" className="hidden" onChange={handleImportData} />
              </label>

              <button onClick={handleClearData} className="flex items-center justify-center gap-2 p-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg font-medium mt-2 hover:bg-red-100 border border-red-200 dark:border-red-900/50">
                <Trash2 size={18} /> {t('settings.clearData', settings.uiLanguage)}
              </button>
            </div>
          </section>
        </div>
      </div>

      {confirmConfig && (
        <div className="absolute inset-0 z-[1100] bg-black/60 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-sm shadow-2xl flex flex-col items-center text-center border border-gray-200 dark:border-gray-700">
            <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-gray-100">
              {settings.uiLanguage === 'th' ? 'ยืนยันการทำรายการ' : 'Confirmation'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">{confirmConfig.message}</p>
            <div className="flex w-full gap-3">
              <button 
                onClick={() => setConfirmConfig(null)}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg font-medium transition-colors"
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

    </div>
  );
}

function SettingsIcon(props: any) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
}
