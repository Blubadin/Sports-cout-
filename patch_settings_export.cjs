const fs = require('fs');
let code = fs.readFileSync('src/components/SettingsModal.tsx', 'utf-8');

code = code.replace(
`  const handleExportData = () => {
    if (events.length === 0) return showToast('ไม่มีข้อมูลให้ Export');
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(events, null, 2));`,
`  const handleExportData = () => {
    if (events.length === 0) return showToast('ไม่มีข้อมูลให้ Export');
    const exportData = {
      schemaVersion: "1.0",
      app: "Sports Scout Logger",
      exportedAt: new Date().toISOString(),
      type: "events",
      events: events
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));`
);

fs.writeFileSync('src/components/SettingsModal.tsx', code);
