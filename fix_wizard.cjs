const fs = require('fs');
let code = fs.readFileSync('src/components/CreateProjectWizard.tsx', 'utf-8');

code = code.replace(
  "subLabel: `${c.name} ${c.thaiName ? \\`(\\${c.thaiName})\\` : ''}`",
  "subLabel: `${c.name} ${c.thaiName ? `(${c.thaiName})` : ''}`"
);

code = code.replace(
  "const finalTitle = projectTitle.trim() || \\`New Match \\${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\\`;",
  "const finalTitle = projectTitle.trim() || `New Match ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;"
);

fs.writeFileSync('src/components/CreateProjectWizard.tsx', code);
