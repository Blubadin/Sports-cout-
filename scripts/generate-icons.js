import fs from 'fs';
import path from 'path';

const ICONS_DIR = path.join(process.cwd(), 'public', 'icons');
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

const png192 = "iVBORw0KGgoAAAANSUhEUgAAAMAAAADAAQMAAAA/C6UBAAAAA1BMVEUAAACnej3aAAAAJUlEQVR42u3BAQEAAACAkP6v7ggKAAAAAAAAAAAAAAAAAAAACx8mAAEAx/c3AAAAAElFTkSuQmCC";
const png512 = "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIAAQMAAADOtka5AAAAA1BMVEUAAACnej3aAAAAQUlEQVR42u3BAQEAAACAkP6v7ggKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcB3gAAQEn6dYAAAAASUVORK5CYII=";

fs.writeFileSync(path.join(ICONS_DIR, 'icon-192.png'), Buffer.from(png192, 'base64'));
fs.writeFileSync(path.join(ICONS_DIR, 'icon-512.png'), Buffer.from(png512, 'base64'));
fs.writeFileSync(path.join(ICONS_DIR, 'icon-512-maskable.png'), Buffer.from(png512, 'base64'));

console.log('Icons generated successfully.');
