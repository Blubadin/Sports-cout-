import fs from 'fs';

let content = fs.readFileSync('src/components/hud/HUDFoulSelector.tsx', 'utf8');

content = content.replace(/key=\{f\.code\}\n\s*onClick=\{/, `key={f.code}
              data-scout-hover-foul={f.code}
              onClick={`);

fs.writeFileSync('src/components/hud/HUDFoulSelector.tsx', content);
