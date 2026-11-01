# Iklan 35 Detik Cari Kecamatan

Video iklan 16:9 (1920×1080, 30 fps, 35 detik termasuk layar akhir 7,5 detik dengan kode QR) untuk YouTube dan presentasi, dibuat dengan [Remotion](https://www.remotion.dev/). Tanpa sulih suara: teks di layar, efek suara, dan musik latar. Semua audio disintesis dari nol oleh `scripts/make_audio.py`, sehingga bebas masalah hak cipta.

## Membuat ulang video

```bash
npm install
npm run audio    # membuat public/audio/*.wav (butuh Python 3 + numpy)
npm run qr       # (opsional) membuat ulang kode QR bila alamat situs berubah
npm run render   # menghasilkan out/cari-kecamatan-iklan-35s.mp4 (butuh ffmpeg)
```

`npm run studio` membuka pratinjau interaktif untuk menyunting adegan. Jika Remotion tidak bisa mengunduh Chrome sendiri, tambahkan `--browser-executable=<jalur chrome-headless-shell>` pada perintah render.

Audio akhir dinormalkan ke −14 LUFS (standar kekerasan YouTube).

## Struktur

| Waktu | Adegan | Berkas |
|---|---|---|
| 0–3 dtk | Sasaran + hook: "Punya titik koordinat, tapi harus tahu kecamatannya?" | `src/scenes/S1Hook.tsx` |
| 3–7 dtk | Masalah: "Format datanya campur aduk? Ratusan baris pula." (216 baris) | `src/scenes/S2Problem.tsx` |
| 7–9,5 dtk | Logo, tagline "Berdasarkan koordinat, cepat dan akurat" | `src/scenes/S3Logo.tsx` |
| 9,5–15 dtk | Cari Tunggal: dirapikan otomatis, stopwatch, hasil Gambir | `src/scenes/S4Single.tsx` |
| 15–20 dtk | Peta batas asli Kecamatan Gambir & Kota Jakarta Pusat (data BIG) | `src/scenes/S5Map.tsx` |
| 20–25 dtk | Cari Massal: 216 / 216 titik, Unduh CSV | `src/scenes/S6Batch.tsx` |
| 25–27,5 dtk | Gratis · Tanpa daftar · Unduh CSV, transisi ke mode gelap | `src/scenes/S7Trust.tsx` |
| 27,5–35 dtk | Layar akhir: ajakan mencoba + kode QR | `src/scenes/S8Cta.tsx` |

Logo kecil di kanan atas tampil sejak detik pertama (kecuali saat logo besar tampil).

Waktu adegan ada di `src/brand.ts` (`SCENES`). Musik 120 BPM, jadi satu ketukan = 15 frame dan setiap pergantian adegan jatuh di ketukan. Penanda efek suara ada di `src/Ad.tsx`.

## Catatan data

- **Waktu pencarian di adegan 4 (`SEARCH_SECONDS` di `src/brand.ts`, kini 0,8 detik) adalah angka sementara.** Ukur di situs sungguhan lalu sesuaikan sebelum publikasi.

- Peta adegan 4–5 memakai batas kecamatan asli tahun 2020 dari [Alf-Anas/batas-administrasi-indonesia](https://github.com/Alf-Anas/batas-administrasi-indonesia) (`src/data/jakarta.ts`): Kecamatan Gambir, kecamatan sekitarnya, dan garis luar Kota Jakarta Pusat. Peta dasar jalan tidak disertakan.
- Kedelapan titik contoh (`src/data/indonesia.ts`) sudah dicocokkan dengan data batas kecamatan yang sama dan semuanya sesuai. Data itu mengeja Jam Gadang sebagai "Guguak Panjang"; video memakai "Guguk Panjang". Tetap periksa ejaan akhirnya di situs Cari Kecamatan sebelum publikasi.
- 208 pin lain pada adegan 6 adalah titik acak di daratan, hanya ilustrasi sebaran data; angka ringkasannya (216 ditemukan, 42 dirapikan) juga ilustrasi.
- Peta provinsi pada adegan 6 berasal dari poligon sederhana sumber terbuka (superpikar/indonesia-geojson).
