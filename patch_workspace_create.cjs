const fs = require('fs');
let code = fs.readFileSync('src/context/WorkspaceContext.tsx', 'utf-8');

code = code.replace(
  `createNewProject: (title: string, sportType: SportType) => void;`,
  `createNewProject: (title: string, sportType: SportType, initMatchInfo?: Partial<MatchInfo>, initTeams?: Team[]) => void;`
);

code = code.replace(
  `const createNewProject = (title: string, sportType: SportType) => {`,
  `const createNewProject = (title: string, sportType: SportType, customMatchInfo?: Partial<MatchInfo>, customTeams?: Team[]) => {`
);

code = code.replace(
  `    const initMatchInfo: MatchInfo = {
      scouterName: matchInfo.scouterName,
      nickname: matchInfo.nickname,
      matchName: '',
      matchType: 'Team',
      setOrGame: '1',
      currentPoint: 1,
      sportType: sportType
    };`,
  `    const initMatchInfo: MatchInfo = {
      scouterName: customMatchInfo?.scouterName ?? matchInfo.scouterName,
      nickname: customMatchInfo?.nickname ?? matchInfo.nickname,
      matchName: customMatchInfo?.matchName ?? '',
      matchType: customMatchInfo?.matchType ?? 'Team',
      setOrGame: customMatchInfo?.setOrGame ?? '1',
      currentPoint: customMatchInfo?.currentPoint ?? 1,
      sportType: sportType
    };
    
    const initialTeams = customTeams || DEFAULT_TEAMS;`
);

code = code.replace(
  `      teams: DEFAULT_TEAMS,`,
  `      teams: initialTeams,`
);

code = code.replace(
  `    setTeams(DEFAULT_TEAMS);`,
  `    setTeams(initialTeams);`
);

fs.writeFileSync('src/context/WorkspaceContext.tsx', code);
