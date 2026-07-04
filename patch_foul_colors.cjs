const fs = require('fs');
let code = fs.readFileSync('src/components/hud/HUDFoulSelector.tsx', 'utf-8');

code = code.replace(
  "                  ? \\`bg-\\${baseColor}-500 text-white border-\\${baseColor}-400 shadow-[0_0_15px_rgba(var(--\\${baseColor}-500),0.5)]\\` \n                  : \\`bg-black/40 text-\\${baseColor}-200/80 border-\\${baseColor}-900/50 hover:bg-\\${baseColor}-900/30\\`",
  "                  ? (isCard ? 'bg-red-500 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-amber-500 text-white border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)]')\n                  : (isCard ? 'bg-black/40 text-red-200/80 border-red-900/50 hover:bg-red-900/30' : 'bg-black/40 text-amber-200/80 border-amber-900/50 hover:bg-amber-900/30')"
);

fs.writeFileSync('src/components/hud/HUDFoulSelector.tsx', code);
