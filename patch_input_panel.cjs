const fs = require('fs');
let code = fs.readFileSync('src/components/InputPanel.tsx', 'utf-8');

const foulSection = `
          {/* FOUL */}
          {sportTemplate.fouls && sportTemplate.fouls.length > 0 && (
            <section className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-amber-200 dark:border-amber-900/30 select-none relative mt-3">
              <h3 className="text-xs font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>5. {settings.uiLanguage === 'th' ? 'ฟาวล์ / ผิดกติกา' : 'Foul / Violation'} (Optional)</span>
                {currentAction.foulCode && (
                  <button 
                    onClick={() => {
                      updateActionField('foulCode', undefined);
                      updateActionField('foulRole', undefined);
                      updateActionField('foulSeverity', undefined);
                    }}
                    className="text-xs text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 px-2 py-0.5 rounded-full font-semibold transition-colors"
                  >
                    {settings.uiLanguage === 'th' ? 'ล้าง' : 'Clear'}
                  </button>
                )}
              </h3>
              <div className="flex flex-wrap gap-2">
                {sportTemplate.fouls.map((f, i) => {
                  const isSelected = currentAction.foulCode === f.code;
                  const isCard = f.severity === 'card' || f.severity === 'technical';
                  
                  let bgClass = "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-200 dark:border-gray-700 hover:bg-gray-100";
                  let selectedClass = isCard ? "bg-red-500 text-white border-red-600" : "bg-amber-500 text-white border-amber-600";
                  let hoverClass = isCard ? "hover:border-red-500" : "hover:border-amber-500";

                  return (
                    <button
                      key={\`foul-\${f.code}\`}
                      onClick={() => {
                        if (isSelected) {
                          updateActionField('foulCode', undefined);
                          updateActionField('foulRole', undefined);
                          updateActionField('foulSeverity', undefined);
                        } else {
                          updateActionField('foulCode', f.code);
                          updateActionField('foulRole', f.role);
                          updateActionField('foulSeverity', f.severity);
                        }
                      }}
                      className={classNames(
                        "py-1.5 px-3 rounded-lg font-bold shadow-sm transition-all cursor-pointer active:scale-95 border-2 text-sm flex items-center gap-1",
                        isSelected ? selectedClass : \`\${bgClass} \${hoverClass}\`
                      )}
                    >
                      <span>{f.code}</span>
                      <span className="text-xs opacity-80">({settings.uiLanguage === 'th' && f.labelTh ? f.labelTh : f.label})</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
`;

code = code.replace(
  `          </section>

        </div>
      </div>
    </>
  );`,
  `          </section>` + foulSection + `
        </div>
      </div>
    </>
  );`
);

fs.writeFileSync('src/components/InputPanel.tsx', code);
