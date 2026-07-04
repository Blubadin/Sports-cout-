const fs = require('fs');
let code = fs.readFileSync('src/context/ScoutContext.tsx', 'utf-8');

code = code.replace(
  "canUndoEventAction: boolean;",
  "canUndoEventAction: boolean;\n  saveEventsWithHistory: (updater: React.SetStateAction<EventRow[]>) => void;"
);

code = code.replace(
  "events, setEvents,",
  "events, setEvents, saveEventsWithHistory,"
);

fs.writeFileSync('src/context/ScoutContext.tsx', code);
