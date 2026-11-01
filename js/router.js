/* =========================================================
   Cari Kecamatan — Rute URL
   /tunggal/<lintang>,<bujur>  → hasil Cari Tunggal (bisa disalin dari bilah alamat)
   /massal#d=<data>            → daftar Cari Massal, dimampatkan di bagian "#" URL
                                  (tidak pernah dikirim ke server)
   Tautan lama (?q=…, #massal) tetap didukung.
   ========================================================= */

const ROUTES = { tunggal: '/tunggal', massal: '/massal' };
const BATCH_URL_MAX = 16000;     // panjang maksimum kode daftar di URL (karakter)
const BATCH_AUTORUN_MAX = 200;   // daftar dari tautan diproses otomatis bila ≤ jumlah ini

function singlePath(lat, lon) {
    return (lat == null || lon == null) ? ROUTES.tunggal : `${ROUTES.tunggal}/${lat},${lon}`;
}

function massalPath(code) {
    return code ? `${ROUTES.massal}#d=${code}` : ROUTES.massal;
}

function readBatchHash() {
    const m = location.hash.match(/^#d=([A-Za-z0-9_-]+)$/);
    return m ? m[1] : null;
}

// Baca rute dari URL saat ini
function readRoute() {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    let m;
    if ((m = path.match(/^\/tunggal\/(.+)$/))) {
        let q = m[1];
        try { q = decodeURIComponent(q); } catch (e) { /* biarkan apa adanya */ }
        return { tab: 'tunggal', q };
    }
    if (path === ROUTES.tunggal) return { tab: 'tunggal' };
    if (path === ROUTES.massal) return { tab: 'massal', data: readBatchHash() };

    // Tautan lama
    const q = new URLSearchParams(location.search).get('q');
    if (q) return { tab: 'tunggal', q };
    if (location.hash === '#massal') return { tab: 'massal', legacy: true };
    return { tab: 'tunggal' };
}

// Ganti alamat di bilah browser tanpa memuat ulang halaman
function setPath(path, push = false) {
    if (!window.history || !history.replaceState) return;
    const current = location.pathname + location.search + location.hash;
    if (current === path) return;
    try { history[push ? 'pushState' : 'replaceState'](null, '', path); } catch (e) { /* abaikan */ }
}

// ---- Kode daftar Cari Massal: teks → deflate → base64url ----
function bytesToB64Url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlToBytes(s) {
    let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

async function encodeBatch(text) {
    const bytes = new TextEncoder().encode(text);
    if (window.CompressionStream) {
        try {
            const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
            const buf = await new Response(stream).arrayBuffer();
            return 'z' + bytesToB64Url(new Uint8Array(buf));
        } catch (e) { /* gunakan tanpa kompresi */ }
    }
    return 'p' + bytesToB64Url(bytes);
}

async function decodeBatch(code) {
    const kind = code.charAt(0);
    const bytes = b64UrlToBytes(code.slice(1));
    if (kind === 'p') return new TextDecoder().decode(bytes);
    if (kind === 'z' && window.DecompressionStream) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new TextDecoder().decode(await new Response(stream).arrayBuffer());
    }
    throw new Error('Kode daftar tidak dikenali');
}
