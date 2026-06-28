import fs from 'fs';
import path from 'path';

const ICONS_DIR = path.join(process.cwd(), 'public', 'icons');

function checkIcon(filename, expectedSize) {
  const filePath = path.join(ICONS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Error: ${filename} is missing!`);
    process.exit(1);
  }

  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(24);
  fs.readSync(fd, buffer, 0, 24, 0);
  fs.closeSync(fd);

  // Check PNG signature
  const signature = buffer.toString('hex', 0, 8);
  if (signature !== '89504e470d0a1a0a') {
    console.error(`❌ Error: ${filename} is not a valid PNG image!`);
    process.exit(1);
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  if (width !== expectedSize || height !== expectedSize) {
    console.error(`❌ Error: ${filename} has wrong dimensions! Expected ${expectedSize}x${expectedSize}, got ${width}x${height}`);
    process.exit(1);
  }

  console.log(`✅ ${filename} exists and is a valid ${width}x${height} PNG.`);
}

console.log('Checking PWA Icons...');
checkIcon('icon-192.png', 192);
checkIcon('icon-512.png', 512);
checkIcon('icon-512-maskable.png', 512);
console.log('All required icons are present and valid.');
