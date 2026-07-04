const fs = require('fs');
let code = fs.readFileSync('src/components/hud/PhoneScoutMode.tsx', 'utf-8');

code = code.replace(
  `{results.map((res, idx) => {`,
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
              className={\`w-14 h-9 sm:w-16 sm:h-10 rounded-xl text-white font-black text-[10px] sm:text-xs uppercase shadow-lg active:scale-90 transition-all border-2 flex items-center justify-center break-words leading-tight px-1 \${isSelected ? (isCard ? 'bg-red-500 border-red-400' : 'bg-amber-500 border-amber-400') : (isCard ? 'bg-black/50 border-red-900/50 text-red-200' : 'bg-black/50 border-amber-900/50 text-amber-200')}\`}
            >
              {f.code}
            </button>
          );
        })}
        {results.map((res, idx) => {`
);

code = code.replace(
  `    commitResult,`,
  `    commitResult,\n    updateActionField,`
);

fs.writeFileSync('src/components/hud/PhoneScoutMode.tsx', code);
