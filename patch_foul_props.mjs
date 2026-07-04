import fs from 'fs';

let content = fs.readFileSync('src/hooks/useProHUDMarkingController.ts', 'utf8');

content = content.replace(/selectArea\?: \(payload: AreaSelectionPayload\) => void;/, `selectArea?: (payload: AreaSelectionPayload) => void;
  selectFoul?: (foul: any) => void;
  sportTemplate?: any;`);

content = content.replace(/selectArea,\n\}: UseProHUDMarkingControllerProps\) \{/, `selectArea,
  selectFoul,
  sportTemplate,
}: UseProHUDMarkingControllerProps) {`);

fs.writeFileSync('src/hooks/useProHUDMarkingController.ts', content);

let content2 = fs.readFileSync('src/components/hud/ScoutHUDMode.tsx', 'utf8');

content2 = content2.replace(/selectArea,\n\s*\}\);/, `selectArea,
    selectFoul,
    sportTemplate,
  });`);

fs.writeFileSync('src/components/hud/ScoutHUDMode.tsx', content2);
