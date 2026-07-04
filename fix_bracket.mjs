import fs from 'fs';

let content = fs.readFileSync('src/hooks/useProHUDMarkingController.ts', 'utf8');

content = content.replace(/\}\s*else if \(menu === "result"\) \{/g, `}
      } else if (menu === "result") {`);

fs.writeFileSync('src/hooks/useProHUDMarkingController.ts', content);
