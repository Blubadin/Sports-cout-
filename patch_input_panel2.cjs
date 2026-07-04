const fs = require('fs');
let code = fs.readFileSync('src/components/InputPanel.tsx', 'utf-8');

code = code.replace(
  `    if (currentAction.resultCode) parts.push({ label: currentAction.resultCode, type: 'result' });`,
  `    if (currentAction.resultCode) parts.push({ label: currentAction.resultCode, type: 'result' });
    if (currentAction.foulCode) parts.push({ label: currentAction.foulCode, type: 'foul' });`
);

code = code.replace(
  `          if (p.type === 'result') color = p.label === 'Yes' ? "bg-green-600/30 text-green-300 border border-green-500/20" : "bg-red-600/30 text-red-300 border border-red-500/20";`,
  `          if (p.type === 'result') color = p.label === 'Yes' ? "bg-green-600/30 text-green-300 border border-green-500/20" : "bg-red-600/30 text-red-300 border border-red-500/20";
          if (p.type === 'foul') color = "bg-orange-600/30 text-orange-400 border border-orange-500/30";`
);

fs.writeFileSync('src/components/InputPanel.tsx', code);
