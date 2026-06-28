const https = require('https');
const fs = require('fs');
const path = require('path');

const download = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
};

const iconsDir = path.join(__dirname, 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

Promise.all([
  download('https://placehold.co/192/4F46E5/FFFFFF/png?text=S', path.join(iconsDir, 'icon-192.png')),
  download('https://placehold.co/512/4F46E5/FFFFFF/png?text=S', path.join(iconsDir, 'icon-512.png')),
  download('https://placehold.co/512/4F46E5/FFFFFF/png?text=S', path.join(iconsDir, 'icon-512-maskable.png'))
]).then(() => {
  console.log('Icons downloaded successfully');
}).catch(console.error);
