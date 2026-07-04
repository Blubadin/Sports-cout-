const fs = require('fs');
let code = fs.readFileSync('src/context/ScoutContext.tsx', 'utf-8');

const oldBlock1 = `  useEffect(() => {
    const handleQuotaExceeded = (e: Event) => {
      const customEvent = e as CustomEvent;
      console.error(\`localStorage quota exceeded for key: \${customEvent.detail?.key}\`);
      showToast(settings.uiLanguage === 'th' 
         ? 'พื้นที่เก็บข้อมูลเต็ม! ไม่สามารถบันทึกข้อมูลได้ กรุณาลบโครงการที่ไม่ได้ใช้งาน' 
         : 'Storage quota exceeded! Cannot save data. Please delete unused projects.');
    };
    
    // window.addEventListener('localStorageQuotaExceeded', handleQuotaExceeded);
    return () => window.removeEventListener('localStorageQuotaExceeded', handleQuotaExceeded);
  }, [showToast, settings.uiLanguage]);`;

const newBlock1 = `  useEffect(() => {
    const handleQuotaExceeded = (e: Event) => {
      const customEvent = e as CustomEvent;
      console.error(\`localStorage quota exceeded for key: \${customEvent.detail?.key}\`);
      showToast(settings.uiLanguage === 'th' 
         ? 'พื้นที่เก็บข้อมูลเต็ม! ไม่สามารถบันทึกข้อมูลได้ กรุณาลบโครงการที่ไม่ได้ใช้งาน' 
         : 'Storage quota exceeded! Cannot save data. Please delete unused projects.');
    };
    
    window.addEventListener('localStorageQuotaExceeded', handleQuotaExceeded);
    return () => window.removeEventListener('localStorageQuotaExceeded', handleQuotaExceeded);
  }, [showToast, settings.uiLanguage]);`;

code = code.replace(oldBlock1, newBlock1);

const oldBlock2 = `  useEffect(() => {
    const handleQuotaExceeded = () => {
      showToast(
        settings.uiLanguage === 'th' 
           ? 'พื้นที่จัดเก็บในเบราว์เซอร์ใกล้เต็ม กรุณา Export ข้อมูลและลบโปรเจคที่ไม่ใช้' 
           : 'Browser storage is almost full. Please export your data and remove unused projects.'
      );
    };
    // window.addEventListener('localStorageQuotaExceeded', handleQuotaExceeded);
    return () => window.removeEventListener('localStorageQuotaExceeded', handleQuotaExceeded);
  }, [settings.uiLanguage, showToast]);`;

code = code.replace(oldBlock2, '');

fs.writeFileSync('src/context/ScoutContext.tsx', code);
