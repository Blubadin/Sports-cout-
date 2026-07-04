const fs = require('fs');
let code = fs.readFileSync('src/context/ScoutContext.tsx', 'utf-8');

code = code.replace(
  "canUndoEventAction: boolean;",
  "canUndoEventAction: boolean;\n  clearEventHistory: () => void;"
);

code = code.replace(
  "  const saveEventsWithHistory = (newEventsUpdater: React.SetStateAction<EventRow[]>) => {",
  `  const clearEventHistory = () => {
    setPastEvents([]);
    setFutureEvents([]);
  };

  const saveEventsWithHistory = (newEventsUpdater: React.SetStateAction<EventRow[]>) => {`
);

code = code.replace(
  "saveEventsWithHistory,",
  "saveEventsWithHistory, clearEventHistory,"
);

fs.writeFileSync('src/context/ScoutContext.tsx', code);
