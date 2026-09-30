const fs = require('node:fs');
const path = require('node:path');
const version = require('../ExpoRideSpeed/package.json').version;
const changelog = fs.readFileSync(path.join(__dirname, '../CHANGELOG_TH.md'), 'utf8');
const section = changelog.split(/^## /m).find(text => text.startsWith(`${version}\n`) || text.startsWith(`${version} `));
if (!section) throw new Error(`Add a Thai CHANGELOG_TH.md section for ${version} before publishing.`);
const notes = `# Ride Speed ${version} — unsigned / ต้องลงนามก่อนติดตั้ง\n\n` +
  `ไฟล์ IPA นี้ยังไม่ได้ลงนาม ให้ติดตั้งจาก Windows ด้วย Sideloadly และ Apple ID ของผู้ใช้แต่ละคน\n\n` +
  `ต้องใช้ iOS 17 ขึ้นไป รุ่นนี้เป็นต้นแบบทดสอบการสร้างและติดตั้งแอป ยังไม่มีระบบบันทึกเบื้องหลัง และยังไม่ได้ยืนยันความแม่นยำบน iPhone\n\n` +
  `ดาวน์โหลดไฟล์ที่ลงท้ายด้วย release-unsigned.ipa ไม่ใช่ Source code.zip และอ่าน INSTALL_TH.md ที่แนบมาด้วย\n\n## ${section.trim()}\n`;
fs.writeFileSync(process.argv[2] || 'release-notes.md', notes);
