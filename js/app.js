/* =========================================================
   Cari Kecamatan — Aplikasi
   Inisialisasi halaman, alur pencarian, Cari Massal, modal, dan rute URL.
   ========================================================= */
// ==========================================
// Main App
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

    // ==========================================
    // Rute URL (/tunggal/<lat>,<lon> dan /massal#d=<data>), lihat js/router.js
    // ==========================================
    let routing = false;        // true selama menerapkan rute dari URL (jangan tulis ulang alamat)
    let lastSingleCoords = null; // titik terakhir Cari Tunggal
    let lastBatchHash = null;    // kode daftar Cari Massal terakhir

    // Kondisi terakhir per tab peramban (sessionStorage): hilang saat tab ditutup,
    // tidak pernah dikirim ke mana pun. Dipakai agar kembali dari halaman Tentang
    // langsung ke titik/daftar terakhir tanpa mencari ulang.
    const SESSION = {
        get(key) { try { return JSON.parse(sessionStorage.getItem(key)); } catch (e) { return null; } },
        set(key, val) { try { sessionStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* penuh/diblokir */ } },
        del(key) { try { sessionStorage.removeItem(key); } catch (e) { /* abaikan */ } }
    };
    const SS_SINGLE = 'ck_last_single';   // { lat, lon, input, result?, error? }
    const SS_BATCH = 'ck_last_batch';     // { hash, input, data? }
    const SS_DRAFT_SINGLE = 'ck_draft_single';
    const SS_DRAFT_BATCH = 'ck_draft_batch';

    // Tampilkan kembali hasil Cari Tunggal tersimpan tanpa memanggil API
    function restoreSingle(st) {
        const { lat, lon } = st;
        ++singleRequestSeq;
        lastSingleCoords = { lat, lon };
        coordInput.value = st.input || `${lat}, ${lon}`;
        setPath(singlePath(lat, lon));
        updateMapMarker(lat, lon);
        clearBoundaryLayers();
        singleSearchCoords = { lat, lon };
        if (st.result) {
            showResult(st.result, lat, lon);
            lastResult = { lat, lon, admin: st.result.administrative };
            fetchAndDrawBoundaries(st.result.administrative, lat, lon);
        } else if (st.error) {
            showError(st.error);
        }
    }

    // Tampilkan kembali tabel & pin Cari Massal tersimpan tanpa memproses ulang
    function restoreBatch(st) {
        lastBatchHash = st.hash || null;
        batchInput.value = st.input || '';
        updateGutter();
        updateProcessLabel();
        setPath(massalPath(lastBatchHash));
        if (!Array.isArray(st.data) || st.data.length === 0) return false;
        initBatchMap();
        clearBatchMarkers();
        batchTableBody.innerHTML = '';
        batchData = st.data.slice();
        batchFilter = 'all';
        batchData.forEach(item => {
            renderBatchRow(item);
            if (typeof item.lat === 'number' && typeof item.lon === 'number') addBatchMarker(item);
        });
        batchProgressContainer.classList.remove('hidden');
        const label = document.getElementById('batchProgressLabel');
        if (label) label.textContent = 'Selesai';
        batchProgressBar.style.width = '100%';
        batchProgressText.textContent = `${batchData.length} / ${batchData.length}`;
        setTimeout(() => { batchMap.invalidateSize(); fitBatchMapBounds(); }, 150);
        return true;
    }

    function restoreTabFromSession(tabId) {
        if (tabId === 'tab-tunggal' && !lastSingleCoords) {
            const saved = SESSION.get(SS_SINGLE);
            if (saved && (saved.result || saved.error)) restoreSingle(saved);
            else {
                const draft = SESSION.get(SS_DRAFT_SINGLE);
                if (draft && !coordInput.value) coordInput.value = draft;
            }
        } else if (tabId === 'tab-massal' && batchData.length === 0 && !isProcessing) {
            const saved = SESSION.get(SS_BATCH);
            if (saved) restoreBatch(saved);
            else {
                const draft = SESSION.get(SS_DRAFT_BATCH);
                if (draft && !batchInput.value) { batchInput.value = draft; updateGutter(); updateProcessLabel(); }
            }
        }
    }

    function activateTab(name) {
        document.querySelector(`.tab-btn[data-tab="tab-${name}"]`)?.click();
    }

    async function applyRoute() {
        const r = readRoute();
        routing = true;
        try {
            if (r.tab === 'massal') {
                activateTab('massal');
                const saved = SESSION.get(SS_BATCH);
                if (r.data) {
                    if (r.data !== lastBatchHash) {
                        if (saved && saved.hash === r.data && restoreBatch(saved)) return;
                        try {
                            const text = await decodeBatch(r.data);
                            lastBatchHash = r.data;
                            batchInput.value = text;
                            updateGutter();
                            updateProcessLabel();
                            const n = countBatchLines();
                            if (n > 0 && n <= BATCH_AUTORUN_MAX) processBatchBtn.click();
                        } catch (e) {
                            console.warn('Tautan Cari Massal tidak valid', e);
                        }
                    }
                } else if (batchData.length === 0) {
                    // /massal tanpa data: kembalikan daftar terakhir di tab ini (bila ada)
                    if (saved) restoreBatch(saved);
                    else {
                        const draft = SESSION.get(SS_DRAFT_BATCH);
                        if (draft && !batchInput.value) { batchInput.value = draft; updateGutter(); updateProcessLabel(); }
                        setPath(ROUTES.massal);
                    }
                }
            } else {
                activateTab('tunggal');
                const saved = SESSION.get(SS_SINGLE);
                if (r.q) {
                    const parsed = parseCoordinates(r.q);
                    const same = parsed.valid && lastSingleCoords && parsed.lat === lastSingleCoords.lat && parsed.lon === lastSingleCoords.lon;
                    if (!same) {
                        if (parsed.valid && saved && saved.lat === parsed.lat && saved.lon === parsed.lon && (saved.result || saved.error)) {
                            restoreSingle(saved);
                        } else {
                            coordInput.value = r.q;
                            processInput(r.q);
                        }
                    }
                } else if (!lastSingleCoords) {
                    // / atau /tunggal tanpa koordinat: kembalikan titik terakhir di tab ini (bila ada)
                    if (saved && (saved.result || saved.error)) restoreSingle(saved);
                    else {
                        const draft = SESSION.get(SS_DRAFT_SINGLE);
                        if (draft && !coordInput.value) coordInput.value = draft;
                    }
                }
            }
        } finally {
            routing = false;
        }
    }
    window.addEventListener('popstate', applyRoute);
    setTimeout(applyRoute, 0);

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
            const url = location.origin + singlePath(lastResult.lat, lastResult.lon);
            const title = `Kecamatan ${lastResult.admin.kecamatan} | Cari Kecamatan`;
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
        // Alamat di bilah browser selalu memuat titik terakhir → siap disalin
        lastSingleCoords = { lat, lon };
        setPath(singlePath(lat, lon));
        setSearching(false);
        // Bersihkan batas lama & tandai koordinat aktif agar fetch batas lama tertolak
        clearBoundaryLayers();
        singleSearchCoords = { lat, lon };

        const inputText = coordInput.value;
        const remember = (extra) => SESSION.set(SS_SINGLE, { lat, lon, input: inputText, ...extra });

        // Koordinat di luar RI: peringatan langsung, tanpa API call
        if (lat < INDONESIA_BOUNDS.latMin || lat > INDONESIA_BOUNDS.latMax || lon < INDONESIA_BOUNDS.lonMin || lon > INDONESIA_BOUNDS.lonMax) {
            showError(OUTSIDE_RI_MSG);
            remember({ error: OUTSIDE_RI_MSG });
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
            remember({ error: OUTSIDE_RI_MSG });
            return;
        }
        if (result.success) {
            showResult(result, lat, lon);
            lastResult = { lat, lon, admin: result.administrative };
            remember({ result: { administrative: result.administrative, source: result.source } });
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
                remember({ result: { administrative: admin, source: 'BIG' } });
            });
        } else {
            showError(result.error);
            // Gangguan jaringan tidak disimpan, agar saat kembali dicoba ulang
            if (!result.networkError) remember({ error: result.error });
        }
    }

    // ==========================================
    // Tab Switching Logic
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

            // Perbarui alamat: /tunggal[/<lat>,<lon>] atau /massal[#d=…]
            if (!routing) {
                const path = btn.dataset.tab === 'tab-massal'
                    ? massalPath(lastBatchHash)
                    : (lastSingleCoords ? singlePath(lastSingleCoords.lat, lastSingleCoords.lon) : ROUTES.tunggal);
                setPath(path, true);
            }

            // Pindah tab di halaman yang sama (mis. Tentang → Massal → Tunggal):
            // pulihkan kondisi terakhir tab tujuan bila belum ada isinya
            if (!routing) restoreTabFromSession(btn.dataset.tab);
            
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
    // Batch Processing Logic
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
    batchInput.addEventListener('input', () => {
        updateGutter();
        updateProcessLabel();
        SESSION.set(SS_DRAFT_BATCH, batchInput.value);
    });
    coordInput.addEventListener('input', () => SESSION.set(SS_DRAFT_SINGLE, coordInput.value));
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
        lastBatchHash = null;
        setPath(ROUTES.massal);
        SESSION.del(SS_BATCH);
        SESSION.del(SS_DRAFT_BATCH);
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

        // Simpan daftar ke alamat (/massal#d=…) agar hasil bisa dibagikan/dibuka ulang
        encodeBatch(lines.join('\n')).then(code => {
            if (runId !== batchRunId) return;
            lastBatchHash = code.length <= BATCH_URL_MAX ? code : null;
            setPath(massalPath(lastBatchHash));
        }).catch(() => {});
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
                        renderBatchRow(result, true);
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
                        renderBatchRow(fallback, true);
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

        // Simpan hasil di tab ini agar bisa dikembalikan tanpa diproses ulang
        const snapshot = { hash: lastBatchHash, input: batchInput.value, data: batchData };
        if (JSON.stringify(snapshot).length > 2000000) delete snapshot.data;
        SESSION.set(SS_BATCH, snapshot);
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

    function renderBatchRow(data, animate = false) {
        const tr = document.createElement('tr');
        tr.title = 'Klik untuk melihat titik pada peta';

        const group = batchStatusGroup(data.status);
        tr.dataset.group = group;
        tr.classList.add('row-' + group);
        if (animate) tr.classList.add('row-new');
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
        success: 'Ditemukan',
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
                batchMap.setView(marker.getLatLng(), Math.max(batchMap.getZoom(), 13), { animate: true });
                selectBatchMarker(marker);
                
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
        coord: () => sortedBatchData().map(d => `${d.lat}\t${d.lon}`).join('\n'),
        link: () => location.origin + massalPath(lastBatchHash)
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
            if (item.dataset.copy === 'link' && !lastBatchHash) {
                alert('Daftar terlalu panjang untuk dijadikan tautan. Gunakan Unduh CSV.');
                return;
            }
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
        // Buang semua id dari salinan agar tidak bentrok dengan tabel asli (#batchTableBody, dll.)
        clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        clone.id = 'batchTableClone';
        // Pastikan thead selalu sebelum tbody
        const thead = clone.querySelector('thead');
        const tbody = clone.querySelector('tbody');
        if (thead && tbody && tbody.compareDocumentPosition(thead) & Node.DOCUMENT_POSITION_PRECEDING) {
            clone.insertBefore(thead, tbody);
        }
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
            
            const noSearchYet = document.getElementById('resultContent').classList.contains('hidden');
            let status = noSearchYet ? 'Belum ada pencarian' : 'Data tidak ditemukan';
            if (!noSearchYet && kec !== '-' && kec !== '') {
                if (kec === '(Luar RI)' || kec.includes('Luar RI')) {
                    status = 'Luar Indonesia';
                } else if (kec === '(Perairan)' || kec.includes('Perairan')) {
                    status = 'Perairan';
                } else {
                    status = 'Ditemukan';
                }
            }
            
            document.getElementById('modalInfoDesaKel').textContent = desa;
            document.getElementById('modalInfoKecamatan').textContent = kec;
            document.getElementById('modalInfoKabKota').textContent = kab;
            document.getElementById('modalInfoProvinsi').textContent = prov;
            document.getElementById('modalInfoStatus').textContent = status;
            
            // Berikan warna status
            const statusEl = document.getElementById('modalInfoStatus');
            if (status === 'Ditemukan') {
                statusEl.style.color = '#0F6B41'; // green
            } else if (status === 'Belum ada pencarian') {
                statusEl.style.color = '#5B6577'; // netral
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
});
