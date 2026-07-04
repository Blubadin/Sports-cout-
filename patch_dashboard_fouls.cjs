const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf-8');

const foulRow = `                    {/* Fouls */}
                    <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-700 dark:text-gray-200">{settings.uiLanguage === 'th' ? 'ทำฟาวล์ / ผิดกติกา' : 'Fouls / Violations'}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{settings.uiLanguage === 'th' ? 'จำนวนครั้งที่ทำฟาวล์หรือผิดกติกา' : 'Total fouls and violations committed'}</span>
                        </div>
                      </td>
                      <td className="py-3 text-center font-mono text-gray-600 dark:text-gray-300">{stats.teamAFouls}</td>
                      <td className="py-3 text-center font-mono text-gray-600 dark:text-gray-300">{stats.teamBFouls}</td>
                    </tr>
`;

code = code.replace(
  `                    {/* Own Errors */}
                    <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10 transition-colors">`,
  foulRow + `                    {/* Own Errors */}
                    <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10 transition-colors">`
);

fs.writeFileSync('src/components/Dashboard.tsx', code);
