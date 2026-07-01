import fs from 'fs';
import { PNG } from 'pngjs';

function createPng(filename: string, size: number) {
    const png = new PNG({ width: size, height: size });
    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            const idx = (png.width * y + x) << 2;
            png.data[idx] = 79; // R
            png.data[idx + 1] = 70; // G
            png.data[idx + 2] = 229; // B
            png.data[idx + 3] = 255; // A
        }
    }
    const buffer = PNG.sync.write(png);
    fs.writeFileSync(`public/icons/${filename}`, buffer);
    console.log(`Created ${filename} (${size}x${size})`);
}

createPng('icon-192.png', 192);
createPng('icon-512.png', 512);
createPng('icon-512-maskable.png', 512);
