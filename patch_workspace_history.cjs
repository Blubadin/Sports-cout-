const fs = require('fs');
let code = fs.readFileSync('src/context/WorkspaceContext.tsx', 'utf-8');

code = code.replace(
  `const { 
    events, setEvents, 
    matchInfo, setMatchInfo, 
    teams, setTeams, 
    settings,
    setVideoSourceType, setYoutubeVideoId, setYoutubeUrl, setLocalFileName
  } = useScoutContext();`,
  `const { 
    events, setEvents, clearEventHistory,
    matchInfo, setMatchInfo, 
    teams, setTeams, 
    settings,
    setVideoSourceType, setYoutubeVideoId, setYoutubeUrl, setLocalFileName
  } = useScoutContext();`
);

code = code.replace(/setEvents\(\[\]\);/g, "setEvents([]); clearEventHistory();");
code = code.replace(/setEvents\(proj\.events\);/g, "setEvents(proj.events); clearEventHistory();");

fs.writeFileSync('src/context/WorkspaceContext.tsx', code);
