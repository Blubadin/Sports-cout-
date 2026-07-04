const fs = require('fs');
let code = fs.readFileSync('src/components/GeneralInfo.tsx', 'utf-8');
code = code.replace(
`  if (compact && !isExpanded) {
    return (
      <div className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <span className="text-sky-600 dark:text-sky-400">{teams[0]?.icon && <span className="mr-1">{teams[0].icon}</span>}{teams[0]?.code || 'Team 1'}</span>
            <span className="text-gray-400 text-xs font-normal">vs</span>
            <span className="text-sky-600 dark:text-sky-400">{teams[1]?.icon && <span className="mr-1">{teams[1].icon}</span>}{teams[1]?.code || 'Team 2'}</span>
          </div>
          <div className="text-xs text-gray-500 border-l border-gray-300 dark:border-gray-600 pl-4 py-1">
            Set {matchInfo.setOrGame} • PT {matchInfo.currentPoint}
          </div>
        </div>
        <button `,
`  if (compact && !isExpanded) {
    return (
      <div className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex items-center justify-between gap-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 overflow-hidden">
          <div className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2 truncate">
            <span className="text-sky-600 dark:text-sky-400 truncate max-w-[100px]">{teams[0]?.icon && <span className="mr-1">{teams[0].icon}</span>}{teams[0]?.code || 'Team 1'}</span>
            <span className="text-gray-400 text-xs font-normal shrink-0">vs</span>
            <span className="text-sky-600 dark:text-sky-400 truncate max-w-[100px]">{teams[1]?.icon && <span className="mr-1">{teams[1].icon}</span>}{teams[1]?.code || 'Team 2'}</span>
          </div>
          <div className="text-xs text-gray-500 sm:border-l border-gray-300 dark:border-gray-600 sm:pl-4 py-0.5 sm:py-1 shrink-0">
            Set {matchInfo.setOrGame} • PT {matchInfo.currentPoint}
          </div>
        </div>
        <button `
);
fs.writeFileSync('src/components/GeneralInfo.tsx', code);
