import React from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { COUNTRIES } from '../countries';
import CustomSelect, { Option } from './ui/CustomSelect';

export default function TeamEditor({ teamIndex }: { teamIndex: number }) {
  const { teams, setTeams, settings } = useScoutContext();
  const isThai = settings.uiLanguage === 'th';
  const team = teams[teamIndex] || { id: `t${teamIndex + 1}`, code: '', name: '', thaiName: '', teamType: 'country', icon: '' };
  const teamType = team.teamType || 'country';

  const countryOptions: Option[] = COUNTRIES.map(c => ({
    value: c.code,
    label: c.code,
    subLabel: `${c.name} ${c.thaiName ? `(${c.thaiName})` : ''}`,
    icon: <span className="text-lg">{c.icon}</span>
  }));

  const handleCountryChange = (newCode: string) => {
    setTeams(prev => {
      const next = [...prev];
      const upperCode = newCode.toUpperCase();
      const country = COUNTRIES.find(c => c.code === upperCode);
      next[teamIndex] = {
        ...team,
        code: upperCode,
        name: country ? country.name : upperCode,
        thaiName: country?.thaiName || '',
        icon: country?.icon || '',
        teamType: 'country'
      };
      return next;
    });
  };

  const handleClubChange = (field: string, value: string) => {
    setTeams(prev => {
      const next = [...prev];
      next[teamIndex] = {
        ...team,
        [field]: field === 'code' ? value.toUpperCase() : value,
        teamType: 'club'
      };
      return next;
    });
  };

  return (
    <div className="space-y-2 border border-gray-100 dark:border-gray-800 p-3 rounded-xl bg-white dark:bg-gray-800/50">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-bold text-gray-600 dark:text-gray-400">
          {isThai ? `ทีม ${teamIndex === 0 ? 'A' : 'B'}` : `Team ${teamIndex + 1}`}
        </label>
        <div className="flex bg-gray-100 dark:bg-gray-700 p-0.5 rounded-lg">
          <button 
            onClick={() => setTeams(prev => { const n = [...prev]; n[teamIndex] = {...team, teamType: 'country'}; return n; })}
            className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${teamType === 'country' ? 'bg-white dark:bg-gray-600 text-sky-600 dark:text-sky-400 shadow-sm' : 'text-gray-500'}`}
          >
            {isThai ? 'ประเทศ' : 'Country'}
          </button>
          <button 
            onClick={() => setTeams(prev => { const n = [...prev]; n[teamIndex] = {...team, teamType: 'club'}; return n; })}
            className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${teamType === 'club' ? 'bg-white dark:bg-gray-600 text-sky-600 dark:text-sky-400 shadow-sm' : 'text-gray-500'}`}
          >
            {isThai ? 'สโมสร' : 'Club'}
          </button>
        </div>
      </div>
      
      {teamType === 'country' ? (
        <CustomSelect
          value={team.code || ''}
          onChange={handleCountryChange}
          options={countryOptions}
          placeholder={isThai ? 'เลือกประเทศ / พิมพ์โค้ด' : 'Select Country / Type Code'}
        />
      ) : (
        <div className="grid grid-cols-[3fr_1fr] gap-2">
          <input 
            type="text" 
            placeholder={isThai ? 'ชื่อทีม' : 'Team Name'} 
            value={team.name}
            onChange={(e) => handleClubChange('name', e.target.value)}
            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <input 
            type="text" 
            placeholder="CODE" 
            value={team.code}
            onChange={(e) => handleClubChange('code', e.target.value)}
            maxLength={3}
            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-center text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 font-bold uppercase"
          />
          <div className="col-span-2 flex gap-2">
             <input 
              type="text" 
              placeholder={isThai ? 'ไอคอน (Emoji/โลโก้)' : 'Icon (Emoji)'} 
              value={team.icon || ''}
              onChange={(e) => handleClubChange('icon', e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
