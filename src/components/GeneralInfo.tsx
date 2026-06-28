import React, { useState } from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { Minus, Plus, Edit2, ChevronDown, ChevronUp } from 'lucide-react';
import { COUNTRIES } from '../countries';
import CustomSelect, { Option } from './ui/CustomSelect';

export default function GeneralInfo({ compact = false }: { compact?: boolean }) {
  const { matchInfo, setMatchInfo, teams, setTeams, settings } = useScoutContext();
  const [isExpanded, setIsExpanded] = useState(!compact);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setMatchInfo(prev => ({ ...prev, [name]: value }));
  };

  const handleTeamChange = (index: number, newCode: string) => {
    setTeams(prev => {
      const next = [...prev];
      if (!next[index]) {
        next[index] = { id: `t${index + 1}`, code: '', name: '', thaiName: '' };
      }
      
      const upperCode = newCode.toUpperCase();
      const country = COUNTRIES.find(c => c.code === upperCode);
      
      next[index] = {
        ...next[index],
        code: upperCode,
        name: country ? country.name : upperCode,
        thaiName: country?.thaiName || ''
      };
      return next;
    });
  };

  const updatePoint = (delta: number) => {
    setMatchInfo(prev => ({ 
      ...prev, 
      currentPoint: Math.max(1, prev.currentPoint + delta) 
    }));
  };

  const countryOptions: Option[] = COUNTRIES.map(c => ({
    value: c.code,
    label: c.code,
    subLabel: `${c.name} ${c.thaiName ? `(${c.thaiName})` : ''}`
  }));

  const matchTypeOptions: Option[] = [
    { value: 'Team', label: settings.uiLanguage === 'th' ? 'ทีม (Team)' : 'Team' },
    { value: 'Single', label: settings.uiLanguage === 'th' ? 'เดี่ยว (Single)' : 'Single' }
  ];

  if (compact && !isExpanded) {
    return (
      <div className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <span className="text-sky-600 dark:text-sky-400">{teams[0]?.code || 'Team 1'}</span>
            <span className="text-gray-400 text-xs font-normal">vs</span>
            <span className="text-sky-600 dark:text-sky-400">{teams[1]?.code || 'Team 2'}</span>
          </div>
          <div className="text-xs text-gray-500 border-l border-gray-300 dark:border-gray-600 pl-4 py-1">
            Set {matchInfo.setOrGame} • PT {matchInfo.currentPoint}
          </div>
        </div>
        <button 
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-1 text-xs text-sky-600 bg-sky-50 dark:bg-sky-900/30 px-2 py-1.5 rounded-lg hover:bg-sky-100 transition-colors"
        >
          <Edit2 size={14} /> {settings.uiLanguage === 'th' ? 'แก้ไขข้อมูล' : 'Edit Info'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4 text-sm relative">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {settings.uiLanguage === 'th' ? 'ข้อมูลทั่วไป (General Info)' : 'General Info'}
        </h2>
        {compact && (
          <button 
            onClick={() => setIsExpanded(false)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
          >
            <ChevronUp size={16} />
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-3">
        <CustomSelect
          label={settings.uiLanguage === 'th' ? 'ทีม 1 (Team 1)' : 'Team 1'}
          value={teams[0]?.code || ''}
          onChange={(val) => handleTeamChange(0, val)}
          options={countryOptions}
          placeholder={settings.uiLanguage === 'th' ? 'เลือกประเทศ / พิมพ์โค้ด' : 'Select Country / Type Code'}
        />
        <CustomSelect
          label={settings.uiLanguage === 'th' ? 'ทีม 2 (Team 2)' : 'Team 2'}
          value={teams[1]?.code || ''}
          onChange={(val) => handleTeamChange(1, val)}
          options={countryOptions}
          placeholder={settings.uiLanguage === 'th' ? 'เลือกประเทศ / พิมพ์โค้ด' : 'Select Country / Type Code'}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            {settings.uiLanguage === 'th' ? 'ผู้บันทึก (Scouter)' : 'Scouter'}
          </label>
          <input 
            type="text" 
            name="scouterName"
            value={matchInfo.scouterName} 
            onChange={handleChange}
            placeholder={settings.uiLanguage === 'th' ? 'ชื่อ-สกุล' : 'Name-Surname'}
            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            {settings.uiLanguage === 'th' ? 'ชื่อเล่น (Nickname)' : 'Nickname'}
          </label>
          <input 
            type="text" 
            name="nickname"
            value={matchInfo.nickname} 
            onChange={handleChange}
            placeholder={settings.uiLanguage === 'th' ? 'ชื่อเล่น' : 'Nickname'}
            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
          {settings.uiLanguage === 'th' ? 'ชื่อการแข่งขัน / ไฟล์วิดีโอ' : 'Match Name / Video File'}
        </label>
        <input 
          type="text" 
          name="matchName"
          value={matchInfo.matchName} 
          onChange={handleChange}
          placeholder={settings.uiLanguage === 'th' ? 'เช่น VNL 2024 THA vs JPN' : 'e.g., VNL 2024 THA vs JPN'}
          className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      <div className="grid grid-cols-3 gap-3 items-end">
        <CustomSelect
          label={settings.uiLanguage === 'th' ? 'ประเภท (Type)' : 'Type'}
          value={matchInfo.matchType}
          onChange={(val) => setMatchInfo(prev => ({ ...prev, matchType: val as any }))}
          options={matchTypeOptions}
        />
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Set / Game</label>
          <input 
            type="text" 
            name="setOrGame"
            value={matchInfo.setOrGame} 
            onChange={handleChange}
            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 text-center">
            {settings.uiLanguage === 'th' ? 'แต้มปัจจุบัน (PT)' : 'Current Point (PT)'}
          </label>
          <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-1">
            <button onClick={() => updatePoint(-1)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"><Minus size={14} /></button>
            <span className="font-semibold text-sm">{matchInfo.currentPoint}</span>
            <button onClick={() => updatePoint(1)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"><Plus size={14} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
