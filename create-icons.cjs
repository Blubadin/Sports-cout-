const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'public', 'icons');
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

// 1x1 transparent png
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

fs.writeFileSync(path.join(dir, 'icon-192.png'), pixel);
fs.writeFileSync(path.join(dir, 'icon-512.png'), pixel);
fs.writeFileSync(path.join(dir, 'icon-512-maskable.png'), pixel);
console.log('Icons created');
