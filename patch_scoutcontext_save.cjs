const fs = require('fs');
let code = fs.readFileSync('src/context/ScoutContext.tsx', 'utf-8');

code = code.replace(
`    setEvents(prev => {
      const nextEvents = [...prev, newRow];
      return nextEvents.map((e, index) => ({ ...e, no: index + 1 }));
    });`,
`    saveEventsWithHistory(prev => {
      const nextEvents = [...prev, newRow];
      return nextEvents.map((e, index) => ({ ...e, no: index + 1 }));
    });`
);

// Check if localStorageQuotaExceeded is bound multiple times
code = code.replace(/window\.addEventListener\('localStorageQuotaExceeded'/g, "// window.addEventListener('localStorageQuotaExceeded'");

fs.writeFileSync('src/context/ScoutContext.tsx', code);
