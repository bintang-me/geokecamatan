/* =========================================================
   Cari Kecamatan — Parser koordinat
   Desimal, DMS, desimal + arah mata angin, dan koreksi salinan Excel.
   ========================================================= */
// ==========================================
// Validator & DMS Converter
// ==========================================

// Normalisasi simbol & arah mata angin yang dipakai bersama oleh parser DMS dan desimal+hemisfer
function normalizeCoordSymbols(str) {
    let s = str.trim();
    // Huruf "o" yang dipakai sebagai simbol derajat (cth: 6o14'52"S) — dilakukan SEBELUM toUpperCase
    s = s.replace(/(\d)\s*[oO]\s*(?=\d)/g, '$1°');
    s = s.replace(/[˚º⁰]/g, '°');
    s = s.replace(/[′ʹ`’‘]/g, "'");
    s = s.replace(/[″ʺ“”]/g, '"');
    s = s.replace(/''/g, '"');
    s = s.replace(/\s+/g, ' ').toUpperCase();
    // Arah mata angin Indonesia → standar internasional (N, S, E, W)
    s = s.replace(/LS\b/g, 'S')
         .replace(/LU\b/g, 'N')
         .replace(/BT\b/g, 'E')
         .replace(/BB\b/g, 'W');
    return s;
}

const isLatDir = (d) => d === 'N' || d === 'S';
const isLonDir = (d) => d === 'E' || d === 'W';

// Gabungkan dua nilai bertanda arah menjadi {lat, lon}; null jika arah tidak valid
function combineDirectional(v1, d1, v2, d2) {
    if (isNaN(v1) || isNaN(v2)) return null;
    if (isLatDir(d1) === isLatDir(d2)) return null; // harus satu N/S dan satu E/W
    const sign = (v, d) => (d === 'S' || d === 'W') ? -Math.abs(v) : Math.abs(v);
    let lat, lon;
    if (isLatDir(d1)) { lat = sign(v1, d1); lon = sign(v2, d2); }
    else { lat = sign(v2, d2); lon = sign(v1, d1); }
    return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 };
}

function convertDMSToDecimal(dmsStr) {
    // Koma desimal (cth: 6,967") → titik
    const cleanStr = normalizeCoordSymbols(dmsStr).replace(/,/g, '.');

    // Derajat, menit (boleh desimal), detik opsional, arah
    const dmsRegex = /(\d+(?:\.\d+)?)\s*[°\s]\s*(\d+(?:\.\d+)?)\s*['\s]\s*(?:(\d+(?:\.\d+)?)\s*"?)?\s*([NSEW])/g;

    const matches = [];
    let match;
    while ((match = dmsRegex.exec(cleanStr)) !== null) {
        matches.push(match);
    }
    if (matches.length !== 2) return null;

    const parsePart = (m) => {
        const deg = parseFloat(m[1]);
        const min = parseFloat(m[2]);
        const sec = m[3] ? parseFloat(m[3]) : 0;
        // Validasi rentang: menit 0-59, detik 0-59
        if (min >= 60 || sec >= 60) return NaN;
        return deg + (min / 60) + (sec / 3600);
    };

    return combineDirectional(parsePart(matches[0]), matches[0][4], parsePart(matches[1]), matches[1][4]);
}

// Format derajat desimal dengan arah, cth: "6.2088 S, 106.8456 E", "6.2088°LS 106.8456°BT", "S 6.2 E 106.8"
function convertHemisphereDecimal(str) {
    const s = normalizeCoordSymbols(str).replace(/(\d),(\d)/g, '$1.$2');
    const num = '(\\d+(?:\\.\\d+)?)';
    const suffix = new RegExp(`^${num}\\s*°?\\s*([NSEW])[\\s,;]*${num}\\s*°?\\s*([NSEW])$`);
    const prefix = new RegExp(`^([NSEW])\\s*${num}\\s*°?[\\s,;]*([NSEW])\\s*${num}\\s*°?$`);
    let m = s.match(suffix);
    if (m) return combineDirectional(parseFloat(m[1]), m[2], parseFloat(m[3]), m[4]);
    m = s.match(prefix);
    if (m) return combineDirectional(parseFloat(m[2]), m[1], parseFloat(m[4]), m[3]);
    return null;
}

// Fungsi pintar hapus koma ribuan / koma desimal
function cleanNumberStr(str) {
    let s = str;
    if (s.includes('.') && s.includes(',')) {
        const cIdx = s.lastIndexOf(',');
        const dIdx = s.lastIndexOf('.');
        if (dIdx > cIdx) s = s.replace(/,/g, ''); // US (e.g. 44,098.00)
        else s = s.replace(/\./g, '').replace(/,/g, '.'); // EU/ID
    } else if (s.includes(',')) {
        if ((s.match(/,/g) || []).length > 1) {
            s = s.replace(/,/g, ''); // Koma ribuan ganda (e.g. 20,642,531)
        } else {
            s = s.replace(',', '.'); // Koma tunggal = desimal ala ID
        }
    }
    return s;
}

const STRICT_NUMBER = /^[+-]?\d+(\.\d+)?$/;

// Alasan koreksi otomatis → kalimat untuk pengguna
const FIX_TEXT = {
    dms: 'format DMS dikonversi ke desimal',
    arah: 'arah mata angin dikonversi ke desimal',
    koma: 'koma desimal diubah menjadi titik',
    desimal: 'titik desimal yang hilang dipulihkan',
    tukar: 'urutan dibalik menjadi lintang, bujur'
};
function describeFixes(fixes) {
    const parts = (fixes || []).map(f => FIX_TEXT[f]).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join(', ') + ' dan ' + parts[parts.length - 1];
}

// Koreksi angka "raksasa" dari Excel yang kehilangan titik desimal, per sumbu
function fixGiantLat(lat) {
    if (Math.abs(lat) <= 90) return lat;
    const digits = Math.abs(lat).toString().replace('.', '');
    if (!/^\d+$/.test(digits) || digits.length < 2) return NaN;
    const v = parseFloat(digits.substring(0, 1) + '.' + digits.substring(1));
    return lat < 0 ? -v : v;
}

function fixGiantLon(lon) {
    if (Math.abs(lon) <= 180) return lon;
    const digits = Math.abs(lon).toString().replace('.', '');
    if (!/^\d+$/.test(digits) || digits.length < 3) return NaN;
    const prefix3 = parseInt(digits.substring(0, 3), 10);
    const dotIndex = (prefix3 >= 100 && prefix3 <= 145) ? 3 : 2;
    const v = parseFloat(digits.substring(0, dotIndex) + '.' + digits.substring(dotIndex));
    return lon < 0 ? -v : v;
}

function parseCoordinates(inputStr) {
    if (!inputStr || inputStr.trim() === '') {
        return { valid: false, error: "Koordinat tidak boleh kosong." };
    }

    // 1. Coba konversi DMS, lalu derajat desimal + arah mata angin
    const dmsResult = convertDMSToDecimal(inputStr);
    const dirResult = dmsResult || convertHemisphereDecimal(inputStr);
    if (dirResult) {
        if (dirResult.lat < -90 || dirResult.lat > 90 || dirResult.lon < -180 || dirResult.lon > 180) {
            return { valid: false, error: "Nilai lintang/bujur di luar rentang yang valid (lintang −90 hingga 90, bujur −180 hingga 180)." };
        }
        return { valid: true, lat: dirResult.lat, lon: dirResult.lon, converted: true, fixes: [dmsResult ? 'dms' : 'arah'] };
    }

    const formatError = { valid: false, error: "Format koordinat tidak dikenali. Gunakan format desimal (contoh: -6.208, 106.845) atau DMS (contoh: 6°14'52.1\"S 106°52'40.0\"E)." };

    // 2. Fallback ke format desimal standar
    // Hilangkan tanda petik tunggal/ganda (sering terbawa dari copy-paste Excel)
    const cleanStr = inputStr.trim().replace(/['"]/g, '');

    // Pisahkan berdasarkan pemisah utama: tab, titik koma, koma-spasi, spasi, lalu koma
    let parts;
    let parsedFromCommaPairs = false;
    if (cleanStr.includes('\t')) {
        parts = cleanStr.split(/\t+/);
    } else if (cleanStr.includes(';')) {
        parts = cleanStr.split(/\s*;\s*/);
    } else if (/\s,|,\s/.test(cleanStr)) {
        parts = cleanStr.split(/\s*,\s*/);
        if (parts.length === 4 && /^[+-]?\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]) &&
            /^[+-]?\d+$/.test(parts[2]) && /^\d+$/.test(parts[3])) {
            // Koma desimal ala ID + koma pemisah, cth: "-6,2088, 106,8456"
            parts = [`${parts[0]}.${parts[1]}`, `${parts[2]}.${parts[3]}`];
            parsedFromCommaPairs = true;
        } else if (parts.length !== 2) {
            return formatError;
        }
    } else if (cleanStr.includes(' ')) {
        parts = cleanStr.split(/\s+/);
    } else {
        parts = cleanStr.split(',');
    }
    parts = parts.map(p => p.trim()).filter(p => p !== '');
    if (parts.length < 2) return formatError;

    let latStr = parts[0].replace(/,$/, '');
    let lonStr = parts[1].replace(/,$/, '');
    const fixes = [];
    if (parsedFromCommaPairs || latStr.includes(',') || lonStr.includes(',')) fixes.push('koma');
    latStr = cleanNumberStr(latStr);
    lonStr = cleanNumberStr(lonStr);

    // Validasi ketat: tolak sisa karakter (°, ', huruf, dll) agar tidak terpotong diam-diam oleh parseFloat
    if (!STRICT_NUMBER.test(latStr) || !STRICT_NUMBER.test(lonStr)) return formatError;

    let lat = parseFloat(latStr);
    let lon = parseFloat(lonStr);

    // URUTAN TERBALIK (bujur, lintang): lintang mustahil > 90, sedangkan nilai kedua cocok sebagai lintang
    if (Math.abs(lat) > 90 && Math.abs(lat) <= 180 && Math.abs(lon) <= 90) {
        [lat, lon] = [lon, lat];
        fixes.push('tukar');
    }

    // KOREKSI ANGKA RAKSASA (Kesalahan Ketik Excel tanpa desimal asli) — hanya sumbu yang keluar batas
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        lat = fixGiantLat(lat);
        lon = fixGiantLon(lon);
        fixes.push('desimal');
    }

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return { valid: false, error: "Nilai lintang/bujur di luar rentang yang valid (lintang −90 hingga 90, bujur −180 hingga 180)." };
    }

    return { valid: true, lat: lat, lon: lon, converted: fixes.length > 0, fixes };
}
