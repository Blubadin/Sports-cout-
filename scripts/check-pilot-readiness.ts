import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluatePilotReadiness, type PilotEvidence } from '../src/pilot/pilotReadiness';

const evidencePath = resolve(process.argv[2] ?? 'docs/pilot/pilot-evidence.json');
const fileInfo = await stat(evidencePath);
if (fileInfo.size > 1_000_000) throw new Error('Pilot evidence file exceeds 1 MB');

const evidence = JSON.parse(await readFile(evidencePath, 'utf8')) as PilotEvidence;
const report = evaluatePilotReadiness(evidence);
console.log(JSON.stringify(report, null, 2));

if (report.status !== 'pilot-ready') {
  console.error(`Pilot gate blocked: ${report.pendingCount} required result(s) are pending or below target.`);
  process.exitCode = 1;
}
