import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const eslintRoot = dirname(dirname(require.resolve('eslint')));
const eslintCli = join(eslintRoot, 'bin', 'eslint.js');
const eslintRun = spawnSync(
  process.execPath,
  [eslintCli, 'src/**/*.{ts,tsx}', '--format', 'json'],
  {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  },
);

if (eslintRun.error) {
  console.error(`Unable to run ESLint: ${eslintRun.error.message}`);
  process.exit(2);
}

if (eslintRun.status === 2) {
  process.stderr.write(eslintRun.stderr ?? 'ESLint configuration failed.\n');
  process.stdout.write(eslintRun.stdout ?? '');
  process.exit(2);
}

if (eslintRun.status !== 0 && eslintRun.status !== 1) {
  console.error(`ESLint exited unexpectedly with status ${eslintRun.status}.`);
  process.stderr.write(eslintRun.stderr ?? '');
  process.exit(2);
}

if (eslintRun.stderr) process.stderr.write(eslintRun.stderr);

let results;
try {
  results = JSON.parse(eslintRun.stdout);
} catch (error) {
  console.error(`Unable to read ESLint JSON output: ${error.message}`);
  process.stderr.write(eslintRun.stderr ?? '');
  process.exit(2);
}

if (!Array.isArray(results) || results.length === 0) {
  console.error('ESLint did not report any files in the declared src TypeScript/TSX scope.');
  process.exit(2);
}

const actual = {};
for (const result of results) {
  const file = relative(projectRoot, result.filePath).split(sep).join('/');
  for (const message of result.messages) {
    const rule = message.ruleId ?? (message.fatal ? '<fatal>' : '<configuration>');
    const severity = message.severity === 2 ? 'error' : 'warning';
    actual[file] ??= {};
    actual[file][rule] ??= { error: 0, warning: 0 };
    actual[file][rule][severity] += 1;
  }
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(join(projectRoot, '.eslint-baseline.json'), 'utf8'));
} catch (error) {
  console.error(`Unable to read .eslint-baseline.json: ${error.message}`);
  process.exit(2);
}

if (baseline.scope !== 'src/**/*.{ts,tsx}') {
  console.error(`Unexpected ESLint baseline scope: ${baseline.scope}`);
  process.exit(2);
}

const regressions = [];
let existingCount = 0;
let actualCount = 0;
for (const [file, rules] of Object.entries(actual)) {
  for (const [rule, counts] of Object.entries(rules)) {
    for (const severity of ['error', 'warning']) {
      const found = counts[severity];
      const allowed = baseline.counts[file]?.[rule]?.[severity] ?? 0;
      actualCount += found;
      existingCount += Math.min(found, allowed);
      if (found > allowed) regressions.push({ file, rule, severity, found, allowed });
    }
  }
}

const errors = Object.values(actual).reduce(
  (sum, rules) => sum + Object.values(rules).reduce((ruleSum, counts) => ruleSum + counts.error, 0),
  0,
);
const warnings = Object.values(actual).reduce(
  (sum, rules) => sum + Object.values(rules).reduce((ruleSum, counts) => ruleSum + counts.warning, 0),
  0,
);
console.log(`ESLint src baseline: ${regressions.length === 0 ? 'PASS' : 'FAIL'}; ${errors} errors, ${warnings} warnings; ${existingCount}/${actualCount} findings within baseline.`);

for (const regression of regressions) {
  console.error(`  ${regression.file} ${regression.rule} ${regression.severity}: ${regression.found} (baseline ${regression.allowed})`);
}

if (regressions.length > 0) process.exitCode = 1;
