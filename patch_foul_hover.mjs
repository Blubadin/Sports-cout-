import fs from 'fs';

let content = fs.readFileSync('src/hooks/useProHUDMarkingController.ts', 'utf8');

// Add hoveredFoul state
content = content.replace(/const \[hoveredTeam, setHoveredTeamState\] = useState<string \| null>\(null\);\n\s*const hoveredTeamRef = useRef<string \| null>\(null\);/, 
    `const [hoveredTeam, setHoveredTeamState] = useState<string | null>(null);
  const hoveredTeamRef = useRef<string | null>(null);
  const [hoveredFoul, setHoveredFoulState] = useState<string | null>(null);
  const hoveredFoulRef = useRef<string | null>(null);`);

content = content.replace(/const setHoveredTeam = useCallback\(\(val: string \| null\) => \{\n\s*setHoveredTeamState\(val\);\n\s*hoveredTeamRef\.current = val;\n\s*\}, \[\]\);/, 
    `const setHoveredTeam = useCallback((val: string | null) => {
    setHoveredTeamState(val);
    hoveredTeamRef.current = val;
  }, []);
  const setHoveredFoul = useCallback((val: string | null) => {
    setHoveredFoulState(val);
    hoveredFoulRef.current = val;
  }, []);`);

// Clear hoveredFoul
content = content.replace(/setHoveredTeam\(null\);\n\s*\}, \[\n\s*setHoveredSkill/, 
    `setHoveredTeam(null);
    setHoveredFoul(null);
  }, [
    setHoveredSkill`);
content = content.replace(/setHoveredTeam,\n\s*\]\);/, 
    `setHoveredTeam,
    setHoveredFoul,
  ]);`);

// Add to handlePointerMove
const teamExtract = `const hTeam =
        element.getAttribute("data-scout-hover-team") ||
        element
          .closest("[data-scout-hover-team]")
          ?.getAttribute("data-scout-hover-team");`;
          
const foulExtract = `const hFoul =
        element.getAttribute("data-scout-hover-foul") ||
        element
          .closest("[data-scout-hover-foul]")
          ?.getAttribute("data-scout-hover-foul");`;

content = content.replace(teamExtract, foulExtract + "\n      " + teamExtract);

const teamSet = `if (hTeam) {
        setHoveredTeam(hTeam);
      } else {
        setHoveredTeam(null);
      }`;
      
const foulSet = `if (hFoul) {
        setHoveredFoul(hFoul);
      } else {
        setHoveredFoul(null);
      }`;
content = content.replace(teamSet, foulSet + "\n      " + teamSet);

// Update dependencies
content = content.replace(/setHoveredTeam,\n\s*\]\,\n\s*\);/, `setHoveredTeam,\n      setHoveredFoul,\n    ],\n  );`);

// Update commitMarking
const foulCommit = `} else if (menu === "foul") {
        const hFoul = hoveredFoulRef.current;
        if (hFoul) {
          updateActionField("foulCode", hFoul);
        }`;
content = content.replace(/\} else if \(menu === "foul"\) \{\n\s*const hFoul = document\.querySelector\('\[data-scout-hover-foul\]'\);\n\s*if \(hFoul\) \{\n\s*const code = hFoul\.getAttribute\('data-scout-hover-foul'\);\n\s*\/\/ foul needs to be handled, but how\? updateActionField\("foulCode", code\)\n\s*if \(code\) \{\n\s*updateActionField\("foulCode", code\);\n\s*\}\n\s*\}/, foulCommit);

// Update return
content = content.replace(/hoveredTeam,\n\s*setHoveredSkill/, `hoveredTeam,\n    hoveredFoul,\n    setHoveredSkill`);

fs.writeFileSync('src/hooks/useProHUDMarkingController.ts', content);
