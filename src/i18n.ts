export type SupportedLanguage = 'th' | 'en';

type Dictionary = {
  [key: string]: {
    th: string;
    en: string;
  };
};

const translations: Dictionary = {
  // App
  'app.title': { th: 'SportScout', en: 'SportScout' },
  'app.description': { th: 'สำหรับวิเคราะห์เกมและบันทึกสถิติ', en: 'For Game Analysis and Statistics Logging' },
  
  // Header / Settings
  'header.settings': { th: 'ตั้งค่า', en: 'Settings' },
  
  // Dashboard
  'dashboard.totalEvents': { th: 'จำนวนเหตุการณ์ทั้งหมด', en: 'Total Events' },
  'dashboard.rallyLength': { th: 'สถิติการโต้กลับ (Rally Length)', en: 'Rally Length Statistics' },
  'dashboard.average': { th: 'ค่าเฉลี่ย', en: 'Average' },
  'dashboard.max': { th: 'สูงสุด', en: 'Max' },
  
  // Scouting Table
  'table.no': { th: 'ลำดับ', en: 'No.' },
  'table.event': { th: 'เหตุการณ์', en: 'Event' },
  'table.video': { th: 'วิดีโอ', en: 'Video' },
  'table.note': { th: 'หมายเหตุ', en: 'Note' },
  'table.actions': { th: 'จัดการ', en: 'Actions' },
  
  // Workspace Menu
  'workspace.activeProject': { th: 'โปรเจกต์ปัจจุบัน', en: 'Active Project' },
  'workspace.myProjects': { th: 'โปรเจกต์ของฉัน', en: 'My Projects' },
  'workspace.newScout': { th: 'สร้างสเกาต์ใหม่', en: 'New Scout' },
  'workspace.exportJson': { th: 'ส่งออกข้อมูล (JSON)', en: 'Export (JSON)' },
  'workspace.importJson': { th: 'นำเข้าข้อมูล (JSON)', en: 'Import (JSON)' },
  
  // Input Panel
  'input.team': { th: 'ทีม', en: 'Team' },
  'input.skill': { th: 'ทักษะ (Skill)', en: 'Skill' },
  'input.area': { th: 'พื้นที่ (Area)', en: 'Area' },
  'input.result': { th: 'ผลลัพธ์ (Result)', en: 'Result' },
  'input.saveEvent': { th: 'บันทึกเหตุการณ์', en: 'Save Event' },
  'input.pass': { th: 'ส่งต่อ (Pass)', en: 'Pass' },
  'input.yes': { th: 'ได้แต้ม (Yes)', en: 'Yes / Point' },
  'input.out': { th: 'เสียแต้ม (Out)', en: 'Out / Error' },
  
  // Video Player
  'video.loadLocal': { th: 'เปิดวิดีโอจากเครื่อง', en: 'Load Local Video' },
  'video.loadYoutube': { th: 'โหลดจาก YouTube', en: 'Load YouTube' },
  'video.pasteYoutubeUrl': { th: 'วางลิงก์ YouTube ที่นี่', en: 'Paste YouTube URL here' },
  'video.pleaseSelectFile': { th: 'กรุณาเลือกไฟล์วิดีโออีกครั้งเพื่อเริ่ม', en: 'Please select video file again to start' },
  
  // Settings Modal
  'settings.title': { th: 'ตั้งค่าระบบ', en: 'Settings' },
  'settings.general': { th: 'ทั่วไป', en: 'General' },
  'settings.workflow': { th: 'กระบวนการทำงาน', en: 'Workflow' },
  'settings.video': { th: 'วิดีโอ', en: 'Video' },
  'settings.scoutHud': { th: 'Scout HUD', en: 'Scout HUD' },
  'settings.dataManagement': { th: 'จัดการข้อมูล', en: 'Data Management' },
  'settings.language': { th: 'ภาษาของระบบ', en: 'Language' },
  'settings.flipCourt': { th: 'สลับฝั่งสนาม', en: 'Flip Court Sides' },
  'settings.fastMode': { th: 'โหมดด่วน (ข้ามการยืนยัน)', en: 'Fast Mode (Skip confirmation)' },
  'settings.advancedDetail': { th: 'โหมดบันทึกรายละเอียดสูง', en: 'Advanced Detail Mode' },
  'settings.autoNextPoint': { th: 'เพิ่มแต้มอัตโนมัติเมื่อได้/เสีย', en: 'Auto Next Point on Yes/Out' },
  'settings.skillLayout': { th: 'รูปแบบการป้อนข้อมูลทักษะ', en: 'Skill Input Layout' },
  'settings.layoutWheel': { th: 'วงล้อ (Radial Wheel)', en: 'Radial Wheel' },
  'settings.layoutGrid': { th: 'ตาราง (Grid)', en: 'Grid' },
  'settings.layoutCompact': { th: 'กะทัดรัด (Compact)', en: 'Compact' },
  'settings.enableGestures': { th: 'เปิดใช้งานการควบคุมด้วยท่าทาง/คีย์บอร์ด', en: 'Enable Gesture/Keyboard Controls' },
  'settings.liveScrub': { th: 'เลื่อนวิดีโอทันทีขณะลาก (Live Scrub)', en: 'Live Scrubbing' },
  'settings.hudMode': { th: 'เปิดใช้งาน Scout HUD Mode', en: 'Enable Scout HUD Mode' },
  'settings.hudTopStats': { th: 'แสดงสถิติด้านบนใน HUD', en: 'Show Top Stats in HUD' },
  'settings.hudActionStatus': { th: 'แสดงสถานะการกระทำปัจจุบัน', en: 'Show Current Action Status' },
  'settings.hudVideoControls': { th: 'แสดงตัวควบคุมวิดีโอ', en: 'Show Video Controls' },
  'settings.hudAutoHide': { th: 'ซ่อนเมนูอัตโนมัติเมื่อไม่ใช้งาน', en: 'Auto-hide controls when idle' },
  'settings.hudLargeButtons': { th: 'ใช้ปุ่มขนาดใหญ่สำหรับมือถือ', en: 'Use Large Buttons on Mobile' },
  'settings.clearData': { th: 'ล้างข้อมูลทั้งหมด', en: 'Clear All Data' },
  'settings.exportData': { th: 'ส่งออกข้อมูลสำรอง', en: 'Export Backup' },
  'settings.importData': { th: 'นำเข้าข้อมูลสำรอง', en: 'Import Backup' },
  'settings.screenMarking': { th: 'เปิดใช้งานโหมดลากบนหน้าจอ (Screen Marking)', en: 'Enable Screen Marking Mode' },
};

export function t(key: string, lang: SupportedLanguage = 'th'): string {
  const item = translations[key];
  if (!item) return key;
  return item[lang] || item['th'];
}
