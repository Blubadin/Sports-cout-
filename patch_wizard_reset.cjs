const fs = require('fs');
let code = fs.readFileSync('src/components/CreateProjectWizard.tsx', 'utf-8');

code = code.replace(
  /onChange=\{\(val\) => setSportType\(val as SportType\)\}/,
  `onChange={(val) => { setSportType(val as SportType); setCourtConfig('standard'); setGameFormat('standard'); }}`
);

fs.writeFileSync('src/components/CreateProjectWizard.tsx', code);
