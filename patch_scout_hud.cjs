const fs = require('fs');
let code = fs.readFileSync('src/components/hud/ScoutHUDMode.tsx', 'utf-8');

code = code.replace(
  `import HUDResultSelector from "./HUDResultSelector";`,
  `import HUDResultSelector from "./HUDResultSelector";\nimport HUDFoulSelector from "./HUDFoulSelector";`
);

code = code.replace(
  `        {/* Right-Center for Result Rail */}`,
  `        {/* Top-Right for Foul Rail */}\n        <HUDFoulSelector isActive={!isProMarkingActive} />\n\n        {/* Right-Center for Result Rail */}`
);

fs.writeFileSync('src/components/hud/ScoutHUDMode.tsx', code);
