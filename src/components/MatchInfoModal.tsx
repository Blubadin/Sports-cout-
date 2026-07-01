import React from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { X, Minus, Plus } from 'lucide-react';
import { COUNTRIES } from '../countries';
import CustomSelect, { Option } from './ui/CustomSelect';
import { motion, AnimatePresence } from 'motion/react';

interface MatchInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MatchInfoModal({ isOpen, onClose }: MatchInfoModalProps) {
  const { matchInfo, setMatchInfo, teams, setTeams, settings } = useScoutContext();
  const isThai = settings.uiLanguage === 'th';

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
    { value: 'Team', label: isThai ? 'ทีม (Team)' : 'Team' },
    { value: 'Single', label: isThai ? 'เดี่ยว (Single)' : 'Single' }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.1 }}
            className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg border border-gray-150 dark:border-gray-700 overflow-hidden z-10"
          >
            {/* Header */}
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/10">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏆</span>
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-150 leading-none">
                  {isThai ? 'ข้อมูลการแข่งขัน (Match Information)' : 'Match Information'}
                </h2>
              </div>
              <button 
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Teams Selection */}
              <div className="grid grid-cols-2 gap-4">
                <CustomSelect
                  label={isThai ? 'ทีม A (Team 1)' : 'Team 1'}
                  value={teams[0]?.code || ''}
                  onChange={(val) => handleTeamChange(0, val)}
                  options={countryOptions}
                  placeholder={isThai ? 'เลือกประเทศ / พิมพ์โค้ด' : 'Select Country / Type Code'}
                />
                <CustomSelect
                  label={isThai ? 'ทีม B (Team 2)' : 'Team 2'}
                  value={teams[1]?.code || ''}
                  onChange={(val) => handleTeamChange(1, val)}
                  options={countryOptions}
                  placeholder={isThai ? 'เลือกประเทศ / พิมพ์โค้ด' : 'Select Country / Type Code'}
                />
              </div>

              {/* Scouter Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1.5">
                    {isThai ? 'ผู้บันทึก (Scouter)' : 'Scouter'}
                  </label>
                  <input 
                    type="text" 
                    name="scouterName"
                    value={matchInfo.scouterName} 
                    onChange={handleChange}
                    placeholder={isThai ? 'ชื่อ-สกุล' : 'Name-Surname'}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1.5">
                    {isThai ? 'ชื่อเล่น (Nickname)' : 'Nickname'}
                  </label>
                  <input 
                    type="text" 
                    name="nickname"
                    value={matchInfo.nickname} 
                    onChange={handleChange}
                    placeholder={isThai ? 'ชื่อเล่น' : 'Nickname'}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Match Name */}
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1.5">
                  {isThai ? 'ชื่อการแข่งขัน / ไฟล์วิดีโอ' : 'Match Name / Video File'}
                </label>
                <input 
                  type="text" 
                  name="matchName"
                  value={matchInfo.matchName} 
                  onChange={handleChange}
                  placeholder={isThai ? 'เช่น VNL 2024 THA vs JPN' : 'e.g., VNL 2024 THA vs JPN'}
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Type, Set, Points */}
              <div className="grid grid-cols-3 gap-4 items-end">
                <CustomSelect
                  label={isThai ? 'ประเภท (Type)' : 'Type'}
                  value={matchInfo.matchType}
                  onChange={(val) => setMatchInfo(prev => ({ ...prev, matchType: val as any }))}
                  options={matchTypeOptions}
                />
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1.5">Set / Game</label>
                  <input 
                    type="text" 
                    name="setOrGame"
                    value={matchInfo.setOrGame} 
                    onChange={handleChange}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1.5 text-center">
                    {isThai ? 'แต้มปัจจุบัน (PT)' : 'Current Point (PT)'}
                  </label>
                  <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-1">
                    <button 
                      onClick={() => updatePoint(-1)} 
                      className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors text-gray-500 dark:text-gray-400"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="font-bold text-sm text-gray-800 dark:text-gray-200">{matchInfo.currentPoint}</span>
                    <button 
                      onClick={() => updatePoint(1)} 
                      className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors text-gray-500 dark:text-gray-400"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/10">
              <button
                onClick={onClose}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold transition-all active:scale-95 text-sm shadow-md shadow-sky-500/10"
              >
                {isThai ? 'ตกลง' : 'OK'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
