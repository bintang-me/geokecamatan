// map.js
let map;
let marker;

export function initMap(containerId, onLocationSelected) {
    const initialLat = -2.5;
    const initialLon = 118.0;

    map = L.map(containerId, {
        zoomControl: true,
        preferCanvas: true
    }).setView([initialLat, initialLon], 5);

    // 1. Peta Standar (CartoDB Voyager)
    const standardMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    });

    // 2. Citra Satelit (Esri World Imagery)
    const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19
    });

    // 3. Label Jalan (CartoDB Voyager Only Labels) untuk Mode Hybrid
    const labelsMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19
    });

    // Gabungkan satelit dan label menjadi satu grup layer "Satelit Hybrid"
    const satelliteHybrid = L.layerGroup([esriSatellite, labelsMap]);

    // Set peta default saat halaman dimuat
    standardMap.addTo(map);

    // Tambahkan kontrol layer ke peta
    const baseMaps = {
        "Peta Standar": standardMap,
        "Satelit Hybrid": satelliteHybrid
    };

    L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

    marker = L.marker([initialLat, initialLon], { draggable: true }).addTo(map);

    marker.on('dragend', function () {
        const pos = marker.getLatLng();
        onLocationSelected(pos.lat, pos.lng);
    });

    map.on('click', function (e) {
        const pos = e.latlng;
        marker.setLatLng(pos);
        onLocationSelected(pos.lat, pos.lng);
    });

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

export function updateMapMarker(lat, lon) {
    if (map && marker) {
        const newLatLng = new L.LatLng(lat, lon);
        marker.setLatLng(newLatLng);
        map.setView(newLatLng, 13); // zoom in
    }
}
