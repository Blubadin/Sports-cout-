import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Trophy, Flag, User, Layout, Settings2, Video, Languages, 
  Palette, Laptop, Info, ChevronRight, HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useScoutContext } from '../context/ScoutContext';
import { COUNTRIES } from '../countries';
import CustomSelect, { Option } from './ui/CustomSelect';
import { SportType, Team, AppSettings } from '../types';

interface CreateProjectWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (
    title: string, 
    sportType: SportType, 
    customMatchInfo?: any, 
    customTeams?: Team[],
    settingsSnapshot?: Partial<AppSettings>,
    videoMeta?: any
  ) => void;
}

const SPORT_OPTIONS: Option[] = [
  { value: 'volleyball', label: 'Volleyball (วอลเลย์บอล)' },
  { value: 'football', label: 'Football (ฟุตบอล 4x4)' },
  { value: 'badminton', label: 'Badminton (แบดมินตัน)' },
  { value: 'basketball', label: 'Basketball (บาสเกตบอล 3x3)' }
];

type WizardTab = 'general' | 'court' | 'teams' | 'workspace';

export default function CreateProjectWizard({ isOpen, onClose, onCreate }: CreateProjectWizardProps) {
  const { settings } = useScoutContext();
  const isThai = settings.uiLanguage === 'th';

  const [activeTab, setActiveTab] = useState<WizardTab>('general');

  // General tab states
  const [projectTitle, setProjectTitle] = useState('');
  const [sportType, setSportType] = useState<SportType>('volleyball');
  const [matchName, setMatchName] = useState('');
  const [scouterName, setScouterName] = useState('');

  // Court & Format tab states
  const [courtConfig, setCourtConfig] = useState('standard');
  const [gameFormat, setGameFormat] = useState('standard');
  const [areaPrecision, setAreaPrecision] = useState<'normal' | 'detailed' | 'point'>('normal');
  const [outOfBounds, setOutOfBounds] = useState<'on' | 'off'>('off');

  // Teams tab states
  const [team1, setTeam1] = useState<Team>({ id: 't1', code: 'T1', name: 'Team 1', thaiName: '', teamType: 'country', icon: '' });
  const [team2, setTeam2] = useState<Team>({ id: 't2', code: 'T2', name: 'Team 2', thaiName: '', teamType: 'country', icon: '' });

  // Workspace tab states
  const [videoSource, setVideoSource] = useState<'youtube' | 'local' | 'none'>('none');
  const [youtubeUrlInput, setYoutubeUrlInput] = useState('');
  const [localFileTitle, setLocalFileTitle] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark' | 'monochrome'>('light');
  const [selectedLanguage, setSelectedLanguage] = useState<'th' | 'en'>(isThai ? 'th' : 'en');

  const courtOptions = React.useMemo(() => {
    switch (sportType) {
      case 'volleyball': return [
        { value: 'standard', label: isThai ? 'มาตรฐาน 3x3 (9 โซน)' : 'Standard 3x3 (9 Zones)' }, 
        { value: 'basic', label: isThai ? 'พื้นฐาน 2x2 (4 โซน)' : 'Basic 2x2 (4 Zones)' }
      ];
      case 'football': return [
        { value: 'standard', label: isThai ? 'สนามเต็ม (รุก/กลาง/รับ)' : 'Full Field (Att/Mid/Def)' }, 
        { value: 'futsal', label: isThai ? 'ฟุตซอล (ครึ่งสนาม)' : 'Futsal (Half)' }
      ];
      case 'badminton': return [
        { value: 'standard', label: isThai ? 'คอร์ทเดี่ยว' : 'Singles Court' }, 
        { value: 'doubles', label: isThai ? 'คอร์ทคู่' : 'Doubles Court' }
      ];
      case 'basketball': return [
        { value: 'standard', label: isThai ? 'เต็มสนาม' : 'Full Court' }, 
        { value: 'half', label: isThai ? 'ครึ่งสนาม (3x3)' : 'Half Court (3x3)' }
      ];
      default: return [{ value: 'standard', label: 'Standard' }];
    }
  }, [sportType, isThai]);

  const formatOptions = React.useMemo(() => {
    switch (sportType) {
      case 'volleyball': return [
        { value: 'standard', label: isThai ? '3 ใน 5 เซ็ต' : 'Best of 5 Sets' }, 
        { value: 'short', label: isThai ? '2 ใน 3 เซ็ต' : 'Best of 3 Sets' }
      ];
      case 'football': return [
        { value: 'standard', label: isThai ? '2 ครึ่ง (45 นาที)' : '2 Halves (45 mins)' }, 
        { value: 'custom', label: isThai ? 'กำหนดเอง' : 'Custom' }
      ];
      case 'badminton': return [
        { value: 'standard', label: isThai ? '2 ใน 3 เกม (21 แต้ม)' : 'Best of 3 Games (21 pts)' }
      ];
      case 'basketball': return [
        { value: 'standard', label: isThai ? '4 ควอเตอร์' : '4 Quarters' }, 
        { value: '3x3', label: isThai ? 'FIBA 3x3 (10 นาที)' : 'FIBA 3x3 (10 mins)' }
      ];
      default: return [{ value: 'standard', label: 'Standard' }];
    }
  }, [sportType, isThai]);
  
  const countryOptions: Option[] = React.useMemo(() => COUNTRIES.map(c => ({
    value: c.code,
    label: c.code,
    subLabel: `${c.name} ${c.thaiName ? `(${c.thaiName})` : ''}`,
    icon: <span className="text-lg">{c.icon}</span>
  })), []);

  const handleCountryChange = (isTeam1: boolean, newCode: string) => {
    const upperCode = newCode.toUpperCase();
    const country = COUNTRIES.find(c => c.code === upperCode);
    const newTeam = {
      id: isTeam1 ? 't1' : 't2',
      code: upperCode,
      name: country ? country.name : upperCode,
      thaiName: country?.thaiName || '',
      icon: country?.icon || '',
      teamType: 'country' as const
    };
    
    if (isTeam1) setTeam1(newTeam);
    else setTeam2(newTeam);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = projectTitle.trim() || `New Match ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    
    // Construct settings snapshot
    const settingsSnapshot: Partial<AppSettings> = {
      areaPrecisionMode: areaPrecision,
      enableOutOfBoundsZones: outOfBounds === 'on',
      enableScoutHUDMode: false,
      hudDefaultMode: 'classic',
      hudExperienceMode: 'auto',
      uiLanguage: selectedLanguage,
      theme: selectedTheme,
      darkMode: selectedTheme === 'dark' || selectedTheme === 'monochrome'
    };

    // Construct videoMeta
    let videoMeta: any = {
      sourceType: videoSource,
      youtubeUrl: videoSource === 'youtube' ? youtubeUrlInput : '',
      localFileName: videoSource === 'local' ? (localFileTitle || 'local_video.mp4') : undefined
    };

    if (videoSource === 'youtube') {
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
      const match = youtubeUrlInput.match(regExp);
      if (match && match[2].length === 11) {
        videoMeta.youtubeVideoId = match[2];
      }
    }

    // Trigger Creation
    onCreate(
      finalTitle, 
      sportType, 
      { 
        matchName, 
        scouterName, 
        courtConfig, 
        gameFormat,
        sportType
      }, 
      [team1, team2],
      settingsSnapshot,
      videoMeta
    );
    
    // Reset states
    setProjectTitle('');
    setMatchName('');
    setScouterName('');
    setCourtConfig('standard');
    setGameFormat('standard');
    setAreaPrecision('normal');
    setOutOfBounds('off');
    setVideoSource('none');
    setYoutubeUrlInput('');
    setLocalFileTitle('');
    setActiveTab('general');
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 10 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0.05 }}
            className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-4xl border border-gray-150 dark:border-gray-700 overflow-hidden z-10 flex flex-col h-[85vh] max-h-[700px]"
          >
            {/* Header (Adobe Styled) */}
            <div className="flex justify-between items-center px-6 py-4.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40 shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 bg-sky-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/10">
                  <Trophy size={20} className="animate-pulse" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-900 dark:text-gray-50 tracking-tight">
                    {isThai ? 'ตัวช่วยสร้างโครงการบันทึกสถิติ' : 'New Scout Project Wizard'}
                  </h2>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                    {isThai ? 'ออกแบบและปรับแต่งสภาพแวดล้อมเพื่อประสิทธิภาพสูงสุด' : 'Design and calibrate your workflow with Adobe-like precision'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all active:scale-95 shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Container (Split Sidebar Layout) */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Sidebar Navigation */}
              <div className="w-[220px] bg-gray-50 dark:bg-gray-900/60 border-r border-gray-100 dark:border-gray-700/50 p-4 flex flex-col gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('general')}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                    activeTab === 'general'
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-500/10'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <Trophy size={16} />
                  <span>{isThai ? 'ข้อมูลพื้นฐาน' : 'Basic Info'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('court')}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                    activeTab === 'court'
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-500/10'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <Layout size={16} />
                  <span>{isThai ? 'สนามและกติกา' : 'Court & Rules'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('teams')}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                    activeTab === 'teams'
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-500/10'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <Flag size={16} />
                  <span>{isThai ? 'ข้อมูลทีมเหย้า/เยือน' : 'Teams Setup'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('workspace')}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                    activeTab === 'workspace'
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-500/10'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <Laptop size={16} />
                  <span>{isThai ? 'แผงควบคุมและธีม' : 'Scout & Aesthetics'}</span>
                </button>

                <div className="mt-auto p-3 bg-sky-50/50 dark:bg-sky-950/10 border border-sky-100/50 dark:border-sky-900/30 rounded-2xl">
                  <div className="flex gap-1.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">
                    <Info size={12} className="shrink-0 mt-0.5" />
                    <span>{isThai ? 'เคล็ดลับ' : 'Tip'}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-normal mt-1">
                    {isThai ? 'การล้างเบราว์เซอร์อาจทำให้ประวัติสูญหาย แนะนำให้ส่งออกไฟล์เก็บไว้ด้วย' : 'Clearing browser cache can lose project histories. Export backups regularly!'}
                  </p>
                </div>
              </div>

              {/* Right Settings Form Area */}
              <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-white dark:bg-gray-800">
                <AnimatePresence mode="wait">
                  {activeTab === 'general' && (
                    <motion.div
                      key="general"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-6"
                    >
                      <div>
                        <h3 className="text-sm font-black text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-700 pb-2 mb-4">
                          {isThai ? 'ระบุรายละเอียดโครงการ' : 'Identify Project Details'}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                          <div>
                            <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                              {isThai ? 'ชื่อโครงการ (Project Name)' : 'Project Name'}
                            </label>
                            <input
                              type="text"
                              value={projectTitle}
                              onChange={e => setProjectTitle(e.target.value)}
                              placeholder={isThai ? 'เช่น รอบชิง VNL 2024' : 'e.g., VNL 2024 Final'}
                              className="w-full bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-sky-500 outline-none font-bold text-gray-800 dark:text-gray-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                              {isThai ? 'ประเภทกีฬา (Sport Battery)' : 'Sport Battery'}
                            </label>
                            <CustomSelect
                              value={sportType}
                              onChange={(val) => { setSportType(val as SportType); setCourtConfig('standard'); setGameFormat('standard'); }}
                              options={SPORT_OPTIONS}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="pt-2">
                        <h3 className="text-sm font-black text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-700 pb-2 mb-4">
                          {isThai ? 'ข้อมูลเสริมแมตช์การแข่งขัน' : 'Supplementary Match Information'}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                          <div>
                            <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                              {isThai ? 'ชื่อทัวร์นาเมนต์ (Match / Tournament)' : 'Tournament / Match Name'}
                            </label>
                            <input
                              type="text"
                              value={matchName}
                              onChange={e => setMatchName(e.target.value)}
                              placeholder={isThai ? 'ระบุชื่อรายการ (เลือกได้)' : 'Tournament name (Optional)'}
                              className="w-full bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-sky-500 outline-none text-gray-800 dark:text-gray-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                              {isThai ? 'ผู้จดบันทึกสถิติ (Scouter Name)' : 'Scouter Name'}
                            </label>
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"><User size={14} /></span>
                              <input
                                type="text"
                                value={scouterName}
                                onChange={e => setScouterName(e.target.value)}
                                placeholder={isThai ? 'เช่น โค้ชต้นสิงห์ปักษ์ใต้' : 'e.g., Coach Ton'}
                                className="w-full bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-xs focus:ring-2 focus:ring-sky-500 outline-none text-gray-800 dark:text-gray-200"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'court' && (
                    <motion.div
                      key="court"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-6"
                    >
                      <div>
                        <h3 className="text-sm font-black text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-700 pb-2 mb-4">
                          {isThai ? 'รูปแบบสนามและโครงสร้างกติกา' : 'Court Grid & Tournament Rule Settings'}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                          <div>
                            <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                              {isThai ? 'การตั้งค่าสนาม (Court/Field Layout)' : 'Court/Field Layout'}
                            </label>
                            <CustomSelect
                              value={courtConfig}
                              onChange={(val) => setCourtConfig(val)}
                              options={courtOptions}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                              {isThai ? 'รูปแบบการแข่งขัน (Game Format)' : 'Game Format'}
                            </label>
                            <CustomSelect
                              value={gameFormat}
                              onChange={(val) => setGameFormat(val)}
                              options={formatOptions}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="pt-2">
                        <h3 className="text-sm font-black text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-700 pb-2 mb-4">
                          {isThai ? 'ความแม่นยำพิกัดและการระบุพื้นที่' : 'Area Precision & Field Geometry'}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                          <div>
                            <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                              {isThai ? 'ความละเอียดจุดพิกัด (Area Precision)' : 'Area Precision'}
                            </label>
                            <div className="grid grid-cols-3 gap-2 bg-gray-50 dark:bg-gray-900/40 p-1.5 rounded-2xl border border-gray-150 dark:border-gray-700">
                              {(['normal', 'detailed', 'point'] as const).map(p => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => setAreaPrecision(p)}
                                  className={`py-2 px-1 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer ${
                                    areaPrecision === p
                                      ? 'bg-sky-600 text-white shadow-sm'
                                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-150 dark:hover:bg-gray-800'
                                  }`}
                                >
                                  {p === 'normal' && (isThai ? 'ทั่วไป' : 'Normal')}
                                  {p === 'detailed' && (isThai ? 'ละเอียด' : 'Detailed')}
                                  {p === 'point' && (isThai ? 'พิกัดจุด' : 'Point')}
                                </button>
                              ))}
                            </div>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-normal mt-1.5">
                              {areaPrecision === 'normal' && (isThai ? 'เก็บบันทึกโซนมาตรฐาน (เช่น 1-9 ในวอลเลย์บอล)' : 'Logs standard grid cells as defined by sport')}
                              {areaPrecision === 'detailed' && (isThai ? 'เก็บบันทึกตารางแบ่งโซนย่อยอย่างละเอียด' : 'Logs sub-divided coordinates for heatmaps')}
                              {areaPrecision === 'point' && (isThai ? 'เก็บบันทึกพิกัด X, Y จากการแตะจอโดยตรง' : 'Captures exact pixel tapped coordinates on court')}
                            </p>
                          </div>

                          <div>
                            <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                              {isThai ? 'วิเคราะห์โซนออกนอกสนาม (Out-of-Bounds Zones)' : 'Out-of-Bounds'}
                            </label>
                            <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-gray-900/40 p-1.5 rounded-2xl border border-gray-150 dark:border-gray-700">
                              {(['off', 'on'] as const).map(o => (
                                <button
                                  key={o}
                                  type="button"
                                  onClick={() => setOutOfBounds(o)}
                                  className={`py-2 px-1 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer ${
                                    outOfBounds === o
                                      ? 'bg-sky-600 text-white shadow-sm'
                                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-150 dark:hover:bg-gray-800'
                                  }`}
                                >
                                  {o === 'on' ? (isThai ? 'เปิดใช้งาน' : 'On') : (isThai ? 'ปิด' : 'Off')}
                                </button>
                              ))}
                            </div>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-normal mt-1.5">
                              {outOfBounds === 'on' 
                                ? (isThai ? 'แยกแยะโซนเสียแต้มว่าลูกออกซ้าย/ขวา/หลัง คอร์ทฝั่งไหน' : 'Splits out-of-bounds error zones into precise directions')
                                : (isThai ? 'รวบพิกัดออกข้างเป็นโซน Out แบบทั่วไป' : 'Rolls all out-of-bounds events into generic "Out" area')}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'teams' && (
                    <motion.div
                      key="teams"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-6"
                    >
                      <div>
                        <h3 className="text-sm font-black text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-700 pb-2 mb-4 flex justify-between items-center">
                          <span>{isThai ? 'ตั้งค่าระบุคู่ทีมแข่งขัน' : 'Match Competitors Setup'}</span>
                          <span className="text-[10px] font-extrabold text-sky-600 dark:text-sky-400 uppercase tracking-wider bg-sky-50 dark:bg-sky-950/20 px-2 py-0.5 rounded-lg">Home vs Away</span>
                        </h3>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 relative">
                          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full flex items-center justify-center text-[10px] font-black text-gray-400 z-10 hidden sm:flex shadow-sm">
                            VS
                          </div>
                          
                          <div className="bg-gray-50/50 dark:bg-gray-900/30 border border-gray-150 dark:border-gray-700 p-5 rounded-2xl shadow-sm space-y-4">
                            <label className="block text-[10px] font-black text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                              {isThai ? 'ทีมเหย้า / ฝั่งซ้าย (Team 1)' : 'Home / Left (Team 1)'}
                            </label>
                            <CustomSelect
                              label=""
                              value={team1.code}
                              onChange={(val) => handleCountryChange(true, val)}
                              options={countryOptions}
                            />
                            <div className="grid grid-cols-2 gap-3 pt-2">
                              <div>
                                <label className="text-[9px] text-gray-400 font-bold block mb-1 uppercase">{isThai ? 'ชื่อย่อทีม (Code)' : 'Team Code'}</label>
                                <input
                                  type="text"
                                  value={team1.code}
                                  onChange={e => setTeam1(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                                  className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-xs outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-gray-400 font-bold block mb-1 uppercase">{isThai ? 'ชื่อไทย (Thai Name)' : 'Thai Name'}</label>
                                <input
                                  type="text"
                                  value={team1.thaiName}
                                  onChange={e => setTeam1(prev => ({ ...prev, thaiName: e.target.value }))}
                                  className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-xs outline-none"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="bg-gray-50/50 dark:bg-gray-900/30 border border-gray-150 dark:border-gray-700 p-5 rounded-2xl shadow-sm space-y-4">
                            <label className="block text-[10px] font-black text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                              {isThai ? 'ทีมเยือน / ฝั่งขวา (Team 2)' : 'Away / Right (Team 2)'}
                            </label>
                            <CustomSelect
                              label=""
                              value={team2.code}
                              onChange={(val) => handleCountryChange(false, val)}
                              options={countryOptions}
                            />
                            <div className="grid grid-cols-2 gap-3 pt-2">
                              <div>
                                <label className="text-[9px] text-gray-400 font-bold block mb-1 uppercase">{isThai ? 'ชื่อย่อทีม (Code)' : 'Team Code'}</label>
                                <input
                                  type="text"
                                  value={team2.code}
                                  onChange={e => setTeam2(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                                  className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-xs outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-gray-400 font-bold block mb-1 uppercase">{isThai ? 'ชื่อไทย (Thai Name)' : 'Thai Name'}</label>
                                <input
                                  type="text"
                                  value={team2.thaiName}
                                  onChange={e => setTeam2(prev => ({ ...prev, thaiName: e.target.value }))}
                                  className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-xs outline-none"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'workspace' && (
                    <motion.div
                      key="workspace"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-6"
                    >
                      <div>
                        <h3 className="text-sm font-black text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-700 pb-2 mb-4">
                          {isThai ? 'โหมดนำเข้าและวิเคราะห์วิดีโอ' : 'Video Integration & Interactive Controls'}
                        </h3>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                          <div>
                            <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                              {isThai ? 'แหล่งที่มาวิดีโอ (Video Source)' : 'Video Source'}
                            </label>
                            <div className="grid grid-cols-3 gap-2 bg-gray-50 dark:bg-gray-900/40 p-1.5 rounded-2xl border border-gray-150 dark:border-gray-700">
                              {(['none', 'youtube', 'local'] as const).map(v => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => setVideoSource(v)}
                                  className={`py-2 px-1 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer ${
                                    videoSource === v
                                      ? 'bg-sky-600 text-white shadow-sm'
                                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-150 dark:hover:bg-gray-800'
                                  }`}
                                >
                                  {v === 'none' && (isThai ? 'ไม่มีวิดีโอ' : 'None')}
                                  {v === 'youtube' && 'YouTube'}
                                  {v === 'local' && (isThai ? 'ในเครื่อง' : 'Local File')}
                                </button>
                              ))}
                            </div>
                            
                            {videoSource === 'youtube' && (
                              <div className="mt-3.5 space-y-1.5">
                                <label className="text-[10px] text-gray-400 font-bold block uppercase">{isThai ? 'ลิงก์ YouTube URL' : 'YouTube URL'}</label>
                                <input
                                  type="text"
                                  value={youtubeUrlInput}
                                  onChange={e => setYoutubeUrlInput(e.target.value)}
                                  placeholder="https://www.youtube.com/watch?v=..."
                                  className="w-full bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                                />
                              </div>
                            )}

                            {videoSource === 'local' && (
                              <div className="mt-3.5 space-y-1.5">
                                <label className="text-[10px] text-gray-400 font-bold block uppercase">{isThai ? 'ชื่ออ้างอิงไฟล์วิดีโอในเครื่อง' : 'Local File Descriptor'}</label>
                                <input
                                  type="text"
                                  value={localFileTitle}
                                  onChange={e => setLocalFileTitle(e.target.value)}
                                  placeholder="e.g. match-video.mp4"
                                  className="w-full bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                                />
                              </div>
                            )}
                          </div>

                        </div>
                      </div>

                      <div className="pt-2">
                        <h3 className="text-sm font-black text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-700 pb-2 mb-4">
                          {isThai ? 'ภาษาและธีมหน้าต่างการทำความเข้าใจ' : 'Aesthetics, Palette & Locale'}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                          <div>
                            <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                              {isThai ? 'ธีมภาพสีหลัก (Visual Theme Palette)' : 'Visual Theme Palette'}
                            </label>
                            <div className="grid grid-cols-3 gap-2 bg-gray-50 dark:bg-gray-900/40 p-1.5 rounded-2xl border border-gray-150 dark:border-gray-700">
                              {(['light', 'dark', 'monochrome'] as const).map(t => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => setSelectedTheme(t)}
                                  className={`py-2 px-1 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer ${
                                    selectedTheme === t
                                      ? 'bg-sky-600 text-white shadow-sm'
                                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-150 dark:hover:bg-gray-800'
                                  }`}
                                >
                                  {t === 'light' && (isThai ? 'สว่าง' : 'Light')}
                                  {t === 'dark' && (isThai ? 'มืด' : 'Dark')}
                                  {t === 'monochrome' && (isThai ? 'ขาวดำ' : 'Mono')}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                              {isThai ? 'ภาษาอินเตอร์เฟส (UI Language)' : 'UI Language Preference'}
                            </label>
                            <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-gray-900/40 p-1.5 rounded-2xl border border-gray-150 dark:border-gray-700">
                              {(['th', 'en'] as const).map(l => (
                                <button
                                  key={l}
                                  type="button"
                                  onClick={() => setSelectedLanguage(l)}
                                  className={`py-2 px-1 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer ${
                                    selectedLanguage === l
                                      ? 'bg-sky-600 text-white shadow-sm'
                                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-150 dark:hover:bg-gray-800'
                                  }`}
                                >
                                  {l === 'th' ? 'ภาษาไทย' : 'English (US)'}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center px-6 py-4.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40 shrink-0">
              <div className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                {activeTab === 'general' && (isThai ? 'ขั้นตอน 1 จาก 4: ตั้งค่าพื้นฐาน' : 'Step 1 of 4: Setup identity')}
                {activeTab === 'court' && (isThai ? 'ขั้นตอน 2 จาก 4: ตั้งค่าพิกัดสนาม' : 'Step 2 of 4: Calibrate court layouts')}
                {activeTab === 'teams' && (isThai ? 'ขั้นตอน 3 จาก 4: จับคู่ระบุคู่แข่งขัน' : 'Step 3 of 4: Select competitors')}
                {activeTab === 'workspace' && (isThai ? 'ขั้นตอน 4 จาก 4: ปรับแต่งหน้าจอด่วน' : 'Step 4 of 4: Establish environment')}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-150 dark:hover:bg-gray-700 rounded-xl transition-all"
                >
                  {isThai ? 'ยกเลิก' : 'Cancel'}
                </button>
                {activeTab !== 'workspace' ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeTab === 'general') setActiveTab('court');
                      else if (activeTab === 'court') setActiveTab('teams');
                      else if (activeTab === 'teams') setActiveTab('workspace');
                    }}
                    className="px-5 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl transition-all shadow-md shadow-sky-500/10 flex items-center gap-1 cursor-pointer"
                  >
                    <span>{isThai ? 'ถัดไป' : 'Next'}</span>
                    <ChevronRight size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="px-6 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl transition-all shadow-md shadow-sky-500/10 active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trophy size={14} />
                    <span>{isThai ? 'สร้างโครงการ (Create)' : 'Create Project'}</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
