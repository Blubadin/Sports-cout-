const fs = require('fs');
let code = fs.readFileSync('src/components/WorkspaceMenu.tsx', 'utf-8');

code = code.replace(
`                      <button onClick={() => {
                        deleteProject(proj.id);
                      }} className="p-2 md:p-1 text-gray-400 hover:text-red-600 rounded-lg bg-gray-100 md:bg-transparent">`,
`                      <button onClick={() => {
                        const confirmMsg = settings.uiLanguage === 'th' ? 'ต้องการลบโปรเจคนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้' : 'Delete this project? This action cannot be undone.';
                        if (window.confirm(confirmMsg)) {
                          deleteProject(proj.id);
                        }
                      }} className="p-2 md:p-1 text-gray-400 hover:text-red-600 rounded-lg bg-gray-100 md:bg-transparent">`
);

fs.writeFileSync('src/components/WorkspaceMenu.tsx', code);
