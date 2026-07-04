const fs = require('fs');
let code = fs.readFileSync('src/components/hud/HUDActionStatus.tsx', 'utf-8');

code = code.replace(
  `  const getResultLabel = () => currentAction.resultCode || (isThai ? "ผลลัพธ์ (E)" : "Result (E)");`,
  `  const getResultLabel = () => currentAction.resultCode || (isThai ? "ผลลัพธ์ (E)" : "Result (E)");
  const getFoulLabel = () => currentAction.foulCode || "";`
);

code = code.replace(
  `    type: "team" | "skill" | "area" | "result",`,
  `    type: "team" | "skill" | "area" | "result" | "foul",`
);

code = code.replace(
  `      if (type === "result") {
        colorClass =
          label === "Yes"
            ? "bg-green-500/80 text-white border-green-400"
            : label === "Out"
            ? "bg-red-500/80 text-white border-red-400"
            : "bg-blue-500/80 text-white border-blue-400";
      } else if (type === "team") {
        colorClass = "bg-sky-500/80 text-white border-sky-400";
      } else if (type === "skill") {
        colorClass = "bg-emerald-600/80 text-white border-emerald-500";
      } else if (type === "area") {
        colorClass = "bg-amber-500/80 text-white border-amber-400";
      }
    }`,
  `      if (type === "result") {
        colorClass =
          label === "Yes"
            ? "bg-green-500/80 text-white border-green-400"
            : label === "Out"
            ? "bg-red-500/80 text-white border-red-400"
            : "bg-blue-500/80 text-white border-blue-400";
      } else if (type === "team") {
        colorClass = "bg-sky-500/80 text-white border-sky-400";
      } else if (type === "skill") {
        colorClass = "bg-emerald-600/80 text-white border-emerald-500";
      } else if (type === "area") {
        colorClass = "bg-amber-500/80 text-white border-amber-400";
      } else if (type === "foul") {
        colorClass = "bg-orange-600/80 text-white border-orange-500";
      }
    }`
);

code = code.replace(
  `{[act.teamCode, act.skillCode, act.areaCode, act.resultCode]`,
  `{[act.teamCode, act.skillCode, act.areaCode, act.resultCode, act.foulCode]`
);

code = code.replace(
  `{renderChip(getResultLabel(), !!currentAction.resultCode, "result")}`,
  `{renderChip(getResultLabel(), !!currentAction.resultCode, "result")}
        {currentAction.foulCode && renderChip(getFoulLabel(), true, "foul")}`
);

fs.writeFileSync('src/components/hud/HUDActionStatus.tsx', code);
