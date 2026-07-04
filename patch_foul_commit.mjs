import fs from 'fs';

let content = fs.readFileSync('src/hooks/useProHUDMarkingController.ts', 'utf8');

const foulCommit = `} else if (menu === "foul") {
        const hFoul = hoveredFoulRef.current;
        if (hFoul) {
          const foulDef = sportTemplate?.fouls?.find(f => f.code === hFoul);
          if (foulDef) {
             updateActionFields({ foulCode: foulDef.code, foulRole: foulDef.role, foulSeverity: foulDef.severity });
          } else {
             updateActionField("foulCode", hFoul);
          }
        }`;
        
content = content.replace(/\} else if \(menu === "foul"\) \{\n\s*const hFoul = hoveredFoulRef\.current;\n\s*if \(hFoul\) \{\n\s*updateActionField\("foulCode", hFoul\);\n\s*\}/, foulCommit);

fs.writeFileSync('src/hooks/useProHUDMarkingController.ts', content);
