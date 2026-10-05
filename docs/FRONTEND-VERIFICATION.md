# Frontend verification

Run these checks from the repository root with Node 22.x, after installing the
locked npm and Python dependencies:

```powershell
npm ci
python -m pip install -r ai_service/requirements.txt
npm run typecheck
npm run lint
npm test
python -m unittest discover -s ai_service/tests -p "test_*.py"
npm run check-icons
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run typecheck` is the TypeScript compiler check (`tsc --noEmit`).
`npm run lint` runs ESLint on `src/**/*.{ts,tsx}`, including the frontend tests
in that directory. It applies the recommended typescript-eslint rules and the
React Hooks `rules-of-hooks` and `exhaustive-deps` rules. The command compares
per-file, per-rule, per-severity counts against `.eslint-baseline.json`; it
fails when any count exceeds the recorded baseline. ESLint is still enabled for
all of these rules; the baseline records existing debt rather than suppressing
it. The initial baseline has 462 findings across 101 files. Reduce findings and
lower the baseline deliberately as files are cleaned up.

The baseline is a count ceiling. If an existing finding is removed and a new
finding with the same file, rule, and severity replaces it, that one-for-one
change is not detectable by this policy.

The lint scope does not include root tooling, `scripts/`, Python, or files
outside `src/`. It is a frontend source check, not a claim that every repository
file is linted. Keep the typecheck separate; a successful ESLint run does not
replace TypeScript verification.

GitHub Actions Quality runs Python unit/contract checks, `npm run typecheck`,
`npm run lint`, frontend tests, icon validation, production build, and Chromium
browser acceptance on Ubuntu and Windows.
