import React from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { Zap, Target, Award, PlayCircle } from 'lucide-react';
import { motion } from 'motion/react';

export default function Sidebar() {
  const { matchInfo, sportTemplate, changeSportType, settings, setSettings } = useScoutContext();
  const isThai = settings.uiLanguage === 'th';

  const sports = [
    { id: 'volleyball', name: 'Volleyball', thaiName: 'วอลเลย์บอล', emoji: '🏐', color: 'bg-orange-500 hover:bg-orange-600' },
    { id: 'football', name: 'Football', thaiName: 'ฟุตบอล', emoji: '⚽', color: 'bg-green-600 hover:bg-green-700' },
    { id: 'badminton', name: 'Badminton', thaiName: 'แบดมินตัน', emoji: '🏸', color: 'bg-teal-500 hover:bg-teal-600' },
    { id: 'basketball', name: 'Basketball', thaiName: 'บาสเกตบอล', emoji: '🏀', color: 'bg-amber-600 hover:bg-amber-700' }
  ];

  return (
    <aside className="w-full lg:w-16 shrink-0 flex flex-row lg:flex-col items-center justify-between lg:justify-start gap-4 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl lg:sticky lg:top-[76px] lg:self-start shadow-sm z-40">
      {/* Sport Battery Section */}
      <div className="flex flex-row lg:flex-col items-center gap-2.5 w-full lg:w-auto">
        <div className="hidden lg:block text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center leading-none mb-1">
          {isThai ? 'กีฬา' : 'Sport'}
        </div>
        <div className="flex flex-row lg:flex-col gap-2 w-full justify-center">
          {sports.map(sport => {
            const isSelected = sportTemplate.id === sport.id;
            return (
              <button
                key={sport.id}
                onClick={() => changeSportType(sport.id as any)}
                className={`relative flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-150 cursor-pointer w-11 h-11 lg:w-12 lg:h-12 border ${
                  isSelected
                    ? 'border-transparent text-white shadow-md scale-105 bg-sky-600 dark:bg-sky-500'
                    : 'border-gray-150 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100'
                }`}
                title={isThai ? sport.thaiName : sport.name}
              >
                <span className="text-xl leading-none">{sport.emoji}</span>
                <span className="text-[8px] font-black mt-0.5 tracking-tight uppercase opacity-90 hidden lg:block">
                  {sport.id.substring(0, 2)}
                </span>
                
                {/* Active Dot Indicator */}
                {isSelected && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Vertical Divider / Space on Desktop */}
      <div className="hidden lg:block w-full h-px bg-gray-150 dark:bg-gray-700 my-4" />
      <div className="lg:hidden w-px h-8 bg-gray-200 dark:bg-gray-700 mx-1" />

      {/* Mode Settings Toggles Section */}
      <div className="flex flex-row lg:flex-col items-center gap-2.5">
        <div className="hidden lg:block text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center leading-none mb-1">
          {isThai ? 'โหมด' : 'Mode'}
        </div>
        
        <div className="flex flex-row lg:flex-col gap-2">
          {/* Fast Mode Toggle */}
          <button
            onClick={() => setSettings(prev => ({ ...prev, fastMode: !prev.fastMode }))}
            className={`relative flex flex-col items-center justify-center w-11 h-11 lg:w-12 lg:h-12 rounded-xl transition-all duration-150 border cursor-pointer ${
              settings.fastMode
                ? 'bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/50 text-amber-500 shadow-sm'
                : 'border-gray-150 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-400 dark:text-gray-500 hover:bg-gray-100'
            }`}
            title={isThai ? 'โหมดด่วน (Fast Mode)' : 'Fast Mode'}
          >
            <Zap size={settings.fastMode ? 20 : 18} className={settings.fastMode ? 'fill-amber-500/10 animate-pulse' : ''} />
            <span className="text-[8.5px] font-extrabold mt-0.5 whitespace-nowrap hidden lg:block">
              {isThai ? 'ด่วน' : 'Fast'}
            </span>
          </button>

          {/* Detail Mode Toggle */}
          <button
            onClick={() => setSettings(prev => ({ ...prev, advancedDetailMode: !prev.advancedDetailMode }))}
            className={`relative flex flex-col items-center justify-center w-11 h-11 lg:w-12 lg:h-12 rounded-xl transition-all duration-150 border cursor-pointer ${
              settings.advancedDetailMode
                ? 'bg-purple-500/10 dark:bg-purple-500/15 border-purple-500/50 text-purple-500 shadow-sm'
                : 'border-gray-150 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-400 dark:text-gray-500 hover:bg-gray-100'
            }`}
            title={isThai ? 'โหมดละเอียด (Detail Mode)' : 'Detail Mode'}
          >
            <Target size={settings.advancedDetailMode ? 20 : 18} className={settings.advancedDetailMode ? 'animate-pulse' : ''} />
            <span className="text-[8.5px] font-extrabold mt-0.5 whitespace-nowrap hidden lg:block">
              {isThai ? 'ละเอียด' : 'Detail'}
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
