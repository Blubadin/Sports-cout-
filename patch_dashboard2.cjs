const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf-8');

code = code.replace(
  `      pieDataGlobal, pieDataTeamA, pieDataTeamB
    };
  }, [events, filterSport, teams]);`,
  `      pieDataGlobal, pieDataTeamA, pieDataTeamB,
      teamAFouls, teamBFouls
    };
  }, [events, filterSport, teams]);`
);

fs.writeFileSync('src/components/Dashboard.tsx', code);
