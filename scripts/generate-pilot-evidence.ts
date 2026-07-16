import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPilotEvidenceTemplate } from '../src/pilot/pilotReadiness';

const outputPath = resolve(process.argv[2] ?? 'docs/pilot/pilot-evidence.json');
await writeFile(outputPath, `${JSON.stringify(createPilotEvidenceTemplate(), null, 2)}\n`, 'utf8');
console.log(`Created pending Pilot evidence: ${outputPath}`);
