const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf-8');

if (!code.includes('courtConfig?: string')) {
  code = code.replace(
    /export type MatchInfo = {[\s\S]*?sportType: SportType;/m,
    match => match + "\n  courtConfig?: string;\n  gameFormat?: string;"
  );
  fs.writeFileSync('src/types.ts', code);
}
