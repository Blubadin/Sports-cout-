const fs = require('fs');
let code = fs.readFileSync('src/components/CreateProjectWizard.tsx', 'utf-8');

code = code.replace(/searchable\s*placeholder=\{[^}]+\}/g, '');
code = code.replace(/searchable\n\s*placeholder=\{[^}]+\}/g, '');

fs.writeFileSync('src/components/CreateProjectWizard.tsx', code);
