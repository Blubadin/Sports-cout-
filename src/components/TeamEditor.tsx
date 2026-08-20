import React from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { COUNTRIES } from '../countries';
import CustomSelect, { Option } from './ui/CustomSelect';
import { Save } from 'lucide-react';

export default function TeamEditor({ teamIndex }: { teamIndex: number }) {
  const { teams, setTeams, settings, showToast } = useScoutContext();
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

  const handleSaveAsDefault = () => {
    localStorage.setItem('sportscout_default_teams', JSON.stringify(teams));
    showToast(isThai ? 'บันทึกทีมเป็นค่าเริ่มต้นของระบบแล้ว' : 'Saved teams as system default');
  };

  return (
    <div className="space-y-2 border border-gray-150 dark:border-gray-800 p-3.5 rounded-xl bg-white dark:bg-gray-850 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-black text-gray-700 dark:text-gray-300">
          {isThai ? `ทีม ${teamIndex === 0 ? 'A' : 'B'}` : `Team ${teamIndex + 1}`}
        </label>
        <div className="flex bg-gray-100 dark:bg-gray-750 p-0.5 rounded-lg">
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
            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <input 
            type="text" 
            placeholder="CODE" 
            value={team.code}
            onChange={(e) => handleClubChange('code', e.target.value)}
            maxLength={4}
            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-center text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 font-bold uppercase"
          />
        </div>
      )}

      {teamIndex === 1 && (
        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={handleSaveAsDefault}
            className="w-full py-1.5 px-2 bg-gray-50 dark:bg-gray-800 hover:bg-sky-50 dark:hover:bg-sky-950/30 text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
          >
            <Save size={12} />
            <span>{isThai ? 'บันทึกคู่นี้เป็นค่าเริ่มต้นของระบบ' : 'Save as Default'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
