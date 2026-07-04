import fs from 'fs';

let content = fs.readFileSync('src/components/hud/ProAreaCommandPad.tsx', 'utf8');

const regex = /className=\{\`relative w-full aspect-\[\4\/3\] sm:aspect-\[1\.4\/1\] bg-slate-900\/60 border border-white\/10 rounded-2xl p-4 flex flex-col justify-between overflow-hidden select-none\`\}\s*>/m;

// Find rx and ry logic to reuse
const ptrRegex = /let rx = \(pointerX - containerRect\.left\) \/ containerRect\.width;\s*let ry = \(pointerY - containerRect\.top\) \/ containerRect\.height;/m;

// Add local state for rx/ry for the pointer
content = content.replace(ptrRegex, `let rx = (pointerX - containerRect.left) / containerRect.width;
    let ry = (pointerY - containerRect.top) / containerRect.height;
    
    setLocalRx(rx);
    setLocalRy(ry);
`);

// Add state definition
content = content.replace(/const \[hoveredPayload, setHoveredPayload\] = useState/, `const [localRx, setLocalRx] = useState(0.5);
  const [localRy, setLocalRy] = useState(0.5);
  const [hoveredPayload, setHoveredPayload] = useState`);

// Render the pointer
const pointerDiv = `className={\`relative w-full aspect-[4/3] sm:aspect-[1.4/1] bg-slate-900/60 border border-white/10 rounded-2xl p-4 flex flex-col justify-between overflow-hidden select-none\`}
    >
      {/* Pointer Highlight */}
      <div 
        className="absolute w-8 h-8 rounded-full bg-amber-500/20 border-2 border-amber-400/60 pointer-events-none z-50 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center shadow-[0_0_10px_rgba(245,158,11,0.5)] backdrop-blur-[2px]"
        style={{ left: \`\${localRx * 100}%\`, top: \`\${localRy * 100}%\` }}
      >
        <div className="w-1 h-1 bg-amber-300 rounded-full" />
      </div>`;

content = content.replace(/className=\{\`relative w-full aspect-\[4\/3\] sm:aspect-\[1\.4\/1\] bg-slate-900\/60 border border-white\/10 rounded-2xl p-4 flex flex-col justify-between overflow-hidden select-none\`\}\s*>/m, pointerDiv);

fs.writeFileSync('src/components/hud/ProAreaCommandPad.tsx', content);
