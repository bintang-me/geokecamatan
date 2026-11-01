/* =========================================================
   Cari Kecamatan — Geocoder
   Reverse geocoding: BIG (utama), ArcGIS & Nominatim (pendukung), deteksi perairan, cache.
   ========================================================= */
// ==========================================
// Parser — Badan Informasi Geospasial (BIG) (sumber utama)
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
// Parser — ArcGIS Esri (sumber pendukung)
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
// Parser — Nominatim OSM (sumber pendukung)
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
// Geocoder — Master Hierarchy Strategy
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

// Cache LRU untuk reverse geocode — 1000 entri (cukup untuk satu daftar Cari Massal), TTL 30 menit
const geocodeCache = new Map();
const CACHE_MAX = 1000;
const CACHE_TTL = 30 * 60 * 1000;

function getCacheKey(lat, lon) {
    return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

// needDetail: Cari Tunggal butuh alamat lengkap; hasil ringkas dari Cari Massal tidak cukup
function getFromCache(lat, lon, needDetail = true) {
    const key = getCacheKey(lat, lon);
    const entry = geocodeCache.get(key);
    if (!entry) return null;
    if (needDetail && !entry.detail) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        geocodeCache.delete(key);
        return null;
    }
    // LRU: hapus & set ulang agar jadi entry terbaru
    geocodeCache.delete(key);
    geocodeCache.set(key, entry);
    return entry.data;
}

function setToCache(lat, lon, data, detail = true) {
    const key = getCacheKey(lat, lon);
    geocodeCache.delete(key);
    if (geocodeCache.size >= CACHE_MAX) {
        const oldest = geocodeCache.keys().next().value;
        geocodeCache.delete(oldest);
    }
    geocodeCache.set(key, { data, detail, timestamp: Date.now() });
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

// Permintaan yang sedang berjalan untuk titik yang sama dipakai bersama (mis. titik ganda di Cari Massal)
const geocodeInflight = new Map();

/**
 * opts.detail (bawaan true): sertakan alamat lengkap (Cari Tunggal).
 * detail=false (Cari Massal): cukup nama wilayah — tanpa menunggu layanan alamat/perairan bila BIG sudah menemukan.
 */
function reverseGeocode(lat, lon, opts = {}) {
    const detail = opts.detail !== false;
    const cached = getFromCache(lat, lon, detail);
    if (cached) return Promise.resolve(cached);
    const key = getCacheKey(lat, lon) + (detail ? '|d' : '|r');
    if (geocodeInflight.has(key)) return geocodeInflight.get(key);
    const p = reverseGeocodeFresh(lat, lon, detail).finally(() => geocodeInflight.delete(key));
    geocodeInflight.set(key, p);
    return p;
}

async function reverseGeocodeFresh(lat, lon, detail) {
    // BIG: layer 3 (kecamatan) = sumber utama nama wilayah — layer yang sama dengan poligon batas di peta;
    // layer 4 (desa/kelurahan) dicoba paralel untuk nama desa.
    const bigQuery = (layer) => `https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/BATAS_WILAYAH/MapServer/${layer}/query?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`;
    const arcgisUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?location=${lon},${lat}&f=pjson&langCode=id`;
    // zoom=14 (tingkat Kecamatan/Suburb) di OSM
    const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1&zoom=14`;
    const waterUrl = `https://is-on-water.balbona.me/api/v1/get/${lat}/${lon}`;

    // --- FASE 1: BIG selalu; ArcGIS & deteksi perairan dimulai bersamaan untuk Cari Tunggal,
    //     atau hanya bila dibutuhkan untuk Cari Massal (hemat permintaan & tidak menunggu yang lambat) ---
    const bigKecP = fetchWithTimeout(bigQuery(3), {}, 8000); // server BIG relatif lambat
    const bigDesaP = fetchWithTimeout(bigQuery(4), {}, 8000);
    let arcP = null, waterP = null;
    const getArc = () => arcP || (arcP = fetchWithTimeout(arcgisUrl));
    const getWater = () => waterP || (waterP = fetchWithTimeout(waterUrl, {}, 3000)); // 3 detik agar tidak memblokir
    if (detail) { getArc(); getWater(); }

    try {
        const [bigKecData, bigDesaData] = await Promise.all([bigKecP, bigDesaP]);

        const bigKec = bigKecData ? parseBIGResponse(bigKecData, 'kec') : null;
        const bigDesa = bigDesaData ? parseBIGResponse(bigDesaData, 'desa') : null;
        const bigData = bigKecData || bigDesaData;
        let bigResult = null;
        if (bigKec && bigKec.kecamatan !== '-') {
            bigResult = { ...bigKec, desaKel: bigDesa && bigDesa.desaKel !== '-' ? bigDesa.desaKel : '-' };
        } else if (bigDesa && bigDesa.kecamatan !== '-') {
            bigResult = bigDesa;
        }
        const bigFound = !!(bigResult && bigResult.kecamatan !== '-');

        // --- FASE 2: tunggu sumber pendukung hanya yang memang diperlukan ---
        let arcData = null, waterData = null;
        if (!bigFound) {
            [arcData, waterData] = await Promise.all([getArc(), getWater()]);
        } else if (detail || bigResult.desaKel === '-') {
            arcData = await getArc(); // alamat lengkap (Cari Tunggal) atau nama desa yang belum ada dari BIG
        }
        const arcResult = arcData ? parseArcGISResponse(arcData) : null;

        // --- FASE 3: Nominatim (dibatasi 1 req/detik) hanya bila dibutuhkan:
        //     BIG tidak menemukan poligon, atau (Cari Tunggal) ArcGIS tidak memberi alamat lengkap ---
        let osmData = null;
        if (!bigFound || (detail && (!arcResult || arcResult.alamat === '-'))) {
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
                    error: `Titik ini berada di perairan (${waterName}) sehingga tidak termasuk wilayah administrasi kecamatan mana pun.`,
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
            if (bigData || outsideIndonesia) setToCache(lat, lon, result, detail || outsideIndonesia);
            return result;
        }

        // Sumber merespons tetapi tidak ada data — tidak di-cache
        return { success: false, notFound: true, error: "Data wilayah untuk titik ini tidak ditemukan. Titik kemungkinan berada di luar daratan Indonesia." };

    } catch (error) {
        console.error("Geocoding failed:", error);
        return { success: false, networkError: true, error: "Tidak dapat terhubung ke layanan data. Periksa koneksi internet Anda, lalu coba lagi." };
    }
}
