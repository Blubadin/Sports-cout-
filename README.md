# SPORTSCOUT

คู่มือ Pilot สำหรับโค้ช: [เริ่มใช้งาน SPORTSCOUT](docs/COACH_QUICK_GUIDE_TH.md)

QA และ Design: [Hardware/Pilot Protocol](docs/pilot/HARDWARE_QA_TH.md) · [Overall Readiness Audit](docs/pilot/OVERALL_READINESS_AUDIT_TH.md) · [GridGeist สำหรับ SPORTSCOUT](docs/GRIDGEIST_USAGE_TH.md)

Project Overview

Sports Scout Logger เป็นเว็บแอปสำหรับบันทึกและวิเคราะห์ข้อมูลการแข่งขันกีฬาแบบ Scouting / Game Analysis โดยออกแบบมาเพื่อใช้กับงานของโค้ช อาจารย์ นักศึกษา และนักวิเคราะห์เกมกีฬา

ระบบรองรับการดูวิดีโอการแข่งขันจากไฟล์วิดีโอในเครื่อง หรือ YouTube และสามารถบันทึกเหตุการณ์สำคัญระหว่างการแข่งขัน เช่น ทักษะที่เกิดขึ้น พื้นที่ในสนาม ทีม ผู้เล่น ผลลัพธ์ และข้อมูลประกอบอื่น ๆ เพื่อนำไปวิเคราะห์ต่อใน Dashboard, ตารางข้อมูล, Heatmap, Sequence Map และ Export ข้อมูลออกไปใช้งานภายนอก

โปรเจคนี้ยังไม่มีระบบ AI วิเคราะห์วิดีโออัตโนมัติ และยังไม่มี backend/database/login ข้อมูลโปรเจกต์หลักเก็บแบบ local-first ใน IndexedDB ส่วนการตั้งค่าขนาดเล็กและ legacy recovery backup ยังใช้ localStorage โดยจะไม่ลบข้อมูลเก่าระหว่างช่วง Pilot

---

Current Goal

เป้าหมายของโปรเจคในระยะนี้คือทำให้ระบบ Sports Scouting ใช้งานได้เสถียรขึ้นสำหรับการทดสอบจริง โดยเน้น 4 เรื่องหลัก:

1. ความถูกต้องของข้อมูลที่บันทึก
2. การใช้งานจริงระหว่างดูวิดีโอและบันทึกเหตุการณ์
3. การดูผลลัพธ์ผ่าน Dashboard / Table / Chart
4. ความพร้อมในการต่อยอดไปสู่ระบบ production หรือระบบของมหาวิทยาลัยในอนาคต

---

Tech Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- Recharts
- ReactPlayer
- PWA
- IndexedDB (`idb-keyval`) สำหรับ project/session data
- localStorage สำหรับ settings และ legacy recovery backup

---

Main Features

Video

- รองรับ Local Video Upload
- รองรับ YouTube URL
- มีระบบควบคุมวิดีโอ เช่น play/pause, seek, speed, volume, brightness
- รองรับการใช้งานร่วมกับการกด shortcut / HUD mode

Scouting

- บันทึกเหตุการณ์ระหว่างการแข่งขัน
- เลือกทีม
- เลือกกีฬา
- เลือกทักษะ
- เลือกพื้นที่สนาม
- เลือกผลลัพธ์
- รองรับ multi-sport template

Sports Supported

- Volleyball
- Football
- Badminton
- Basketball

Analysis

- Dashboard summary
- Skill frequency chart
- Result distribution
- Team comparison
- Field / court sequence map
- Heatmap
- Event table
- Export / Import JSON
- Export CSV

Interface

- Normal Input Panel
- HUD Mode
- Phone Scout Mode
- Phone Landscape / Gamepad Mode
- Dark mode
- Thai / English language support
- PWA installable

---

Important Architecture

Core Files

- "src/App.tsx"
  Main application entry

- "src/context/ScoutContext.tsx"
  Main scouting state, events, teams, sport type, current action, saving, undo/redo, validation

- "src/context/WorkspaceContext.tsx"
  Project/workspace state, active project, create/delete/import/export project

- "src/types.ts"
  Main TypeScript types for Event, Action, SportTemplate, Team, MatchInfo, Settings

- "src/sports.ts"
  Sport-specific templates such as skills, results, areas, and sport configuration

- "src/components/InputPanel.tsx"
  Normal scouting input UI

- "src/components/ScoutingTable.tsx"
  Event table, export, edit/delete/duplicate events

- "src/components/Dashboard.tsx"
  Summary dashboard and charts

- "src/components/VideoPlayer.tsx"
  Video playback UI and controls

- "src/components/hud/"
  HUD-related components for full-screen / mobile scouting modes

- "src/utils/projectRepository.ts"
  IndexedDB project repository, migration, retry และ recovery envelope

- "src/hooks/useLocalStorage.ts"
  localStorage helper สำหรับ settings/legacy backup และ quota handling

---

Current Data Model

Event

An event represents a saved scouting moment.

Typical fields include:

- id
- timestamp
- videoTime
- sportType
- team
- teamCode
- actions
- notes

Action

An action represents one scouting action inside an event.

Typical fields include:

- no
- teamCode
- skillCode
- resultCode
- areaCode
- areaResolution
- gridX
- gridY
- pointX
- pointY
- outZone
- descriptor
- notes

Project

A project contains a match/session.

Typical fields include:

- id
- title
- sportType
- events
- teams
- matchInfo
- createdAt
- updatedAt

---

Phase 10 Status

Phase 10 focused on Stabilization & Data Integrity.

Implemented items:

1. Sport Locking
   
   - Prevent changing sport after events exist
   - Protect against sport mismatch and corrupted event data

2. Event Validation
   
   - Prevent saving incomplete events
   - Required fields include team, skill, area, and result depending on sport/action flow

3. Undo / Redo
   
   - Basic undo/redo support for event operations
   - Should cover save, delete, and edit events

4. JSON Schema Versioning
   
   - Export JSON now supports schemaVersion
   - Import should support both new schema and legacy array format

5. Confirmation Dialogs
   
   - Confirm before deleting event
   - Confirm before deleting project

6. localStorage Quota Handling
   
   - Warn users when browser storage is full or near full
   - Avoid silent data loss

---

Known Issues / Areas To Verify

Before adding more features, always verify:

1. "saveEvent()" should use undo/redo-safe state update.
2. "setEvents()" direct calls should be avoided for important event operations.
3. "ScoutingTable.tsx" duplicate/delete all actions should not bypass undo/redo history.
4. "SettingsModal.tsx" import logic should sanitize and renumber events.
5. "ScoutContext.tsx" should not have duplicate localStorage quota event listeners.
6. Sport locking must work from all UI entry points, including HUD.
7. Importing old JSON files must still work.
8. Export CSV must not break after JSON schema changes.
9. HUD mode must still work after validation changes.
10. Dashboard should not crash when events are empty or incomplete.

---

Phase 11 Direction

Phase 11 should focus on adding a Foul / Violation category and verifying Dashboard/Table usefulness.

Main goals:

1. Add foul metadata to action/event model.
2. Add sport-specific foul templates.
3. Add foul selection in Normal Input.
4. Add foul selection/display in HUD.
5. Show foul data in ScoutingTable.
6. Add foul summary to Dashboard.
7. Preserve backward compatibility with old events.
8. Keep foul optional; do not force every event to have foul data.

---

Recommended Foul Data Model

Foul should be optional metadata of an action, not a replacement for skill or result.

Recommended fields in Action:

foulCode?: string;
foulRole?: 'committed' | 'drawn' | 'violation' | 'technical';
foulSeverity?: 'normal' | 'warning' | 'card' | 'technical';

Recommended new types:

export type FoulRole = 'committed' | 'drawn' | 'violation' | 'technical';

export type FoulSeverity = 'normal' | 'warning' | 'card' | 'technical';

export interface FoulOption {
  code: string;
  label: string;
  labelTh?: string;
  role?: FoulRole;
  severity?: FoulSeverity;
}

Recommended SportTemplate addition:

fouls?: FoulOption[];

---

Suggested Fouls By Sport

Volleyball

- NET_TOUCH: แตะเน็ต
- FOOT_FAULT: เหยียบเส้น
- ROTATION: ผิดตำแหน่งหมุน
- DOUBLE: สัมผัสสองครั้ง
- FOUR_HITS: เล่นเกิน 3 ครั้ง / 4 hits
- CARRY: อุ้มบอล / พักบอล

Football

- FOUL: ทำฟาวล์
- HANDBALL: แฮนด์บอล
- OFFSIDE: ล้ำหน้า
- YELLOW: ใบเหลือง
- RED: ใบแดง
- PENALTY: เสียจุดโทษ

Badminton

- SERVICE_FAULT: เสิร์ฟผิดกติกา
- NET_TOUCH: แตะเน็ต
- DOUBLE_HIT: ตีสองครั้ง
- CARRY: พักลูก / อุ้มลูก
- WRONG_COURT: ยืนผิดตำแหน่ง

Basketball

- PERSONAL: ฟาวล์บุคคล
- OFFENSIVE: ฟาวล์รุก
- SHOOTING: ฟาวล์ขณะยิง
- TECHNICAL: ฟาวล์เทคนิค
- UNSPORT: ฟาวล์ไม่มีน้ำใจนักกีฬา
- TRAVEL: เดิน
- DOUBLE_DRIBBLE: เลี้ยงสองครั้ง

---

AI Studio Working Rules

When using Google AI Studio, follow these rules:

1. Always inspect the existing files before editing.
2. Do not rewrite the whole app.
3. Do not remove existing HUD modes.
4. Do not remove Thai/English language support.
5. Do not remove multi-sport support.
6. Do not change the main data model unless necessary.
7. Keep backward compatibility with existing localStorage data and JSON exports.
8. Do not add backend, database, login, AI tracking, Electron, or Tauri unless explicitly requested.
9. Prefer small, safe changes.
10. After editing, always run:

- "npm run lint"
- "npm run build"

11. Report changed files clearly.
12. Report remaining risks clearly.

---

Build Commands

Interface feature flag:

- Classic UI เป็นค่าเริ่มต้นสำหรับ Pilot
- Workstation UI เปิดแบบ opt-in ด้วย `VITE_ENABLE_WORKSTATION=true`
- ทั้งสอง interface ต้องอ่านและเขียนผ่าน project/event data layer ชุดเดียวกัน

Install dependencies:

npm install

Run development server:

npm run dev

Run lint:

npm run lint

Build production:

npm run build

---

Recommended Manual Test Flow

1. Create a new Volleyball project.
2. Record 3 complete events.
3. Try changing sport to Basketball; it should be blocked.
4. Save an incomplete event; it should be blocked.
5. Delete one event and undo it.
6. Redo the deleted event.
7. Export JSON.
8. Import JSON back.
9. Export CSV.
10. Open Dashboard.
11. Switch Thai/English language.
12. Test HUD mode.
13. Test local video.
14. Test YouTube video.
15. Confirm build passes.
