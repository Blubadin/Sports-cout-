# AGENTS.md — SportsScout Engineering & Contribution Rules

## 1. Product Mission & Priority
- **Scouting-First**: SportsScout is primarily a match scouting, video analysis, and tactical review workstation (`Scout → Review → Analyze → Report`).
- **Labs are Extensions**: Labs (such as Badminton Tracking Lab) are specialized experimental extensions. Never convert the core app into a generic AI workbench, training tool, or biomechanics suite.
- **Preserve Workstation Visual Identity**: Maintain professional, high-density dark workstation UI (`#0b1219` / slate accents) with clear typography and tactile feedback.

## 2. Branch & Git Governance
- **No Direct Changes to `main`**: All work happens on the milestone branch specified by the project owner (currently: `feat/desktop-tauri-workstation`). Never push, open PRs, or merge without explicit user instruction.
- **Step-by-Step Phased Execution**: Execute strictly ONE phase or task at a time. Run verification, fix regressions, commit, report SHA and test results, then STOP.

## 3. Real Production Tracking & Integrity
- **Real Video Tracking Only**: Production tracking pipelines must use real video decodes, observed ByteTrack MOT identifiers, and real YOLO detections/poses.
- **Synthetic Data Protection**: Demo/synthetic data is for disconnected simulation only. Synthetic frames must never be saved to IndexedDB or presented as real analysis.
- **MOT Identity vs Sports Identity**: Tracker trackId (ByteTrack MOT ID) must remain distinct from SportsScout player identity (P1..P4). Never substitute `trackId = playerId`.

## 4. Scientific Claim Limitations
- **2D Pose Estimates Only**: Body keypoints and derived angles from monocular video are 2D pixel estimates.
- **No False Biomechanics Claims**: Never claim true 3D kinematics, ground reaction forces, joint torques, or absolute vertical jump heights from standard 2D camera footage.

## 5. Scope Gates
- **Phase Auditing**: Do not begin Shuttle Tracking, Dataset Export, or Model Fine-Tuning phases without explicit requirement audit and user approval.
- **Verification Rule**: After every phase, run TypeScript checks, ESLint, Vitest, and Python unittests. Ensure zero regressions before proceeding.

## 6. Evidence & Benchmark Integrity
- **No Fabricated Evidence**: Never synthesize predictions from ground truth (e.g. adding constant offsets or jitter) or fabricate reviewer/approver identities, blind review badges, or sign-offs.
- **No False Verification or Certification Claims**: Any test, gate, or benchmark that has not been executed live in the current cycle must be recorded as `NOT RUN` with a clear reason. Never state `PASS` or `CERTIFIED` without live, repeatable execution evidence.
- **Synthetic Evaluator Self-Tests**: Evaluator self-tests or synthetic pipeline benchmarks used for verification must explicitly declare `evidenceKind: "SYNTHETIC_SELFTEST"` and `certificationValid: false` to avoid misrepresentation as real evaluation.
