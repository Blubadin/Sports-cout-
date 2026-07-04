const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf-8');

code = code.replace(
  `    let teamAOut = 0;
    let teamAPass = 0;`,
  `    let teamAOut = 0;
    let teamAPass = 0;
    let teamAFouls = 0;`
);

code = code.replace(
  `    let teamBOut = 0;
    let teamBPass = 0;`,
  `    let teamBOut = 0;
    let teamBPass = 0;
    let teamBFouls = 0;`
);

code = code.replace(
  `        e.actions.forEach(action => {
          totalActions++;
          const team = action.teamCode;`,
  `        e.actions.forEach(action => {
          totalActions++;
          const team = action.teamCode;
          if (action.foulCode) {
            if (team === teamA) teamAFouls++;
            if (team === teamB) teamBFouls++;
          }`
);

code = code.replace(
  `      teamADefensiveSkills,
      teamBTotalEvents,`,
  `      teamADefensiveSkills,
      teamAFouls,
      teamBTotalEvents,`
);

code = code.replace(
  `      teamBAttackingSkills,
      teamBDefensiveSkills
    };
  }, [events, filterSport, teams, settings.showDetailedAreaInDashboard]);`,
  `      teamBAttackingSkills,
      teamBDefensiveSkills,
      teamBFouls
    };
  }, [events, filterSport, teams, settings.showDetailedAreaInDashboard]);`
);

fs.writeFileSync('src/components/Dashboard.tsx', code);
