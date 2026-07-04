const fs = require('fs');
let code = fs.readFileSync('src/components/SettingsModal.tsx', 'utf-8');

code = code.replace(
  `            setConfirmConfig({
              message: \`พบข้อมูล \${eventsToImport.length} รายการ ยืนยันการแทนที่ข้อมูลปัจจุบัน?\`,
              onConfirm: () => {
                setEvents(eventsToImport);
                showToast('Import สำเร็จ');
                setConfirmConfig(null);
              }
            });`,
  `            setConfirmConfig({
              message: \`พบข้อมูล \${eventsToImport.length} รายการ ยืนยันการแทนที่ข้อมูลปัจจุบัน?\`,
              onConfirm: () => {
                const renumbered = eventsToImport.map((e: any, index: number) => ({...e, no: index + 1}));
                saveEventsWithHistory(renumbered);
                showToast('Import สำเร็จ');
                setConfirmConfig(null);
              }
            });`
);

code = code.replace(
  `  const { events, setEvents, matchInfo, setMatchInfo, teams, setTeams, updateTeam, settings, setSettings, resetSettings, showToast } = useScoutContext();`,
  `  const { events, setEvents, saveEventsWithHistory, matchInfo, setMatchInfo, teams, setTeams, updateTeam, settings, setSettings, resetSettings, showToast } = useScoutContext();`
);

fs.writeFileSync('src/components/SettingsModal.tsx', code);
