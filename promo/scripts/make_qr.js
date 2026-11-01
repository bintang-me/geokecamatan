// Membuat matriks kode QR untuk layar akhir: node scripts/make_qr.js https://carikecamatan.vercel.app
const QRCode = require('qrcode');
const fs = require('fs');
const url = process.argv[2] || 'https://carikecamatan.vercel.app';
const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
const n = qr.modules.size;
const rows = [];
for (let y = 0; y < n; y++) {
    let r = '';
    for (let x = 0; x < n; x++) r += qr.modules.get(x, y) ? '1' : '0';
    rows.push(r);
}
fs.writeFileSync(__dirname + '/../src/data/qr.ts',
    `// Dihasilkan oleh scripts/make_qr.js untuk ${url}\nexport const QR_URL = ${JSON.stringify(url)};\nexport const QR_ROWS: string[] = ${JSON.stringify(rows)};\n`);
console.log('QR', n + 'x' + n, url);
