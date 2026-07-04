const fs = require('fs');
let code = fs.readFileSync('src/components/InputPanel.tsx', 'utf-8');

code = code.replace(
  `[a.teamCode, a.skillCode, a.areaCode || (a.resultCode === 'Out' ? 'OUT' : ''), a.resultCode].filter(Boolean).join(' ');`,
  `[a.teamCode, a.skillCode, a.areaCode || (a.resultCode === 'Out' ? 'OUT' : ''), a.resultCode, a.foulCode].filter(Boolean).join(' ');`
);

fs.writeFileSync('src/components/InputPanel.tsx', code);
