// validator.js
export function convertDMSToDecimal(dmsStr) {
    let cleanStr = dmsStr.trim().replace(/\s+/g, ' ').toUpperCase();

    // Normalisasi simbol derajat, menit, detik non-standar
    cleanStr = cleanStr.replace(/[˚º⁰o]/g, '°');
    cleanStr = cleanStr.replace(/[′ʹ`]/g, "'");
    cleanStr = cleanStr.replace(/[″ʺ]/g, '"');
    // Normalisasi koma desimal (contoh: 6,967" → 6.967")
    cleanStr = cleanStr.replace(/,/g, '.');

    const dmsRegex = /([\d\.]+)[°\s]+(\d+)['’\s]+([\d\.]+)?["”\s]*([NSEW])/gi;

    let matches = [];
    let match;
    while ((match = dmsRegex.exec(cleanStr)) !== null) {
        matches.push(match);
    }

    if (matches.length >= 2) {
        const parsePart = (m) => {
            let deg = parseFloat(m[1]);
            let min = parseFloat(m[2]);
            let sec = m[3] ? parseFloat(m[3]) : 0;
            let dir = m[4];

            // Validasi rentang: menit 0-59, detik 0-59
            if (min >= 60 || sec >= 60) return NaN;

            let dec = deg + (min / 60) + (sec / 3600);
            if (dir === 'S' || dir === 'W') dec = dec * -1;
            return dec;
        };

        let val1 = parsePart(matches[0]);
        let dir1 = matches[0][4];
        let val2 = parsePart(matches[1]);
        let dir2 = matches[1][4];

        // Jika parsePart return NaN → menit/detik tidak valid
        if (isNaN(val1) || isNaN(val2)) return null;

        // Validasi: pastikan satu N/S dan satu E/W
        const isLat = (d) => d === 'N' || d === 'S';
        const isLon = (d) => d === 'E' || d === 'W';
        if (isLat(dir1) === isLat(dir2)) return null;

        let lat, lon;
        if (isLat(dir1)) {
            lat = val1; lon = val2;
        } else {
            lat = val2; lon = val1;
        }

        // Presisi 6 angka desimal
        lat = Math.round(lat * 1e6) / 1e6;
        lon = Math.round(lon * 1e6) / 1e6;

        return { lat, lon };
    }
    return null;
}

export function parseCoordinates(inputStr) {
    if (!inputStr || inputStr.trim() === '') {
        return { valid: false, error: "Koordinat tidak boleh kosong." };
    }

    // 1. Coba konversi DMS terlebih dahulu
    const dmsResult = convertDMSToDecimal(inputStr);
    if (dmsResult) {
        if (dmsResult.lat < -90 || dmsResult.lat > 90 || dmsResult.lon < -180 || dmsResult.lon > 180) {
            return { valid: false, error: "Nilai lat/long dari format DMS di luar batas Bumi." };
        }
        return { valid: true, lat: dmsResult.lat, lon: dmsResult.lon, converted: true };
    }

    // 2. Fallback ke format desimal standar
    // Hilangkan tanda petik tunggal/ganda (sering terbawa dari copy-paste Excel)
    let cleanStr = inputStr.trim().replace(/['"]/g, '');
    
    // a. Coba pisahkan berdasarkan pemisah utama: tab, lalu koma-spasi, lalu spasi, lalu koma
    let parts = [];
    if (cleanStr.includes('\t')) {
        parts = cleanStr.split(/\t+/);
    } else if (cleanStr.includes(' , ') || cleanStr.includes(', ')) {
        parts = cleanStr.split(/\s*,\s*/);
    } else if (cleanStr.includes(' ')) {
        parts = cleanStr.split(/\s+/);
    } else {
        parts = cleanStr.split(',');
    }

    if (parts.length >= 2) {
        let latStrRaw = parts[0].trim();
        let lonStrRaw = parts[1].trim();

        // Bersihkan koma trailing (misal split by space dari "-6.2, 106.8" -> "-6.2,")
        if (latStrRaw.endsWith(',')) latStrRaw = latStrRaw.slice(0, -1);
        if (lonStrRaw.endsWith(',')) lonStrRaw = lonStrRaw.slice(0, -1);

        // Fungsi pintar hapus koma ribuan
        const cleanNumberStr = (str) => {
            let s = str;
            if (s.includes('.') && s.includes(',')) {
                let cIdx = s.lastIndexOf(',');
                let dIdx = s.lastIndexOf('.');
                if (dIdx > cIdx) s = s.replace(/,/g, ''); // US (e.g. 44,098.00)
                else s = s.replace(/\./g, '').replace(/,/g, '.'); // EU/ID
            } else if (s.includes(',')) {
                if ((s.match(/,/g) || []).length > 1) {
                    s = s.replace(/,/g, ''); // Koma ribuan ganda (e.g. 20,642,531)
                } else {
                    // Jika angkanya besar misal 42,328871 (satu koma salah ketik), 
                    // atau -6,208 (koma desimal).
                    // Kita asumsikan koma tunggal tanpa titik adalah desimal ala ID.
                    // Namun jika jumlah digit setelah koma sangat panjang (misal 42,328871), koma desimal tetap valid.
                    // Jika formatnya 984,096 (1 koma, tepat 3 digit di belakang), bisa jadi itu ribuan.
                    // Untuk aman, kita jadikan titik desimal, NANTI akan dikoreksi oleh KOREKSI ANGKA RAKSASA.
                    let partsComma = s.split(',');
                    if (partsComma[1].length === 3 && Math.abs(parseFloat(s.replace(',', ''))) > 90) {
                        s = s.replace(',', ''); // Anggap ribuan
                    } else {
                        s = s.replace(',', '.'); // Anggap desimal
                    }
                }
            }
            return s;
        };

        let latStr = cleanNumberStr(latStrRaw);
        let lonStr = cleanNumberStr(lonStrRaw);
        
        let lat = parseFloat(latStr);
        let lon = parseFloat(lonStr);

        if (!isNaN(lat) && !isNaN(lon)) {
            let convertedFlag = parts[0].includes(',') || parts[1].includes(',');

            // c. KOREKSI ANGKA RAKSASA (Kesalahan Ketik Excel tanpa desimal asli)
            if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
                let latStrRaw = Math.abs(lat).toString().replace('.', '');
                let lonStrRaw = Math.abs(lon).toString().replace('.', '');
                
                // Koreksi Latitude (1 angka sebelum desimal)
                if (latStrRaw.length > 1) {
                    let newLat = parseFloat(latStrRaw.substring(0, 1) + "." + latStrRaw.substring(1));
                    lat = lat < 0 ? -newLat : newLat;
                }

                // Koreksi Longitude (2 atau 3 angka sebelum desimal)
                if (lonStrRaw.length > 2) {
                    let prefix3 = parseInt(lonStrRaw.substring(0, 3));
                    let dotIndex = (prefix3 >= 100 && prefix3 <= 145) ? 3 : 2;
                    let newLon = parseFloat(lonStrRaw.substring(0, dotIndex) + "." + lonStrRaw.substring(dotIndex));
                    lon = lon < 0 ? -newLon : newLon;
                }
                
                convertedFlag = true;
            }

            if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                return { valid: false, error: "Nilai lat/long di luar batas normal Bumi." };
            }

            // Tandai koordinat di luar batas wilayah Indonesia (tetap diproses, tidak diblokir)
            const outsideIndonesia = (lat < -11.5 || lat > 6.5 || lon < 94.5 || lon > 141.5);

            return { valid: true, lat: lat, lon: lon, converted: convertedFlag, outsideIndonesia };
        }
    }

    return { valid: false, error: "Format koordinat tidak dikenali. Coba desimal (cth: -6.208, 106.845) atau DMS (cth: 6°14'52.1\"S 106°52'40.0\"E)" };
}
