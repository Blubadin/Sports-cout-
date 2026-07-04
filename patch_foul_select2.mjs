import fs from 'fs';

let content = fs.readFileSync('src/hooks/useProHUDMarkingController.ts', 'utf8');

const foulCommit = `} else if (menu === "foul") {
        const hFoul = hoveredFoulRef.current;
        if (hFoul) {
          const foulDef = sportTemplate?.fouls?.find((f: any) => f.code === hFoul);
          if (foulDef && typeof selectFoul === 'function') {
             selectFoul(foulDef);
          } else if (typeof updateActionField === 'function') {
             updateActionField("foulCode", hFoul);
          }
        }`;

content = content.replace(/\} else if \(menu === "foul"\) \{\n\s*const hFoul = hoveredFoulRef\.current;\n\s*if \(hFoul\) \{\n\s*updateActionField\("foulCode", hFoul\);\n\s*\/\/ Auto-commit foul if fast mode is enabled\? Wait, standard is to wait for user to press Space or just save it\.\n\s*\/\/ In Pro HUD, standard actions auto-commit when result is selected\. Foul might need to be explicitly saved with Result \(e\.g\. Foul -> Point\) or Space\.\n\s*\}\n\s*\}/m, foulCommit);

fs.writeFileSync('src/hooks/useProHUDMarkingController.ts', content);
