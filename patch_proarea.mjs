import fs from 'fs';

let content = fs.readFileSync('src/components/hud/ProAreaCommandPad.tsx', 'utf8');

// We want to replace the `if (sportType === "volleyball") { ... } else if (sportType === "basketball") { ... }` inside inner court mapping.

const regex = /\/\/ Inner Court mapping - normalize coordinates to inside-court frame[\s\S]*?(?=if \(payload && payload\.areaCode\))/m;

const newInnerMapping = `// Inner Court mapping - normalize coordinates to inside-court frame
      // Left/Right margin = 0.15, Top/Bottom margin = 0.15
      const cx = Math.max(0, Math.min(1, (rx - 0.15) / 0.70));
      const cy = Math.max(0, Math.min(1, (ry - 0.15) / 0.70));
      
      const isDetailed = settings?.areaPrecisionMode === 'detailed' || settings?.areaPrecisionMode === 'point'; // Point mode not fully supported yet, fallback to detailed

      if (sportType === "volleyball") {
        const teamA = "teamA";
        const teamB = "teamB";
        const leftCourtSide = flipCourtSide ? teamB : teamA;
        const rightCourtSide = flipCourtSide ? teamA : teamB;

        // Divided in Left court, NET, Right court
        if (cx < 0.46) {
          // Left side
          const colX = cx / 0.46;
          const rowCode = cy < 0.33 ? "L" : cy < 0.66 ? "C" : "R";
          let areaCode = "";
          if (isDetailed) {
             const colIdx = colX < 0.33 ? "1" : colX < 0.66 ? "2" : "1";
             const baseCol = colX < 0.66 ? "B" : "N";
             areaCode = rowCode + baseCol + "-" + colIdx;
          } else {
             const colCode = colX < 0.5 ? "B" : "N";
             areaCode = rowCode + colCode;
          }
          payload = { areaCode, courtSide: leftCourtSide, areaResolution: isDetailed ? "detailed" : "normal", areaMode: isDetailed ? "detailed" : "normal" };
        } else if (cx > 0.54) {
          // Right side
          const colX = (cx - 0.54) / 0.46;
          const rowCode = cy < 0.33 ? "R" : cy < 0.66 ? "C" : "L"; // Mirrored
          let areaCode = "";
          if (isDetailed) {
             const colIdx = colX < 0.33 ? "2" : colX < 0.66 ? "3" : "4";
             const baseCol = colX < 0.33 ? "N" : "B";
             areaCode = rowCode + baseCol + "-" + colIdx;
          } else {
             const colCode = colX < 0.5 ? "N" : "B";
             areaCode = rowCode + colCode;
          }
          payload = { areaCode, courtSide: rightCourtSide, areaResolution: isDetailed ? "detailed" : "normal", areaMode: isDetailed ? "detailed" : "normal" };
        } else {
          // NET
          payload = { areaCode: "NET", courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
        }
      } else if (sportType === "football") {
        if (isDetailed) {
           const r = Math.min(3, Math.floor(cy * 4));
           const c = Math.min(3, Math.floor(cx * 4));
           payload = { areaCode: \`F-\${r}-\${c}\`, courtSide: "neutral", areaResolution: "detailed", areaMode: "detailed" };
        } else {
          if (cy < 0.22) {
            const areaCode = cx > 0.33 && cx < 0.67 ? "GOAL" : "BOX";
            payload = { areaCode, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
          } else {
            const gridY = (cy - 0.22) / 0.78;
            const rowLabel = gridY < 0.33 ? "ATT" : gridY < 0.66 ? "MID" : "DEF";
            const colLabel = cx < 0.33 ? "L" : cx < 0.66 ? "C" : "R";
            payload = { areaCode: \`\${rowLabel}_\${colLabel}\`, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
          }
        }
      } else if (sportType === "badminton") {
        if (cy < 0.46) {
          const gridY = cy / 0.46;
          const rowCode = gridY < 0.33 ? "B" : gridY < 0.66 ? "M" : "F";
          const colCode = cx < 0.33 ? "R" : cx < 0.66 ? "C" : "L";
          payload = { areaCode: rowCode + colCode, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
        } else if (cy > 0.54) {
          const gridY = (cy - 0.54) / 0.46;
          const rowCode = gridY < 0.33 ? "F" : gridY < 0.66 ? "M" : "B";
          const colCode = cx < 0.33 ? "L" : cx < 0.66 ? "C" : "R";
          payload = { areaCode: rowCode + colCode, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
        } else {
          payload = { areaCode: "NET_ERR", courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
        }
      } else if (sportType === "basketball") {
        if (cy < 0.25) {
          const areaCode = cx > 0.33 && cx < 0.67 ? "PAINT" : cx < 0.33 ? "LEFT_WING" : "RIGHT_WING";
          payload = { areaCode, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
        } else if (cy >= 0.75) {
          payload = { areaCode: "THREE_PT", courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
        } else {
          const gridY = (cy - 0.25) / 0.50;
          const isTopRow = gridY < 0.5;
          let areaCode = "MID_RANGE";
          if (isTopRow) {
            areaCode = cx < 0.33 ? "LEFT_WING" : cx < 0.66 ? "TOP_KEY" : "RIGHT_WING";
          } else {
            areaCode = cx < 0.33 ? "LEFT_CORNER" : cx < 0.66 ? "MID_RANGE" : "RIGHT_CORNER";
          }
          payload = { areaCode, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
        }
      }
    }
    
    `;

content = content.replace(regex, newInnerMapping);
fs.writeFileSync('src/components/hud/ProAreaCommandPad.tsx', content);
