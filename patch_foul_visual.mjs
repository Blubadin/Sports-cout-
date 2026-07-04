import fs from 'fs';

let content = fs.readFileSync('src/components/hud/ScoutHUDMode.tsx', 'utf8');

content = content.replace(/<HUDFoulSelector isActive=\{true\} \/>/, `<HUDFoulSelector isActive={true} hoveredFoul={hoveredFoul} />`);

fs.writeFileSync('src/components/hud/ScoutHUDMode.tsx', content);

let content2 = fs.readFileSync('src/components/hud/HUDFoulSelector.tsx', 'utf8');

content2 = content2.replace(/interface Props \{/, `interface Props {
  hoveredFoul?: string | null;`);
content2 = content2.replace(/export default function HUDFoulSelector\(\{ isActive = true \}: Props\) \{/, `export default function HUDFoulSelector({ isActive = true, hoveredFoul }: Props) {`);

content2 = content2.replace(/const isSelected = currentAction\.foulCode === f\.code;/, `const isSelected = currentAction.foulCode === f.code;
          const isHovered = hoveredFoul === f.code;`);

content2 = content2.replace(/className=\{\`w-full text-left px-2 py-1\.5 rounded-lg border text-\[10px\] sm:text-xs font-bold leading-tight transition-all \$\{/, `className={\`w-full text-left px-2 py-1.5 rounded-lg border text-[10px] sm:text-xs font-bold leading-tight transition-all \${`);

content2 = content2.replace(/isSelected\s*\?\s*\(isCard \? 'bg-red-500 border-red-400 text-white shadow-lg scale-105' : 'bg-amber-500 border-amber-400 text-white shadow-lg scale-105'\)\s*:\s*\(isCard \? 'bg-black\/50 border-red-900\/50 text-red-300 hover:bg-red-900\/30' : 'bg-black\/50 border-amber-900\/50 text-amber-300 hover:bg-amber-900\/30'\)/, 
`isSelected
                  ? (isCard ? 'bg-red-500 border-red-400 text-white shadow-lg scale-105' : 'bg-amber-500 border-amber-400 text-white shadow-lg scale-105')
                  : isHovered
                    ? (isCard ? 'bg-red-900/80 border-red-500 text-red-200 scale-105 shadow-[0_0_8px_rgba(239,68,68,0.5)] z-10' : 'bg-amber-900/80 border-amber-500 text-amber-200 scale-105 shadow-[0_0_8px_rgba(245,158,11,0.5)] z-10')
                    : (isCard ? 'bg-black/50 border-red-900/50 text-red-300 hover:bg-red-900/30' : 'bg-black/50 border-amber-900/50 text-amber-300 hover:bg-amber-900/30')`);

fs.writeFileSync('src/components/hud/HUDFoulSelector.tsx', content2);
