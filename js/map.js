/* =========================================================
   Cari Kecamatan — Peta
   Leaflet: peta Cari Tunggal & Cari Massal, basemap, garis batas, marker.
   ========================================================= */
// ==========================================
// Map
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

// Leaflet memfokuskan peta saat diklik lalu mengembalikan posisi gulir dengan window.scrollTo,
// yang bisa membuat halaman "melompat" ketika tombol zoom ditekan. Fokuskan tanpa menggulir.
if (window.L && L.Map && L.Map.Keyboard) {
    L.Map.Keyboard.prototype._onMouseDown = function () {
        if (this._focused) return;
        try { this._map._container.focus({ preventScroll: true }); }
        catch (e) { this._map._container.focus(); }
    };
}
// Tombol kontrol (zoom +/−, dll.) juga memfokuskan ulang peta setelah diklik — tanpa menggulir halaman
if (window.L && L.Control) {
    L.Control.prototype._refocusOnMap = function (e) {
        if (this._map && e && e.screenX > 0 && e.screenY > 0) {
            try { this._map.getContainer().focus({ preventScroll: true }); }
            catch (err) { /* abaikan */ }
        }
    };
}

// Factory: buat tile layers — sekali definisi, dipakai initMap dan initBatchMap
function createMapLayers() {
    // Semua basemap dari server Esri (tanpa API key). CARTO tidak dipakai lagi karena kini
    // menampilkan tile "API key required".
    const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

    const standardMap = L.tileLayer(`${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`, {
        attribution: 'Tiles &copy; Esri. Sumber: Esri, HERE, Garmin, USGS, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
        dropMainPin();
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

// Animasi pin jatuh singkat (CSS) setiap kali titik berpindah
function dropMainPin() {
    const icon = marker && marker.getElement && marker.getElement();
    if (!icon) return;
    icon.classList.remove('is-dropping');
    void icon.offsetWidth; // mulai ulang animasi
    icon.classList.add('is-dropping');
}

function updateMapMarker(lat, lon) {
    if (!map || !marker) return;
    const latlng = L.latLng(lat, lon);
    marker.setLatLng(latlng);
    dropMainPin();
    // Zoom ke tingkat kecamatan agar titik & poligon terlihat (jangan zoom-out bila pengguna sudah lebih dekat)
    map.setView(latlng, Math.max(map.getZoom(), 13));
}

// ==========================================
// Batch Map (Peta Cari Massal)
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
    'Sukses': 'Ditemukan',
    'Wilayah Perairan': 'Perairan',
    'Luar Batas RI': 'Luar Indonesia',
    'Gagal': 'Tidak ditemukan',
    'Error API': 'Gagal terhubung',
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
                batchMap.fitBounds(kecLayer.getBounds(), { paddingTopLeft: [20, batchInfoClearance()], paddingBottomRight: [20, 40], maxZoom: 14 });
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
        className: 'batch-pin',
        iconSize: [22, 33],
        iconAnchor: [11, 33]
    });

    const m = L.marker([data.lat, data.lon], { icon: pinIcon, title: `Titik No. ${data.id}`, keyboard: true });
    m.batchId = data.id; // Simpan ID untuk referensi silang tabel-peta
    m.batchData = data;
    m.pinColor = pinColor;

    // Klik pin: keterangan di kiri atas peta (seperti Cari Tunggal), pin diberi cincin, baris tabel disorot
    m.on('click', () => {
        selectBatchMarker(m);
        highlightBatchRows(data.id);
    });

    m.addTo(batchMap);
    batchMarkers.push(m);

    // Auto-positioning untuk titik pertama yang muncul di peta
    if (batchMarkers.length === 1) {
        lastSelectedBatchMarker = m;
        batchMap.setView(m.getLatLng(), 13);
    }
}

// ---- Titik terpilih di peta Cari Massal ----
const BATCH_STATUS_TEXT_COLOR = { success: '#0F6B41', warning: '#7A5200', error: '#9B1C12', empty: '#3E4757' };

function batchGroupOf(status) {
    if (status === 'Sukses') return 'success';
    if (status === 'Kosong') return 'empty';
    if (status === 'Luar Batas RI' || status === 'Wilayah Perairan') return 'warning';
    return 'error';
}

// Kotak keterangan di kiri atas peta (ikut pindah saat peta diperbesar)
function getBatchInfoBox() {
    if (!batchMap) return null;
    let box = document.getElementById('batchInfoBox');
    if (!box) {
        box = L.DomUtil.create('div', 'map-single-info-box batch-info-box hidden', batchMap.getContainer());
        box.id = 'batchInfoBox';
        box.setAttribute('role', 'status');
        box.setAttribute('aria-live', 'polite');
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.disableScrollPropagation(box);
    }
    return box;
}

function hideBatchInfo() {
    const box = document.getElementById('batchInfoBox');
    if (box) box.classList.add('hidden');
    if (lastSelectedBatchMarker && lastSelectedBatchMarker.getElement()) {
        lastSelectedBatchMarker.getElement().classList.remove('is-selected');
        lastSelectedBatchMarker.setZIndexOffset(0);
    }
}

function showBatchInfo(data) {
    const box = getBatchInfoBox();
    if (!box) return;
    box.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'info-head';
    const title = document.createElement('span');
    title.className = 'info-title';
    title.textContent = `Titik No. ${data.id}`;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'info-close';
    close.setAttribute('aria-label', 'Tutup keterangan titik');
    close.textContent = '×';
    close.addEventListener('click', () => { hideBatchInfo(); clearBatchBoundaryLayers(); });
    head.append(title, close);
    box.appendChild(head);

    const group = batchGroupOf(data.status);
    const rows = [
        ['Desa/Kelurahan', group === 'success' ? (data.desaKel || '-') : '-'],
        ['Kecamatan', group === 'success' ? data.kecamatan : '-'],
        ['Kabupaten/Kota', group === 'success' ? data.kabKota : '-'],
        ['Provinsi', group === 'success' ? data.provinsi : '-'],
        ['Koordinat', `${data.lat}, ${data.lon}`],
        ['Status', statusLabel(data.status)]
    ];
    rows.forEach(([label, value], i) => {
        const row = document.createElement('div');
        row.className = 'info-row';
        const k = document.createElement('strong');
        k.textContent = label;
        const v = document.createElement('span');
        v.textContent = value ?? '-';
        if (label === 'Koordinat') v.className = 'mono';
        if (i === rows.length - 1) v.style.color = BATCH_STATUS_TEXT_COLOR[group];
        row.append(k, ' ', v);
        box.appendChild(row);
    });
    box.classList.remove('hidden');
}

// Jarak dari atas peta yang tertutup kotak keterangan (agar pin/poligon tidak tertutup)
function batchInfoClearance() {
    const box = document.getElementById('batchInfoBox');
    if (!box || box.classList.contains('hidden')) return 20;
    return box.offsetTop + box.offsetHeight + 24;
}

// Pilih pin: cincin penanda + keterangan + poligon batas
function selectBatchMarker(m) {
    if (!m) return;
    if (lastSelectedBatchMarker && lastSelectedBatchMarker !== m && lastSelectedBatchMarker.getElement()) {
        lastSelectedBatchMarker.getElement().classList.remove('is-selected');
        lastSelectedBatchMarker.setZIndexOffset(0);
    }
    lastSelectedBatchMarker = m;
    const el = m.getElement();
    if (el) el.classList.add('is-selected');
    m.setZIndexOffset(1000);
    showBatchInfo(m.batchData);
    // Geser peta seperlunya agar pin terpilih tidak tertutup kotak keterangan
    try {
        batchMap.panInside(m.getLatLng(), { paddingTopLeft: [24, batchInfoClearance() + 30], paddingBottomRight: [24, 60] });
    } catch (e) { /* abaikan */ }
    showBatchBoundaries(m.batchData);
}

// Sorot baris tabel (utama & jendela perbesar) untuk nomor titik tertentu
function highlightBatchRows(id) {
    const idText = String(id);
    document.querySelectorAll('#batchTableBody tr, .table-modal-body .batch-table tbody tr').forEach(r => {
        r.classList.toggle('row-selected', r.querySelector('td:first-child')?.textContent === idText);
    });
}

function clearBatchMarkers() {
    if (!batchMap) return;
    hideBatchInfo();
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
