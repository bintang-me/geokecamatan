/* =========================================================
   Cari Kecamatan — Tampilan
   Panel hasil, salin ke clipboard, dan riwayat pencarian.
   ========================================================= */
// ==========================================
// UI
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
    else if (kec !== '-' && kec !== '') { status = 'Ditemukan'; kind = 'success'; }

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
// History Management
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
    const countEl = document.getElementById('historyCount');
    if (countEl) countEl.textContent = history.length ? String(history.length) : '';

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
