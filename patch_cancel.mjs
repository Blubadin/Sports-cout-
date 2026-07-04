import fs from 'fs';

let content = fs.readFileSync('src/hooks/useProHUDMarkingController.ts', 'utf8');

content = content.replace(/\} else if \(menu === "foul"\) \{\n\s*const hFoul = hoveredFoulRef\.current;\n\s*if \(hFoul\) \{\n\s*updateActionField\("foulCode", hFoul\);\n\s*\}/, `} else if (menu === "foul") {
        const hFoul = hoveredFoulRef.current;
        if (hFoul) {
          updateActionField("foulCode", hFoul);
          // Auto-commit foul if fast mode is enabled? Wait, standard is to wait for user to press Space or just save it.
          // In Pro HUD, standard actions auto-commit when result is selected. Foul might need to be explicitly saved with Result (e.g. Foul -> Point) or Space.
        }`);

fs.writeFileSync('src/hooks/useProHUDMarkingController.ts', content);
