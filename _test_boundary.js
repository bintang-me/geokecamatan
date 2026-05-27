// Test: apakah kecamatan di Penajam Paser Utara, Paser, Aceh, Sumut bisa ditemukan
async function testBoundary(name, parent, label) {
    const q = parent ? `${name}, ${parent}, Indonesia` : `${name}, Indonesia`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&polygon_geojson=1&limit=5`;
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'GeoKecamatan-Test/1.0', 'Accept-Language': 'id' } });
        const data = await res.json();
        const boundary = data.find(r =>
            r.category === 'boundary' && r.type === 'administrative' &&
            r.geojson && (r.geojson.type === 'Polygon' || r.geojson.type === 'MultiPolygon')
        );
        const allTypes = data.map(r => `${r.category}/${r.type}`).join(', ');
        console.log(`\n[${label}] q="${q}"`);
        console.log(`  FOUND BOUNDARY: ${!!boundary}`);
        if (boundary) {
            console.log(`  geojson type: ${boundary.geojson.type}, display: ${boundary.display_name?.substring(0,80)}`);
        } else {
            console.log(`  All results (${data.length}): ${allTypes}`);
            if (data[0]) console.log(`  First result display: ${data[0].display_name?.substring(0,100)}`);
        }
    } catch(e) {
        console.log(`[${label}] ERROR: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1100));
}

async function main() {
    // Kecamatan di Penajam Paser Utara
    await testBoundary('Penajam', 'Penajam Paser Utara', 'Kec Penajam - PPU');
    await testBoundary('Babulu', 'Penajam Paser Utara', 'Kec Babulu - PPU');
    await testBoundary('Waru', 'Penajam Paser Utara', 'Kec Waru - PPU');
    await testBoundary('Sepaku', 'Penajam Paser Utara', 'Kec Sepaku - PPU');

    // Kecamatan di Paser
    await testBoundary('Tanah Grogot', 'Paser', 'Kec Tanah Grogot - Paser');
    await testBoundary('Kuaro', 'Paser', 'Kec Kuaro - Paser');

    // Kecamatan di Aceh
    await testBoundary('Kuta Alam', 'Banda Aceh', 'Kec Kuta Alam - Banda Aceh');
    await testBoundary('Simpang Tiga', 'Pidie', 'Kec Simpang Tiga - Aceh');
    await testBoundary('Meureudu', 'Pidie Jaya', 'Kec Meureudu - Pidie Jaya');

    // Kecamatan di Sumut
    await testBoundary('Medan Kota', 'Medan', 'Kec Medan Kota - Medan');
    await testBoundary('Nias', 'Nias', 'Kec Nias - Sumut');
    await testBoundary('Toba', 'Samosir', 'Kec Toba - Samosir');

    // Coba tanpa parent untuk lihat apakah bisa ditemukan
    await testBoundary('Babulu', null, 'Kec Babulu - no parent');
    await testBoundary('Sepaku', null, 'Kec Sepaku - no parent (IKN)');
    
    // Coba query berbeda - dengan "Kecamatan" prefix
    const q = `Kecamatan Penajam, Penajam Paser Utara, Indonesia`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&polygon_geojson=1&limit=5`;
    await new Promise(r => setTimeout(r, 1100));
    const res = await fetch(url, { headers: { 'User-Agent': 'GeoKecamatan-Test/1.0' } });
    const data = await res.json();
    console.log(`\n[Kecamatan Penajam - with prefix] Found ${data.length}, types: ${data.map(r=>`${r.category}/${r.type}`).join(', ')}`);
    if (data[0]) console.log(`  First: ${data[0].display_name?.substring(0,100)}`);
}

main().catch(e => console.error('ERR:', e));
