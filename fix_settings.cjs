const fs = require('fs');
let code = fs.readFileSync('src/components/SettingsModal.tsx', 'utf-8');
code = code.replace(/<span className="sm:hidden">HUD\/Court<\/span>/g, `<span className="sm:hidden">HUD/Court</span>`);
fs.writeFileSync('src/components/SettingsModal.tsx', code);
