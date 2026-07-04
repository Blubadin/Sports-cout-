import fs from 'fs';

let content = fs.readFileSync('src/hooks/useProHUDMarkingController.ts', 'utf8');

const foulCommit = `} else if (menu === "foul") {
        const hFoul = hoveredFoulRef.current;
        if (hFoul) {
          const foulDef = sportTemplate?.fouls?.find(f => f.code === hFoul);
          if (foulDef && selectFoul) {
             selectFoul(foulDef);
          } else if (updateActionField) {
             updateActionField("foulCode", hFoul);
          }
        }`;
        
content = content.replace(/\} else if \(menu === "foul"\) \{\n\s*const hFoul = hoveredFoulRef\.current;\n\s*if \(hFoul\) \{\n\s*const foulDef = sportTemplate\?\.fouls\?\.find\(f => f\.code === hFoul\);\n\s*if \(foulDef\) \{\n\s*updateActionFields\(\{ foulCode: foulDef\.code, foulRole: foulDef\.role, foulSeverity: foulDef\.severity \}\);\n\s*\} else \{\n\s*updateActionField\("foulCode", hFoul\);\n\s*\}\n\s*\}/, foulCommit);

// Import selectFoul if needed from props?
// Wait, what does useProHUDMarkingController accept as props?
fs.writeFileSync('src/hooks/useProHUDMarkingController.ts', content);
