import React, { useState } from 'react';
import { useScoutContext } from '../context/ScoutContext';
import TeamEditor from "./TeamEditor";
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

  const updatePoint = (delta: number) => {
    setMatchInfo(prev => ({ 
      ...prev, 
      currentPoint: Math.max(1, prev.currentPoint + delta) 
    }));
  };

  if (compact && !isExpanded) {
    return (
      <div className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex items-center justify-between gap-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 overflow-hidden">
          <div className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2 truncate">
            <span className="text-sky-600 dark:text-sky-400 truncate max-w-[100px]">{teams[0]?.icon && <span className="mr-1">{teams[0].icon}</span>}{teams[0]?.code || 'Team 1'}</span>
            <span className="text-gray-400 text-xs font-normal shrink-0">vs</span>
            <span className="text-sky-600 dark:text-sky-400 truncate max-w-[100px]">{teams[1]?.icon && <span className="mr-1">{teams[1].icon}</span>}{teams[1]?.code || 'Team 2'}</span>
          </div>
          <div className="text-xs text-gray-500 sm:border-l border-gray-300 dark:border-gray-600 sm:pl-4 py-0.5 sm:py-1 shrink-0">
            Set {matchInfo.setOrGame} • PT {matchInfo.currentPoint}
          </div>
        </div>
        <button 
          onClick={() => setIsExpanded(true)}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-400"
        >
          <ChevronDown size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4 transition-all">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-150 flex items-center gap-2">
          <Edit2 size={16} className="text-sky-500" />
          {settings.uiLanguage === 'th' ? 'ข้อมูลการแข่งขัน (Match Info)' : 'Match Info'}
        </h2>
        {compact && (
          <button 
            onClick={() => setIsExpanded(false)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-400"
          >
            <ChevronUp size={18} />
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <TeamEditor teamIndex={0} />
        <TeamEditor teamIndex={1} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
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

      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            {settings.uiLanguage === 'th' ? 'ชื่อการแข่งขัน / คลิป' : 'Match / Video'}
          </label>
          <input 
            type="text" 
            name="matchName"
            value={matchInfo.matchName} 
            onChange={handleChange}
            placeholder={settings.uiLanguage === 'th' ? 'เช่น VNL 2024...' : 'e.g., VNL 2024...'}
            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 text-center">Set / Game</label>
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
            {settings.uiLanguage === 'th' ? 'แต้มปัจจุบัน' : 'Point'}
          </label>
          <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-1">
            <button 
              onClick={() => updatePoint(-1)} 
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors text-gray-500 dark:text-gray-400"
            >
              <Minus size={14} />
            </button>
            <span className="font-bold text-sm text-gray-800 dark:text-gray-200">{matchInfo.currentPoint}</span>
            <button 
              onClick={() => updatePoint(1)} 
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors text-gray-500 dark:text-gray-400"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
