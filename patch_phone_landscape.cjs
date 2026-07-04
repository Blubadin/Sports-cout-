const fs = require('fs');
let code = fs.readFileSync('src/components/hud/PhoneLandscapeGamepadMode.tsx', 'utf-8');

code = code.replace(
  `{results.slice(0, 3).map((res, idx) => {`,
  `{(sportTemplate.fouls || []).map(f => {
            const isSelected = currentAction.foulCode === f.code;
            const isCard = f.severity === 'card' || f.severity === 'technical';
            return (
              <button
                key={f.code}
                onClick={() => {
                  setControlsVisible(true);
                  if (isSelected) {
                    updateActionField('foulCode', undefined);
                    updateActionField('foulRole', undefined);
                    updateActionField('foulSeverity', undefined);
                  } else {
                    updateActionField('foulCode', f.code);
                    updateActionField('foulRole', f.role);
                    updateActionField('foulSeverity', f.severity);
                  }
                }}
                className={\`w-[58px] h-[38px] rounded-lg text-white font-black text-[10px] uppercase shadow-lg active:scale-90 transition-all border break-words leading-tight px-1 \${isSelected ? (isCard ? 'bg-red-500 border-red-400' : 'bg-amber-500 border-amber-400') : (isCard ? 'bg-black/50 border-red-900/50 text-red-200' : 'bg-black/50 border-amber-900/50 text-amber-200')}\`}
              >
                {f.code}
              </button>
            );
          })}
          {results.slice(0, 3).map((res, idx) => {`
);

code = code.replace(
  `    commitResult,`,
  `    commitResult,\n    updateActionField,`
);

fs.writeFileSync('src/components/hud/PhoneLandscapeGamepadMode.tsx', code);
