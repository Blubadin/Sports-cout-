import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const svgPath = path.join(process.cwd(), 'public', 'icons', 'app-icon.svg');
const outDir = path.join(process.cwd(), 'public', 'icons');

async function main() {
  console.log('Generating PWA icons with sharp...');
  
  if (!fs.existsSync(svgPath)) {
    console.error(`Error: master SVG not found at ${svgPath}`);
    process.exit(1);
  }

  // 1. Generate 192x192
  await sharp(svgPath)
    .resize(192, 192)
    .png()
    .toFile(path.join(outDir, 'icon-192.png'));
  console.log('✓ Generated icon-192.png');

  // 2. Generate 512x512
  await sharp(svgPath)
    .resize(512, 512)
    .png()
    .toFile(path.join(outDir, 'icon-512.png'));
  console.log('✓ Generated icon-512.png');

  // 3. Generate 512x512 maskable
  const innerSvg = await sharp(svgPath)
    .resize(384, 384)
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 15, g: 23, b: 42, alpha: 1 }
    }
  })
  .composite([{ input: innerSvg, gravity: 'center' }])
  .png()
  .toFile(path.join(outDir, 'icon-512-maskable.png'));
  console.log('✓ Generated icon-512-maskable.png');
}

main().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
