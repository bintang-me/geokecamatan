// ==========================================
// 1. Validator & DMS Converter
// ==========================================
function convertDMSToDecimal(dmsStr) {
    let cleanStr = dmsStr.trim().replace(/\s+/g, ' ').toUpperCase();

    // Normalisasi simbol derajat, menit, detik non-standar
    cleanStr = cleanStr.replace(/[˚º⁰o]/g, '°');
    cleanStr = cleanStr.replace(/[′ʹ`]/g, "'");
    cleanStr = cleanStr.replace(/[″ʺ]/g, '"');
    // Normalisasi koma desimal (contoh: 6,967" → 6.967")
    cleanStr = cleanStr.replace(/,/g, '.');

    // Normalisasi arah mata angin Indonesia ke standar internasional (N, S, E, W)
    cleanStr = cleanStr.replace(/LS/g, 'S')
                       .replace(/LU/g, 'N')
                       .replace(/BT/g, 'E')
                       .replace(/BB/g, 'W');

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

function parseCoordinates(inputStr) {
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
            const outsideIndonesia = (lat < INDONESIA_BOUNDS.latMin || lat > INDONESIA_BOUNDS.latMax || lon < INDONESIA_BOUNDS.lonMin || lon > INDONESIA_BOUNDS.lonMax);

            return { valid: true, lat: lat, lon: lon, converted: convertedFlag, outsideIndonesia };
        }
    }

    return { valid: false, error: "Format koordinat tidak dikenali. Coba desimal (cth: -6.208, 106.845) atau DMS (cth: 6°14'52.1\"S 106°52'40.0\"E)" };
}

// ==========================================
// 2. Parser — Badan Informasi Geospasial (BIG) (SUMBER PRIMER & ABSOLUT)
//    Menggunakan layanan Kebijakan Satu Peta untuk mendeteksi koordinat
//    langsung ke dalam batas wilayah resmi RI.
// ==========================================
function parseBIGResponse(data) {
    if (!data || !data.features || data.features.length === 0) return null;
    const attr = data.features[0].attributes || data.features[0].properties;
    if (!attr) return null;

    const toTitleCase = (str) => {
        if (!str) return "-";
        return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    let provinsi = toTitleCase(attr.WADMPR);
    let kabKota = toTitleCase(attr.WADMKK);
    let kecamatan = toTitleCase(attr.WADMKC);
    let desaKel = toTitleCase(attr.WADMKD || attr.WADMKD_HTML || attr.WADMKP || "-");

    return { provinsi, kabKota, kecamatan, desaKel, alamat: "-", geometry: null };
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
    const geometry = data.geojson || null;
    return { provinsi, kabKota, kecamatan, desaKel, alamat, countryCode, isWaterBody, geometry };
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
//    1. BPS: Kebenaran absolut untuk Kecamatan, Kab/Kota, Provinsi
//    2. ArcGIS / Nominatim: Hanya digunakan untuk melengkapi
//       detail 'alamat' (nama jalan, kelurahan) yang BPS tidak sediakan.
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
    return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

function getFromCache(lat, lon) {
    const key = getCacheKey(lat, lon);
    const entry = geocodeCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        geocodeCache.delete(key);
        return null;
    }
    // Invalidasi cache lama yang tidak memiliki geometry
    if (entry.data && entry.data.success && entry.data.administrative && !entry.data.administrative.geometry) {
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

async function reverseGeocode(lat, lon) {
    // Cek cache terlebih dahulu
    const cached = getFromCache(lat, lon);
    if (cached) return cached;

    // --- FASE 1: Water check (cepat, <50ms biasanya) ---
    const waterUrl = `https://is-on-water.balbona.me/api/v1/get/${lat}/${lon}`;
    const waterRes = await fetchWithTimeout(waterUrl, {}, 4000);
    const isWater = waterRes && waterRes.isWater === true;

    if (isWater) {
        const result = {
            success: true,
            administrative: {
                provinsi: '(Perairan)',
                kabKota: '(Perairan)',
                kecamatan: '(Perairan)',
                alamat: '-'
            },
            outsideIndonesia: false
        };
        setToCache(lat, lon, result);
        return result;
    }

    // --- FASE 2: Geocoding 4 API paralel (hanya jika daratan) ---
    const bigUrl = `https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/BATAS_WILAYAH/MapServer/4/query?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=pjson`;
    const arcgisUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?location=${lon},${lat}&f=pjson&langCode=id`;
    // Gunakan zoom=14 (tingkat Kecamatan/Suburb) di OSM agar poligon yang dikembalikan lebih relevan sebagai batas wilayah, dan tambahkan polygon_geojson=1
    const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1&zoom=14&polygon_geojson=1`;
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=id`;

    try {
        const [bigRes, arcRes, osmRes, bdcRes] = await Promise.allSettled([
            fetchWithTimeout(bigUrl),
            fetchWithTimeout(arcgisUrl),
            fetchWithTimeout(osmUrl, { headers: { 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' } }),
            fetchWithTimeout(bdcUrl)
        ]);

        const bigData  = bigRes.status  === 'fulfilled' ? bigRes.value  : null;
        const arcData  = arcRes.status  === 'fulfilled' ? arcRes.value  : null;
        const osmData  = osmRes.status  === 'fulfilled' ? osmRes.value  : null;
        const bdcData  = bdcRes.status  === 'fulfilled' ? bdcRes.value  : null;

        let bigResult = bigData  ? parseBIGResponse(bigData)     : null;
        let arcResult = arcData  ? parseArcGISResponse(arcData)   : null;
        let osmResult = (osmData && !osmData.error) ? parseNominatimResponse(osmData) : null;
        let bdcResult = bdcData  ? parseBDCResponse(bdcData)      : null;

        let finalResult = null;

        if (bigResult && bigResult.kecamatan !== '-') {
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
        else if (bdcResult && bdcResult.kecamatan !== '-') {
            finalResult = { ...bdcResult };
        } 
        else {
            finalResult = arcResult || osmResult || bdcResult;
        }

        if (finalResult) {
            let outsideIndonesia = false;
            if (!bigResult || bigResult.kecamatan === '-') {
                const confirmedNonIndonesia = [arcResult, osmResult, bdcResult].some(r => {
                    return r && r.countryCode && !['id', 'idn', 'ina'].includes(r.countryCode.toLowerCase());
                });
                if (confirmedNonIndonesia) outsideIndonesia = true;
            }

            if (outsideIndonesia) {
                finalResult.kecamatan = '(Luar RI)';
                finalResult.kabKota = '(Luar RI)';
                finalResult.provinsi = '(Luar RI)';
                finalResult.alamat = '-';
            }

            const result = { success: true, administrative: finalResult, outsideIndonesia };
            setToCache(lat, lon, result);
            return result;
        }

        const result = { success: false, error: "Lokasi tidak ditemukan di database manapun. Titik mungkin berada di luar perairan wilayah Indonesia." };
        setToCache(lat, lon, result);
        return result;

    } catch (error) {
        console.error("Geocoding failed:", error);
        return { success: false, error: "Gagal terhubung ke layanan data geoportal." };
    }
}

// ==========================================
// 5. Map
// ==========================================
let map;
let marker;
let boundaryLayers = []; // Array layer batas administratif

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
        weight: 2.5,
        opacity: 0.75,
        fillColor: '#3B82F6',
        fillOpacity: 0.05,
        dashArray: '6, 4'
    },
    kecamatan: {
        color: '#EEA201',   // Kuning (aksen utama)
        weight: 2.5,
        opacity: 0.95,
        fillColor: '#EEA201',
        fillOpacity: 0.13,
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
async function fetchOSMProvinsiBoundary(namaProvinsi) {
    if (!namaProvinsi || namaProvinsi === '-') return null;
    
    // Perbaiki penamaan untuk OSM (hapus awalan "DKI", dsb agar pencarian lebih relevan)
    let searchName = namaProvinsi.replace(/^DKI /i, '');

    const url = `https://nominatim.openstreetmap.org/search?state=${encodeURIComponent(searchName)}&country=Indonesia&format=jsonv2&polygon_geojson=1&limit=1`;
    try {
        const response = await fetchWithTimeout(url, { headers: { 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' } }, 5000);
        if (response && response.length > 0 && response[0].geojson) {
            return response[0].geojson;
        }
    } catch (e) {
        console.warn('Gagal memuat batas provinsi OSM', e);
    }
    return null;
}

/**
 * Ambil dan gambar poligon batas Provinsi, Kab/Kota, dan Kecamatan via BIG MapServer.
 * Dipanggil setelah reverseGeocode berhasil.
 */
async function fetchAndDrawBoundaries(adminData, lat, lon) {
    clearBoundaryLayers();
    if (!map || !adminData || lat == null || lon == null) return;

    // Fetch batas darat Kab/Kota dan Kecamatan secara paralel dari BIG
    const [kabFeature, kecFeature] = await Promise.all([
        fetchBIGBoundary(BIG_URLS.kabKota, lat, lon),
        fetchBIGBoundary(BIG_URLS.kecamatan, lat, lon)
    ]);

    // Ambil Provinsi menggunakan OSM Nominatim
    const namaProv = adminData.provinsi;
    const provGeoJSON = await fetchOSMProvinsiBoundary(namaProv);

    // Gambar Provinsi (Area putih transparan)
    if (provGeoJSON) {
        const layer = L.geoJSON(provGeoJSON, { style: BOUNDARY_STYLES.provinsi })
            .bindTooltip(`Batas Provinsi: ${namaProv}`, { sticky: true, className: 'boundary-tooltip' })
            .addTo(map);
        boundaryLayers.push(layer);
    }

    // Gambar Kab/Kota (Area)
    if (kabFeature) {
        // Nama Kab/Kota di BIG MapServer biasanya ada di wadmkk
        const name = kabFeature.properties.WADMKK || kabFeature.properties.wadmkk || adminData.kabKota;
        const layer = L.geoJSON(kabFeature, { style: BOUNDARY_STYLES.kabKota })
            .bindTooltip(`Kab/Kota: ${name}`, { sticky: true, className: 'boundary-tooltip' })
            .addTo(map);
        boundaryLayers.push(layer);
    }
    
    // Gambar Kecamatan (Area)
    if (kecFeature) {
        // Nama Kecamatan di BIG MapServer biasanya ada di wadmkc
        const name = kecFeature.properties.WADMKC || kecFeature.properties.wadmkc || adminData.kecamatan;
        const layer = L.geoJSON(kecFeature, { style: BOUNDARY_STYLES.kecamatan })
            .bindTooltip(`Kecamatan: ${name}`, { sticky: true, className: 'boundary-tooltip' })
            .addTo(map);
        boundaryLayers.push(layer);
    }
}

// Compat: drawPolygon lama (untuk single geometry fallback)
function drawPolygon(geometry) {
    clearBoundaryLayers();
    if (geometry && map) {
        const layer = L.geoJSON(geometry, { style: BOUNDARY_STYLES.kecamatan }).addTo(map);
        boundaryLayers.push(layer);
        try {
            map.fitBounds(layer.getBounds(), { padding: [20, 20], maxZoom: 15 });
        } catch(e) { console.error(e); }
    }
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

    marker.on('dragend', function () {
        const pos = marker.getLatLng();
        map.setView(pos, map.getZoom());
        onLocationSelected(pos.lat, pos.lng);
    });

    map.on('click', function (e) {
        const pos = e.latlng;
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
    map.setView(latlng, map.getZoom());
}

// ==========================================
// 5b. Batch Map (Peta Cari Massal)
// ==========================================
let batchMap = null;
let batchMarkers = [];
let batchBoundaryLayers = []; // Penampung untuk poligon interaktif di peta batch
let batchMapInitialized = false;

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

    const { standardMap, satelliteHybrid } = createMapLayers();

    // Set peta default batch — Satellite Hybrid
    satelliteHybrid.addTo(batchMap);

    L.control.layers({ "Peta Standar": standardMap, "Satelit Hybrid": satelliteHybrid }, null, { position: 'topright' }).addTo(batchMap);

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
    if (!batchMap || data.status !== 'Sukses') return;
    clearBatchBoundaryLayers();
    const [kabFeature, kecFeature] = await Promise.all([
        fetchBIGBoundary(BIG_URLS.kabKota, data.lat, data.lon),
        fetchBIGBoundary(BIG_URLS.kecamatan, data.lat, data.lon)
    ]);
    
    if (kabFeature) {
        const kabLayer = L.geoJSON(kabFeature, { style: BOUNDARY_STYLES.kabKota })
            .bindTooltip(`Kab/Kota: ${data.kabKota}`, { sticky: true, className: 'boundary-tooltip' })
            .addTo(batchMap);
        batchBoundaryLayers.push(kabLayer);
    }
    if (kecFeature) {
        const kecLayer = L.geoJSON(kecFeature, { style: BOUNDARY_STYLES.kecamatan })
            .bindTooltip(`Kecamatan: ${data.kecamatan}`, { sticky: true, className: 'boundary-tooltip' })
            .addTo(batchMap);
        batchBoundaryLayers.push(kecLayer);
        
        // Zoom sedikit untuk menyorot poligon tanpa menghilangkan konteks
        try {
            batchMap.fitBounds(kecLayer.getBounds(), { padding: [20, 20], maxZoom: 14 });
        } catch(e) {}
    }
}

function addBatchMarker(data) {
    if (!batchMap) return;

    // Tentukan warna berdasarkan status
    let pinColor;
    if (data.status === 'Sukses') {
        pinColor = '#10B981'; // hijau
    } else if (data.status === 'Kosong') {
        pinColor = '#6B7280'; // abu
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
    
    // Fitur: Poligon Interaktif (On-Click Highlight)
    if (data.status === 'Sukses') {
        m.on('click', async () => {
            await showBatchBoundaries(data);
        });
    }

    m.addTo(batchMap);
    batchMarkers.push(m);

    // Auto-positioning untuk titik pertama yang muncul di peta
    if (batchMarkers.length === 1) {
        batchMap.setView(m.getLatLng(), 13);
    }
}

function clearBatchMarkers() {
    if (!batchMap) return;
    batchMarkers.forEach(m => m.remove());
    batchMarkers = [];
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
    document.getElementById('errorState').classList.remove('hidden');
    document.getElementById('errorMessage').textContent = message;

    const modalBox = document.getElementById('mapSingleInfoBox');
    if (modalBox && !modalBox.classList.contains('hidden')) {
        document.getElementById('modalInfoDesaKel').textContent = '-';
        document.getElementById('modalInfoKecamatan').textContent = '-';
        document.getElementById('modalInfoKabKota').textContent = '-';
        document.getElementById('modalInfoProvinsi').textContent = '-';
        document.getElementById('modalInfoStatus').textContent = 'Gagal';
        document.getElementById('modalInfoStatus').style.color = '#EF4444';
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



function setInputValue(lat, lon) {
    document.getElementById('coordInput').value = `${lat}, ${lon}`;
}

// ==========================================
// 7. History Management
// ==========================================
const HISTORY_KEY = 'geokecamatan_history';

function getHistory() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
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
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
}

function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
}

function removeHistoryItem(coordStr) {
    let history = getHistory().filter(h => h.coord !== coordStr);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
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
                navigator.clipboard.writeText(textToCopy).then(() => {
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
                navigator.clipboard.writeText(textToCopy).then(() => {
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

    async function doGeocode(lat, lon) {
        // Koordinat di luar RI: peringatan langsung, tanpa API call
        if (lat < INDONESIA_BOUNDS.latMin || lat > INDONESIA_BOUNDS.latMax || lon < INDONESIA_BOUNDS.lonMin || lon > INDONESIA_BOUNDS.lonMax) {
            showError("Wilayah ini berada di luar batas Negara Republik Indonesia.");
            return;
        }

        showLoading();
        clearBoundaryLayers();

        const result = await reverseGeocode(lat, lon);
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
    const copyTableBtn = document.getElementById('copyTableBtn');
    const copyKecamatanBtn = document.getElementById('copyKecamatanBtn');
    const copyKabKotaBtn = document.getElementById('copyKabKotaBtn');
    const copyCoordBtn = document.getElementById('copyCoordBtn');
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
    const copyKecamatanBtnModal = document.getElementById('copyKecamatanBtnModal');
    const copyKabKotaBtnModal = document.getElementById('copyKabKotaBtnModal');
    const copyCoordBtnModal = document.getElementById('copyCoordBtnModal');
    const copyTableBtnModal = document.getElementById('copyTableBtnModal');

    let batchData = [];
    let isProcessing = false;

    clearBatchBtn.addEventListener('click', () => {
        batchInput.value = '';
        batchTableBody.innerHTML = '<tr class="empty-row"><td colspan="7">Belum ada data diproses.</td></tr>';
        batchData = [];
        batchProgressContainer.classList.add('hidden');
        clearBatchMarkers();
    });

    processBatchBtn.addEventListener('click', async () => {
        if (isProcessing) return;
        
        const rawText = batchInput.value;
        // Menghapus newline ekstra di akhir, tapi mempertahankan baris kosong di tengah
        const lines = rawText.replace(/\n+$/, '').split('\n');
        
        if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
            alert('Silakan masukkan setidaknya satu baris koordinat.');
            return;
        }

        isProcessing = true;
        processBatchBtn.disabled = true;
        processBatchBtn.textContent = 'Memproses...';
        batchTableBody.innerHTML = '';
        batchData = [];
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
                        batchData.push(result);
                        renderBatchRow(result);
                        // addBatchMarker terima, hanya jika lat/lon adalah angka valid
                        if (typeof result.lat === 'number' && typeof result.lon === 'number' &&
                            isFinite(result.lat) && isFinite(result.lon)) {
                            addBatchMarker(result);
                        }
                    }).catch(err => {
                        // Jika processTask gagal total, tetap catat sebagai error
                        console.error('Task gagal:', task.id, err);
                        const fallback = {
                            id: task.id, lat: '-', lon: '-',
                            kecamatan: '-', kabKota: '-', provinsi: '-',
                            status: 'Error'
                        };
                        batchData.push(fallback);
                        renderBatchRow(fallback);
                    }).finally(() => {
                        // KRITIS: selalu jalankan apapun yang terjadi
                        completed++;
                        const percent = (completed / tasks.length) * 100;
                        batchProgressBar.style.width = `${percent}%`;
                        batchProgressText.textContent = `Memproses: ${completed} / ${tasks.length}`;
                        activeCount--;
                        next();
                    });
                }
            }
            next();
        });

        isProcessing = false;
        processBatchBtn.disabled = false;
        processBatchBtn.textContent = 'Mulai Proses';
        
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
                    status: 'Error'
                };
            }

            const lat = task.parsed.lat;
            const lon = task.parsed.lon;

            const result = await reverseGeocode(lat, lon);

            if (result.success) {
                const adm = result.administrative;
                const isSpecial = adm.kecamatan === '-' || adm.kecamatan === '(Luar RI)' || adm.kecamatan === '(Perairan)';
                return {
                    id: task.id,
                    lat: lat,
                    lon: lon,
                    desaKel: adm.desaKel || '-',
                    kecamatan: isSpecial && adm.kecamatan === '-' ? 'Tidak Ditemukan' : adm.kecamatan,
                    kabKota: adm.kabKota,
                    provinsi: adm.provinsi,
                    status: isSpecial ? 'Gagal' : 'Sukses'
                };
            } else {
                return {
                    id: task.id,
                    lat: lat,
                    lon: lon,
                    desaKel: '-',
                    kecamatan: '-', kabKota: '-', provinsi: '-',
                    status: 'Error API'
                };
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

        let statusClass = 'status-error';
        if (data.status === 'Sukses') statusClass = 'status-success';
        else if (data.status === 'Kosong') statusClass = 'status-empty';

        // Mapping kolom: [text, bold, className]
        const columns = [
            [data.id, false],
            [data.lat, false],
            [data.lon, false],
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

    // Export & Copy
    copyTableBtn.addEventListener('click', () => {
        if (batchData.length === 0) return;
        const headers = "No\tLintang\tBujur\tKecamatan\tKab/Kota\tProvinsi\tStatus\n";
        const rows = batchData.map(d => `${d.id}\t${d.lat}\t${d.lon}\t${d.kecamatan}\t${d.kabKota}\t${d.provinsi}\t${d.status}`).join('\n');
        
        navigator.clipboard.writeText(headers + rows).then(() => {
            const originalText = copyTableBtn.textContent;
            copyTableBtn.textContent = 'Tersalin!';
            setTimeout(() => copyTableBtn.textContent = originalText, 2000);
        });
    });

    copyKecamatanBtn.addEventListener('click', () => {
        if (batchData.length === 0) return;
        const rows = batchData.map(d => d.kecamatan).join('\n');
        
        navigator.clipboard.writeText(rows).then(() => {
            const originalText = copyKecamatanBtn.textContent;
            copyKecamatanBtn.textContent = 'Tersalin!';
            setTimeout(() => copyKecamatanBtn.textContent = originalText, 2000);
        });
    });

    copyKabKotaBtn.addEventListener('click', () => {
        if (batchData.length === 0) return;
        const rows = batchData.map(d => d.kabKota).join('\n');
        
        navigator.clipboard.writeText(rows).then(() => {
            const originalText = copyKabKotaBtn.textContent;
            copyKabKotaBtn.textContent = 'Tersalin!';
            setTimeout(() => copyKabKotaBtn.textContent = originalText, 2000);
        });
    });

    copyCoordBtn.addEventListener('click', () => {
        if (batchData.length === 0) return;
        const rows = batchData.map(d => `${d.lat}\t${d.lon}`).join('\n');
        
        navigator.clipboard.writeText(rows).then(() => {
            const originalText = copyCoordBtn.textContent;
            copyCoordBtn.textContent = 'Tersalin!';
            setTimeout(() => copyCoordBtn.textContent = originalText, 2000);
        });
    });

    // Helper: salin ke clipboard dan tampilkan feedback di tombol yang benar
    function clipboardCopyWithFeedback(text, btn) {
        navigator.clipboard.writeText(text).then(() => {
            const originalText = btn.textContent;
            btn.textContent = 'Tersalin!';
            setTimeout(() => btn.textContent = originalText, 2000);
        });
    }

    // Tombol aksi di modal tabel hasil — handler mandiri (agar feedback muncul di tombol modal, bukan tombol asli)
    copyTableBtnModal.addEventListener('click', function() {
        if (batchData.length === 0) return;
        const headers = "No\tLintang\tBujur\tKecamatan\tKab/Kota\tProvinsi\tStatus\n";
        const rows = batchData.map(d => `${d.id}\t${d.lat}\t${d.lon}\t${d.kecamatan}\t${d.kabKota}\t${d.provinsi}\t${d.status}`).join('\n');
        clipboardCopyWithFeedback(headers + rows, copyTableBtnModal);
    });
    copyKecamatanBtnModal.addEventListener('click', function() {
        if (batchData.length === 0) return;
        clipboardCopyWithFeedback(batchData.map(d => d.kecamatan).join('\n'), copyKecamatanBtnModal);
    });
    copyCoordBtnModal.addEventListener('click', function() {
        if (batchData.length === 0) return;
        clipboardCopyWithFeedback(batchData.map(d => `${d.lat}\t${d.lon}`).join('\n'), copyCoordBtnModal);
    });
    copyKabKotaBtnModal.addEventListener('click', function() {
        if (batchData.length === 0) return;
        clipboardCopyWithFeedback(batchData.map(d => d.kabKota).join('\n'), copyKabKotaBtnModal);
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
                toggleDisclaimerBtn.textContent = 'Lihat Disclaimer Selengkapnya';
            } else {
                disclaimerWrapper.classList.add('expanded');
                toggleDisclaimerBtn.textContent = 'Sembunyikan Disclaimer';
            }
        });
    }
});
