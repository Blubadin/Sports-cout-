const fs = require('fs');
let code = fs.readFileSync('src/context/ScoutContext.tsx', 'utf-8');

code = code.replace(
  `const parts = [action.teamCode, action.skillCode, area, action.resultCode];`,
  `const parts = [action.teamCode, action.skillCode, area, action.resultCode, action.foulCode];`
);

code = code.replace(
  `    const resultCode = action.resultCode || '';`,
  `    const resultCode = action.resultCode || '';
    const foulCode = action.foulCode || '';`
);

code = code.replace(
  `    if (resultCode && resultCode !== '0') parts.push(resultCode);`,
  `    if (resultCode && resultCode !== '0') parts.push(resultCode);
    if (foulCode) {
      const foulObj = sportTemplate.fouls?.find(f => f.code === foulCode);
      parts.push(foulObj?.labelTh || foulCode);
    }`
);

fs.writeFileSync('src/context/ScoutContext.tsx', code);
