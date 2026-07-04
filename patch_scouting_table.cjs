const fs = require('fs');
let code = fs.readFileSync('src/components/ScoutingTable.tsx', 'utf-8');

code = code.replace(
  `const { events, setEvents, deleteEventRow, updateEventRow, setSeekRequest, settings, showToast, canUndoEventAction, canRedoEventAction, undoEventAction, redoEventAction } = useScoutContext();`,
  `const { events, setEvents, saveEventsWithHistory, deleteEventRow, updateEventRow, setSeekRequest, settings, showToast, canUndoEventAction, canRedoEventAction, undoEventAction, redoEventAction } = useScoutContext();`
);

code = code.replace(
  `  const duplicateRow = (row: EventRow) => {
    setEvents(prev => {`,
  `  const duplicateRow = (row: EventRow) => {
    saveEventsWithHistory(prev => {`
);

code = code.replace(
  `                <button 
                  onClick={() => {
                    setEvents([]);
                    setShowDeleteAllModal(false);
                    showToast(settings.uiLanguage === 'th' ? 'ลบข้อมูลทั้งหมดเรียบร้อย' : 'All events deleted');
                  }}`,
  `                <button 
                  onClick={() => {
                    saveEventsWithHistory([]);
                    setShowDeleteAllModal(false);
                    showToast(settings.uiLanguage === 'th' ? 'ลบข้อมูลทั้งหมดเรียบร้อย' : 'All events deleted');
                  }}`
);

fs.writeFileSync('src/components/ScoutingTable.tsx', code);
