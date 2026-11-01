# Laporan Bug — GeoKecamatan (Cari Kecamatan)

Tanggal audit: 2026-11-01 · Commit yang diaudit: `6993aad`

Laporan ini ditulis sebagai **instruksi kerja** untuk model/engineer yang akan memperbaiki bug (mis. Claude Sonnet). Setiap bug punya lokasi, cara reproduksi, akar masalah, arahan perbaikan, dan kriteria selesai.

---

## 0. Konteks penting sebelum mulai

- **Hanya `js/bundle.js` yang dimuat** oleh `index.html` (baris 365). File `js/main.js`, `js/geocoder.js`, `js/map.js`, `js/parser.js`, `js/ui.js`, `js/validator.js` adalah versi ES-module lama yang **tidak dipakai**. Semua perbaikan dilakukan di `js/bundle.js`.
- Folder `backup_working_state/` adalah salinan lama — **jangan diedit**.
- Proyek ini vanilla JS tanpa build step dan tanpa test suite. Pertahankan gaya kode dan teks UI berbahasa Indonesia.
- Nomor baris di bawah merujuk ke `js/bundle.js` pada commit `6993aad`.
- Status verifikasi:
  - **[TERVERIFIKASI]** = sudah direproduksi dengan menjalankan kode asli di Node (lihat §4).
  - **[ANALISIS KODE]** = dari pembacaan kode; alur logikanya jelas tetapi belum dijalankan di browser.
  - Endpoint API (BIG, ArcGIS, Nominatim, is-on-water) **tidak bisa diakses** dari sandbox audit, jadi perilaku API live belum diverifikasi.

### Ringkasan

| ID | Tingkat | Area | Judul singkat |
|----|---------|------|---------------|
| B1 | 🔴 Tinggi | Parser | Huruf hemisfer (S/LS/W) diabaikan pada format desimal → tanda salah |
| B2 | 🔴 Tinggi | Parser | DMS yang gagal diparse jatuh ke `parseFloat` → koordinat terpotong diam-diam |
| B3 | 🔴 Tinggi | Parser | "Koreksi angka raksasa" merusak lintang ≥ 10° dan lintang yang sudah valid |
| B4 | 🔴 Tinggi | Geocoder | Semua API gagal/timeout → batch melabeli titik "Luar Batas RI", dan kegagalan di-cache |
| B5 | 🟠 Sedang-Tinggi | Geocoder | Logika cache terbalik: hasil sukses BIG/ArcGIS tidak pernah di-cache |
| B6 | 🟠 Sedang-Tinggi | Geocoder | Deteksi perairan ArcGIS/OSM menimpa hasil darat BIG |
| B7 | 🟠 Sedang-Tinggi | Cari Tunggal | Race condition: hasil/batas wilayah pencarian lama menimpa yang baru |
| B8 | 🟠 Sedang | Batch | Konkurensi 3 melanggar batas 1 req/detik Nominatim |
| B9 | 🟠 Sedang | Batch | "Hapus Input" saat proses berjalan tidak menghentikan proses |
| B10 | 🟡 Sedang | Cari Tunggal | Error `localStorage` membatalkan penggambaran batas wilayah |
| B11 | 🟡 Sedang | Deploy | `bundle.js` tanpa cache-busting → pengguna bisa tetap kena splash "infinite loading" lama |
| B12 | 🟡 Sedang | Peta | Klik peta setelah digeser melewati antimeridian → bujur > 180 |
| B13 | 🟡 Rendah-Sedang | Parser | Ambiguitas koma desimal + koma pemisah; titik koma tidak didukung |
| B14 | 🟢 Rendah | Batch | Poligon lama tertinggal saat memilih baris non-Sukses |
| B15 | 🟢 Rendah | Batch | Input CRLF dengan baris kosong di akhir menambah baris "Kosong" palsu |
| B16 | 🟢 Rendah | Batch | Baris error tidak menampilkan teks asli input |
| B17 | 🟢 Rendah | UI | `navigator.clipboard` tidak ada di konteks non-HTTPS → TypeError |
| B18 | 🟢 Rendah | UX | Setelah cari tunggal, peta tidak zoom ke titik (tetap zoom 5) |
| B19 | ⚪ Kebersihan | Repo | Kode mati & file uji/backup ikut ter-deploy |

Urutan perbaikan yang disarankan: **B1 → B2 → B3 → B13** (satu PR parser), lalu **B4 → B5 → B6** (geocoder), lalu **B7 → B10 → B12 → B18** (cari tunggal/peta), lalu **B8 → B9 → B14 → B15 → B16** (batch), terakhir **B11, B17, B19**.

---

## 1. Parser koordinat (`convertDMSToDecimal`, `parseCoordinates`, baris 4–182)

### B1 — Huruf hemisfer diabaikan pada format desimal 🔴 [TERVERIFIKASI]

**Reproduksi** (`parseCoordinates(input)`):

| Input | Hasil sekarang | Seharusnya |
|---|---|---|
| `6.2088 S, 106.8456 E` | lat **6.2088** | lat **-6.2088** |
| `6.2088°S, 106.8456°E` | lat **6.2088** | lat **-6.2088** |
| `6.2088 LS, 106.8456 BT` | lat **6.2088** | lat **-6.2088** |
| `6°S 106°E` | lat **6** | lat **-6** |

Hasilnya *valid* dan masih di dalam `INDONESIA_BOUNDS` (latMax 6.5), jadi pengguna mendapat lokasi yang salah (Laut Cina Selatan / Natuna) tanpa peringatan.

**Akar masalah:** Normalisasi `LS/LU/BT/BB` hanya ada di `convertDMSToDecimal` (baris 15–18). Regex DMS (baris 20) mewajibkan komponen menit, jadi format "desimal + hemisfer" gagal di sana dan jatuh ke jalur desimal (baris 86+), yang memakai `parseFloat` dan membuang huruf hemisfer.

**Arahan perbaikan:**
- Tambahkan jalur parse khusus "derajat desimal + hemisfer" (setelah DMS, sebelum desimal biasa): normalisasi `LS/LU/BT/BB` → `S/N/E/W`, cocokkan dua token angka yang masing-masing diikuti/didahului `N|S|E|W` (dengan atau tanpa `°`), lalu terapkan tanda (S/W = negatif) dan tentukan lat/lon dari hurufnya (bukan dari urutan).
- Jika angka sudah bertanda minus **dan** ada huruf S/W, jangan dinegasikan dua kali.

**Kriteria selesai:** keempat input di tabel menghasilkan `lat` negatif yang benar, dan `-6.2088, 106.8456` tetap seperti sekarang.

### B2 — DMS gagal diparse diam-diam berubah jadi derajat bulat 🔴 [TERVERIFIKASI]

| Input | Hasil sekarang | Seharusnya |
|---|---|---|
| `6o14'52.1"S 106o52'40.0"E` (huruf `o` sebagai derajat) | `{lat: 6, lon: 106}` | `{lat: -6.247806, lon: 106.877778}` |
| `6°14.5'S 106°52.3'E` (derajat + menit desimal) | `{lat: 6, lon: 106}` | `{lat: -6.241667, lon: 106.871667}` |

**Akar masalah:**
1. Baris 5 melakukan `toUpperCase()` **sebelum** baris 8 mengganti `o` → `°`, jadi `o` kecil tidak pernah cocok (sudah menjadi `O`).
2. Regex baris 20 mensyaratkan menit `(\d+)` bilangan bulat, jadi menit desimal (`14.5'`) tidak didukung.
3. Saat regex DMS gagal, jalur desimal memakai `parseFloat("6°14'52.1S")` yang dengan longgar mengembalikan `6` — tanda bahwa input sebenarnya tidak valid terbuang.

**Arahan perbaikan:**
- Pindahkan normalisasi simbol (`˚º⁰o` → `°`) ke **sebelum** `toUpperCase()`, atau tambahkan `O` ke character class (hati-hati jangan sampai menabrak huruf lain; idealnya hanya `o`/`O` yang diapit digit, mis. `/(\d)\s*[oO]\s*(?=\d)/g`).
- Dukung menit desimal: ubah grup menit menjadi `([\d.]+)` dan biarkan detik opsional.
- Di jalur desimal, **validasi ketat** setiap token: setelah dibersihkan, token harus cocok dengan `^-?\d+(\.\d+)?$`. Jika ada sisa karakter (`°`, `'`, `"`, huruf), anggap input tidak valid dan kembalikan error, alih-alih memakai hasil `parseFloat` parsial.

**Kriteria selesai:** dua input di tabel menghasilkan nilai yang benar (±1e-6); input DMS rusak seperti `6°14'xx"S 106°52'E` menghasilkan `valid: false`, bukan `lat: 6`.

### B3 — "Koreksi angka raksasa" merusak lintang ≥ 10° 🔴 [TERVERIFIKASI]

| Input | Hasil sekarang | Seharusnya |
|---|---|---|
| `-10.17, 1234567` | lat **-1.017**, lon 123.4567 | lat **-10.17** (lat sudah valid, hanya lon yang dikoreksi) |
| `-102088, 1238456` | lat **-1.02088** | ambigu; minimal jangan menghasilkan nilai yang salah dengan yakin |

Wilayah Indonesia di selatan -10° (Rote, Sabu, sebagian Sumba/NTT) jadi tidak bisa diinput dengan format "tanpa titik desimal" dari Excel, dan lat valid ikut dirusak bila hanya bujur yang "raksasa".

**Akar masalah (baris 149–168):**
1. Koreksi dijalankan untuk **kedua** nilai bila **salah satu** keluar batas.
2. Lintang selalu dipaksa 1 digit sebelum titik desimal (`substring(0, 1)`).

**Arahan perbaikan:**
- Koreksi lat hanya jika `Math.abs(lat) > 90`; koreksi lon hanya jika `Math.abs(lon) > 180`.
- Untuk lat: coba posisi titik desimal 1 dan 2 digit; pilih kandidat yang jatuh di dalam `INDONESIA_BOUNDS` (latMin -11.5, latMax 6.5). Jika keduanya valid atau keduanya tidak valid, pilih 1 digit (perilaku sekarang) — tetapi jangan ubah nilai yang memang sudah valid.
- Untuk lon: logika `prefix3` 100–145 → 3 digit sudah benar; pertahankan.

**Kriteria selesai:** `-10.17, 1234567` → `{lat: -10.17, lon: 123.4567}`; `-62088, 1068456` tetap → `{lat: -6.2088, lon: 106.8456}`; `-107000, 1230000` → `{lat: -10.7, lon: 123}`.

### B13 — Ambiguitas koma & pemisah titik koma 🟡 [TERVERIFIKASI]

| Input | Hasil sekarang | Seharusnya |
|---|---|---|
| `-6,2088, 106,8456` (koma desimal ID + pemisah `, `) | `{lat: -6, lon: 20.88}` → "Luar RI" | `{lat: -6.2088, lon: 106.8456}` |
| `-10,123, 123,456` | `{lat: -10, lon: 123}` | `{lat: -10.123, lon: 123.456}` |
| `-6.2088;106.8456` (format umum Excel locale ID/CSV) | `valid: false` | `{lat: -6.2088, lon: 106.8456}` |

**Akar masalah:** baris 94–95 memecah dengan `/\s*,\s*/` sehingga koma desimal ikut jadi pemisah (hasil 4 bagian, hanya 2 pertama dipakai). Titik koma tidak ada dalam daftar pemisah.

**Arahan perbaikan:**
- Tambahkan `;` sebagai pemisah utama (prioritas setelah tab).
- Jika hasil split dengan koma menghasilkan **tepat 4 bagian** yang semuanya bilangan bulat (bertanda minus opsional di bagian 1 dan 3), gabungkan menjadi `p0.p1` dan `p2.p3`.
- Jika hasil split > 2 bagian dalam kasus lain, kembalikan error (jangan diam-diam memakai 2 bagian pertama).

**Kriteria selesai:** ketiga input di tabel menghasilkan nilai yang benar; semua kasus B1–B3 tetap lulus.

---

## 2. Geocoder (`reverseGeocode` dan cache, baris 293–444)

### B4 — API gagal/timeout dilabeli "Luar Batas RI" dan kegagalan di-cache 🔴 [TERVERIFIKASI]

**Reproduksi:** buat semua `fetch` gagal (offline/timeout). `reverseGeocode(-6.2, 106.8)` mengembalikan
`{success:false, error:"Lokasi tidak ditemukan di database manapun. Titik mungkin berada di luar perairan wilayah Indonesia."}`.
- Di mode batch, `processTask` (baris 1607) mencari substring `'luar perairan'` → baris diberi status **"Luar Batas RI"** (pin emas), bukan **"Error API"**. Satu gangguan jaringan bisa membuat seluruh tabel tampak "di luar Indonesia".
- Hasil gagal ini **di-cache** (baris 437) selama 5 menit. Setelah jaringan pulih, pencarian ulang titik yang sama tetap gagal tanpa memanggil API (terverifikasi: 0 panggilan `fetch`).
- Blok `catch` "Gagal terhubung ke layanan data geoportal" (baris 440–443) praktis tidak pernah tercapai karena `fetchWithTimeout` menelan semua error menjadi `null`.

**Arahan perbaikan:**
- Bedakan "semua sumber gagal/null" dari "sumber merespons tapi tidak ada data". Jika `bigData`, `arcData`, dan `osmData` semuanya `null`, kembalikan `{ success: false, networkError: true, error: "Gagal terhubung ke layanan data geoportal. Coba lagi." }`.
- **Jangan cache** hasil `success: false` (atau minimal jangan cache `networkError`).
- Di `processTask`, klasifikasikan berdasarkan flag terstruktur (`result.networkError`, `result.isWaterBody`, `result.outsideIndonesia`), bukan dengan mencocokkan substring pesan error. `networkError` → status `'Error API'`.

**Kriteria selesai:** saat semua fetch gagal, batch menampilkan "Error API" (merah), dan setelah jaringan pulih pencarian ulang memanggil API lagi.

### B5 — Logika cache terbalik 🟠 [TERVERIFIKASI]

**Reproduksi:** dengan BIG merespons sukses, panggil `reverseGeocode(-6.4, 106.9)` dua kali → `fetch` dipanggil 4 kali **lagi** pada panggilan kedua (tidak ada cache hit).

**Akar masalah:** `getFromCache` baris 316–320 menghapus entri sukses yang `administrative.geometry`-nya kosong. `parseBIGResponse` selalu mengisi `geometry: null` (baris 204) dan `parseArcGISResponse` tidak punya `geometry`. Artinya cache hanya efektif untuk hasil fallback OSM dan untuk **kegagalan** (lihat B4) — kebalikan dari yang diinginkan. Geometri sudah tidak dipakai lagi (batas digambar lewat `fetchAndDrawBoundaries` dari BIG).

**Arahan perbaikan:** hapus blok invalidasi baris 316–320. Pertimbangkan juga tidak menyimpan `geometry` OSM (polygon GeoJSON) di cache karena tidak dipakai dan bisa besar.

**Kriteria selesai:** panggilan kedua untuk koordinat yang sama dalam 5 menit tidak memanggil `fetch`.

### B6 — Deteksi perairan menimpa hasil darat BIG 🟠 [TERVERIFIKASI dengan data tiruan]

**Reproduksi (simulasi):** BIG mengembalikan desa `KARET / SETIABUDI`, Nominatim mengembalikan alamat dengan `address.bay` → hasil akhir `isWaterBody: true` "Wilayah ini terdeteksi berada di perairan".

**Akar masalah (baris 377–390):** pengecekan perairan dijalankan **sebelum** prioritas BIG, dan `isArcWater`/`isOsmWater` cukup salah satu benar untuk mengembalikan "perairan", meskipun BIG (yang di komentar disebut "SUMBER PRIMER & ABSOLUT") menemukan desa. Selain itu `isArcWater` juga bernilai benar bila ArcGIS hanya tidak punya `Region/Subregion/City` — yang bisa terjadi di daratan terpencil. Desa pesisir, pulau kecil, dan titik dekat teluk berisiko salah dilabeli perairan.

**Arahan perbaikan:** jika `bigResult && bigResult.kecamatan !== '-'`, **lewati seluruh deteksi perairan** dan langsung pakai hasil BIG. Deteksi perairan hanya dipakai saat BIG tidak menemukan poligon (atau BIG gagal/timeout).

**Kriteria selesai:** simulasi di atas mengembalikan `success: true` dengan kecamatan `Setiabudi`.

### Catatan risiko (belum diverifikasi, tidak wajib diperbaiki)

- `fetchWithTimeout` default 4 detik (baris 337). Server BIG dikenal lambat; bila timeout, hasil jatuh ke ArcGIS yang memetakan `addr.City` sebagai kecamatan (baris 215) — untuk Indonesia field `City` ArcGIS sering berisi nama Kab/Kota, sehingga "Kecamatan" bisa terisi nama kabupaten. Pertimbangkan timeout BIG yang lebih panjang (mis. 8 detik) dan/atau menandai hasil non-BIG sebagai "akurasi lebih rendah" di badge.
- `getCacheKey` memakai `toFixed(4)` (~11 m). Dua titik di sisi berbeda batas desa yang berjarak < 11 m bisa berbagi hasil cache. Pertimbangkan `toFixed(5)` atau `toFixed(6)`.

---

## 3. UI, peta, dan batch

### B7 — Race condition pada Cari Tunggal 🟠 [ANALISIS KODE]

**Skenario:** klik peta di titik A, lalu cepat klik titik B. Jika respons A datang **setelah** respons B:
1. `showResult` untuk A menimpa hasil B di panel, sementara marker ada di B.
2. `saveToHistory` mencatat A sebagai pencarian terbaru.
3. `fetchAndDrawBoundaries(A)` men-set `singleSearchCoords = A` dan menghapus poligon B → peta menggambar batas A padahal marker di B.

Kasus terkait: `doGeocode` untuk titik di luar `INDONESIA_BOUNDS` (baris 1348–1351) `return` **sebelum** `clearBoundaryLayers()`, sehingga poligon pencarian sebelumnya tetap tampil di peta untuk titik di luar RI. Hal yang sama terjadi bila hasil `success: false` (perairan/error): `singleSearchCoords` tidak di-reset, sehingga batas lama yang fetch-nya masih berjalan tetap bisa digambar.

**Arahan perbaikan:**
- Tambahkan token permintaan di `doGeocode`, mis. `const reqId = ++singleRequestSeq;` lalu setelah `await reverseGeocode(...)`: `if (reqId !== singleRequestSeq) return;`.
- Panggil `clearBoundaryLayers()` dan set `singleSearchCoords = null` di **awal** `doGeocode` (sebelum cek luar batas), atau set `singleSearchCoords = {lat, lon}` di awal `doGeocode` sehingga fetch batas lama otomatis tertolak.

**Kriteria selesai:** dengan `reverseGeocode` dibuat lambat untuk permintaan pertama, panel, riwayat, dan poligon selalu mencerminkan klik terakhir.

### B8 — Batch melanggar batas rate Nominatim 🟠 [ANALISIS KODE]

Batch memproses 3 titik paralel (baris 1476) dan setiap titik memanggil Nominatim `reverse`. Kebijakan penggunaan Nominatim publik adalah maksimal **1 request/detik**; pelanggaran menghasilkan HTTP 429 atau blokir IP, sehingga untuk batch besar OSM praktis selalu `null` dan fallback/deteksi perairan OSM tidak bekerja.

**Arahan perbaikan:** buat antrean/throttle global khusus untuk URL `nominatim.openstreetmap.org` (≥ 1100 ms antar request, juga berlaku untuk `fetchOSMProvinsiBoundary`). BIG/ArcGIS boleh tetap paralel. Alternatif: di mode batch, panggil Nominatim **hanya** bila BIG tidak menemukan kecamatan.

### B9 — "Hapus Input" tidak membatalkan batch yang sedang berjalan 🟠 [ANALISIS KODE]

`clearBatchBtn` (baris 1432–1438) mengosongkan `batchData`, tabel, dan marker, tetapi loop di `processBatchBtn` tetap berjalan: hasil berikutnya di-`push` ke `batchData` baru, baris dan marker muncul kembali, lalu di akhir tabel di-render ulang berisi hasil sebagian dari batch yang "sudah dihapus".

**Arahan perbaikan:** gunakan `let batchRunId = 0;`. Saat mulai proses: `const runId = ++batchRunId;`. Di callback `.then/.catch/.finally` dan setelah `await` utama, abaikan jika `runId !== batchRunId`. `clearBatchBtn` melakukan `batchRunId++`, reset `isProcessing`, mengaktifkan kembali tombol, dan menyembunyikan progress. Alternatif lebih sederhana: nonaktifkan `clearBatchBtn` selama proses.

### B10 — Error `localStorage` membatalkan penggambaran batas 🟡 [ANALISIS KODE]

Di `doGeocode` (baris 1363–1366), `saveToHistory` dipanggil sebelum `fetchAndDrawBoundaries`. `localStorage.setItem` (baris 1159, 1170) bisa melempar error (mode privat Safari, kuota penuh, storage diblokir). Exception itu menghentikan `doGeocode` sehingga batas wilayah tidak pernah digambar (dan muncul unhandled promise rejection).

**Arahan perbaikan:** bungkus `localStorage.setItem` / `removeItem` dengan `try/catch` di `saveToHistory`, `removeHistoryItem`, dan `clearHistory`.

### B11 — `bundle.js` tanpa cache-busting 🟡 [ANALISIS KODE]

`index.html` memakai `?v=1779070546` untuk CSS, tetapi `<script src="js/bundle.js">` (baris 365) tanpa versi. Commit `6993aad` mengaktifkan kembali auto-dismiss splash; browser yang masih menyimpan `bundle.js` lama (yang auto-dismiss-nya dinonaktifkan) bisa tetap terjebak di splash "infinite loading" sampai cache kedaluwarsa.

**Arahan perbaikan:** tambahkan query versi yang sama ke script, mis. `js/bundle.js?v=<timestamp>`, dan perbarui nilainya setiap rilis (CSS dan JS sebaiknya memakai nilai yang sama). Pertimbangkan juga membuat splash bisa ditutup dengan klik sebagai pengaman.

### B12 — Bujur di luar ±180 setelah peta digeser 🟡 [ANALISIS KODE]

Handler `map.on('click')` dan `marker.on('dragend')` (baris 713–724) memakai `e.latlng` / `marker.getLatLng()` mentah. Jika pengguna menggeser peta melewati antimeridian (dunia berulang), bujur bisa bernilai mis. `466.8`, lalu `doGeocode` menampilkan "Wilayah ini berada di luar batas Negara Republik Indonesia" walaupun titik secara visual ada di Indonesia.

**Arahan perbaikan:** gunakan `e.latlng.wrap()` dan `marker.getLatLng().wrap()`, lalu `marker.setLatLng(wrapped)`. Bulatkan juga nilai yang dimasukkan ke input menjadi 6 desimal di `setInputValue` agar riwayat tidak berisi angka seperti `-6.208812345678901`.

### B14 — Poligon batch lama tetap tampil 🟢 [ANALISIS KODE]

`showBatchBoundaries` (baris 885) langsung `return` jika `data.status !== 'Sukses'` **sebelum** `clearBatchBoundaryLayers()`. Memilih baris/marker berstatus Error/Perairan/Luar RI setelah baris Sukses membiarkan poligon kecamatan sebelumnya tetap tampil.

**Arahan perbaikan:** panggil `clearBatchBoundaryLayers()` dan set `activeBatchCoords = null` sebelum cek status.

### B15 — CRLF dan baris kosong di akhir 🟢 [ANALISIS KODE]

Baris 1445: `rawText.replace(/\n+$/, '')` hanya menghapus `\n`, bukan `\r\n`. Input dari Windows/Excel seperti `"a\r\nb\r\n\r\n"` menghasilkan baris terakhir `"\r"` → satu baris "Kosong" palsu di tabel.

**Arahan perbaikan:** `rawText.replace(/\r\n?/g, '\n').replace(/\n+$/, '')`.

### B16 — Baris error kehilangan teks asli 🟢 [ANALISIS KODE]

Untuk input yang tidak valid, `processTask` (baris 1545–1551) mengisi `lat: '-', lon: '-'`, sehingga pengguna tidak tahu baris mana/apa yang salah di daftar panjang.

**Arahan perbaikan:** tampilkan `task.originalText` (sudah tersedia) di kolom Lintang (atau tooltip baris) dan pesan `task.parsed.error` sebagai `title` sel status. Jangan ubah format salinan kolom koordinat untuk baris sukses.

### B17 — `navigator.clipboard` tidak tersedia di non-HTTPS 🟢 [ANALISIS KODE]

Semua tombol salin memanggil `navigator.clipboard.writeText` langsung. Di konteks tidak aman (dibuka via `http://` di LAN atau `file://`), `navigator.clipboard` bernilai `undefined` → `TypeError` dan tombol tidak berfungsi tanpa umpan balik.

**Arahan perbaikan:** buat satu helper `copyText(text)` dengan fallback `document.execCommand('copy')` lewat `<textarea>` sementara, lalu pakai di semua tombol salin (baris 1283–1316 dan 1728–1800). Sekalian hilangkan duplikasi handler tombol utama vs. modal dengan memakai `clipboardCopyWithFeedback` yang sudah ada.

### B18 — Peta tidak zoom ke hasil Cari Tunggal 🟢 [ANALISIS KODE]

`updateMapMarker` (baris 779–784) memakai `map.getZoom()`; saat pertama kali mencari, zoom tetap 5 (seluruh Indonesia) sehingga marker dan poligon kecamatan hampir tidak terlihat. Fungsi `drawPolygon` yang dulu melakukan `fitBounds` sudah tidak dipanggil.

**Arahan perbaikan:** di `updateMapMarker`, gunakan `Math.max(map.getZoom(), 13)`; atau di `fetchAndDrawBoundaries`, setelah poligon kecamatan tergambar, lakukan `map.fitBounds(layer.getBounds(), { padding: [20, 20], maxZoom: 15 })` (hanya untuk pencarian dari input teks, bukan dari klik peta, agar tidak mengganggu pengguna yang sedang menjelajah).

### B19 — Kode mati dan kebersihan repo ⚪

- Fungsi/konstanta tidak terpakai di `bundle.js`: `drawPolygon` (642), `fetchOSMDesaKelBoundary` + `osmVillageCache` (532–569), `BOUNDARY_STYLES.desaKel` (480), `BIG_URLS.desaKel` (505), field `outsideIndonesia` dari `parseCoordinates` (175–177), cabang `'(Perairan)'` di `showResult` (1080, 1108) yang tidak pernah terjadi karena perairan dikembalikan sebagai `success: false`.
- File yang tidak dipakai tetapi ikut ter-deploy ke publik: `js/main.js`, `js/geocoder.js`, `js/map.js`, `js/parser.js`, `js/ui.js`, `js/validator.js`, folder `backup_working_state/`, `_test_boundary.js`, `test_count.js`.
- Komentar header bagian 6 (baris 286–291) masih menyebut "BPS" padahal sumbernya BIG.

**Arahan:** hapus kode mati di `bundle.js` setelah bug lain selesai (agar nomor baris di laporan ini tetap relevan selama perbaikan). Untuk file/folder yang tidak dipakai, **minta konfirmasi pemilik repo** sebelum menghapus.

---

## 4. Cara memverifikasi (tanpa browser)

Fungsi parser dan geocoder di `bundle.js` tidak bergantung pada DOM, jadi bisa diuji di Node ≥ 18 dengan mengekstrak bagian file. Simpan skrip uji **di luar repo** (atau di folder `tests/` bila pemilik setuju).

**Parser (B1, B2, B3, B13):**

```bash
{ sed -n '1,182p' js/bundle.js; sed -n '293,297p' js/bundle.js; cat <<'EOF'
const cases = [
 ["-6.2088, 106.8456",            -6.2088,   106.8456],
 ["6.2088 S, 106.8456 E",         -6.2088,   106.8456],
 ["6.2088 LS, 106.8456 BT",       -6.2088,   106.8456],
 ["6°S 106°E",                    -6,        106],
 ["6°14'52.1\"S 106°52'40.0\"E",  -6.247806, 106.877778],
 ["6o14'52.1\"S 106o52'40.0\"E",  -6.247806, 106.877778],
 ["6°14.5'S 106°52.3'E",          -6.241667, 106.871667],
 ["-10.17, 1234567",              -10.17,    123.4567],
 ["-62088, 1068456",              -6.2088,   106.8456],
 ["-6,2088, 106,8456",            -6.2088,   106.8456],
 ["-6.2088;106.8456",             -6.2088,   106.8456],
];
let fail = 0;
for (const [inp, la, lo] of cases) {
  const r = parseCoordinates(inp);
  const ok = r.valid && Math.abs(r.lat - la) < 1e-5 && Math.abs(r.lon - lo) < 1e-5;
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(inp), '=>', JSON.stringify(r));
}
const bad = parseCoordinates("6°14'xx\"S 106°52'E");
console.log(bad.valid ? 'FAIL' : 'PASS', 'DMS rusak harus invalid =>', JSON.stringify(bad));
process.exit(fail || bad.valid ? 1 : 0);
EOF
} > /tmp/parsetest.js && node /tmp/parsetest.js
```

Pada commit `6993aad`: 8 dari 11 kasus **FAIL** dan kasus DMS rusak juga FAIL. Setelah perbaikan semuanya harus PASS.

**Geocoder (B4, B5, B6)** — sesuaikan rentang baris `sed` bila baris bergeser:

```bash
{ sed -n '1,444p' js/bundle.js; cat <<'EOF'
let calls = 0, mode = 'down';
global.fetch = async (url) => { calls++;
  if (mode === 'down') throw new Error('network');
  if (url.includes('big.go.id')) return { ok: true, json: async () => ({ features: [{ attributes: { WADMPR: 'DKI JAKARTA', WADMKK: 'KOTA ADM. JAKARTA SELATAN', WADMKC: 'SETIABUDI', WADMKD: 'KARET' } }] }) };
  if (url.includes('nominatim')) return { ok: true, json: async () => ({ display_name: 'Pantai X', address: { bay: 'Teluk Jakarta', country_code: 'id' } }) };
  return { ok: false, json: async () => null };
};
(async () => {
  let r = await reverseGeocode(-6.2, 106.8);
  console.log('B4 semua API mati  => harus networkError, bukan "luar perairan":', JSON.stringify(r));
  mode = 'up'; calls = 0;
  r = await reverseGeocode(-6.2, 106.8);
  console.log('B4 setelah pulih   => calls harus > 0:', calls);
  geocodeCache.clear();
  r = await reverseGeocode(-6.3, 106.9);
  console.log('B6 BIG ada desa    => harus success:true:', JSON.stringify(r).slice(0, 160));
  calls = 0; await reverseGeocode(-6.3, 106.9);
  console.log('B5 panggilan kedua => calls harus 0:', calls);
})();
EOF
} > /tmp/geotest.js && node /tmp/geotest.js
```

Catatan: baris B5 di skrip ini baru bisa lulus setelah B6 **dan** B5 diperbaiki (sebelum B6 diperbaiki, hasilnya "perairan" yang memang tidak di-cache). Pada commit `6993aad` keempat baris output menunjukkan perilaku salah.

**UI/peta/batch (B7–B12, B14–B18):** jalankan `python3 -m http.server 8000` di root repo dan uji manual di browser (Chromium + Playwright tersedia di lingkungan cloud). Gunakan DevTools → Network → "Offline" untuk B4, dan throttling "Slow 3G" untuk B7.

---

## 5. Batasan untuk yang memperbaiki

- Jangan ubah sumber data, endpoint, atau urutan prioritas BIG → ArcGIS → OSM selain yang dijelaskan di atas.
- Jangan menambah dependensi/build step; tetap vanilla JS di satu `bundle.js`.
- Teks yang tampil ke pengguna tetap dalam Bahasa Indonesia.
- Setelah mengubah `bundle.js`, perbarui query versi cache-busting di `index.html` (lihat B11).
- Satu commit per kelompok (parser / geocoder / cari tunggal / batch / kebersihan) agar mudah ditinjau.
