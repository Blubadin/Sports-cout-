const fs = require('fs');
let code = fs.readFileSync('src/components/hud/HUDTopStatsBar.tsx', 'utf-8');

code = code.replace(
`  const isLocked = events.length > 0;

  return (`,
`  const isLocked = events.length > 0;

  useEffect(() => {
    if (isLocked && showSportSelector) {
      setShowSportSelector(false);
    }
  }, [isLocked, showSportSelector]);

  return (`);

code = code.replace(`import { useState } from "react";`, `import { useState, useEffect } from "react";`);

fs.writeFileSync('src/components/hud/HUDTopStatsBar.tsx', code);
