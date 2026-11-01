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
            return { valid: false, error: "Nilai lat/long dari format DMS di luar batas Bumi." };
        }
        return { valid: true, lat: dirResult.lat, lon: dirResult.lon, converted: true };
    }

    const formatError = { valid: false, error: "Format koordinat tidak dikenali. Coba desimal (cth: -6.208, 106.845) atau DMS (cth: 6°14'52.1\"S 106°52'40.0\"E)" };

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
        return { valid: false, error: "Nilai lat/long di luar batas normal Bumi." };
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

function parseBIGResponse(data) {
    if (!data || !data.features || data.features.length === 0) return null;
    const attr = data.features[0].attributes || data.features[0].properties;
    if (!attr) return null;

    let provinsi = formatWilayahName(attr.WADMPR, true);
    let kabKota = formatWilayahName(attr.WADMKK);
    let kecamatan = formatWilayahName(attr.WADMKC);
    let desaKel = formatWilayahName(attr.WADMKD || attr.WADMKD_HTML || attr.WADMKP || "-");

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
    const bigUrl = `https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/BATAS_WILAYAH/MapServer/4/query?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=pjson`;
    const arcgisUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?location=${lon},${lat}&f=pjson&langCode=id`;
    // zoom=14 (tingkat Kecamatan/Suburb) di OSM
    const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1&zoom=14`;
    const waterUrl = `https://is-on-water.balbona.me/api/v1/get/${lat}/${lon}`;

    try {
        const [bigData, arcData, waterData] = await Promise.all([
            fetchWithTimeout(bigUrl, {}, 8000), // server BIG relatif lambat
            fetchWithTimeout(arcgisUrl),
            fetchWithTimeout(waterUrl, {}, 3000) // batas timeout 3 detik agar tidak memblokir jika API mati
        ]);

        const bigResult = bigData ? parseBIGResponse(bigData) : null;
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
                error: "Gagal terhubung ke layanan data geoportal. Periksa koneksi internet lalu coba lagi."
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
                    error: `Wilayah ini terdeteksi berada di perairan (${waterName}). Tidak terdapat data administrasi darat pada titik koordinat ini.`,
                    outsideIndonesia: false
                };
                if (bigData) setToCache(lat, lon, result);
                return result;
            }
        }

        let finalResult = null;

        if (bigFound) {
            finalResult = { ...bigResult };
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
        return { success: false, notFound: true, error: "Lokasi tidak ditemukan di database manapun. Titik mungkin berada di luar wilayah daratan Indonesia." };

    } catch (error) {
        console.error("Geocoding failed:", error);
        return { success: false, networkError: true, error: "Gagal terhubung ke layanan data geoportal." };
    }
}

// ==========================================
// 5. Map
// ==========================================
let map;
let marker;
let boundaryLayers = []; // Array layer batas administratif
let singleSearchCoords = null; // Menyimpan koordinat aktif untuk mencegah race condition pencarian cepat

// Konfigurasi style per level administratif
const BOUNDARY_STYLES = {
    provinsi: {
        color: '#FFFFFF',   // Putih
        weight: 2.5,
        opacity: 0.6,
        fillColor: '#FFFFFF',
        fillOpacity: 0.02,
        dashArray: '10, 6'
    },
    kabKota: {
        color: '#3B82F6',   // Biru
        weight: 2.0,
        opacity: 0.75,
        fillColor: '#3B82F6',
        fillOpacity: 0.03,
        dashArray: '6, 4'
    },
    kecamatan: {
        color: '#EEA201',   // Emas — identitas website
        weight: 2.5,
        opacity: 0.95,
        fillColor: '#EEA201',
        fillOpacity: 0.10,
        dashArray: null
    }
};

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

async function fetchAndDrawBoundaries(adminData, lat, lon) {
    clearBoundaryLayers();
    if (!map || !adminData || lat == null || lon == null) return;

    // Set koordinat aktif untuk melacak race condition pencarian cepat
    singleSearchCoords = { lat, lon };

    // 1. Gambar Provinsi (OSM) secara independen (zIndex 410)
    const namaProv = adminData.provinsi;
    fetchOSMProvinsiBoundary(namaProv).then(provGeoJSON => {
        if (provGeoJSON && map && singleSearchCoords && singleSearchCoords.lat === lat && singleSearchCoords.lon === lon) {
            const layer = L.geoJSON(provGeoJSON, { 
                style: BOUNDARY_STYLES.provinsi,
                pane: 'provPane'
            })
                .bindTooltip(`Batas Provinsi: ${namaProv}`, { sticky: true, className: 'boundary-tooltip' })
                .addTo(map);
            boundaryLayers.push(layer);
        }
    }).catch(e => console.warn('Gagal memuat batas provinsi', e));

    // 2. Gambar Kab/Kota (BIG) secara independen (zIndex 420)
    fetchBIGBoundary(BIG_URLS.kabKota, lat, lon).then(kabFeature => {
        if (kabFeature && map && singleSearchCoords && singleSearchCoords.lat === lat && singleSearchCoords.lon === lon) {
            const name = kabFeature.properties.WADMKK || kabFeature.properties.wadmkk || adminData.kabKota;
            const layer = L.geoJSON(kabFeature, { 
                style: BOUNDARY_STYLES.kabKota,
                pane: 'kabPane'
            })
                .bindTooltip(`Kab/Kota: ${name}`, { sticky: true, className: 'boundary-tooltip' })
                .addTo(map);
            boundaryLayers.push(layer);
        }
    }).catch(e => console.warn('Gagal memuat batas Kab/Kota', e));

    // 3. Gambar Kecamatan (BIG) secara independen (zIndex 430)
    fetchBIGBoundary(BIG_URLS.kecamatan, lat, lon).then(kecFeature => {
        if (kecFeature && map && singleSearchCoords && singleSearchCoords.lat === lat && singleSearchCoords.lon === lon) {
            const name = kecFeature.properties.WADMKC || kecFeature.properties.wadmkc || adminData.kecamatan;
            const layer = L.geoJSON(kecFeature, { 
                style: BOUNDARY_STYLES.kecamatan,
                pane: 'kecPane'
            })
                .bindTooltip(`Kecamatan: ${name}`, { sticky: true, className: 'boundary-tooltip' })
                .addTo(map);
            boundaryLayers.push(layer);
        }
    }).catch(e => console.warn('Gagal memuat batas kecamatan', e));
}

// Factory: buat tile layers — sekali definisi, dipakai initMap dan initBatchMap
function createMapLayers() {
    const standardMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    });

    const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; <a href="https://www.esri.com">Esri</a>, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19
    });

    const labelsMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    });

    const satelliteHybrid = L.layerGroup([esriSatellite, labelsMap]);

    return { standardMap, esriSatellite, labelsMap, satelliteHybrid };
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

    const { standardMap, satelliteHybrid } = createMapLayers();

    // Set peta default saat halaman dimuat — Satellite Hybrid
    satelliteHybrid.addTo(map);

    // Tambahkan kontrol layer ke peta
    const baseMaps = {
        "Peta Standar": standardMap,
        "Satelit Hybrid": satelliteHybrid
    };

    L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

    marker = L.marker([initialLat, initialLon], { draggable: true }).addTo(map);

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
            link.title = 'Fokus & Zoom ke Titik Lokasi Utama (Zoom 17)';
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

    const { standardMap, satelliteHybrid } = createMapLayers();

    // Set peta default batch — Satellite Hybrid
    satelliteHybrid.addTo(batchMap);

    L.control.layers({ "Peta Standar": standardMap, "Satelit Hybrid": satelliteHybrid }, null, { position: 'topright' }).addTo(batchMap);

    // Tambahkan kontrol Autozoom kustom di bawah kontrol zoom (+/-) bawaan Leaflet pada Peta Cari Massal
    const AutoZoomControlBatch = L.Control.extend({
        options: {
            position: 'topleft'
        },
        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-custom-autozoom');
            const link = L.DomUtil.create('a', '', container);
            link.href = '#';
            link.title = 'Fokus & Autozoom ke Titik Terpilih (Zoom 17)';
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
            const kabLayer = L.geoJSON(kabFeature, { 
                style: BOUNDARY_STYLES.kabKota,
                pane: 'kabPane'
            })
                .bindTooltip(`Kab/Kota: ${data.kabKota}`, { sticky: true, className: 'boundary-tooltip' })
                .addTo(batchMap);
            batchBoundaryLayers.push(kabLayer);
        }
    }).catch(e => console.warn('Gagal memuat batas Kab/Kota batch', e));

    // 2. Gambar Kecamatan (BIG) secara independen (zIndex 430)
    fetchBIGBoundary(BIG_URLS.kecamatan, data.lat, data.lon).then(kecFeature => {
        if (kecFeature && batchMap && activeBatchCoords && activeBatchCoords.lat === data.lat && activeBatchCoords.lon === data.lon) {
            const kecLayer = L.geoJSON(kecFeature, { 
                style: BOUNDARY_STYLES.kecamatan,
                pane: 'kecPane'
            })
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
        pinColor = '#10B981'; // hijau
    } else if (data.status === 'Kosong') {
        pinColor = '#6B7280'; // abu
    } else if (data.status === 'Luar Batas RI' || data.status === 'Wilayah Perairan') {
        pinColor = '#EEA201'; // emas/warning
    } else {
        pinColor = '#EF4444'; // merah
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
            <div style="font-weight:700;margin-bottom:4px;color:#14305E;">No. ${escapeHtml(String(data.id))}</div>
            <div style="font-size:0.85rem;color:#374151;">
                <b>Desa/Kelurahan:</b> ${escapeHtml(data.desaKel || '-')}<br>
                <b>Kecamatan:</b> ${escapeHtml(data.kecamatan)}<br>
                <b>Kab/Kota:</b> ${escapeHtml(data.kabKota)}<br>
                <b>Provinsi:</b> ${escapeHtml(data.provinsi)}<br>
                <b>Status:</b> <span style="color:${pinColor};font-weight:600;">${escapeHtml(data.status)}</span>
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
function showLoading() {
    document.getElementById('loadingIndicator').classList.remove('hidden');
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('resultContent').classList.add('hidden');

    const modalBox = document.getElementById('mapSingleInfoBox');
    if (modalBox && !modalBox.classList.contains('hidden')) {
        document.getElementById('modalInfoStatus').textContent = 'Memproses...';
        document.getElementById('modalInfoStatus').style.color = '#F59E0B';
    }
}

function showError(message) {
    document.getElementById('loadingIndicator').classList.add('hidden');
    document.getElementById('resultContent').classList.add('hidden');
    
    const errorState = document.getElementById('errorState');
    errorState.classList.remove('hidden');
    document.getElementById('errorMessage').textContent = message;

    // Peringatan emas untuk: luar RI dan wilayah perairan
    const isWarning = message === "Wilayah ini berada di luar batas Negara Republik Indonesia."
        || message.startsWith("Wilayah ini terdeteksi berada di perairan");
    if (isWarning) {
        errorState.style.color = "#F59E0B";
    } else {
        errorState.style.color = ""; // Default bawaan CSS (Merah)
    }

    const modalBox = document.getElementById('mapSingleInfoBox');
    if (modalBox && !modalBox.classList.contains('hidden')) {
        document.getElementById('modalInfoDesaKel').textContent = '-';
        document.getElementById('modalInfoKecamatan').textContent = '-';
        document.getElementById('modalInfoKabKota').textContent = '-';
        document.getElementById('modalInfoProvinsi').textContent = '-';
        const statusEl = document.getElementById('modalInfoStatus');
        if (isWarning) {
            statusEl.textContent = message.startsWith('Wilayah ini terdeteksi berada di perairan') ? 'Di Perairan' : 'Luar RI';
            statusEl.style.color = '#F59E0B';
        } else {
            statusEl.textContent = 'Gagal';
            statusEl.style.color = '#EF4444';
        }
    }
}

function showResult(data) {
    document.getElementById('loadingIndicator').classList.add('hidden');
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('resultContent').classList.remove('hidden');

    const admin = data.administrative;

    document.getElementById('resProvinsi').textContent = admin.provinsi;
    document.getElementById('resKabKota').textContent = admin.kabKota;
    document.getElementById('resKecamatan').textContent = admin.kecamatan;
    document.getElementById('resDesaKel').textContent = admin.desaKel || "-";
    document.getElementById('resAlamat').textContent = admin.alamat;

    // Update modal info box jika aktif (tidak disembunyikan)
    const modalBox = document.getElementById('mapSingleInfoBox');
    if (modalBox && !modalBox.classList.contains('hidden')) {
        const desa = admin.desaKel || '-';
        const kec = admin.kecamatan || '-';
        const kab = admin.kabKota || '-';
        const prov = admin.provinsi || '-';
        
        let status = 'Tidak Ada Data';
        if (kec !== '-' && kec !== '') {
            if (kec === '(Luar RI)' || kec.includes('Luar RI')) {
                status = 'Luar Batas RI';
            } else if (kec === '(Perairan)' || kec.includes('Perairan')) {
                status = 'Wilayah Perairan';
            } else {
                status = 'Sukses';
            }
        }
        
        document.getElementById('modalInfoDesaKel').textContent = desa;
        document.getElementById('modalInfoKecamatan').textContent = kec;
        document.getElementById('modalInfoKabKota').textContent = kab;
        document.getElementById('modalInfoProvinsi').textContent = prov;
        document.getElementById('modalInfoStatus').textContent = status;
        
        const statusEl = document.getElementById('modalInfoStatus');
        if (status === 'Sukses') {
            statusEl.style.color = '#10B981';
        } else if (status === 'Tidak Ada Data') {
            statusEl.style.color = '#EF4444';
        } else {
            statusEl.style.color = '#F59E0B';
        }
    }

    const badge = document.getElementById('confidenceBadge');
    if (admin.kecamatan === '(Luar RI)') {
        badge.textContent = "⚠ Lokasi di luar wilayah RI";
        badge.style.color = "#FFFFFF";
        badge.style.background = "var(--color-error)";
    } else if (admin.kecamatan === '(Perairan)') {
        badge.textContent = "⚠ Titik berada di perairan";
        badge.style.color = "#000000";
        badge.style.background = "var(--color-warning)";
    } else if (admin.kecamatan !== '-') {
        badge.textContent = "🟢 Kecamatan ditemukan";
        badge.style.color = "#000000";
        badge.style.background = "var(--color-accent)";
    } else {
        badge.textContent = "⚠ Kecamatan tidak terdeteksi";
        badge.style.color = "#FFFFFF";
        badge.style.background = "var(--color-error)";
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
        ok ? resolve() : reject(new Error('Salin ke clipboard tidak didukung browser ini'));
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

function renderHistory() {
    const history = getHistory();
    const historyList = document.getElementById('historyList');

    if (history.length === 0) {
        historyList.innerHTML = '<p class="history-empty">Belum ada histori pencarian.</p>';
        return;
    }

    historyList.innerHTML = '';

    history.forEach(item => {
        const row = document.createElement('div');
        row.className = 'history-item';

        const dateObj = new Date(item.timestamp);
        const timeStr = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            + ' · ' + dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

        // Left: coord + details
        const left = document.createElement('div');
        left.className = 'hist-left';

        const coord = document.createElement('span');
        coord.className = 'hist-coord';
        coord.textContent = item.coord;

        const details = document.createElement('span');
        details.className = 'hist-details';
        details.textContent = [item.kecamatan !== '-' ? item.kecamatan : null, item.kabKota]
            .filter(Boolean).join(', ');

        left.appendChild(coord);
        left.appendChild(details);

        // Right: timestamp
        const time = document.createElement('span');
        time.className = 'hist-time';
        time.textContent = timeStr;

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-item-btn';
        delBtn.title = 'Hapus riwayat ini';
        delBtn.textContent = '×';

        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeHistoryItem(item.coord);
        });

        row.addEventListener('click', () => {
            document.getElementById('coordInput').value = item.coord;
            window.scrollTo({ top: 0, behavior: 'smooth' });
            document.getElementById('searchBtn').click();
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
    // INTRO SPLASH — wajib setiap kali halaman dibuka
    // ==========================================
    (function() {
        const splash = document.getElementById('introSplash');
        if (!splash) return;

        const DISPLAY_MS = 2200; // durasi tampil (ms)
        const EXIT_MS    = 550;  // durasi animasi fade-out (harus sama dengan CSS)

        function dismissSplash() {
            if (splash.classList.contains('intro-exit') ||
                splash.classList.contains('intro-hidden')) return;
            splash.classList.add('intro-exit');
            setTimeout(() => {
                splash.classList.add('intro-hidden');
            }, EXIT_MS);
        }

        // Auto-dismiss — selalu tampil, tidak ada skip
        setTimeout(dismissSplash, DISPLAY_MS);
    })();

    const searchBtn = document.getElementById('searchBtn');
    const coordInput = document.getElementById('coordInput');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    initMap('map', (lat, lon) => {
        setInputValue(lat, lon);
        doGeocode(lat, lon);
    });

    renderHistory();

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

    searchBtn.addEventListener('click', () => {
        processInput(coordInput.value);
    });

    coordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') processInput(coordInput.value);
    });

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

    async function doGeocode(lat, lon) {
        const reqId = ++singleRequestSeq;
        // Bersihkan batas lama & tandai koordinat aktif agar fetch batas lama tertolak
        clearBoundaryLayers();
        singleSearchCoords = { lat, lon };

        // Koordinat di luar RI: peringatan langsung, tanpa API call
        if (lat < INDONESIA_BOUNDS.latMin || lat > INDONESIA_BOUNDS.latMax || lon < INDONESIA_BOUNDS.lonMin || lon > INDONESIA_BOUNDS.lonMax) {
            showError("Wilayah ini berada di luar batas Negara Republik Indonesia.");
            return;
        }

        showLoading();

        const result = await reverseGeocode(lat, lon);
        if (reqId !== singleRequestSeq) return; // sudah ada pencarian yang lebih baru
        // Konfirmasi dari API: wilayah ini bukan Republik Indonesia
        if (result.outsideIndonesia) {
            showError("Wilayah ini berada di luar batas Negara Republik Indonesia.");
            return;
        }
        if (result.success) {
            showResult(result);
            saveToHistory(lat, lon, result.administrative);
            // Fetch dan gambar batas administratif di background (non-blocking)
            fetchAndDrawBoundaries(result.administrative, lat, lon);
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
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
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

    function resetBatchButton() {
        isProcessing = false;
        processBatchBtn.disabled = false;
        processBatchBtn.textContent = 'Mulai Proses';
    }

    clearBatchBtn.addEventListener('click', () => {
        batchRunId++; // batalkan proses yang sedang berjalan
        resetBatchButton();
        batchInput.value = '';
        batchTableBody.innerHTML = '<tr class="empty-row"><td colspan="8">Belum ada data diproses.</td></tr>';
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
            alert('Silakan masukkan setidaknya satu baris koordinat.');
            return;
        }

        const runId = ++batchRunId;
        const isStale = () => runId !== batchRunId;
        isProcessing = true;
        processBatchBtn.disabled = true;
        processBatchBtn.textContent = 'Memproses...';
        batchTableBody.innerHTML = '';
        batchData = [];
        batchFilter = 'all';
        updateBatchSummary();
        clearBatchMarkers();
        initBatchMap();
        
        batchProgressContainer.classList.remove('hidden');
        batchProgressBar.style.width = '0%';
        batchProgressText.textContent = `Memproses: 0 / ${lines.length}`;

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
                        batchProgressText.textContent = `Memproses: ${completed} / ${tasks.length}`;
                        next();
                    });
                }
            }
            next();
        });

        if (isStale()) return;
        resetBatchButton();
        
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
                    kecamatan: adm.kecamatan === '-' ? 'Tidak Ditemukan' : adm.kecamatan,
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
                        kecamatan: result.notFound ? 'Tidak Ditemukan' : '-', kabKota: '-', provinsi: '-',
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

    function renderBatchRow(data) {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.title = 'Klik untuk melihat koordinat di peta';

        const group = batchStatusGroup(data.status);
        const statusClass = 'status-' + group;
        tr.dataset.group = group;
        tr.classList.add('row-' + group);
        if (batchFilter !== 'all' && batchFilter !== group) tr.classList.add('row-filtered');

        // Mapping kolom: [text, bold, className]
        // Baris error: tampilkan teks input asli agar pengguna tahu baris mana yang salah
        const latDisplay = (data.status === 'Error' && data.inputText) ? data.inputText : data.lat;
        if (data.errorMsg) tr.title = data.errorMsg;

        const columns = [
            [data.id, false],
            [latDisplay, false],
            [data.lon, false],
            [data.status === 'Kosong' ? '' : (data.desaKel || '-'), false],
            [data.kecamatan, true],
            [data.kabKota, false],
            [data.provinsi, false],
            [data.status, true, statusClass]
        ];

        for (const [text, bold, className] of columns) {
            const td = document.createElement('td');
            if (className) td.className = className;

            if (bold) {
                const strong = document.createElement('strong');
                strong.textContent = text ?? '-';
                td.appendChild(strong);
            } else {
                td.textContent = text ?? '-';
            }
            tr.appendChild(td);
        }

        batchTableBody.appendChild(tr);
        updateBatchSummary();
    }

    // ---- Ringkasan & filter status hasil batch ----
    const batchSummary = document.getElementById('batchSummary');
    let batchFilter = 'all';
    const BATCH_GROUP_LABELS = {
        success: 'Sukses',
        warning: 'Perairan/Luar RI',
        error: 'Error/Gagal',
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
        mainRows.forEach(r => r.style.backgroundColor = ''); // reset
        const targetMainRow = Array.from(mainRows).find(r => r.querySelector('td:first-child')?.textContent === idText);
        if (targetMainRow) targetMainRow.style.backgroundColor = 'rgba(238, 162, 1, 0.15)';

        // Highlight baris di modal tabel (jika sedang terbuka)
        if (tableModalBody) {
            const modalRows = tableModalBody.querySelectorAll('.batch-table tbody tr');
            modalRows.forEach(r => r.style.backgroundColor = ''); // reset
            const targetModalRow = Array.from(modalRows).find(r => r.querySelector('td:first-child')?.textContent === idText);
            if (targetModalRow) targetModalRow.style.backgroundColor = 'rgba(238, 162, 1, 0.15)';
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
        table: () => "No\tLintang\tBujur\tDesa/Kelurahan\tKecamatan\tKab/Kota\tProvinsi\tStatus\n" +
            sortedBatchData().map(d => `${d.id}\t${d.lat}\t${d.lon}\t${d.desaKel ?? ''}\t${d.kecamatan}\t${d.kabKota}\t${d.provinsi}\t${d.status}`).join('\n'),
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
        const header = ['No', 'Input', 'Lintang', 'Bujur', 'Desa/Kelurahan', 'Kecamatan', 'Kab/Kota', 'Provinsi', 'Status'];
        const rows = sortedBatchData().map(d => [d.id, d.inputText ?? '', d.lat, d.lon, d.desaKel ?? '', d.kecamatan, d.kabKota, d.provinsi, d.status]);
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
            document.getElementById('mapModalTitle').textContent = 'Peta Interaktif (Cari Tunggal)';
            document.getElementById('mapModalLegend').style.display = 'none';
            
            // Ambil data terbaru dari panel hasil Cari Tunggal
            const desa = document.getElementById('resDesaKel').textContent.trim();
            const kec = document.getElementById('resKecamatan').textContent.trim();
            const kab = document.getElementById('resKabKota').textContent.trim();
            const prov = document.getElementById('resProvinsi').textContent.trim();
            
            let status = 'Tidak Ada Data';
            if (kec !== '-' && kec !== '') {
                if (kec === '(Luar RI)' || kec.includes('Luar RI')) {
                    status = 'Luar Batas RI';
                } else if (kec === '(Perairan)' || kec.includes('Perairan')) {
                    status = 'Wilayah Perairan';
                } else {
                    status = 'Sukses';
                }
            }
            
            document.getElementById('modalInfoDesaKel').textContent = desa;
            document.getElementById('modalInfoKecamatan').textContent = kec;
            document.getElementById('modalInfoKabKota').textContent = kab;
            document.getElementById('modalInfoProvinsi').textContent = prov;
            document.getElementById('modalInfoStatus').textContent = status;
            
            // Berikan warna status
            const statusEl = document.getElementById('modalInfoStatus');
            if (status === 'Sukses') {
                statusEl.style.color = '#10B981'; // green
            } else if (status === 'Tidak Ada Data') {
                statusEl.style.color = '#EF4444'; // red
            } else {
                statusEl.style.color = '#F59E0B'; // amber/warning
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
        document.getElementById('mapModalTitle').textContent = 'Peta Sebaran Titik (Cari Massal)';
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

    // Disclaimer Toggle (Mobile Only)
    const toggleDisclaimerBtn = document.getElementById('toggleDisclaimerBtn');
    const disclaimerWrapper = document.querySelector('.disclaimer-content-wrapper');
    if (toggleDisclaimerBtn && disclaimerWrapper) {
        toggleDisclaimerBtn.addEventListener('click', () => {
            if (disclaimerWrapper.classList.contains('expanded')) {
                disclaimerWrapper.classList.remove('expanded');
                toggleDisclaimerBtn.setAttribute('aria-expanded', 'false');
                toggleDisclaimerBtn.textContent = 'Lihat Disclaimer Selengkapnya';
            } else {
                disclaimerWrapper.classList.add('expanded');
                toggleDisclaimerBtn.setAttribute('aria-expanded', 'true');
                toggleDisclaimerBtn.textContent = 'Sembunyikan Disclaimer';
            }
        });
    }
});
