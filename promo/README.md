# Iklan 30 Detik Cari Kecamatan

Video iklan 16:9 (1920×1080, 30 fps, 30 detik) untuk YouTube dan presentasi, dibuat dengan [Remotion](https://www.remotion.dev/). Tanpa sulih suara: teks di layar, efek suara, dan musik latar. Semua audio disintesis dari nol oleh `scripts/make_audio.py`, sehingga bebas masalah hak cipta.

## Membuat ulang video

```bash
npm install
npm run audio    # membuat public/audio/*.wav (butuh Python 3 + numpy)
npm run render   # menghasilkan out/cari-kecamatan-iklan-30s.mp4 (butuh ffmpeg)
```

`npm run studio` membuka pratinjau interaktif untuk menyunting adegan. Jika Remotion tidak bisa mengunduh Chrome sendiri, tambahkan `--browser-executable=<jalur chrome-headless-shell>` pada perintah render.

Audio akhir dinormalkan ke −14 LUFS (standar kekerasan YouTube).

## Struktur

| Waktu | Adegan | Berkas |
|---|---|---|
| 0–3 dtk | Hook: koordinat diketik, "tapi tidak tahu kecamatannya?" | `src/scenes/S1Hook.tsx` |
| 3–7 dtk | Masalah: format campur aduk, ratusan baris | `src/scenes/S2Problem.tsx` |
| 7–9,5 dtk | Logo muncul, layar berubah terang | `src/scenes/S3Logo.tsx` |
| 9,5–15 dtk | Cari Tunggal: dirapikan otomatis → Gambir | `src/scenes/S4Single.tsx` |
| 15–20 dtk | Peta & batas wilayah resmi BIG | `src/scenes/S5Map.tsx` |
| 20–25 dtk | Cari Massal: tabel, pin, Unduh CSV | `src/scenes/S6Batch.tsx` |
| 25–27,5 dtk | Tanpa akun, tanpa pelacak, mode gelap | `src/scenes/S7Trust.tsx` |
| 27,5–30 dtk | Ajakan mencoba | `src/scenes/S8Cta.tsx` |

Waktu adegan ada di `src/brand.ts` (`SCENES`). Musik 120 BPM, jadi satu ketukan = 15 frame dan setiap pergantian adegan jatuh di ketukan. Penanda efek suara ada di `src/Ad.tsx`.

## Catatan data

- Peta adegan 5 adalah ilustrasi, bukan geometri batas sebenarnya.
- Nama kecamatan pada adegan 4 dan 6 adalah contoh landmark terkenal (`src/data/indonesia.ts`). **Periksa ulang semuanya di situs Cari Kecamatan sebelum video dipublikasikan**, lalu sesuaikan bila hasil situs berbeda.
- Peta provinsi pada adegan 6 berasal dari poligon sederhana sumber terbuka (superpikar/indonesia-geojson).
