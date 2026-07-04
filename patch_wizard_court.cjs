const fs = require('fs');
let code = fs.readFileSync('src/components/CreateProjectWizard.tsx', 'utf-8');

// Add state for courtConfig and gameFormat
if (!code.includes('courtConfig')) {
  code = code.replace(
    /const \[scouterName, setScouterName\] = useState\(''\);/,
    `const [scouterName, setScouterName] = useState('');
  const [courtConfig, setCourtConfig] = useState('standard');
  const [gameFormat, setGameFormat] = useState('standard');`
  );

  // Update handleSubmit
  code = code.replace(
    /onCreate\(finalTitle, sportType, \{ matchName, scouterName \}, \[team1, team2\]\);/,
    `onCreate(finalTitle, sportType, { matchName, scouterName, courtConfig, gameFormat }, [team1, team2]);`
  );

  // Reset state
  code = code.replace(
    /setScouterName\(''\);/,
    `setScouterName('');\n    setCourtConfig('standard');\n    setGameFormat('standard');`
  );
  
  // Add Layout Icon
  code = code.replace(
    /import \{ X, Trophy, Flag, User \} from 'lucide-react';/,
    `import { X, Trophy, Flag, User, Layout, Settings2 } from 'lucide-react';`
  );
  
  // Add options generation based on sportType
  const optionsLogic = `
  const getCourtOptions = () => {
    switch (sportType) {
      case 'volleyball': return [{ value: 'standard', label: isThai ? 'มาตรฐาน 3x3 (9 โซน)' : 'Standard 3x3 (9 Zones)' }, { value: 'basic', label: isThai ? 'พื้นฐาน 2x2 (4 โซน)' : 'Basic 2x2 (4 Zones)' }];
      case 'football': return [{ value: 'standard', label: isThai ? 'สนามเต็ม (รุก/กลาง/รับ)' : 'Full Field (Att/Mid/Def)' }, { value: 'futsal', label: isThai ? 'ฟุตซอล (ครึ่งสนาม)' : 'Futsal (Half)' }];
      case 'badminton': return [{ value: 'standard', label: isThai ? 'คอร์ทเดี่ยว' : 'Singles Court' }, { value: 'doubles', label: isThai ? 'คอร์ทคู่' : 'Doubles Court' }];
      case 'basketball': return [{ value: 'standard', label: isThai ? 'เต็มสนาม' : 'Full Court' }, { value: 'half', label: isThai ? 'ครึ่งสนาม (3x3)' : 'Half Court (3x3)' }];
      default: return [{ value: 'standard', label: 'Standard' }];
    }
  };

  const getFormatOptions = () => {
    switch (sportType) {
      case 'volleyball': return [{ value: 'standard', label: isThai ? '3 ใน 5 เซ็ต' : 'Best of 5 Sets' }, { value: 'short', label: isThai ? '2 ใน 3 เซ็ต' : 'Best of 3 Sets' }];
      case 'football': return [{ value: 'standard', label: isThai ? '2 ครึ่ง (45 นาที)' : '2 Halves (45 mins)' }, { value: 'custom', label: isThai ? 'กำหนดเอง' : 'Custom' }];
      case 'badminton': return [{ value: 'standard', label: isThai ? '2 ใน 3 เกม (21 แต้ม)' : 'Best of 3 Games (21 pts)' }];
      case 'basketball': return [{ value: 'standard', label: isThai ? '4 ควอเตอร์' : '4 Quarters' }, { value: '3x3', label: isThai ? 'FIBA 3x3 (10 นาที)' : 'FIBA 3x3 (10 mins)' }];
      default: return [{ value: 'standard', label: 'Standard' }];
    }
  };
  `;
  
  code = code.replace(
    /const countryOptions/,
    optionsLogic + "\n  const countryOptions"
  );
  
  // Add UI for Court Configuration below the basic info
  const courtUI = `
              <div className="p-5 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-xl space-y-5">
                <h3 className="text-sm font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
                  <Layout size={16} />
                  {isThai ? 'การตั้งค่าหน้าโปรเจกต์ (Project Canvas)' : 'Project Canvas Settings'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase">
                      {isThai ? 'รูปแบบสนาม (Court/Field Layout)' : 'Court/Field Layout'}
                    </label>
                    <CustomSelect
                      value={courtConfig}
                      onChange={(val) => setCourtConfig(val)}
                      options={getCourtOptions()}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase">
                      {isThai ? 'รูปแบบการแข่งขัน (Game Format)' : 'Game Format'}
                    </label>
                    <CustomSelect
                      value={gameFormat}
                      onChange={(val) => setGameFormat(val)}
                      options={getFormatOptions()}
                    />
                  </div>
                </div>
              </div>
  `;
  
  code = code.replace(
    /<div className="p-5 bg-sky-50\/50/,
    courtUI + "\n              <div className=\"p-5 bg-sky-50/50"
  );

  fs.writeFileSync('src/components/CreateProjectWizard.tsx', code);
}
