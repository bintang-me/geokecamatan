// ==========================================
// 1. Validator & DMS Converter
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
    const dirResult = convertDMSToDecimal(inputStr) || convertHemisphereDecimal(inputStr);
    if (dirResult) {
        if (dirResult.lat < -90 || dirResult.lat > 90 || dirResult.lon < -180 || dirResult.lon > 180) {
            return { valid: false, error: "Nilai lintang/bujur di luar rentang yang valid (lintang −90 hingga 90, bujur −180 hingga 180)." };
        }
        return { valid: true, lat: dirResult.lat, lon: dirResult.lon, converted: true };
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
    let convertedFlag = parsedFromCommaPairs || latStr.includes(',') || lonStr.includes(',');
    latStr = cleanNumberStr(latStr);
    lonStr = cleanNumberStr(lonStr);

    // Validasi ketat: tolak sisa karakter (°, ', huruf, dll) agar tidak terpotong diam-diam oleh parseFloat
    if (!STRICT_NUMBER.test(latStr) || !STRICT_NUMBER.test(lonStr)) return formatError;

    let lat = parseFloat(latStr);
    let lon = parseFloat(lonStr);

    // KOREKSI ANGKA RAKSASA (Kesalahan Ketik Excel tanpa desimal asli) — hanya sumbu yang keluar batas
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        lat = fixGiantLat(lat);
        lon = fixGiantLon(lon);
        convertedFlag = true;
    }

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return { valid: false, error: "Nilai lintang/bujur di luar rentang yang valid (lintang −90 hingga 90, bujur −180 hingga 180)." };
    }

    return { valid: true, lat: lat, lon: lon, converted: convertedFlag };
}

// ==========================================
// 2. Parser — Badan Informasi Geospasial (BIG) (SUMBER PRIMER & ABSOLUT)
//    Menggunakan layanan Kebijakan Satu Peta untuk mendeteksi koordinat
//    langsung ke dalam batas wilayah resmi RI.
// ==========================================
// Format nama wilayah dari data BIG (HURUF KAPITAL) menjadi Title Case yang benar:
// "DKI JAKARTA" → "DKI Jakarta", "KOTO XI TARUSAN" → "Koto XI Tarusan", "TOLI-TOLI" → "Toli-Toli"
const ROMAN_NUMERAL = /^(X{0,3})(IX|IV|V?I{0,3})$/;
function formatWilayahName(str, isProvinsi = false) {
    if (!str || str === '-') return '-';
    const words = String(str).trim().split(/\s+/);
    return words.map((w, i) => {
        const upper = w.toUpperCase();
        if (upper !== '' && ROMAN_NUMERAL.test(upper)) return upper;          // angka Romawi
        if (isProvinsi && i === 0 && (upper === 'DKI' || upper === 'DI')) return upper; // DKI / DI
        return w.toLowerCase().replace(/(^|[-(/])([a-z])/g, (m, pre, ch) => pre + ch.toUpperCase());
    }).join(' ');
}

// Ambil atribut BIG tanpa peduli huruf besar/kecil nama field (WADMKC / wadmkc)
function bigAttr(attr, ...names) {
    if (!attr) return null;
    const upper = {};
    Object.keys(attr).forEach(k => { upper[k.toUpperCase()] = attr[k]; });
    for (const n of names) {
        const v = upper[n];
        if (typeof v === 'string' && v.trim() !== '' && v.trim() !== '-') return v.trim();
    }
    return null;
}

// level: 'kec' (layer 3 — kecamatan) atau 'desa' (layer 4 — desa/kelurahan)
function parseBIGResponse(data, level = 'desa') {
    if (!data || !data.features || data.features.length === 0) return null;
    const attr = data.features[0].attributes || data.features[0].properties;
    if (!attr) return null;

    const provinsi = formatWilayahName(bigAttr(attr, 'WADMPR'), true);
    const kabKota = formatWilayahName(bigAttr(attr, 'WADMKK'));
    const kecamatan = formatWilayahName(level === 'kec' ? bigAttr(attr, 'WADMKC', 'NAMOBJ') : bigAttr(attr, 'WADMKC'));
    const desaKel = level === 'desa' ? formatWilayahName(bigAttr(attr, 'WADMKD', 'WADMKD_HTML', 'NAMOBJ', 'WADMKP')) : '-';

    return { provinsi, kabKota, kecamatan, desaKel, alamat: "-" };
}

// ==========================================
// 3. Parser — ArcGIS Esri (SUMBER KEDUA)
// ==========================================
function parseArcGISResponse(data) {
    if (data.error) return null;
    const addr = data.address || {};
    const provinsi = addr.Region || "-";
    const kabKota = addr.Subregion || addr.MetroArea || "-";
    const kecamatan = addr.City || addr.District || "-";
    const desaKel = addr.Neighborhood || addr.Block || "-";
    const alamat = addr.LongLabel || addr.Match_addr || "-";
    const countryCode = addr.CountryCode || null;
    if (!addr.Region && !addr.Subregion && !addr.City) return null;
    return { provinsi, kabKota, kecamatan, desaKel, alamat, countryCode };
}

// ==========================================
// 4. Parser — Nominatim OSM (SUMBER KETIGA)
// ==========================================
function parseNominatimResponse(data) {
    const addr = data.address || {};
    const provinsi = addr.state || addr.province || "-";
    const kabKota = addr.city || addr.county || addr.town || addr.municipality || "-";
    let kecamatan = "-";
    if (addr.district) kecamatan = addr.district;
    else if (addr.city_district) kecamatan = addr.city_district;
    
    const desaKel = addr.village || addr.suburb || addr.neighbourhood || addr.hamlet || addr.quarter || "-";
    
    const alamat = data.display_name || "-";
    const countryCode = addr.country_code || null;
    // Deteksi badan air (laut, samudra, teluk, selat) — tidak memiliki administrative data
    const isWaterBody = !!(addr.sea || addr.ocean || addr.bay || addr.strait);
    return { provinsi, kabKota, kecamatan, desaKel, alamat, countryCode, isWaterBody };
}

// ==========================================
// 5. Parser — BigDataCloud (SUMBER KEEMPAT)
// ==========================================
function parseBDCResponse(data) {
    let admin = { provinsi: "-", kabKota: "-", kecamatan: "-", desaKel: "-", alamat: "-", countryCode: null };
    const countryCode = data.countryCode || null;
    if (data.localityInfo && data.localityInfo.administrative) {
        const admins = data.localityInfo.administrative;
        let level4 = null; let level5 = null; let level6Candidates = []; let level7Candidates = [];
        admins.forEach(item => {
            if (item.adminLevel === 4) level4 = item;
            if (item.adminLevel === 5) level5 = item;
            if (item.adminLevel === 6) level6Candidates.push(item);
            if (item.adminLevel >= 7) level7Candidates.push(item);
        });
        if (level4) admin.provinsi = level4.name;
        if (level5) admin.kabKota = level5.name;
        else if (data.city) admin.kabKota = data.city;

        if (level6Candidates.length === 1) admin.kecamatan = level6Candidates[0].name;
        else if (level6Candidates.length > 1) {
            const loc = (data.locality || "").toLowerCase();
            const match = level6Candidates.find(c => c.name.toLowerCase() === loc);
            admin.kecamatan = match ? match.name : level6Candidates[0].name;
        }
        if (admin.kecamatan === "-" && data.locality) admin.kecamatan = data.locality;
        
        if (level7Candidates.length > 0) admin.desaKel = level7Candidates[0].name;

        const sorted = [...admins].filter(a => a.adminLevel >= 4).sort((a, b) => b.adminLevel - a.adminLevel);
        const unique = sorted.filter((a, i, self) => i === self.findIndex((t) => t.name === a.name));
        admin.alamat = unique.map(a => a.name).join(', ');
    } else {
        if (data.principalSubdivision) admin.provinsi = data.principalSubdivision;
        if (data.city) admin.kabKota = data.city;
        if (data.locality) admin.kecamatan = data.locality;
    }
    admin.countryCode = countryCode;
    return admin;
}

// ==========================================
// 6. Geocoder — Master Hierarchy Strategy
//    Strategi pamungkas:
//    1. BIG: Kebenaran absolut untuk Kecamatan, Kab/Kota, Provinsi
//    2. ArcGIS / Nominatim: Hanya digunakan untuk melengkapi
//       detail 'alamat' (nama jalan, kelurahan) yang BIG tidak sediakan,
//       serta sebagai cadangan bila BIG tidak menemukan poligon.
// ==========================================

// Batas koordinat terluar wilayah Negara Republik Indonesia
const INDONESIA_BOUNDS = {
    latMin: -11.5, latMax: 6.5,
    lonMin: 94.5, lonMax: 141.5
};

// Cache LRU untuk reverse geocode — 50 entri, TTL 5 menit
const geocodeCache = new Map();
const CACHE_MAX = 50;
const CACHE_TTL = 5 * 60 * 1000;

function getCacheKey(lat, lon) {
    return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

function getFromCache(lat, lon) {
    const key = getCacheKey(lat, lon);
    const entry = geocodeCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        geocodeCache.delete(key);
        return null;
    }
    // LRU: hapus & set ulang agar jadi entry terbaru
    geocodeCache.delete(key);
    geocodeCache.set(key, entry);
    return entry.data;
}

function setToCache(lat, lon, data) {
    const key = getCacheKey(lat, lon);
    if (geocodeCache.size >= CACHE_MAX) {
        const oldest = geocodeCache.keys().next().value;
        geocodeCache.delete(oldest);
    }
    geocodeCache.set(key, { data, timestamp: Date.now() });
}

// Helper: fetch dengan timeout (AbortController) - cegah hang saat API tidak merespons
const fetchWithTimeout = (url, options = {}, timeoutMs = 4000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
        .then(r => { clearTimeout(id); return r.ok ? r.json() : null; })
        .catch(() => { clearTimeout(id); return null; });
};

// Antrean global Nominatim — kebijakan OSM: maksimal 1 request/detik
const NOMINATIM_INTERVAL_MS = 1100;
let nominatimQueue = Promise.resolve();
let nominatimLastCall = 0;
function nominatimFetch(url, timeoutMs = 4000) {
    const run = nominatimQueue.then(async () => {
        const wait = nominatimLastCall + NOMINATIM_INTERVAL_MS - Date.now();
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        nominatimLastCall = Date.now();
        return fetchWithTimeout(url, { headers: { 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' } }, timeoutMs);
    });
    nominatimQueue = run.catch(() => null);
    return run;
}

async function reverseGeocode(lat, lon) {
    // Cek cache terlebih dahulu
    const cached = getFromCache(lat, lon);
    if (cached) return cached;

    // --- FASE 1: BIG, ArcGIS, IsOnWater paralel ---
    // BIG: layer 3 (kecamatan) = sumber utama nama wilayah — layer yang sama dengan poligon batas di peta;
    // layer 4 (desa/kelurahan) dicoba paralel untuk nama desa.
    const bigQuery = (layer) => `https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/BATAS_WILAYAH/MapServer/${layer}/query?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`;
    const arcgisUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?location=${lon},${lat}&f=pjson&langCode=id`;
    // zoom=14 (tingkat Kecamatan/Suburb) di OSM
    const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1&zoom=14`;
    const waterUrl = `https://is-on-water.balbona.me/api/v1/get/${lat}/${lon}`;

    try {
        const [bigKecData, bigDesaData, arcData, waterData] = await Promise.all([
            fetchWithTimeout(bigQuery(3), {}, 8000), // server BIG relatif lambat
            fetchWithTimeout(bigQuery(4), {}, 8000),
            fetchWithTimeout(arcgisUrl),
            fetchWithTimeout(waterUrl, {}, 3000) // batas timeout 3 detik agar tidak memblokir jika API mati
        ]);

        const bigKec = bigKecData ? parseBIGResponse(bigKecData, 'kec') : null;
        const bigDesa = bigDesaData ? parseBIGResponse(bigDesaData, 'desa') : null;
        const bigData = bigKecData || bigDesaData;
        let bigResult = null;
        if (bigKec && bigKec.kecamatan !== '-') {
            bigResult = { ...bigKec, desaKel: bigDesa && bigDesa.desaKel !== '-' ? bigDesa.desaKel : '-' };
        } else if (bigDesa && bigDesa.kecamatan !== '-') {
            bigResult = bigDesa;
        }
        const arcResult = arcData ? parseArcGISResponse(arcData) : null;
        const bigFound = !!(bigResult && bigResult.kecamatan !== '-');

        // --- FASE 2: Nominatim (dibatasi 1 req/detik) hanya bila dibutuhkan:
        //     BIG tidak menemukan poligon, atau ArcGIS tidak memberi alamat lengkap ---
        let osmData = null;
        if (!bigFound || !arcResult || arcResult.alamat === '-') {
            osmData = await nominatimFetch(osmUrl);
        }
        const osmResult = (osmData && !osmData.error) ? parseNominatimResponse(osmData) : null;

        // Semua sumber data administrasi gagal merespons → gangguan jaringan/layanan, bukan "luar RI"
        if (!bigData && !arcData && !osmData) {
            return {
                success: false,
                networkError: true,
                error: "Tidak dapat terhubung ke layanan data. Periksa koneksi internet Anda, lalu coba lagi."
            };
        }

        // BIG adalah sumber primer & absolut: bila BIG menemukan desa/kecamatan, abaikan deteksi perairan
        if (!bigFound) {
            const isWaterFromApi = waterData && waterData.isWater === true;
            const arcAddress = arcData ? arcData.address : null;
            const isArcWater = arcAddress && (arcAddress.Type === 'Sea' || arcAddress.Type === 'Ocean' || (!arcAddress.Region && !arcAddress.Subregion && !arcAddress.City));
            const isOsmWater = osmResult && osmResult.isWaterBody;

            if (isArcWater || isOsmWater || isWaterFromApi) {
                const waterName = (arcAddress && arcAddress.Match_addr) || (osmResult && osmResult.alamat !== '-' && osmResult.alamat) || (waterData && waterData.feature) || 'Perairan';
                const result = {
                    success: false,
                    isWaterBody: true,
                    error: `Titik ini berada di perairan (${waterName}), sehingga tidak memiliki data wilayah administrasi.`,
                    outsideIndonesia: false
                };
                if (bigData) setToCache(lat, lon, result);
                return result;
            }
        }

        let finalResult = null;

        if (bigFound) {
            finalResult = { ...bigResult };
            // Desa/kelurahan: dari BIG bila ada, jika tidak dari ArcGIS/OSM
            if (!finalResult.desaKel || finalResult.desaKel === '-') {
                finalResult.desaKel = (arcResult && arcResult.desaKel !== '-' && arcResult.desaKel)
                    || (osmResult && osmResult.desaKel !== '-' && osmResult.desaKel) || '-';
            }
            if (arcResult && arcResult.alamat !== '-') {
                finalResult.alamat = arcResult.alamat;
            } else if (osmResult && osmResult.alamat !== '-') {
                finalResult.alamat = osmResult.alamat;
            } else {
                finalResult.alamat = `${finalResult.kecamatan}, ${finalResult.kabKota}, ${finalResult.provinsi}`;
            }
        }
        else if (arcResult && arcResult.kecamatan !== '-') {
            finalResult = { ...arcResult };
        }
        else if (osmResult && osmResult.kecamatan !== '-') {
            finalResult = { ...osmResult };
        }
        else {
            finalResult = arcResult || osmResult;
        }

        if (finalResult) {
            let outsideIndonesia = false;
            if (!bigFound) {
                const confirmedNonIndonesia = [arcResult, osmResult].some(r => {
                    return r && r.countryCode && !['id', 'idn', 'ina'].includes(r.countryCode.toLowerCase());
                });
                if (confirmedNonIndonesia) outsideIndonesia = true;
            }

            if (outsideIndonesia) {
                finalResult.kecamatan = '(Luar RI)';
                finalResult.kabKota = '(Luar RI)';
                finalResult.provinsi = '(Luar RI)';
                finalResult.desaKel = '(Luar RI)';
                finalResult.alamat = '-';
            }

            const result = { success: true, administrative: finalResult, outsideIndonesia, source: bigFound ? 'BIG' : 'fallback' };
            // Hasil cadangan saat BIG gagal merespons tidak di-cache, agar pencarian ulang bisa mendapat data BIG
            if (bigData || outsideIndonesia) setToCache(lat, lon, result);
            return result;
        }

        // Sumber merespons tetapi tidak ada data — tidak di-cache
        return { success: false, notFound: true, error: "Data wilayah untuk titik ini tidak ditemukan. Titik kemungkinan berada di luar daratan Indonesia." };

    } catch (error) {
        console.error("Geocoding failed:", error);
        return { success: false, networkError: true, error: "Tidak dapat terhubung ke layanan data. Periksa koneksi internet Anda, lalu coba lagi." };
    }
}

// ==========================================
// 5. Map
// ==========================================
let map;
let marker;
let boundaryLayers = []; // Array layer batas administratif
let singleSearchCoords = null; // Menyimpan koordinat aktif untuk mencegah race condition pencarian cepat

// Tema garis batas per jenis basemap.
// Teori warna: kecamatan = emas/amber (warna identitas), kab/kota = ungu (komplementer kuning)
// sehingga keduanya tidak tertukar. Setiap garis punya "casing" (garis bawah kontras):
// navy/putih di peta terang, hitam di citra satelit yang gelap — garis tetap tegas di latar apa pun.
const BOUNDARY_THEMES = {
    map: {
        kecamatan: { casing: { color: '#0F1D35', weight: 7, opacity: 0.55 }, core: { color: '#E08A00', weight: 3.5, opacity: 1, fillColor: '#EEA201', fillOpacity: 0.12 } },
        kabKota:   { casing: { color: '#FFFFFF', weight: 6, opacity: 0.95 }, core: { color: '#6D28D9', weight: 2.75, opacity: 0.95, dashArray: '10, 6', fillColor: '#6D28D9', fillOpacity: 0.03 } },
        provinsi:  { casing: null, core: { color: '#0F1D35', weight: 1.75, opacity: 0.45, dashArray: '2, 6' } }
    },
    sat: {
        kecamatan: { casing: { color: '#000000', weight: 7.5, opacity: 0.6 }, core: { color: '#FFC233', weight: 3.5, opacity: 1, fillColor: '#FFC233', fillOpacity: 0.10 } },
        kabKota:   { casing: { color: '#000000', weight: 6, opacity: 0.55 }, core: { color: '#F0ABFC', weight: 2.75, opacity: 1, dashArray: '10, 6', fillColor: '#F0ABFC', fillOpacity: 0.04 } },
        provinsi:  { casing: null, core: { color: '#FFFFFF', weight: 1.75, opacity: 0.75, dashArray: '2, 6' } }
    }
};

function boundaryCasingStyle(t) {
    return t.casing ? { ...t.casing, fill: false, lineJoin: 'round', lineCap: 'round' } : { opacity: 0, weight: 0, fill: false };
}
function boundaryCoreStyle(t) {
    return { ...t.core, fill: !!t.core.fillColor, lineJoin: 'round' };
}

// Buat layer batas (casing + garis inti) mengikuti mode basemap peta tersebut
function makeBoundaryLayer(geojson, type, pane, mapObj) {
    const t = BOUNDARY_THEMES[mapObj._ckMode || 'map'][type];
    const casing = L.geoJSON(geojson, { pane, interactive: false, style: boundaryCasingStyle(t) });
    const core = L.geoJSON(geojson, { pane, style: boundaryCoreStyle(t) });
    const group = L.featureGroup([casing, core]);
    group.ckType = type;
    group.ckCasing = casing;
    group.ckCore = core;
    return group;
}

// Terapkan ulang warna batas saat pengguna berganti Peta ↔ Satelit
function applyBoundaryTheme(mapObj) {
    const mode = mapObj._ckMode || 'map';
    mapObj.eachLayer(l => {
        if (!l.ckType) return;
        const t = BOUNDARY_THEMES[mode][l.ckType];
        l.ckCasing.setStyle(boundaryCasingStyle(t));
        l.ckCore.setStyle(boundaryCoreStyle(t));
    });
    const wrapper = mapObj.getContainer().closest('.map-wrapper') || document.querySelector('.map-wrapper');
    if (mapObj === map && wrapper) wrapper.classList.toggle('is-satellite', mode === 'sat');
}

/**
 * Hapus semua layer batas dari peta
 */
function clearBoundaryLayers() {
    if (!map) return;
    boundaryLayers.forEach(layer => {
        try { map.removeLayer(layer); } catch(e) {}
    });
    boundaryLayers = [];
}

// Konfigurasi BIG Satupeta MapServer Endpoints
const BIG_URLS = {
    kabKota: 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/BATAS_WILAYAH/MapServer/2', // Wilayah Administrasi Kabupaten/Kota (Area)
    kecamatan: 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/BATAS_WILAYAH/MapServer/3' // Wilayah Administrasi Kecamatan (Area)
};

/**
 * Menggunakan esri-leaflet untuk menembak koordinat ke peladen BIG
 * dan mengembalikan satu poligon GeoJSON.
 */
function fetchBIGBoundary(url, lat, lon) {
    return new Promise((resolve) => {
        if (typeof L.esri === 'undefined') {
            console.warn('esri-leaflet belum termuat!');
            resolve(null);
            return;
        }
        L.esri.query({ url: url })
            .intersects(L.latLng(lat, lon))
            .run(function (error, featureCollection) {
                if (error || !featureCollection || !featureCollection.features || featureCollection.features.length === 0) {
                    resolve(null);
                } else {
                    resolve(featureCollection.features[0]);
                }
            });
    });
}

/**
 * Mengambil poligon batas provinsi menggunakan API OSM (Nominatim).
 */
const osmProvinsiCache = new Map(); // nama provinsi → GeoJSON (maks 5 entri, poligon provinsi berukuran besar)

async function fetchOSMProvinsiBoundary(namaProvinsi) {
    if (!namaProvinsi || namaProvinsi === '-' || namaProvinsi === '(Luar RI)') return null;
    if (osmProvinsiCache.has(namaProvinsi)) return osmProvinsiCache.get(namaProvinsi);
    
    // Perbaiki penamaan untuk OSM (hapus awalan "DKI", dsb agar pencarian lebih relevan)
    let searchName = namaProvinsi.replace(/^DKI /i, '');

    const url = `https://nominatim.openstreetmap.org/search?state=${encodeURIComponent(searchName)}&country=Indonesia&format=jsonv2&polygon_geojson=1&limit=1`;
    try {
        const response = await nominatimFetch(url, 8000);
        if (response && response.length > 0 && response[0].geojson) {
            if (osmProvinsiCache.size >= 5) osmProvinsiCache.delete(osmProvinsiCache.keys().next().value);
            osmProvinsiCache.set(namaProvinsi, response[0].geojson);
            return response[0].geojson;
        }
    } catch (e) {
        console.warn('Gagal memuat batas provinsi OSM', e);
    }
    return null;
}

async function fetchAndDrawBoundaries(adminData, lat, lon, onKecamatanFeature) {
    clearBoundaryLayers();
    if (!map || !adminData || lat == null || lon == null) return;

    // Set koordinat aktif untuk melacak race condition pencarian cepat
    singleSearchCoords = { lat, lon };

    // 1. Gambar Provinsi (OSM) secara independen (zIndex 410)
    const namaProv = adminData.provinsi;
    fetchOSMProvinsiBoundary(namaProv).then(provGeoJSON => {
        if (provGeoJSON && map && singleSearchCoords && singleSearchCoords.lat === lat && singleSearchCoords.lon === lon) {
            const layer = makeBoundaryLayer(provGeoJSON, 'provinsi', 'provPane', map)
                .bindTooltip(`Batas Provinsi: ${namaProv}`, { sticky: true, className: 'boundary-tooltip' })
                .addTo(map);
            boundaryLayers.push(layer);
        }
    }).catch(e => console.warn('Gagal memuat batas provinsi', e));

    // 2. Gambar Kab/Kota (BIG) secara independen (zIndex 420)
    fetchBIGBoundary(BIG_URLS.kabKota, lat, lon).then(kabFeature => {
        if (kabFeature && map && singleSearchCoords && singleSearchCoords.lat === lat && singleSearchCoords.lon === lon) {
            const name = formatWilayahName(bigAttr(kabFeature.properties, 'WADMKK')) !== '-' ? formatWilayahName(bigAttr(kabFeature.properties, 'WADMKK')) : adminData.kabKota;
            const layer = makeBoundaryLayer(kabFeature, 'kabKota', 'kabPane', map)
                .bindTooltip(`Kabupaten/Kota: ${name}`, { sticky: true, className: 'boundary-tooltip' })
                .addTo(map);
            boundaryLayers.push(layer);
        }
    }).catch(e => console.warn('Gagal memuat batas Kab/Kota', e));

    // 3. Gambar Kecamatan (BIG) secara independen (zIndex 430)
    fetchBIGBoundary(BIG_URLS.kecamatan, lat, lon).then(kecFeature => {
        if (kecFeature && map && singleSearchCoords && singleSearchCoords.lat === lat && singleSearchCoords.lon === lon) {
            const props = kecFeature.properties || {};
            const bigKecName = formatWilayahName(bigAttr(props, 'WADMKC', 'NAMOBJ'));
            const name = bigKecName !== '-' ? bigKecName : adminData.kecamatan;
            const layer = makeBoundaryLayer(kecFeature, 'kecamatan', 'kecPane', map)
                .bindTooltip(`Kecamatan: ${name}`, { sticky: true, className: 'boundary-tooltip' })
                .addTo(map);
            boundaryLayers.push(layer);
            if (onKecamatanFeature && bigKecName !== '-') {
                onKecamatanFeature({
                    kecamatan: bigKecName,
                    kabKota: formatWilayahName(bigAttr(props, 'WADMKK')),
                    provinsi: formatWilayahName(bigAttr(props, 'WADMPR'), true)
                });
            }
        }
    }).catch(e => console.warn('Gagal memuat batas kecamatan', e));
}

// Factory: buat tile layers — sekali definisi, dipakai initMap dan initBatchMap
function createMapLayers() {
    // Semua basemap dari server Esri (tanpa API key). CARTO tidak dipakai lagi karena kini
    // menampilkan tile "API key required".
    const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

    const standardMap = L.tileLayer(`${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`, {
        attribution: 'Tiles &copy; Esri &mdash; Sumber: Esri, HERE, Garmin, USGS, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    });

    const esriSatellite = L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
        attribution: '&copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community',
        maxZoom: 19
    });

    const labelsMap = L.tileLayer(`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, {
        attribution: 'Label &copy; Esri',
        maxZoom: 19
    });

    const satelliteHybrid = L.layerGroup([esriSatellite, labelsMap]);

    return { standardMap, esriSatellite, labelsMap, satelliteHybrid };
}

// Pemilih basemap "Peta | Satelit" (segmented control)
function addBasemapSwitch(mapObj, layers) {
    const Switch = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function () {
            const box = L.DomUtil.create('div', 'leaflet-control basemap-switch');
            box.setAttribute('role', 'group');
            box.setAttribute('aria-label', 'Jenis peta dasar');
            const make = (label, layer, active) => {
                const b = L.DomUtil.create('button', '', box);
                b.type = 'button';
                b.textContent = label;
                b.setAttribute('aria-pressed', active ? 'true' : 'false');
                L.DomEvent.on(b, 'click', (e) => {
                    L.DomEvent.stop(e);
                    if (mapObj.hasLayer(layer)) return;
                    mapObj.removeLayer(layers.standardMap);
                    mapObj.removeLayer(layers.satelliteHybrid);
                    layer.addTo(mapObj);
                    mapObj._ckMode = layer === layers.satelliteHybrid ? 'sat' : 'map';
                    applyBoundaryTheme(mapObj);
                    box.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
                });
            };
            make('Peta', layers.standardMap, true);
            make('Satelit', layers.satelliteHybrid, false);
            L.DomEvent.disableClickPropagation(box);
            return box;
        }
    });
    mapObj.addControl(new Switch());
}

// Pin lokasi utama: navy dengan titik emas (selaras logo)
function createMainPinIcon() {
    return L.divIcon({
        className: 'ck-pin',
        html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 46" width="34" height="43" aria-hidden="true"><path d="M18 45C18 45 3 28 3 17a15 15 0 0 1 30 0c0 11-15 28-15 28z" fill="#0F1D35" stroke="#FFFFFF" stroke-width="2"/><circle cx="18" cy="17" r="6" fill="#EEA201"/></svg>',
        iconSize: [34, 43],
        iconAnchor: [17, 43],
        popupAnchor: [0, -40]
    });
}

// Sembunyikan indikator "Memuat peta…" saat tile pertama selesai dimuat
function watchMapLoading(layers) {
    const el = document.getElementById('mapLoading');
    if (!el) return;
    const hide = () => el.classList.add('hidden');
    layers.standardMap.once('load', hide);
    layers.esriSatellite.once('load', hide);
    setTimeout(hide, 8000);
}

function initMap(containerId, onLocationSelected) {
    const initialLat = -2.5;
    const initialLon = 118.0;

    map = L.map(containerId, {
        zoomControl: true,
        preferCanvas: true
    }).setView([initialLat, initialLon], 5);

    // Buat map panes kustom untuk mengatur urutan penumpukan z-index layer administratif
    map.createPane('provPane');
    map.getPane('provPane').style.zIndex = 410;
    map.getPane('provPane').style.pointerEvents = 'none'; // agar tidak menghalangi klik pada layer di atasnya

    map.createPane('kabPane');
    map.getPane('kabPane').style.zIndex = 420;

    map.createPane('kecPane');
    map.getPane('kecPane').style.zIndex = 430;

    const layers = createMapLayers();
    watchMapLoading(layers);

    // Peta default: standar (terang) — selaras tampilan; Satelit tersedia di pemilih
    layers.standardMap.addTo(map);
    addBasemapSwitch(map, layers);

    marker = L.marker([initialLat, initialLon], { draggable: true, icon: createMainPinIcon(), keyboard: true, title: 'Titik lokasi (dapat digeser)' }).addTo(map);

    // Normalisasi bujur ke -180..180 (peta bisa digeser melewati antimeridian) & bulatkan 6 desimal
    const normalizeLatLng = (latlng) => {
        const w = latlng.wrap();
        return L.latLng(Math.round(w.lat * 1e6) / 1e6, Math.round(w.lng * 1e6) / 1e6);
    };

    marker.on('dragend', function () {
        const pos = normalizeLatLng(marker.getLatLng());
        marker.setLatLng(pos);
        map.setView(pos, map.getZoom());
        onLocationSelected(pos.lat, pos.lng);
    });

    map.on('click', function (e) {
        const pos = normalizeLatLng(e.latlng);
        marker.setLatLng(pos);
        map.setView(pos, map.getZoom());
        onLocationSelected(pos.lat, pos.lng);
    });

    // Tambahkan kontrol Autozoom kustom di bawah kontrol zoom (+/-) bawaan Leaflet
    const AutoZoomControl = L.Control.extend({
        options: {
            position: 'topleft'
        },
        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-custom-autozoom');
            const link = L.DomUtil.create('a', '', container);
            link.href = '#';
            link.title = 'Perbesar ke titik lokasi';
            link.role = 'button';
            link.style.display = 'flex';
            link.style.alignItems = 'center';
            link.style.justifyContent = 'center';
            link.style.width = '30px';
            link.style.height = '30px';

            link.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                </svg>
            `;

            L.DomEvent.on(link, 'click', function (e) {
                L.DomEvent.preventDefault(e);
                L.DomEvent.stopPropagation(e);
                if (marker) {
                    const pos = marker.getLatLng();
                    map.setView(pos, 17); // Zoom-in langsung ke level 17
                }
            });

            return container;
        }
    });
    map.addControl(new AutoZoomControl());

    // Fix bug peta terpotong abu-abu yang lebih solid (menggunakan ResizeObserver)
    if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(() => {
            map.invalidateSize();
        });
        resizeObserver.observe(document.getElementById(containerId));
    } else {
        setTimeout(() => map.invalidateSize(), 500);
    }
}

function updateMapMarker(lat, lon) {
    if (!map || !marker) return;
    const latlng = L.latLng(lat, lon);
    marker.setLatLng(latlng);
    // Zoom ke tingkat kecamatan agar titik & poligon terlihat (jangan zoom-out bila pengguna sudah lebih dekat)
    map.setView(latlng, Math.max(map.getZoom(), 13));
}

// ==========================================
// 5b. Batch Map (Peta Cari Massal)
// ==========================================
let batchMap = null;
let batchMarkers = [];
let batchBoundaryLayers = []; // Penampung untuk poligon interaktif di peta batch
let activeBatchCoords = null; // Menyimpan koordinat aktif pencarian batch untuk mencegah race condition
let batchMapInitialized = false;
let lastSelectedBatchMarker = null;

function clearBatchBoundaryLayers() {
    if (!batchMap) return;
    batchBoundaryLayers.forEach(layer => {
        try { batchMap.removeLayer(layer); } catch(e) {}
    });
    batchBoundaryLayers = [];
}

function initBatchMap() {
    if (batchMapInitialized) return;
    batchMapInitialized = true;

    batchMap = L.map('batchMap', {
        zoomControl: true,
        preferCanvas: true
    }).setView([-2.5, 118.0], 5);

    // Buat map panes kustom untuk peta batch
    batchMap.createPane('kabPane');
    batchMap.getPane('kabPane').style.zIndex = 420;

    batchMap.createPane('kecPane');
    batchMap.getPane('kecPane').style.zIndex = 430;

    const batchLayers = createMapLayers();
    batchLayers.standardMap.addTo(batchMap);
    addBasemapSwitch(batchMap, batchLayers);

    // Tambahkan kontrol Autozoom kustom di bawah kontrol zoom (+/-) bawaan Leaflet pada Peta Cari Massal
    const AutoZoomControlBatch = L.Control.extend({
        options: {
            position: 'topleft'
        },
        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-custom-autozoom');
            const link = L.DomUtil.create('a', '', container);
            link.href = '#';
            link.title = 'Perbesar ke titik terpilih';
            link.role = 'button';
            link.style.display = 'flex';
            link.style.alignItems = 'center';
            link.style.justifyContent = 'center';
            link.style.width = '30px';
            link.style.height = '30px';

            link.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                </svg>
            `;

            L.DomEvent.on(link, 'click', function (e) {
                L.DomEvent.preventDefault(e);
                L.DomEvent.stopPropagation(e);
                if (lastSelectedBatchMarker) {
                    batchMap.setView(lastSelectedBatchMarker.getLatLng(), 17); // Zoom-in langsung ke level 17
                } else if (batchMarkers.length > 0) {
                    fitBatchMapBounds(); // Zoom ke seluruh sebaran jika belum ada yang dipilih
                }
            });

            return container;
        }
    });
    batchMap.addControl(new AutoZoomControlBatch());

    // ResizeObserver fix
    if (window.ResizeObserver) {
        new ResizeObserver(() => batchMap.invalidateSize()).observe(document.getElementById('batchMap'));
    }
}

// Pesan & label status yang tampil ke pengguna
const OUTSIDE_RI_MSG = "Titik ini berada di luar wilayah Negara Kesatuan Republik Indonesia.";
const STATUS_LABELS = {
    'Sukses': 'Berhasil',
    'Wilayah Perairan': 'Perairan',
    'Luar Batas RI': 'Luar Indonesia',
    'Gagal': 'Tidak ditemukan',
    'Error API': 'Layanan gagal',
    'Error': 'Tidak valid',
    'Kosong': 'Kosong'
};
function statusLabel(status) { return STATUS_LABELS[status] || status; }

// Utilitas sanitasi HTML — mencegah XSS via data dari API atau input pengguna
function escapeHtml(str) {
    if (typeof str !== 'string') return '-';
    const el = document.createElement('div');
    el.textContent = str;
    return el.innerHTML;
}

async function showBatchBoundaries(data) {
    if (!batchMap) return;
    clearBatchBoundaryLayers();
    activeBatchCoords = null;
    if (data.status !== 'Sukses') return;

    // Set koordinat aktif pencarian batch untuk mencegah race condition
    activeBatchCoords = { lat: data.lat, lon: data.lon };

    // 1. Gambar Kab/Kota (BIG) secara independen (zIndex 420)
    fetchBIGBoundary(BIG_URLS.kabKota, data.lat, data.lon).then(kabFeature => {
        if (kabFeature && batchMap && activeBatchCoords && activeBatchCoords.lat === data.lat && activeBatchCoords.lon === data.lon) {
            const kabLayer = makeBoundaryLayer(kabFeature, 'kabKota', 'kabPane', batchMap)
                .bindTooltip(`Kabupaten/Kota: ${data.kabKota}`, { sticky: true, className: 'boundary-tooltip' })
                .addTo(batchMap);
            batchBoundaryLayers.push(kabLayer);
        }
    }).catch(e => console.warn('Gagal memuat batas Kab/Kota batch', e));

    // 2. Gambar Kecamatan (BIG) secara independen (zIndex 430)
    fetchBIGBoundary(BIG_URLS.kecamatan, data.lat, data.lon).then(kecFeature => {
        if (kecFeature && batchMap && activeBatchCoords && activeBatchCoords.lat === data.lat && activeBatchCoords.lon === data.lon) {
            const kecLayer = makeBoundaryLayer(kecFeature, 'kecamatan', 'kecPane', batchMap)
                .bindTooltip(`Kecamatan: ${data.kecamatan}`, { sticky: true, className: 'boundary-tooltip' })
                .addTo(batchMap);
            batchBoundaryLayers.push(kecLayer);
            
            // Zoom sedikit untuk menyorot poligon tanpa menghilangkan konteks
            try {
                batchMap.fitBounds(kecLayer.getBounds(), { padding: [20, 20], maxZoom: 14 });
            } catch(e) {}
        }
    }).catch(e => console.warn('Gagal memuat batas kecamatan batch', e));
}

function addBatchMarker(data) {
    if (!batchMap) return;

    // Tentukan warna berdasarkan status
    let pinColor;
    if (data.status === 'Sukses') {
        pinColor = '#0F7B4A'; // hijau
    } else if (data.status === 'Kosong') {
        pinColor = '#8A93A3'; // abu
    } else if (data.status === 'Luar Batas RI' || data.status === 'Wilayah Perairan') {
        pinColor = '#B7791F'; // peringatan
    } else {
        pinColor = '#B42318'; // merah
    }

    // Buat custom SVG pin icon (mirip marker Leaflet asli tapi berwarna)
    const svgPin = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="22" height="33">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24C24 5.373 18.627 0 12 0z"
              fill="${pinColor}" stroke="#fff" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="5" fill="rgba(255,255,255,0.9)"/>
    </svg>`;

    const pinIcon = L.divIcon({
        html: svgPin,
        className: '',
        iconSize: [22, 33],
        iconAnchor: [11, 33],
        popupAnchor: [0, -34]
    });

    const popupContent = `
        <div style="font-family:inherit;min-width:160px;">
            <div style="font-weight:700;margin-bottom:4px;color:#0F1D35;">No. ${escapeHtml(String(data.id))}</div>
            <div style="font-size:0.85rem;color:#374151;">
                <b>Desa/Kelurahan:</b> ${escapeHtml(data.desaKel || '-')}<br>
                <b>Kecamatan:</b> ${escapeHtml(data.kecamatan)}<br>
                <b>Kabupaten/Kota:</b> ${escapeHtml(data.kabKota)}<br>
                <b>Provinsi:</b> ${escapeHtml(data.provinsi)}<br>
                <b>Status:</b> <span style="color:${pinColor};font-weight:600;">${escapeHtml(statusLabel(data.status))}</span>
            </div>
        </div>
    `;

    const m = L.marker([data.lat, data.lon], { icon: pinIcon });
    m.batchId = data.id; // Simpan ID untuk referensi silang tabel-peta
    m.bindPopup(popupContent);
    
    m.on('click', () => {
        lastSelectedBatchMarker = m;
    });

    // Fitur: Poligon Interaktif (On-Click Highlight) — titik non-Sukses membersihkan poligon lama
    m.on('click', () => {
        showBatchBoundaries(data);
    });

    m.addTo(batchMap);
    batchMarkers.push(m);

    // Auto-positioning untuk titik pertama yang muncul di peta
    if (batchMarkers.length === 1) {
        lastSelectedBatchMarker = m;
        batchMap.setView(m.getLatLng(), 13);
    }
}

function clearBatchMarkers() {
    if (!batchMap) return;
    batchMarkers.forEach(m => m.remove());
    batchMarkers = [];
    lastSelectedBatchMarker = null;
    clearBatchBoundaryLayers(); // Bersihkan poligon juga saat tabel di-reset
}

function fitBatchMapBounds() {
    if (!batchMap || batchMarkers.length === 0) return;
    const group = L.featureGroup(batchMarkers);
    batchMap.fitBounds(group.getBounds().pad(0.15));
}


// ==========================================
// 6. UI
// ==========================================
const STATUS_COLORS = { success: '#0F6B41', warning: '#7A5200', error: '#9B1C12' };

function setModalStatus(text, kind) {
    const statusEl = document.getElementById('modalInfoStatus');
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color = STATUS_COLORS[kind] || '';
}

function setBadge(text, kind) {
    const badge = document.getElementById('confidenceBadge');
    if (!badge) return;
    if (!text) { badge.classList.add('hidden'); return; }
    badge.textContent = text;
    badge.className = `badge badge-${kind}`;
    badge.title = kind === 'success'
        ? 'Nama wilayah dari poligon batas resmi Badan Informasi Geospasial (BIG).'
        : kind === 'neutral' ? 'Layanan BIG belum merespons; nama wilayah diambil dari layanan peta Esri/OpenStreetMap.' : '';
}

function showLoading() {
    document.getElementById('emptyState')?.classList.add('hidden');
    document.getElementById('loadingIndicator').classList.remove('hidden');
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('resultContent').classList.add('hidden');
    setBadge(null);

    const modalBox = document.getElementById('mapSingleInfoBox');
    if (modalBox && !modalBox.classList.contains('hidden')) setModalStatus('Memproses…', 'warning');
}

function showError(message) {
    document.getElementById('emptyState')?.classList.add('hidden');
    document.getElementById('loadingIndicator').classList.add('hidden');
    document.getElementById('resultContent').classList.add('hidden');
    setBadge(null);

    const errorState = document.getElementById('errorState');
    errorState.classList.remove('hidden');
    document.getElementById('errorMessage').textContent = message;

    // Peringatan (kuning) untuk luar RI dan wilayah perairan; selain itu error (merah)
    const isWater = message.startsWith("Titik ini berada di perairan");
    const isWarning = message === OUTSIDE_RI_MSG || isWater;
    errorState.classList.toggle('is-warning', isWarning);

    const modalBox = document.getElementById('mapSingleInfoBox');
    if (modalBox && !modalBox.classList.contains('hidden')) {
        ['modalInfoDesaKel', 'modalInfoKecamatan', 'modalInfoKabKota', 'modalInfoProvinsi']
            .forEach(id => { document.getElementById(id).textContent = '-'; });
        if (isWarning) setModalStatus(isWater ? 'Perairan' : 'Luar Indonesia', 'warning');
        else setModalStatus('Gagal', 'error');
    }
}

function showResult(data, lat, lon) {
    document.getElementById('emptyState')?.classList.add('hidden');
    document.getElementById('loadingIndicator').classList.add('hidden');
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('resultContent').classList.remove('hidden');

    const admin = data.administrative;

    document.getElementById('resProvinsi').textContent = admin.provinsi;
    document.getElementById('resKabKota').textContent = admin.kabKota;
    document.getElementById('resKecamatan').textContent = admin.kecamatan;
    document.getElementById('resDesaKel').textContent = admin.desaKel || "-";
    document.getElementById('resAlamat').textContent = admin.alamat && admin.alamat !== '-' ? admin.alamat : '';
    const coordEl = document.getElementById('resKoordinat');
    if (coordEl) coordEl.textContent = (typeof lat === 'number' && typeof lon === 'number') ? `${lat.toFixed(6)}, ${lon.toFixed(6)}` : '-';

    const kec = admin.kecamatan || '-';
    let status = 'Data tidak ditemukan', kind = 'error';
    if (kec === '(Luar RI)') { status = 'Luar Indonesia'; kind = 'warning'; }
    else if (kec !== '-' && kec !== '') { status = 'Berhasil'; kind = 'success'; }

    // Badge sumber data
    if (kec === '(Luar RI)') setBadge('Berada di luar wilayah Indonesia', 'danger');
    else if (kec === '-' || kec === '') setBadge('Kecamatan tidak terdeteksi', 'danger');
    else if (data.source === 'BIG') setBadge('Sumber resmi · BIG', 'success');
    else setBadge('Sumber: Esri/OSM', 'neutral');

    // Update modal info box jika aktif (tidak disembunyikan)
    const modalBox = document.getElementById('mapSingleInfoBox');
    if (modalBox && !modalBox.classList.contains('hidden')) {
        document.getElementById('modalInfoDesaKel').textContent = admin.desaKel || '-';
        document.getElementById('modalInfoKecamatan').textContent = kec;
        document.getElementById('modalInfoKabKota').textContent = admin.kabKota || '-';
        document.getElementById('modalInfoProvinsi').textContent = admin.provinsi || '-';
        setModalStatus(status, kind);
    }
}

// Salin teks ke clipboard dengan fallback untuk konteks non-HTTPS (navigator.clipboard tidak tersedia)
function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('Peramban ini tidak mendukung fitur salin'));
    });
}

function setInputValue(lat, lon) {
    document.getElementById('coordInput').value = `${lat}, ${lon}`;
}

// ==========================================
// 7. History Management
// ==========================================
const HISTORY_KEY = 'geokecamatan_history';

function getHistory() {
    try {
        const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY));
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function saveToHistory(lat, lon, adminData) {
    let history = getHistory();
    const coordStr = `${lat}, ${lon}`;

    // Remove duplicate
    history = history.filter(h => h.coord !== coordStr);

    history.unshift({
        coord: coordStr,
        lat,
        lon,
        kecamatan: adminData.kecamatan,
        kabKota: adminData.kabKota,
        timestamp: new Date().toISOString()
    });

    if (history.length > 50) history.pop();
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        console.warn('Riwayat tidak dapat disimpan (localStorage tidak tersedia/penuh):', e);
    }
    renderHistory();
}

function clearHistory() {
    try { localStorage.removeItem(HISTORY_KEY); } catch (e) { console.warn(e); }
    renderHistory();
}

function removeHistoryItem(coordStr) {
    let history = getHistory().filter(h => h.coord !== coordStr);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (e) { console.warn(e); }
    renderHistory();
}

function formatHistoryTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return 'Baru saja';
    const sameDay = new Date().toDateString() === d.toDateString();
    const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    return sameDay ? time : `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}, ${time}`;
}

function renderHistory() {
    const history = getHistory();
    const historyList = document.getElementById('historyList');

    if (history.length === 0) {
        historyList.innerHTML = '<p class="history-empty">Belum ada riwayat pencarian.</p>';
        return;
    }

    historyList.innerHTML = '';

    history.forEach(item => {
        const row = document.createElement('div');
        row.className = 'history-item';
        row.setAttribute('role', 'button');
        row.tabIndex = 0;

        const left = document.createElement('div');
        left.className = 'hist-left';

        const details = document.createElement('span');
        details.className = 'hist-details';
        details.textContent = [item.kecamatan && item.kecamatan !== '-' ? item.kecamatan : null, item.kabKota && item.kabKota !== '-' ? item.kabKota : null]
            .filter(Boolean).join(', ') || 'Kecamatan tidak ditemukan';

        const coord = document.createElement('span');
        coord.className = 'hist-coord';
        coord.textContent = item.coord;

        left.appendChild(details);
        left.appendChild(coord);

        const time = document.createElement('span');
        time.className = 'hist-time';
        time.textContent = formatHistoryTime(item.timestamp);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'delete-item-btn';
        delBtn.setAttribute('aria-label', `Hapus riwayat ${item.coord}`);
        delBtn.textContent = '×';

        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeHistoryItem(item.coord);
        });

        const open = () => {
            document.getElementById('coordInput').value = item.coord;
            window.scrollTo({ top: 0, behavior: 'smooth' });
            document.getElementById('searchBtn').click();
        };
        row.addEventListener('click', open);
        row.addEventListener('keydown', (e) => {
            if (e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); }
        });

        row.appendChild(left);
        row.appendChild(time);
        row.appendChild(delBtn);

        historyList.appendChild(row);
    });
}

// ==========================================
// 8. Main App
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // LOADING AWAL (splash) — hanya selama memuat, maks ~1,2 detik, sekali per sesi
    // ==========================================
    (function() {
        const splash = document.getElementById('introSplash');
        if (!splash) return;
        try { sessionStorage.setItem('ck_splash_seen', '1'); } catch (e) {}

        const MIN_MS = 700;   // cukup untuk animasi logo, tanpa kesan berkedip
        const MAX_MS = 1200;  // batas atas: jangan menahan pengguna
        const EXIT_MS = 400;  // sama dengan transisi CSS
        const started = performance.now();

        function dismissSplash() {
            if (splash.classList.contains('intro-exit')) return;
            splash.classList.add('intro-exit');
            setTimeout(() => splash.classList.add('intro-hidden'), EXIT_MS);
        }
        const dismissWhenReady = () => {
            const wait = Math.max(0, MIN_MS - (performance.now() - started));
            setTimeout(dismissSplash, wait);
        };

        if (document.readyState === 'complete') dismissWhenReady();
        else window.addEventListener('load', dismissWhenReady, { once: true });
        setTimeout(dismissSplash, MAX_MS);
        splash.addEventListener('click', dismissSplash);
        document.addEventListener('keydown', dismissSplash, { once: true });
    })();

    const searchBtn = document.getElementById('searchBtn');
    const coordInput = document.getElementById('coordInput');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    initMap('map', (lat, lon) => {
        setInputValue(lat, lon);
        doGeocode(lat, lon);
    });

    renderHistory();

    // Tautan langsung ke tab Cari Massal (#massal), mis. dari halaman Tentang
    if (location.hash === '#massal') {
        setTimeout(() => document.querySelector('.tab-btn[data-tab="tab-massal"]')?.click(), 0);
    }

    // Tautan berbagi: ?q=lat,lon langsung mencari titik tersebut
    try {
        const q = new URLSearchParams(location.search).get('q');
        if (q) {
            coordInput.value = q;
            setTimeout(() => processInput(q), 0);
        }
    } catch (e) {}

    // Copy to clipboard logic
    const copyKecamatanContainer = document.getElementById('copyKecamatanContainer');
    const resKecamatan = document.getElementById('resKecamatan');
    const copyTooltip = document.getElementById('copyTooltip');

    if (copyKecamatanContainer) {
        copyKecamatanContainer.addEventListener('click', () => {
            const textToCopy = resKecamatan.textContent;
            if (textToCopy && textToCopy !== '-') {
                copyText(textToCopy).then(() => {
                    copyTooltip.classList.add('show');
                    setTimeout(() => {
                        copyTooltip.classList.remove('show');
                    }, 2000);
                }).catch(err => {
                    console.error('Gagal menyalin: ', err);
                });
            }
        });
    }

    const copyDesaKelContainer = document.getElementById('copyDesaKelContainer');
    const resDesaKel = document.getElementById('resDesaKel');
    const copyDesaKelTooltip = document.getElementById('copyDesaKelTooltip');

    if (copyDesaKelContainer) {
        copyDesaKelContainer.addEventListener('click', () => {
            const textToCopy = resDesaKel.textContent;
            if (textToCopy && textToCopy !== '-') {
                copyText(textToCopy).then(() => {
                    copyDesaKelTooltip.classList.add('show');
                    setTimeout(() => {
                        copyDesaKelTooltip.classList.remove('show');
                    }, 2000);
                }).catch(err => {
                    console.error('Gagal menyalin: ', err);
                });
            }
        });
    }

    const searchForm = document.getElementById('searchForm');
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        processInput(coordInput.value);
    });

    // Contoh format yang bisa diklik
    document.querySelectorAll('.example-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            coordInput.value = chip.dataset.coord;
            processInput(coordInput.value);
        });
    });

    // Lokasi saya (GPS perangkat)
    const locateBtn = document.getElementById('locateBtn');
    if (locateBtn) {
        locateBtn.addEventListener('click', () => {
            if (!navigator.geolocation) {
                showError('Peramban ini tidak mendukung deteksi lokasi.');
                return;
            }
            locateBtn.disabled = true;
            navigator.geolocation.getCurrentPosition((pos) => {
                locateBtn.disabled = false;
                const lat = Math.round(pos.coords.latitude * 1e6) / 1e6;
                const lon = Math.round(pos.coords.longitude * 1e6) / 1e6;
                setInputValue(lat, lon);
                updateMapMarker(lat, lon);
                doGeocode(lat, lon);
            }, (err) => {
                locateBtn.disabled = false;
                showError(err.code === 1
                    ? 'Izin akses lokasi ditolak. Aktifkan izin lokasi pada peramban atau masukkan koordinat secara manual.'
                    : 'Lokasi perangkat tidak dapat ditentukan. Coba lagi atau masukkan koordinat secara manual.');
            }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
        });
    }

    // Salin semua & bagikan tautan
    let lastResult = null; // { lat, lon, admin }
    const flashLabel = (btn, text) => {
        if (btn.dataset.flash) return;
        btn.dataset.flash = '1';
        const original = btn.textContent;
        btn.textContent = text;
        setTimeout(() => { btn.textContent = original; delete btn.dataset.flash; }, 2000);
    };
    const copyAllBtn = document.getElementById('copyAllBtn');
    if (copyAllBtn) {
        copyAllBtn.addEventListener('click', () => {
            if (!lastResult) return;
            const a = lastResult.admin;
            const text = [
                `Desa/Kelurahan: ${a.desaKel || '-'}`,
                `Kecamatan: ${a.kecamatan || '-'}`,
                `Kabupaten/Kota: ${a.kabKota || '-'}`,
                `Provinsi: ${a.provinsi || '-'}`,
                `Koordinat: ${lastResult.lat}, ${lastResult.lon}`
            ].join('\n');
            copyText(text).then(() => flashLabel(copyAllBtn, 'Tersalin!')).catch(err => console.error(err));
        });
    }
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            if (!lastResult) return;
            const url = `${location.origin}${location.pathname}?q=${lastResult.lat},${lastResult.lon}`;
            const title = `Kecamatan ${lastResult.admin.kecamatan} — Cari Kecamatan`;
            if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
                try { await navigator.share({ title, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
            }
            copyText(url).then(() => flashLabel(shareBtn, 'Tautan tersalin!')).catch(err => console.error(err));
        });
    }

    clearHistoryBtn.addEventListener('click', () => {
        if (getHistory().length === 0) return;
        if (confirm("Hapus semua riwayat pencarian?")) {
            clearHistory();
        }
    });

    function processInput(inputStr) {
        const parsed = parseCoordinates(inputStr);
        if (!parsed.valid) {
            showError(parsed.error);
            return;
        }
        if (parsed.converted) {
            setInputValue(parsed.lat, parsed.lon);
        }
        updateMapMarker(parsed.lat, parsed.lon);
        doGeocode(parsed.lat, parsed.lon);
    }

    let singleRequestSeq = 0; // token untuk membuang respons pencarian lama (race condition)

    function setSearching(on) {
        searchBtn.classList.toggle('is-loading', on);
        searchBtn.querySelector('.btn-label').textContent = on ? 'Mencari…' : 'Cari lokasi';
    }

    async function doGeocode(lat, lon) {
        const reqId = ++singleRequestSeq;
        lastResult = null;
        setSearching(false);
        // Bersihkan batas lama & tandai koordinat aktif agar fetch batas lama tertolak
        clearBoundaryLayers();
        singleSearchCoords = { lat, lon };

        // Koordinat di luar RI: peringatan langsung, tanpa API call
        if (lat < INDONESIA_BOUNDS.latMin || lat > INDONESIA_BOUNDS.latMax || lon < INDONESIA_BOUNDS.lonMin || lon > INDONESIA_BOUNDS.lonMax) {
            showError(OUTSIDE_RI_MSG);
            return;
        }

        showLoading();
        setSearching(true);

        const result = await reverseGeocode(lat, lon);
        if (reqId !== singleRequestSeq) return; // sudah ada pencarian yang lebih baru
        setSearching(false);
        // Konfirmasi dari API: wilayah ini bukan Republik Indonesia
        if (result.outsideIndonesia) {
            showError(OUTSIDE_RI_MSG);
            return;
        }
        if (result.success) {
            showResult(result, lat, lon);
            lastResult = { lat, lon, admin: result.administrative };
            saveToHistory(lat, lon, result.administrative);
            // Fetch dan gambar batas administratif di background (non-blocking)
            fetchAndDrawBoundaries(result.administrative, lat, lon, (big) => {
                // Poligon kecamatan BIG berhasil dimuat: pastikan panel memakai nama resmi BIG
                if (reqId !== singleRequestSeq || result.source === 'BIG') return;
                const admin = { ...result.administrative, kecamatan: big.kecamatan };
                if (big.kabKota !== '-') admin.kabKota = big.kabKota;
                if (big.provinsi !== '-') admin.provinsi = big.provinsi;
                result.administrative = admin;
                result.source = 'BIG';
                showResult(result, lat, lon);
                lastResult = { lat, lon, admin };
                saveToHistory(lat, lon, admin);
            });
        } else {
            showError(result.error);
        }
    }

    // ==========================================
    // 9. Tab Switching Logic
    // ==========================================
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
            tabPanes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
            document.getElementById(btn.dataset.tab).classList.add('active');
            
            // Fix map rendering issue when switching tabs
            if (btn.dataset.tab === 'tab-tunggal' && map) {
                setTimeout(() => map.invalidateSize(), 100);
            }
            // Lazy init peta batch saat pertama kali tab massal diklik
            if (btn.dataset.tab === 'tab-massal') {
                setTimeout(() => {
                    initBatchMap();
                    if (batchMap) batchMap.invalidateSize();
                }, 100);
            }
        });
    });

    // ==========================================
    // 10. Batch Processing Logic
    // ==========================================
    const batchInput = document.getElementById('batchInput');
    const processBatchBtn = document.getElementById('processBatchBtn');
    const clearBatchBtn = document.getElementById('clearBatchBtn');
    const batchTableBody = document.getElementById('batchTableBody');
    const batchProgressContainer = document.getElementById('batchProgressContainer');
    const batchProgressBar = document.getElementById('batchProgressBar');
    const batchProgressText = document.getElementById('batchProgressText');
    const expandTableBtn = document.getElementById('expandTableBtn');
    const tableModal = document.getElementById('tableModal');
    const closeTableModalBtn = document.getElementById('closeTableModalBtn');
    const tableModalBody = document.querySelector('.table-modal-body');
    const batchTable = document.getElementById('batchTable');
    const expandMapBtn = document.getElementById('expandMapBtn');
    const expandSingleMapBtn = document.getElementById('expandSingleMapBtn');
    const mapModal = document.getElementById('mapModal');
    const closeMapModalBtn = document.getElementById('closeMapModalBtn');
    const mapModalBody = document.getElementById('mapModalBody');

    let batchData = [];
    let isProcessing = false;
    let batchRunId = 0; // token untuk membatalkan proses batch yang sedang berjalan

    // Label tombol proses mengikuti jumlah titik ("Proses 5 titik")
    function countBatchLines() {
        return batchInput.value.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim() !== '').length;
    }
    function updateProcessLabel() {
        if (isProcessing) return;
        const n = countBatchLines();
        processBatchBtn.textContent = n > 0 ? `Proses ${n} titik` : 'Mulai proses';
    }

    // Nomor baris di samping textarea
    const batchGutter = document.getElementById('batchGutter');
    function updateGutter() {
        if (!batchGutter) return;
        const n = Math.max(1, batchInput.value.replace(/\r\n?/g, '\n').split('\n').length);
        let out = '';
        for (let i = 1; i <= n; i++) out += i + (i < n ? '\n' : '');
        batchGutter.textContent = out;
        batchGutter.scrollTop = batchInput.scrollTop;
    }
    batchInput.addEventListener('input', () => { updateGutter(); updateProcessLabel(); });
    batchInput.addEventListener('scroll', () => { if (batchGutter) batchGutter.scrollTop = batchInput.scrollTop; });

    // Unggah / seret file CSV/TXT: ambil pasangan lintang-bujur dari tiap baris
    function extractCoordLine(line) {
        const fields = line.split(/[;\t,]/).map(f => f.trim().replace(/^"|"$/g, ''));
        const num = (f) => /^[+-]?\d+(\.\d+)?$/.test(f) ? parseFloat(f) : NaN;
        for (let i = 0; i < fields.length - 1; i++) {
            const a = num(fields[i]), b = num(fields[i + 1]);
            if (!isNaN(a) && !isNaN(b) && Math.abs(a) <= 90 && Math.abs(b) > 90 && Math.abs(b) <= 180) {
                return `${fields[i]}, ${fields[i + 1]}`;
            }
        }
        return line.trim();
    }
    function loadBatchFile(file) {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { alert('Ukuran berkas maksimal 5 MB.'); return; }
        const reader = new FileReader();
        reader.onload = () => {
            const rows = String(reader.result).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
            let lines = rows.map(extractCoordLine);
            // Buang baris judul (mis. "lat,lon") di awal file
            while (lines.length && lines[0] !== '' && !parseCoordinates(lines[0]).valid && /[a-z]/i.test(lines[0])) lines.shift();
            batchInput.value = lines.join('\n').replace(/\n+$/, '');
            updateGutter();
            updateProcessLabel();
        };
        reader.readAsText(file);
    }
    const batchFile = document.getElementById('batchFile');
    const batchDrop = document.getElementById('batchDrop');
    if (batchFile) batchFile.addEventListener('change', () => { loadBatchFile(batchFile.files[0]); batchFile.value = ''; });
    if (batchDrop) {
        ['dragenter', 'dragover'].forEach(ev => batchDrop.addEventListener(ev, (e) => { e.preventDefault(); batchDrop.classList.add('is-dragover'); }));
        ['dragleave', 'drop'].forEach(ev => batchDrop.addEventListener(ev, (e) => { e.preventDefault(); batchDrop.classList.remove('is-dragover'); }));
        batchDrop.addEventListener('drop', (e) => loadBatchFile(e.dataTransfer.files[0]));
    }

    function resetBatchButton() {
        isProcessing = false;
        processBatchBtn.disabled = false;
        updateProcessLabel();
    }

    clearBatchBtn.addEventListener('click', () => {
        batchRunId++; // batalkan proses yang sedang berjalan
        resetBatchButton();
        batchInput.value = '';
        updateGutter();
        updateProcessLabel();
        batchTableBody.innerHTML = '<tr class="empty-row"><td colspan="7">Belum ada data yang diproses.</td></tr>';
        batchFilter = 'all';
        updateBatchSummary();
        batchData = [];
        batchProgressContainer.classList.add('hidden');
        clearBatchMarkers();
    });

    processBatchBtn.addEventListener('click', async () => {
        if (isProcessing) return;
        
        const rawText = batchInput.value;
        // Menghapus newline ekstra di akhir, tapi mempertahankan baris kosong di tengah
        const lines = rawText.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
        
        if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
            alert('Masukkan setidaknya satu baris koordinat.');
            return;
        }

        const runId = ++batchRunId;
        const isStale = () => runId !== batchRunId;
        isProcessing = true;
        processBatchBtn.disabled = true;
        processBatchBtn.textContent = 'Memproses…';
        batchTableBody.innerHTML = '';
        batchData = [];
        batchFilter = 'all';
        updateBatchSummary();
        clearBatchMarkers();
        initBatchMap();
        
        batchProgressContainer.classList.remove('hidden');
        const progressLabel = document.getElementById('batchProgressLabel');
        const progressTrack = document.getElementById('batchProgressTrack');
        if (progressLabel) progressLabel.textContent = 'Memproses';
        batchProgressBar.style.width = '0%';
        batchProgressText.textContent = `0 / ${lines.length}`;

        // Create tasks
        let tasks = lines.map((line, index) => {
            const isEmpty = line.trim() === '';
            return {
                id: index + 1,
                originalText: line,
                isEmpty: isEmpty,
                parsed: isEmpty ? null : parseCoordinates(line)
            };
        });

        // Konkurensi 3 request bersamaan
        const concurrencyLimit = 3;
        let activeCount = 0;
        let index = 0;
        let completed = 0;

        await new Promise((resolve) => {
            function next() {
                if (index >= tasks.length) {
                    if (activeCount === 0) resolve();
                    return;
                }

                while (activeCount < concurrencyLimit && index < tasks.length) {
                    const task = tasks[index++];
                    activeCount++;

                    processTask(task).then(result => {
                        if (isStale()) return;
                        if (result.inputText === undefined) result.inputText = task.originalText.trim();
                        batchData.push(result);
                        renderBatchRow(result);
                        // addBatchMarker terima, hanya jika lat/lon adalah angka valid
                        if (typeof result.lat === 'number' && typeof result.lon === 'number' &&
                            isFinite(result.lat) && isFinite(result.lon)) {
                            addBatchMarker(result);
                        }
                    }).catch(err => {
                        if (isStale()) return;
                        // Jika processTask gagal total, tetap catat sebagai error
                        console.error('Task gagal:', task.id, err);
                        const fallback = {
                            id: task.id, lat: '-', lon: '-', inputText: task.originalText.trim(),
                            kecamatan: '-', kabKota: '-', provinsi: '-',
                            status: 'Error'
                        };
                        batchData.push(fallback);
                        renderBatchRow(fallback);
                    }).finally(() => {
                        // KRITIS: selalu jalankan apapun yang terjadi
                        activeCount--;
                        if (isStale()) {
                            // Proses dibatalkan: hentikan antrean tanpa menyentuh UI
                            index = tasks.length;
                            if (activeCount === 0) resolve();
                            return;
                        }
                        completed++;
                        const percent = (completed / tasks.length) * 100;
                        batchProgressBar.style.width = `${percent}%`;
                        if (progressTrack) progressTrack.setAttribute('aria-valuenow', String(Math.round(percent)));
                        batchProgressText.textContent = `${completed} / ${tasks.length}`;
                        next();
                    });
                }
            }
            next();
        });

        if (isStale()) return;
        resetBatchButton();
        if (progressLabel) progressLabel.textContent = 'Selesai';
        
        // Ensure final render is sorted by original ID
        batchData.sort((a, b) => a.id - b.id);
        batchTableBody.innerHTML = '';
        batchData.forEach(item => renderBatchRow(item));
        fitBatchMapBounds();
    });

    async function processTask(task) {
        try {
            if (task.isEmpty) {
                return {
                    id: task.id,
                    lat: '', lon: '', kecamatan: '', kabKota: '', provinsi: '',
                    status: 'Kosong'
                };
            }

            if (!task.parsed || !task.parsed.valid) {
                return {
                    id: task.id,
                    lat: '-', lon: '-', kecamatan: '-', kabKota: '-', provinsi: '-',
                    status: 'Error',
                    inputText: task.originalText.trim(),
                    errorMsg: task.parsed ? task.parsed.error : ''
                };
            }

            const lat = task.parsed.lat;
            const lon = task.parsed.lon;

            // Cek cepat batas koordinat wilayah RI terluar secara fisik sebelum panggil geocoder
            if (lat < INDONESIA_BOUNDS.latMin || lat > INDONESIA_BOUNDS.latMax || lon < INDONESIA_BOUNDS.lonMin || lon > INDONESIA_BOUNDS.lonMax) {
                return {
                    id: task.id,
                    lat: lat,
                    lon: lon,
                    desaKel: '-',
                    kecamatan: '(Luar RI)',
                    kabKota: '(Luar RI)',
                    provinsi: '(Luar RI)',
                    status: 'Luar Batas RI'
                };
            }

            const result = await reverseGeocode(lat, lon);

            if (result.success) {
                const adm = result.administrative;
                let status = 'Sukses';
                
                if (adm.kecamatan === '(Luar RI)' || result.outsideIndonesia) {
                    status = 'Luar Batas RI';
                } else if (adm.kecamatan === '(Perairan)') {
                    status = 'Wilayah Perairan';
                } else if (adm.kecamatan === '-') {
                    status = 'Gagal';
                }

                return {
                    id: task.id,
                    lat: lat,
                    lon: lon,
                    desaKel: adm.desaKel || '-',
                    kecamatan: adm.kecamatan === '-' ? 'Tidak ditemukan' : adm.kecamatan,
                    kabKota: adm.kabKota,
                    provinsi: adm.provinsi,
                    status: status
                };
            } else {
                // Bedakan perairan/luar RI nyata atau network failure dari API
                if (result.isWaterBody) {
                    return {
                        id: task.id,
                        lat: lat,
                        lon: lon,
                        desaKel: '-',
                        kecamatan: '(Perairan)',
                        kabKota: '(Perairan)',
                        provinsi: '(Perairan)',
                        status: 'Wilayah Perairan'
                    };
                } else if (result.outsideIndonesia) {
                    return {
                        id: task.id,
                        lat: lat,
                        lon: lon,
                        desaKel: '-',
                        kecamatan: '(Luar RI)',
                        kabKota: '(Luar RI)',
                        provinsi: '(Luar RI)',
                        status: 'Luar Batas RI'
                    };
                } else {
                    return {
                        id: task.id,
                        lat: lat,
                        lon: lon,
                        desaKel: '-',
                        kecamatan: result.notFound ? 'Tidak ditemukan' : '-', kabKota: '-', provinsi: '-',
                        status: result.networkError ? 'Error API' : 'Gagal',
                        errorMsg: result.error || ''
                    };
                }
            }
        } catch (err) {
            // Safety net: jika ada error tak terduga, JANGAN biarkan promise reject
            console.error('processTask error untuk task', task.id, err);
            return {
                id: task.id,
                lat: '-', lon: '-', desaKel: '-', kecamatan: '-', kabKota: '-', provinsi: '-',
                status: 'Error'
            };
        }
    }

    const BATCH_MESSAGES = {
        'Wilayah Perairan': 'Titik berada di perairan',
        'Luar Batas RI': 'Berada di luar wilayah Indonesia',
        'Error API': 'Layanan data tidak merespons. Silakan proses ulang.',
        'Gagal': 'Kecamatan tidak ditemukan',
        'Error': 'Format tidak dikenali. Gunakan format desimal atau DMS.',
        'Kosong': 'Baris kosong'
    };

    // Di mobile kolom Koordinat/Desa/Provinsi disembunyikan → pesan cukup membentang 2 kolom (Kecamatan, Kab/Kota)
    const mobileTableMq = window.matchMedia('(max-width: 768px)');
    const batchMsgColspan = () => (mobileTableMq.matches ? 2 : 4);
    const syncMsgColspans = () => document.querySelectorAll('.batch-table td.col-msg').forEach(td => { td.colSpan = batchMsgColspan(); });
    if (mobileTableMq.addEventListener) mobileTableMq.addEventListener('change', syncMsgColspans);

    function renderBatchRow(data) {
        const tr = document.createElement('tr');
        tr.title = 'Klik untuk melihat titik pada peta';

        const group = batchStatusGroup(data.status);
        tr.dataset.group = group;
        tr.classList.add('row-' + group);
        if (batchFilter !== 'all' && batchFilter !== group) tr.classList.add('row-filtered');
        if (data.errorMsg) tr.title = data.errorMsg;

        const td = (text, cls, colspan) => {
            const el = document.createElement('td');
            if (cls) el.className = cls;
            if (colspan) el.colSpan = colspan;
            el.textContent = text ?? '-';
            tr.appendChild(el);
            return el;
        };

        const hasCoord = typeof data.lat === 'number' && typeof data.lon === 'number';
        const coordText = hasCoord ? `${data.lat}, ${data.lon}` : (data.inputText || '');

        td(data.id, 'col-no');
        td(coordText, 'col-coord');
        if (group === 'success') {
            td(data.desaKel || '-');
            td(data.kecamatan, 'col-kec');
            td(data.kabKota);
            td(data.provinsi);
        } else {
            const msg = (data.status === 'Gagal' || data.status === 'Error API') && data.errorMsg ? data.errorMsg : BATCH_MESSAGES[data.status];
            td(msg || data.status, 'col-msg', batchMsgColspan());
        }
        const statusTd = td('', 'col-status');
        const pill = document.createElement('span');
        pill.className = `status-pill status-${group}`;
        pill.textContent = statusLabel(data.status);
        statusTd.appendChild(pill);

        batchTableBody.appendChild(tr);
        updateBatchSummary();
    }

    // ---- Ringkasan & filter status hasil batch ----
    const batchSummary = document.getElementById('batchSummary');
    let batchFilter = 'all';
    const BATCH_GROUP_LABELS = {
        success: 'Berhasil',
        warning: 'Perairan/luar Indonesia',
        error: 'Gagal/tidak valid',
        empty: 'Kosong'
    };

    function batchStatusGroup(status) {
        if (status === 'Sukses') return 'success';
        if (status === 'Kosong') return 'empty';
        if (status === 'Luar Batas RI' || status === 'Wilayah Perairan') return 'warning';
        return 'error';
    }

    function updateBatchSummary() {
        if (!batchSummary) return;
        if (batchData.length === 0) {
            batchSummary.classList.add('hidden');
            batchSummary.innerHTML = '';
            return;
        }
        const counts = { success: 0, warning: 0, error: 0, empty: 0 };
        batchData.forEach(d => counts[batchStatusGroup(d.status)]++);
        if (batchFilter !== 'all' && counts[batchFilter] === 0) batchFilter = 'all';

        batchSummary.innerHTML = '';
        const makeChip = (key, label, count) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `summary-chip chip-${key}` + (batchFilter === key ? ' active' : '');
            b.dataset.filter = key;
            b.setAttribute('aria-pressed', batchFilter === key ? 'true' : 'false');
            const lbl = document.createElement('span');
            lbl.textContent = label;
            const num = document.createElement('strong');
            num.textContent = count;
            b.append(lbl, ' ', num);
            batchSummary.appendChild(b);
        };
        makeChip('all', 'Semua', batchData.length);
        Object.keys(BATCH_GROUP_LABELS).forEach(k => {
            if (counts[k] > 0) makeChip(k, BATCH_GROUP_LABELS[k], counts[k]);
        });
        batchSummary.classList.remove('hidden');
    }

    function applyBatchFilter() {
        const rows = [
            ...batchTableBody.querySelectorAll('tr[data-group]'),
            ...tableModalBody.querySelectorAll('tr[data-group]')
        ];
        rows.forEach(r => r.classList.toggle('row-filtered', batchFilter !== 'all' && r.dataset.group !== batchFilter));
    }

    if (batchSummary) {
        batchSummary.addEventListener('click', (e) => {
            const chip = e.target.closest('.summary-chip');
            if (!chip) return;
            batchFilter = (chip.dataset.filter === batchFilter && batchFilter !== 'all') ? 'all' : chip.dataset.filter;
            applyBatchFilter();
            updateBatchSummary();
        });
    }

    // Interaktivitas Tabel -> Peta: sinkronisasi sorotan baris dan marker
    function syncMapWithTableRow(e) {
        const tr = e.target.closest('tr');
        if (!tr || !tr.parentElement || tr.parentElement.tagName !== 'TBODY') return;

        const firstTd = tr.querySelector('td:first-child');
        if (!firstTd) return;
        const idText = firstTd.textContent;
        const dataId = parseInt(idText, 10);
        if (isNaN(dataId)) return;

        // Highlight baris di tabel utama
        const mainRows = batchTableBody.querySelectorAll('tr');
        mainRows.forEach(r => r.classList.remove('row-selected')); // reset
        const targetMainRow = Array.from(mainRows).find(r => r.querySelector('td:first-child')?.textContent === idText);
        if (targetMainRow) targetMainRow.classList.add('row-selected');

        // Highlight baris di modal tabel (jika sedang terbuka)
        if (tableModalBody) {
            const modalRows = tableModalBody.querySelectorAll('.batch-table tbody tr');
            modalRows.forEach(r => r.classList.remove('row-selected')); // reset
            const targetModalRow = Array.from(modalRows).find(r => r.querySelector('td:first-child')?.textContent === idText);
            if (targetModalRow) targetModalRow.classList.add('row-selected');
        }

        // Cari marker terkait dan pan peta
        if (typeof batchMarkers !== 'undefined' && batchMap) {
            const marker = batchMarkers.find(m => m.batchId === dataId);
            if (marker) {
                lastSelectedBatchMarker = marker;
                batchMap.setView(marker.getLatLng(), 13, { animate: true });
                marker.openPopup();
                
                const dataItem = batchData.find(item => item.id === dataId);
                if (dataItem) {
                    showBatchBoundaries(dataItem);
                }
                
                // Jika peta dalam modal terbuka, invalidateSize sesaat untuk memastikan
                if (document.getElementById('mapModal') && document.getElementById('mapModal').classList.contains('active')) {
                    setTimeout(() => batchMap.invalidateSize(), 50);
                }
            }
        }
    }

    batchTableBody.addEventListener('click', syncMapWithTableRow);
    tableModalBody.addEventListener('click', syncMapWithTableRow);

    // Export & Copy — menu "Salin ▾" dan tombol "Unduh CSV" (panel utama & modal tabel)
    function clipboardCopyWithFeedback(text, btn) {
        copyText(text).then(() => {
            if (btn.dataset.copying) return;
            btn.dataset.copying = '1';
            const originalHTML = btn.innerHTML;
            btn.textContent = 'Tersalin!';
            setTimeout(() => { btn.innerHTML = originalHTML; delete btn.dataset.copying; }, 2000);
        }).catch(err => console.error('Gagal menyalin: ', err));
    }

    const sortedBatchData = () => batchData.slice().sort((a, b) => a.id - b.id);
    const copyBuilders = {
        table: () => "No.\tLintang\tBujur\tDesa/Kelurahan\tKecamatan\tKabupaten/Kota\tProvinsi\tStatus\n" +
            sortedBatchData().map(d => `${d.id}\t${d.lat}\t${d.lon}\t${d.desaKel ?? ''}\t${d.kecamatan}\t${d.kabKota}\t${d.provinsi}\t${statusLabel(d.status)}`).join('\n'),
        kecamatan: () => sortedBatchData().map(d => d.kecamatan).join('\n'),
        kabKota: () => sortedBatchData().map(d => d.kabKota).join('\n'),
        desaKel: () => sortedBatchData().map(d => d.desaKel ?? '').join('\n'),
        coord: () => sortedBatchData().map(d => `${d.lat}\t${d.lon}`).join('\n')
    };

    function closeCopyMenus(except) {
        document.querySelectorAll('.copy-menu').forEach(menu => {
            if (menu === except) return;
            const list = menu.querySelector('.copy-menu-list');
            const toggle = menu.querySelector('.copy-menu-toggle');
            if (list) list.hidden = true;
            if (toggle) toggle.setAttribute('aria-expanded', 'false');
        });
    }

    document.querySelectorAll('.copy-menu').forEach(menu => {
        const toggle = menu.querySelector('.copy-menu-toggle');
        const list = menu.querySelector('.copy-menu-list');
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (batchData.length === 0) return;
            const willOpen = list.hidden;
            closeCopyMenus(menu);
            list.hidden = !willOpen;
            toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        });
        list.addEventListener('click', (e) => {
            const item = e.target.closest('[data-copy]');
            if (!item) return;
            e.stopPropagation();
            closeCopyMenus();
            if (batchData.length === 0) return;
            clipboardCopyWithFeedback(copyBuilders[item.dataset.copy](), toggle);
        });
    });
    document.addEventListener('click', () => closeCopyMenus());

    function buildBatchCsv() {
        const esc = (v) => {
            const str = String(v ?? '');
            return /[",;\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
        };
        const header = ['No.', 'Input asli', 'Lintang', 'Bujur', 'Desa/Kelurahan', 'Kecamatan', 'Kabupaten/Kota', 'Provinsi', 'Status'];
        const rows = sortedBatchData().map(d => [d.id, d.inputText ?? '', d.lat, d.lon, d.desaKel ?? '', d.kecamatan, d.kabKota, d.provinsi, statusLabel(d.status)]);
        // BOM agar Excel membaca UTF-8 dengan benar
        return '﻿' + [header, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
    }

    document.querySelectorAll('.download-csv-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (batchData.length === 0) return;
            const blob = new Blob([buildBatchCsv()], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const a = document.createElement('a');
            a.href = url;
            a.download = `hasil-cari-kecamatan-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
    });

    // Perbesar tabel hasil (modal)
    expandTableBtn.addEventListener('click', () => {
        if (batchData.length === 0) return;
        // Clone tabel ke dalam modal
        const clone = batchTable.cloneNode(true);
        clone.id = 'batchTableClone';
        // Pastikan thead selalu sebelum tbody
        const thead = clone.querySelector('thead');
        const tbody = clone.querySelector('tbody');
        if (thead && tbody && tbody.compareDocumentPosition(thead) & Node.DOCUMENT_POSITION_PRECEDING) {
            clone.insertBefore(thead, tbody);
        }
        // Pastikan header cells solid — inline style override
        const headerCells = clone.querySelectorAll('thead th');
        headerCells.forEach(function(cell) {
            cell.style.position = 'sticky';
            cell.style.top = '0';
            cell.style.zIndex = '100';
            cell.style.background = '#0f264a';
        });
        tableModalBody.innerHTML = '';
        tableModalBody.appendChild(clone);
        tableModal.classList.add('active');
    });

    closeTableModalBtn.addEventListener('click', () => {
        tableModal.classList.remove('active');
    });

    tableModal.addEventListener('click', (e) => {
        if (e.target === tableModal) tableModal.classList.remove('active');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeCopyMenus();
        if (e.key === 'Escape' && tableModal.classList.contains('active')) {
            tableModal.classList.remove('active');
        }
        if (e.key === 'Escape' && mapModal.classList.contains('active')) {
            closeMapModal();
        }
    });

    // Perbesar peta (modal)
    let activeExpandedMap = null; // 'single' or 'batch'

    function closeMapModal() {
        document.getElementById('mapModal').classList.remove('active');
        
        if (activeExpandedMap === 'single') {
            var mapEl = document.getElementById('map');
            var wrapper = document.querySelector('.map-wrapper');
            var btn = document.getElementById('expandSingleMapBtn');
            if (wrapper && mapEl) {
                if (btn) wrapper.insertBefore(mapEl, btn);
                else wrapper.appendChild(mapEl);
            }
            document.getElementById('mapSingleInfoBox').classList.add('hidden');
            if (typeof map !== 'undefined' && map) {
                setTimeout(function() { map.invalidateSize(); }, 100);
                setTimeout(function() { map.invalidateSize(); }, 400);
                setTimeout(function() { map.invalidateSize(); }, 800);
            }
        } else if (activeExpandedMap === 'batch') {
            var mapEl = document.getElementById('batchMap');
            var legend = document.querySelector('.batch-map-legend');
            var section = document.querySelector('.batch-map-section');
            if (section && mapEl) {
                if (legend) section.insertBefore(mapEl, legend);
                else section.appendChild(mapEl);
            }
            if (typeof batchMap !== 'undefined' && batchMap) {
                setTimeout(function() { batchMap.invalidateSize(); }, 100);
                setTimeout(function() { batchMap.invalidateSize(); }, 400);
                setTimeout(function() { batchMap.invalidateSize(); }, 800);
            }
        }
        activeExpandedMap = null;
    }

    if (expandSingleMapBtn) {
        expandSingleMapBtn.addEventListener('click', function() {
            activeExpandedMap = 'single';
            document.getElementById('mapModalTitle').textContent = 'Peta lokasi';
            document.getElementById('mapModalLegend').style.display = 'none';
            
            // Ambil data terbaru dari panel hasil Cari Tunggal
            const desa = document.getElementById('resDesaKel').textContent.trim();
            const kec = document.getElementById('resKecamatan').textContent.trim();
            const kab = document.getElementById('resKabKota').textContent.trim();
            const prov = document.getElementById('resProvinsi').textContent.trim();
            
            let status = 'Data tidak ditemukan';
            if (kec !== '-' && kec !== '') {
                if (kec === '(Luar RI)' || kec.includes('Luar RI')) {
                    status = 'Luar Indonesia';
                } else if (kec === '(Perairan)' || kec.includes('Perairan')) {
                    status = 'Perairan';
                } else {
                    status = 'Berhasil';
                }
            }
            
            document.getElementById('modalInfoDesaKel').textContent = desa;
            document.getElementById('modalInfoKecamatan').textContent = kec;
            document.getElementById('modalInfoKabKota').textContent = kab;
            document.getElementById('modalInfoProvinsi').textContent = prov;
            document.getElementById('modalInfoStatus').textContent = status;
            
            // Berikan warna status
            const statusEl = document.getElementById('modalInfoStatus');
            if (status === 'Berhasil') {
                statusEl.style.color = '#0F6B41'; // green
            } else if (status === 'Data tidak ditemukan') {
                statusEl.style.color = '#9B1C12'; // red
            } else {
                statusEl.style.color = '#7A5200'; // amber/warning
            }
            
            document.getElementById('mapSingleInfoBox').classList.remove('hidden');
            
            document.getElementById('mapModal').classList.add('active');
            document.getElementById('mapModalBody').appendChild(document.getElementById('map'));
            
            if (typeof map !== 'undefined' && map) {
                setTimeout(function() { map.invalidateSize(); }, 100);
                setTimeout(function() { map.invalidateSize(); }, 400);
                setTimeout(function() { map.invalidateSize(); }, 800);
            }
        });
    }

    expandMapBtn.addEventListener('click', function() {
        activeExpandedMap = 'batch';
        document.getElementById('mapModalTitle').textContent = 'Peta sebaran titik';
        document.getElementById('mapModalLegend').style.display = 'flex';
        document.getElementById('mapModal').classList.add('active');
        document.getElementById('mapModalBody').appendChild(document.getElementById('batchMap'));
        
        if (typeof batchMap !== 'undefined' && batchMap) {
            setTimeout(function() { batchMap.invalidateSize(); }, 100);
            setTimeout(function() { batchMap.invalidateSize(); }, 400);
            setTimeout(function() { batchMap.invalidateSize(); }, 800);
        }
    });

    closeMapModalBtn.addEventListener('click', closeMapModal);

    mapModal.addEventListener('click', function(e) {
        if (e.target === mapModal) closeMapModal();
    });

    // ==========================================
    // 11. Collapsible Text Toggle (Selengkapnya)
    // ==========================================
    document.querySelectorAll('.toggle-text-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const parent = link.parentElement;
            const shortText = parent.querySelector('.text-short');
            const fullText = parent.querySelector('.text-full');
            
            if (fullText.classList.contains('hidden')) {
                // Expand
                fullText.classList.remove('hidden');
                shortText.classList.add('hidden');
                link.textContent = 'Sembunyikan';
            } else {
                // Collapse
                fullText.classList.add('hidden');
                shortText.classList.remove('hidden');
                link.textContent = 'Selengkapnya';
            }
        });
    });
});
