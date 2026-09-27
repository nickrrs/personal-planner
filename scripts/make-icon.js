// Gera build/icon.ico e src/icon.png. Uso: npx electron scripts/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 24, 32, 48, 64, 128, 256];

const draw = `
(sizes) => sizes.map((S) => {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const k = S / 256;
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x * k, y * k, w * k, h * k, r * k); };

  const grad = g.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, '#6366f1');
  grad.addColorStop(1, '#22c55e');
  rr(8, 8, 240, 240, 56); g.fillStyle = grad; g.fill();

  rr(52, 62, 152, 142, 22); g.fillStyle = '#ffffff'; g.fill();
  g.save(); rr(52, 62, 152, 142, 22); g.clip();
  g.fillStyle = '#1e1b4b'; g.globalAlpha = 0.85; g.fillRect(52 * k, 62 * k, 152 * k, 38 * k);
  g.restore();

  g.fillStyle = '#ffffff';
  rr(84, 44, 18, 38, 9); g.fill();
  rr(154, 44, 18, 38, 9); g.fill();

  g.strokeStyle = '#16a34a';
  g.lineWidth = Math.max(2, 20 * k);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(92 * k, 150 * k); g.lineTo(118 * k, 176 * k); g.lineTo(166 * k, 124 * k);
  g.stroke();
  return c.toDataURL('image/png');
})`;

function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  pngs.forEach(({ size, buf }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    entries.push(e);
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<html></html>');
  const urls = await win.webContents.executeJavaScript(`(${draw})(${JSON.stringify(SIZES)})`);
  const pngs = urls.map((u, i) => ({ size: SIZES[i], buf: Buffer.from(u.split(',')[1], 'base64') }));
  const root = path.join(__dirname, '..');
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), buildIco(pngs));
  fs.writeFileSync(path.join(root, 'src', 'icon.png'), pngs[pngs.length - 1].buf);
  console.log('Ícones gerados.');
  app.exit(0);
});
