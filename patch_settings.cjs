const fs = require('fs');
let code = fs.readFileSync('src/components/SettingsModal.tsx', 'utf-8');

code = code.replace(
`          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            // Basic validation
            const isValid = parsed.every(row => {`,
`          const parsed = JSON.parse(content);
          let eventsToImport = null;
          
          if (Array.isArray(parsed)) {
            eventsToImport = parsed;
          } else if (parsed && parsed.schemaVersion && Array.isArray(parsed.events)) {
            eventsToImport = parsed.events;
          }

          if (eventsToImport) {
            // Basic validation
            const isValid = eventsToImport.every((row: any) => {`);

code = code.replace(
`            if (!isValid) {
              showToast('โครงสร้างข้อมูลในไฟล์ไม่ถูกต้อง หรือ resultCode ผิดพลาด');
              return;
            }

            setConfirmConfig({
              message: \`พบข้อมูล \${parsed.length} รายการ ยืนยันการแทนที่ข้อมูลปัจจุบัน?\`,
              onConfirm: () => {
                setEvents(parsed);
                showToast('Import สำเร็จ');
                setConfirmConfig(null);
              }
            });
          } else {
            showToast('รูปแบบไฟล์ไม่ถูกต้อง ต้องเป็น Array ของ EventRow');
          }`,
`            if (!isValid) {
              showToast('โครงสร้างข้อมูลในไฟล์ไม่ถูกต้อง หรือ resultCode ผิดพลาด');
              return;
            }

            setConfirmConfig({
              message: \`พบข้อมูล \${eventsToImport.length} รายการ ยืนยันการแทนที่ข้อมูลปัจจุบัน?\`,
              onConfirm: () => {
                setEvents(eventsToImport);
                showToast('Import สำเร็จ');
                setConfirmConfig(null);
              }
            });
          } else {
            showToast('รูปแบบไฟล์ไม่ถูกต้อง ต้องเป็น Array ของ EventRow หรือ Export JSON format');
          }`);

fs.writeFileSync('src/components/SettingsModal.tsx', code);
