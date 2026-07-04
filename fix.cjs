const fs = require('fs');
let code = fs.readFileSync('src/components/MatchInfoModal.tsx', 'utf-8');
code = code.replace(`    setMatchInfo(prev => ({ 
      ...prev, 
      currentPoint: Math.max(1, prev.currentPoint + delta) 
    }));
  };`, `  const updatePoint = (delta: number) => {
    setMatchInfo(prev => ({ 
      ...prev, 
      currentPoint: Math.max(1, prev.currentPoint + delta) 
    }));
  };`);
fs.writeFileSync('src/components/MatchInfoModal.tsx', code);
