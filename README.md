# Cari Kecamatan

Situs web untuk mencari nama kecamatan, desa/kelurahan, kabupaten/kota, dan provinsi di Indonesia berdasarkan titik koordinat.

## Alamat

| Alamat | Isi |
|---|---|
| `/` atau `/tunggal` | Cari Tunggal |
| `/tunggal/-6.2088,106.8456` | Hasil langsung untuk titik tersebut; alamat ini diperbarui otomatis setiap kali mencari |
| `/massal` | Cari Massal |
| `/massal#d=…` | Daftar koordinat yang dimampatkan di bagian `#` URL; dibuka → diisi & diproses otomatis (≤ 200 titik) |
| `/tentang` | Tentang & Privasi |

Aturan rewrite ada di `vercel.json`.

## Struktur

```
index.html        Halaman utama (Cari Tunggal & Cari Massal)
tentang.html      Tentang & Privasi
favicon.svg
css/style.css     Sistem desain & tata letak
css/map.css       Penyesuaian Leaflet
js/parser.js      Parser koordinat (desimal, DMS, arah mata angin, salinan Excel)
js/geocoder.js    Reverse geocoding: BIG (utama), ArcGIS & Nominatim (pendukung), deteksi perairan
js/map.js         Peta Leaflet, basemap, garis batas, marker
js/ui.js          Panel hasil, salin, riwayat
js/router.js      Rute URL /tunggal & /massal
js/app.js         Inisialisasi & alur halaman
```

Tanpa build step: file dimuat langsung oleh peramban dengan urutan di `index.html`.
Setelah mengubah CSS/JS, perbarui nilai `?v=` di `index.html` dan `tentang.html` agar peramban tidak memakai versi lama.

## Menjalankan secara lokal

Rute `/tunggal/...` dan `/massal` memerlukan rewrite, jadi gunakan Vercel CLI:

```bash
npx vercel dev
```

Server statis biasa (`python3 -m http.server`) tetap bisa dipakai untuk halaman `/`.
