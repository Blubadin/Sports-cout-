const fs = require('fs');
let code = fs.readFileSync('src/context/ScoutContext.tsx', 'utf-8');

// The block at 280:
// useEffect(() => {
//   const handleQuotaExceeded = (e: Event) => {
// ...
//     showToast(settings.uiLanguage === 'th' 
//       ? 'พื้นที่เก็บข้อมูลเต็ม! ไม่สามารถบันทึกข้อมูลได้ กรุณาลบโครงการที่ไม่ได้ใช้งาน' 
//       : 'Storage quota exceeded! Cannot save data. Please delete unused projects.');
//   };
//   // window.addEventListener('localStorageQuotaExceeded', handleQuotaExceeded);
//   return () => window.removeEventListener('localStorageQuotaExceeded', handleQuotaExceeded);
// }, [showToast, settings.uiLanguage]);

code = code.replace(
/  useEffect\(\(\) => \{\n    const handleQuotaExceeded = \(e: Event\) => \{\n      const customEvent = e as CustomEvent;\n      console\.error\(`localStorage quota exceeded for key: \$\{customEvent\.detail\?\.key\}`\);\n      showToast\(settings\.uiLanguage === 'th' \n         \? 'พื้นที่เก็บข้อมูลเต็ม! ไม่สามารถบันทึกข้อมูลได้ กรุณาลบโครงการที่ไม่ได้ใช้งาน' \n         : 'Storage quota exceeded! Cannot save data\. Please delete unused projects\.'\);\n    \};\n    \n    \/\/ window\.addEventListener\('localStorageQuotaExceeded', handleQuotaExceeded\);\n    return \(\) => window\.removeEventListener\('localStorageQuotaExceeded', handleQuotaExceeded\);\n  \}, \[showToast, settings\.uiLanguage\]\);/g, 
`  useEffect(() => {
    const handleQuotaExceeded = (e: Event) => {
      const customEvent = e as CustomEvent;
      console.error(\`localStorage quota exceeded for key: \${customEvent.detail?.key}\`);
      showToast(settings.uiLanguage === 'th' 
         ? 'พื้นที่เก็บข้อมูลเต็ม! ไม่สามารถบันทึกข้อมูลได้ กรุณาลบโครงการที่ไม่ได้ใช้งาน' 
         : 'Storage quota exceeded! Cannot save data. Please delete unused projects.');
    };
    
    window.addEventListener('localStorageQuotaExceeded', handleQuotaExceeded);
    return () => window.removeEventListener('localStorageQuotaExceeded', handleQuotaExceeded);
  }, [showToast, settings.uiLanguage]);`
);

// The block at 785: remove entirely
code = code.replace(
/  useEffect\(\(\) => \{\n    const handleQuotaExceeded = \(\) => \{\n      showToast\(\n        settings\.uiLanguage === 'th' \n           \? 'พื้นที่จัดเก็บในเบราว์เซอร์ใกล้เต็ม กรุณา Export ข้อมูลและลบโปรเจคที่ไม่ใช้' \n           : 'Browser storage is almost full\. Please export your data and remove unused projects\.'\n      \);\n    \};\n    \/\/ window\.addEventListener\('localStorageQuotaExceeded', handleQuotaExceeded\);\n    return \(\) => window\.removeEventListener\('localStorageQuotaExceeded', handleQuotaExceeded\);\n  \}, \[settings\.uiLanguage, showToast\]\);/g,
''
);

fs.writeFileSync('src/context/ScoutContext.tsx', code);
