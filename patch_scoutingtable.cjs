const fs = require('fs');
let code = fs.readFileSync('src/components/ScoutingTable.tsx', 'utf-8');

// Add icons import
code = code.replace(
  `import { Trash2, Copy, Download, FileJson, CopyCheck, Type, Play, Pencil } from 'lucide-react';`,
  `import { Trash2, Copy, Download, FileJson, CopyCheck, Type, Play, Pencil, Undo2, Redo2 } from 'lucide-react';`
);

// Get properties from context
code = code.replace(
  `const { events, setEvents, deleteEventRow, updateEventRow, setSeekRequest, settings, showToast } = useScoutContext();`,
  `const { events, setEvents, deleteEventRow, updateEventRow, setSeekRequest, settings, showToast, canUndoEventAction, canRedoEventAction, undoEventAction, redoEventAction } = useScoutContext();`
);

// Add undo/redo buttons and delete confirm
code = code.replace(
  `<div className="flex gap-2 items-center">
          <ExportButtons events={events} />`,
  `<div className="flex gap-2 items-center">
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 border border-gray-200 dark:border-gray-700">
            <button 
              onClick={undoEventAction} 
              disabled={!canUndoEventAction}
              className={\`p-1.5 rounded-md transition-colors \${canUndoEventAction ? 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 cursor-pointer shadow-sm' : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'}\`}
              title="Undo Event Action"
            >
              <Undo2 size={14} />
            </button>
            <button 
              onClick={redoEventAction} 
              disabled={!canRedoEventAction}
              className={\`p-1.5 rounded-md transition-colors \${canRedoEventAction ? 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 cursor-pointer shadow-sm' : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'}\`}
              title="Redo Event Action"
            >
              <Redo2 size={14} />
            </button>
          </div>
          <ExportButtons events={events} />`
);

// Add delete confirmation for single rows (desktop)
code = code.replace(
`                      <button 
                        onClick={() => {
                          deleteEventRow(row.id);
                          showToast(settings.uiLanguage === 'th' ? \`ลบซีเควนซ์ที่ \${row.no} เรียบร้อยแล้ว\` : \`Sequence #\${row.no} has been deleted\`);
                        }}`,
`                      <button 
                        onClick={() => {
                          const confirmDelete = window.confirm(settings.uiLanguage === 'th' ? 'ต้องการลบรายการนี้ใช่หรือไม่? การกระทำนี้สามารถ Undo ได้' : 'Delete this event? You can undo this action.');
                          if (confirmDelete) {
                            deleteEventRow(row.id);
                            showToast(settings.uiLanguage === 'th' ? \`ลบซีเควนซ์ที่ \${row.no} เรียบร้อยแล้ว\` : \`Sequence #\${row.no} has been deleted\`);
                          }
                        }}`
);

// Add delete confirmation for single rows (mobile)
code = code.replace(
`                  <button 
                    onClick={() => {
                      deleteEventRow(row.id);
                      showToast(settings.uiLanguage === 'th' ? \`ลบซีเควนซ์ที่ \${row.no} เรียบร้อยแล้ว\` : \`Sequence #\${row.no} has been deleted\`);
                    }}`,
`                  <button 
                    onClick={() => {
                      const confirmDelete = window.confirm(settings.uiLanguage === 'th' ? 'ต้องการลบรายการนี้ใช่หรือไม่? การกระทำนี้สามารถ Undo ได้' : 'Delete this event? You can undo this action.');
                      if (confirmDelete) {
                        deleteEventRow(row.id);
                        showToast(settings.uiLanguage === 'th' ? \`ลบซีเควนซ์ที่ \${row.no} เรียบร้อยแล้ว\` : \`Sequence #\${row.no} has been deleted\`);
                      }
                    }}`
);

// Update Export JSON logic to include metadata versioning
code = code.replace(
`  const exportJSON = () => {
    if (events.length === 0) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(events, null, 2));`,
`  const exportJSON = () => {
    if (events.length === 0) return;
    const exportData = {
      schemaVersion: "1.0",
      app: "Sports Scout Logger",
      exportedAt: new Date().toISOString(),
      type: "events",
      events: events
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));`
);

fs.writeFileSync('src/components/ScoutingTable.tsx', code);
