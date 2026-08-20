import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Trophy, Flag, User, Layout, Settings2, Video, Languages, 
  Palette, Laptop, Info, CheckCircle2, ShieldCheck, Sparkles, AlertCircle
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

export default function CreateProjectWizard({ isOpen, onClose, onCreate }: CreateProjectWizardProps) {
  const { settings } = useScoutContext();
  const isThai = settings.uiLanguage === 'th';

  // Section 1: General & Match
  const [projectTitle, setProjectTitle] = useState('');
  const [sportType, setSportType] = useState<SportType>('volleyball');
  const [matchName, setMatchName] = useState('');
  const [scouterName, setScouterName] = useState('');

  // Section 2: Teams
  const [team1, setTeam1] = useState<Team>({ id: 't1', code: 'THA', name: 'Thailand', thaiName: 'ไทย', teamType: 'country', icon: '🇹🇭' });
  const [team2, setTeam2] = useState<Team>({ id: 't2', code: 'JPN', name: 'Japan', thaiName: 'ญี่ปุ่น', teamType: 'country', icon: '🇯🇵' });

  // Section 3: Court & Format
  const [courtConfig, setCourtConfig] = useState('standard');
  const [gameFormat, setGameFormat] = useState('standard');
  const [areaPrecision, setAreaPrecision] = useState<'normal' | 'detailed' | 'point'>('normal');
  const [courtViewMode, setCourtViewMode] = useState<'auto' | 'full' | 'half'>('auto');
  const [outOfBounds, setOutOfBounds] = useState<'on' | 'off'>('off');

  // Section 4: Video & Workspace
  const [videoSource, setVideoSource] = useState<'youtube' | 'local' | 'none'>('none');
  const [youtubeUrlInput, setYoutubeUrlInput] = useState('');
  const [localFileTitle, setLocalFileTitle] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark' | 'monochrome'>('light');
  const [selectedLanguage, setSelectedLanguage] = useState<'th' | 'en'>(isThai ? 'th' : 'en');

  const courtOptions = React.useMemo(() => {
    switch (sportType) {
      case 'volleyball': return [
        { value: 'standard', label: isThai ? 'มาตรฐาน 3x3 (9 โซน FIVB)' : 'Standard 3x3 (9 Zones FIVB)' }, 
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
        { value: 'standard', label: isThai ? '3 ใน 5 เซ็ต (Best of 5)' : 'Best of 5 Sets' }, 
        { value: 'short', label: isThai ? '2 ใน 3 เซ็ต (Best of 3)' : 'Best of 3 Sets' }
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

  const handleClubChange = (isTeam1: boolean, field: string, val: string) => {
    const current = isTeam1 ? team1 : team2;
    const updated = {
      ...current,
      [field]: field === 'code' ? val.toUpperCase() : val,
      teamType: 'club' as const,
      icon: ''
    };
    if (isTeam1) setTeam1(updated);
    else setTeam2(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = projectTitle.trim() || `${team1.code || 'T1'} vs ${team2.code || 'T2'} (${new Date().toLocaleDateString()})`;
    
    const settingsSnapshot: Partial<AppSettings> = {
      areaPrecisionMode: areaPrecision,
      areaCourtViewMode: courtViewMode,
      enableOutOfBoundsZones: outOfBounds === 'on',
      enableScoutHUDMode: false,
      hudDefaultMode: 'classic',
      hudExperienceMode: 'auto',
      uiLanguage: selectedLanguage,
      theme: selectedTheme,
      darkMode: selectedTheme === 'dark' || selectedTheme === 'monochrome'
    };

    let videoMeta: any = {
      sourceType: videoSource,
      youtubeUrl: videoSource === 'youtube' ? youtubeUrlInput : '',
      localFileName: videoSource === 'local' ? (localFileTitle || 'local_video.mp4') : undefined
    };

    if (videoSource === 'youtube') {
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
      const match = youtubeUrlInput.match(regExp);
      if (match && match[2].length === 11) {
        videoMeta.youtubeVideoId = match[2];
      }
    }

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
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 10 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0.05 }}
            className="relative bg-white dark:bg-gray-850 rounded-3xl shadow-2xl w-full max-w-5xl border border-gray-200 dark:border-gray-700 overflow-hidden z-10 flex flex-col h-[90vh] max-h-[850px]"
          >
            {/* Top Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-gray-700/80 bg-gray-50/80 dark:bg-gray-900/60 shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 bg-sky-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/20">
                  <Trophy size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-900 dark:text-gray-50 tracking-tight">
                    {isThai ? 'สร้างโครงการบันทึกสถิติใหม่ (Single-Page Form)' : 'Create New Scout Project'}
                  </h2>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                    {isThai ? 'กรอกข้อมูลและตรวจสอบความถูกต้องก่อนเริ่มแมตช์ได้ในหน้าเดียว' : 'Configure match details, teams, court format and video in one unified form'}
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

            {/* 2-Column Split Body */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
              
              {/* Left Column: 4 Form Sections (Scrollable) */}
              <div className="lg:col-span-7 overflow-y-auto p-5 sm:p-6 space-y-6 border-b lg:border-b-0 lg:border-r border-gray-150 dark:border-gray-700/80 bg-white dark:bg-gray-900 custom-scrollbar">
                
                {/* SECTION 1: MATCH & BASIC INFO */}
                <section className="bg-gray-50/60 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-2xl p-4.5 space-y-3.5">
                  <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
                    <Trophy size={16} />
                    <h3 className="text-xs font-black uppercase tracking-wider">
                      {isThai ? '1. ข้อมูลแมตช์และโครงการ' : '1. Match & Project Info'}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase mb-1">
                        {isThai ? 'ชื่อโครงการ (Project Title)' : 'Project Title'}
                      </label>
                      <input
                        type="text"
                        value={projectTitle}
                        onChange={e => setProjectTitle(e.target.value)}
                        placeholder={isThai ? 'เช่น ชิงแชมป์สโมสรเอเชีย 2026' : 'e.g. Asia Club Championship 2026'}
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2 text-xs text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase mb-1">
                        {isThai ? 'ประเภทกีฬา (Sport)' : 'Sport Type'}
                      </label>
                      <CustomSelect
                        value={sportType}
                        options={SPORT_OPTIONS}
                        onChange={v => setSportType(v as SportType)}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase mb-1">
                        {isThai ? 'ชื่อการแข่งขัน (Match Label)' : 'Match / Tournament'}
                      </label>
                      <input
                        type="text"
                        value={matchName}
                        onChange={e => setMatchName(e.target.value)}
                        placeholder={isThai ? 'เช่น รอบชิงชนะเลิศ (Final)' : 'e.g. Grand Finals'}
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2 text-xs text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase mb-1">
                        {isThai ? 'ผู้บันทึกสถิติ (Scouter Name)' : 'Scouter Name'}
                      </label>
                      <input
                        type="text"
                        value={scouterName}
                        onChange={e => setScouterName(e.target.value)}
                        placeholder={isThai ? 'ชื่อผู้บันทึก' : 'Analyst name'}
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2 text-xs text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 outline-none"
                      />
                    </div>
                  </div>
                </section>

                {/* SECTION 2: TEAMS */}
                <section className="bg-gray-50/60 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-2xl p-4.5 space-y-3.5">
                  <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
                    <Flag size={16} />
                    <h3 className="text-xs font-black uppercase tracking-wider">
                      {isThai ? '2. ทีมคู่แข่งขัน (Teams Setup)' : '2. Teams Setup'}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Team 1 */}
                    <div className="p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-sky-600 dark:text-sky-400 uppercase">Team A (ทีม 1)</span>
                        <div className="flex bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg text-[9px] font-bold">
                          <button
                            type="button"
                            onClick={() => setTeam1(prev => ({ ...prev, teamType: 'country' }))}
                            className={`px-2 py-0.5 rounded ${team1.teamType === 'country' ? 'bg-sky-600 text-white' : 'text-gray-500'}`}
                          >
                            {isThai ? 'ประเทศ' : 'Country'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setTeam1(prev => ({ ...prev, teamType: 'club', icon: '' }))}
                            className={`px-2 py-0.5 rounded ${team1.teamType === 'club' ? 'bg-sky-600 text-white' : 'text-gray-500'}`}
                          >
                            {isThai ? 'สโมสร' : 'Club'}
                          </button>
                        </div>
                      </div>

                      {team1.teamType === 'country' ? (
                        <CustomSelect
                          value={team1.code}
                          options={countryOptions}
                          onChange={v => handleCountryChange(true, v)}
                        />
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="text"
                            placeholder="Code"
                            value={team1.code}
                            maxLength={4}
                            onChange={e => handleClubChange(true, 'code', e.target.value)}
                            className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs text-center font-bold"
                          />
                          <input
                            type="text"
                            placeholder="Club Name"
                            value={team1.name}
                            onChange={e => handleClubChange(true, 'name', e.target.value)}
                            className="col-span-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs"
                          />
                        </div>
                      )}
                    </div>

                    {/* Team 2 */}
                    <div className="p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase">Team B (ทีม 2)</span>
                        <div className="flex bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg text-[9px] font-bold">
                          <button
                            type="button"
                            onClick={() => setTeam2(prev => ({ ...prev, teamType: 'country' }))}
                            className={`px-2 py-0.5 rounded ${team2.teamType === 'country' ? 'bg-amber-600 text-white' : 'text-gray-500'}`}
                          >
                            {isThai ? 'ประเทศ' : 'Country'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setTeam2(prev => ({ ...prev, teamType: 'club', icon: '' }))}
                            className={`px-2 py-0.5 rounded ${team2.teamType === 'club' ? 'bg-amber-600 text-white' : 'text-gray-500'}`}
                          >
                            {isThai ? 'สโมสร' : 'Club'}
                          </button>
                        </div>
                      </div>

                      {team2.teamType === 'country' ? (
                        <CustomSelect
                          value={team2.code}
                          options={countryOptions}
                          onChange={v => handleCountryChange(false, v)}
                        />
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="text"
                            placeholder="Code"
                            value={team2.code}
                            maxLength={4}
                            onChange={e => handleClubChange(false, 'code', e.target.value)}
                            className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs text-center font-bold"
                          />
                          <input
                            type="text"
                            placeholder="Club Name"
                            value={team2.name}
                            onChange={e => handleClubChange(false, 'name', e.target.value)}
                            className="col-span-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* SECTION 3: COURT & FORMAT */}
                <section className="bg-gray-50/60 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-2xl p-4.5 space-y-3.5">
                  <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
                    <Layout size={16} />
                    <h3 className="text-xs font-black uppercase tracking-wider">
                      {isThai ? '3. สนามและรูปแบบการบันทึก' : '3. Court & Recording Format'}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase mb-1">
                        {isThai ? 'โครงสร้างสนาม (Court Grid)' : 'Court Grid'}
                      </label>
                      <CustomSelect
                        value={courtConfig}
                        options={courtOptions}
                        onChange={setCourtConfig}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase mb-1">
                        {isThai ? 'รูปแบบเกม (Match Format)' : 'Match Format'}
                      </label>
                      <CustomSelect
                        value={gameFormat}
                        options={formatOptions}
                        onChange={setGameFormat}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase mb-1">
                        {isThai ? 'ความละเอียดพิกัด (Area Precision)' : 'Area Precision'}
                      </label>
                      <div className="grid grid-cols-3 gap-1.5 bg-white dark:bg-gray-900 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
                        {(['normal', 'detailed', 'point'] as const).map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setAreaPrecision(p)}
                            className={`py-1 px-1 rounded-lg text-[10px] font-bold transition-all ${
                              areaPrecision === p
                                ? 'bg-sky-600 text-white shadow-sm'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                          >
                            {p === 'normal' && (isThai ? 'มาตรฐาน' : 'Normal')}
                            {p === 'detailed' && (isThai ? 'ละเอียด' : 'Detailed')}
                            {p === 'point' && (isThai ? 'จุดพิกัด' : 'Point')}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase mb-1">
                        {isThai ? 'โซนนอกสนาม (Out of Bounds)' : 'Out of Bounds Zone'}
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 bg-white dark:bg-gray-900 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
                        <button
                          type="button"
                          onClick={() => setOutOfBounds('off')}
                          className={`py-1 px-1 rounded-lg text-[10px] font-bold transition-all ${
                            outOfBounds === 'off' ? 'bg-sky-600 text-white shadow-sm' : 'text-gray-500'
                          }`}
                        >
                          {isThai ? 'ปิด (มาตรฐาน)' : 'Off (Standard)'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setOutOfBounds('on')}
                          className={`py-1 px-1 rounded-lg text-[10px] font-bold transition-all ${
                            outOfBounds === 'on' ? 'bg-sky-600 text-white shadow-sm' : 'text-gray-500'
                          }`}
                        >
                          {isThai ? 'เปิดใช้งาน' : 'Enabled'}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                {/* SECTION 4: VIDEO & WORKSPACE */}
                <section className="bg-gray-50/60 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-2xl p-4.5 space-y-3.5">
                  <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
                    <Video size={16} />
                    <h3 className="text-xs font-black uppercase tracking-wider">
                      {isThai ? '4. แหล่งวิดีโอและภาษา' : '4. Video Source & Theme'}
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 bg-white dark:bg-gray-900 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => setVideoSource('youtube')}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                          videoSource === 'youtube' ? 'bg-rose-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        <Video size={13} />
                        YouTube
                      </button>
                      <button
                        type="button"
                        onClick={() => setVideoSource('local')}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                          videoSource === 'local' ? 'bg-sky-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        <Laptop size={13} />
                        Local File
                      </button>
                      <button
                        type="button"
                        onClick={() => setVideoSource('none')}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                          videoSource === 'none' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {isThai ? 'บันทึกสด (Live)' : 'Live / None'}
                      </button>
                    </div>

                    {videoSource === 'youtube' && (
                      <input
                        type="text"
                        value={youtubeUrlInput}
                        onChange={e => setYoutubeUrlInput(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2 text-xs text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-rose-500 outline-none"
                      />
                    )}

                    {videoSource === 'local' && (
                      <input
                        type="text"
                        value={localFileTitle}
                        onChange={e => setLocalFileTitle(e.target.value)}
                        placeholder="match_recording_2026.mp4"
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2 text-xs text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 outline-none"
                      />
                    )}
                  </div>
                </section>
              </div>

              {/* Right Column: Live Summary & Review Card (Sticky/Auto) */}
              <div className="lg:col-span-5 bg-gray-50/90 dark:bg-gray-950/80 p-5 sm:p-6 flex flex-col justify-between overflow-y-auto">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
                    <Sparkles size={16} className="text-amber-500" />
                    <h3 className="text-xs font-black uppercase tracking-wider">
                      {isThai ? 'สรุปข้อมูลก่อนบันทึก (Live Review)' : 'Summary & Live Preview'}
                    </h3>
                  </div>

                  {/* Visual Match Header Card */}
                  <div className="bg-gradient-to-br from-sky-600 to-indigo-700 text-white rounded-2xl p-4 shadow-lg space-y-3">
                    <div className="text-[10px] font-bold tracking-widest uppercase opacity-80">
                      {sportType.toUpperCase()} MATCH
                    </div>
                    <div className="text-sm font-black truncate">
                      {projectTitle.trim() || `${team1.code || 'T1'} vs ${team2.code || 'T2'}`}
                    </div>

                    {/* Team Faceoff */}
                    <div className="flex items-center justify-between bg-white/10 backdrop-blur-md rounded-xl p-3">
                      <div className="text-center flex-1">
                        <div className="text-2xl mb-1">{team1.icon || '🏐'}</div>
                        <div className="text-xs font-extrabold">{team1.code || 'Team A'}</div>
                        <div className="text-[10px] opacity-80 truncate max-w-[100px] mx-auto">{team1.thaiName || team1.name}</div>
                      </div>
                      <div className="px-2 text-xs font-black opacity-60">VS</div>
                      <div className="text-center flex-1">
                        <div className="text-2xl mb-1">{team2.icon || '🏐'}</div>
                        <div className="text-xs font-extrabold">{team2.code || 'Team B'}</div>
                        <div className="text-[10px] opacity-80 truncate max-w-[100px] mx-auto">{team2.thaiName || team2.name}</div>
                      </div>
                    </div>
                  </div>

                  {/* Key Configurations Table */}
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 space-y-2.5 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-gray-800">
                      <span className="text-gray-500 dark:text-gray-400">{isThai ? 'การแข่งขัน' : 'Match Name'}</span>
                      <span className="font-bold text-gray-800 dark:text-gray-200">{matchName || '-'}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-gray-800">
                      <span className="text-gray-500 dark:text-gray-400">{isThai ? 'ผู้บันทึก' : 'Scouter'}</span>
                      <span className="font-bold text-gray-800 dark:text-gray-200">{scouterName || '-'}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-gray-800">
                      <span className="text-gray-500 dark:text-gray-400">{isThai ? 'โครงสร้างสนาม' : 'Court Config'}</span>
                      <span className="font-bold text-sky-600 dark:text-sky-400">{courtConfig}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-gray-800">
                      <span className="text-gray-500 dark:text-gray-400">{isThai ? 'รูปแบบเกม' : 'Game Format'}</span>
                      <span className="font-bold text-gray-800 dark:text-gray-200">{gameFormat}</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-gray-500 dark:text-gray-400">{isThai ? 'แหล่งวิดีโอ' : 'Video Source'}</span>
                      <span className="font-bold text-gray-800 dark:text-gray-200 uppercase">{videoSource}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action CTA */}
                <div className="pt-5 space-y-2">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="w-full py-3.5 px-4 bg-sky-600 hover:bg-sky-500 active:scale-[0.98] text-white font-black text-sm rounded-2xl shadow-xl shadow-sky-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <CheckCircle2 size={18} />
                    <span>{isThai ? 'ยืนยันและสร้างโปรเจกต์ (Create)' : 'Confirm & Create Project'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-2.5 px-4 bg-transparent hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    {isThai ? 'ยกเลิก' : 'Cancel'}
                  </button>
                </div>
              </div>

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
