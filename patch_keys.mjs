import fs from 'fs';

let content = fs.readFileSync('src/hooks/useProHUDMarkingController.ts', 'utf8');

content = content.replace(/export type MarkingMenuType = "none" \| "team" \| "skill" \| "area" \| "result";/, 
    'export type MarkingMenuType = "none" | "team" | "skill" | "area" | "result" | "foul";');

content = content.replace(/if \(e\.code === "KeyQ"\) \{\s*e\.preventDefault\(\);\s*if \(isHoldMode\) \{\s*setActiveMenu\("skill"\);\s*\} else \{\s*setActiveMenu\(activeMenuRef\.current === "skill" \? "none" : "skill"\);\s*\}\s*\}/, 
    `if (e.code === "KeyQ") {
        e.preventDefault();
        if (isHoldMode) {
          setActiveMenu("area");
        } else {
          setActiveMenu(activeMenuRef.current === "area" ? "none" : "area");
        }
      }`);

content = content.replace(/if \(e\.code === "KeyW"\) \{\s*e\.preventDefault\(\);\s*if \(isHoldMode\) \{\s*setActiveMenu\("area"\);\s*\} else \{\s*setActiveMenu\(activeMenuRef\.current === "area" \? "none" : "area"\);\s*\}\s*\}/, 
    `if (e.code === "KeyW") {
        e.preventDefault();
        if (isHoldMode) {
          setActiveMenu("skill");
        } else {
          setActiveMenu(activeMenuRef.current === "skill" ? "none" : "skill");
        }
      }`);
      
const keyupReplace = `if (e.code === "KeyQ" && activeMenuRef.current === "area") {
        commitMarking("area");
      } else if (e.code === "KeyW" && activeMenuRef.current === "skill") {
        commitMarking("skill");`;
content = content.replace(/if \(e\.code === "KeyQ" && activeMenuRef\.current === "skill"\) \{\s*commitMarking\("skill"\);\s*\} else if \(e\.code === "KeyW" && activeMenuRef\.current === "area"\) \{\s*commitMarking\("area"\);/, keyupReplace);

const foulKeyMap = `if (e.code === "KeyE") {
        e.preventDefault();
        if (isHoldMode) {
          setActiveMenu("result");
        } else {
          setActiveMenu(activeMenuRef.current === "result" ? "none" : "result");
        }
      }

      if (e.code === "KeyR" || e.code === "KeyF") {
        e.preventDefault();
        if (isHoldMode) {
          setActiveMenu("foul");
        } else {
          setActiveMenu(activeMenuRef.current === "foul" ? "none" : "foul");
        }
      }`;

content = content.replace(/if \(e\.code === "KeyE"\) \{\s*e\.preventDefault\(\);\s*if \(isHoldMode\) \{\s*setActiveMenu\("result"\);\s*\} else \{\s*setActiveMenu\(activeMenuRef\.current === "result" \? "none" : "result"\);\s*\}\s*\}/, foulKeyMap);

const foulKeyUpMap = `} else if (e.code === "KeyE" && activeMenuRef.current === "result") {
        commitMarking("result");
      } else if ((e.code === "KeyR" || e.code === "KeyF") && activeMenuRef.current === "foul") {
        commitMarking("foul");`;
content = content.replace(/\} else if \(e\.code === "KeyE" && activeMenuRef\.current === "result"\) \{\s*commitMarking\("result"\);/, foulKeyUpMap);

// Add foul to commitMarking
const foulCommit = `} else if (menu === "foul") {
        const hFoul = document.querySelector('[data-scout-hover-foul]');
        if (hFoul) {
          const code = hFoul.getAttribute('data-scout-hover-foul');
          // foul needs to be handled, but how? updateActionField("foulCode", code)
          if (code) {
             updateActionField("foulCode", code);
          }
        }`;
content = content.replace(/\} else if \(menu === "result"\) \{/, foulCommit + '\n      } else if (menu === "result") {');

fs.writeFileSync('src/hooks/useProHUDMarkingController.ts', content);
