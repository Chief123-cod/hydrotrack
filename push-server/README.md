# HydroTrack Push Server (Cloudflare Workers)

Server Web Push berbasis Cloudflare Workers, Workers KV, dan Cron Trigger (`* * * * *`) untuk mengirim pengingat minum air HydroTrack ke browser dan HP, termasuk saat tab ditutup atau layar terkunci.

Server ini tidak memakai API berbayar maupun token AI. Enkripsi payload (`aes128gcm`, RFC 8291) dan tanda tangan VAPID (ES256 JWT, RFC 8292) dijalankan langsung memakai Web Crypto API bawaan Cloudflare Workers tanpa dependensi native Node.js.

## Arsitektur singkat

- **Runtime:** Cloudflare Workers (paket Free, tanpa kartu kredit)
- **Penyimpanan:** Cloudflare Workers KV (`HYDRO_PUSH_KV`), menyimpan langganan push dan jadwal pengguna dengan masa aktif 90 hari yang diperpanjang otomatis
- **Penjadwalan:** Cloudflare Cron Trigger setiap 1 menit (`* * * * *`)
- **Pesan pengingat:** Dibuat langsung di Worker dalam bahasa Indonesia sesuai waktu lokal (pagi, siang, sore, malam) dan progres minum harian pengguna

## Prasyarat

- Node.js versi 18 atau lebih baru (disarankan v20+)
- Akun Cloudflare gratis ([dash.cloudflare.com](https://dash.cloudflare.com))

## Panduan deploy gratis (5 langkah)

Semua perintah dijalankan di dalam folder `push-server/`:

```bash
cd push-server
npm install
```

### Langkah 1: Buat akun Cloudflare gratis dan login

Daftar akun gratis di [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) (paket Workers Free tidak memerlukan kartu kredit), lalu login lewat terminal:

```bash
npx wrangler login
```

Browser akan terbuka untuk konfirmasi izin Wrangler. Setelah muncul pesan berhasil di terminal, lanjutkan ke langkah berikutnya.

### Langkah 2: Buat KV Namespace

Buat namespace KV bernama `HYDRO_PUSH_KV`:

```bash
npx wrangler kv namespace create HYDRO_PUSH_KV
```

Wrangler akan menampilkan potongan konfigurasi dengan nilai `id`, misalnya:

```toml
[[kv_namespaces]]
binding = "HYDRO_PUSH_KV"
id = "a1b2c3d4e5f6..."
```

Buka file `push-server/wrangler.toml`, lalu ganti `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` dengan nilai `id` yang baru dibuat.

Opsional: ganti juga `VAPID_SUBJECT` di `wrangler.toml` dengan alamat email Anda (harus diawali `mailto:`, misalnya `mailto:nama@domain.com`), dan bila ingin membatasi CORS hanya ke domain produksi, ubah `ALLOWED_ORIGIN` dari `"*"` menjadi URL Vercel Anda.

### Langkah 3: Generate VAPID Keys dan simpan ke Secrets

Jalankan skrip pembuat kunci VAPID (tanpa dependensi tambahan):

```bash
npm run generate-vapid
```

Atau langsung lewat Node.js:

```bash
node generate-vapid.mjs
```

Skrip akan mencetak `VAPID_PUBLIC_KEY` (87 karakter) dan `VAPID_PRIVATE_KEY` (43 karakter). Simpan keduanya sebagai secret terenkripsi di Cloudflare:

```bash
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
```

Tempel masing-masing kunci saat terminal memintanya lalu tekan Enter. Jangan pernah meng-commit `VAPID_PRIVATE_KEY` ke repositori Git.

### Langkah 4: Deploy ke Cloudflare Workers

Jalankan perintah deploy:

```bash
npx wrangler deploy
```

Setelah selesai, Wrangler akan menampilkan URL Worker Anda, misalnya:

```text
https://hydrotrack-push.<subdomain-anda>.workers.dev
```

Verifikasi bahwa server sudah aktif dengan membuka endpoint berikut di browser:

- `https://hydrotrack-push.<subdomain-anda>.workers.dev/health` (pastikan `ok: true`, `vapidConfigured: true`, dan `kvConfigured: true`)
- `https://hydrotrack-push.<subdomain-anda>.workers.dev/vapid-public-key` (harus mengembalikan `{ "publicKey": "..." }`)

### Langkah 5: Hubungkan ke HydroTrack di Vercel

Anda punya dua cara untuk menghubungkan frontend HydroTrack ke Worker ini:

1. **Lewat halaman Pengaturan (per perangkat):** buka aplikasi HydroTrack Vercel Anda, masuk ke halaman **Pengaturan**, buka bagian **Notifikasi**, lalu tempel URL Worker (tanpa garis miring di akhir) pada kolom URL Server Push dan simpan.
2. **Bawaan untuk semua pengunjung:** buka `js/notifications.js` di repositori HydroTrack, isi konstanta `DEFAULT_PUSH_SERVER_URL` dengan URL Worker Anda, lalu deploy ulang ke Vercel agar semua pengunjung langsung terhubung tanpa mengetik URL secara manual.

## Daftar endpoint API

| Metode | Path | Fungsi |
| :--- | :--- | :--- |
| `GET` | `/health` | Cek status Worker, kesiapan kunci VAPID, dan koneksi KV |
| `GET` | `/vapid-public-key` | Mengembalikan `{ publicKey }` untuk `PushManager.subscribe()` |
| `POST` | `/subscribe` | Menyimpan atau memperbarui subscription, jadwal (Fixed/Smart, jam aktif, interval, zona waktu), dan profil hidrasi di KV |
| `POST` | `/sync-progress` | Memperbarui `todayTotal`, `todayDate`, `lastDrinkAt`, `dailyGoal`, dan `userName` tanpa menghapus jadwal |
| `POST` | `/unsubscribe` | Menghapus subscription dari KV berdasarkan endpoint |
| `POST` | `/test-push` | Mengirim notifikasi tes langsung (`delaySeconds: 0`) atau tertunda hingga 25 detik (`delaySeconds: 1..25`) memakai `ctx.waitUntil` agar bisa diuji saat tab ditutup atau layar terkunci |

## Cara kerja penjadwalan Cron (`* * * * *`)

Setiap menit, handler `scheduled` membaca daftar key `sub:` di KV lalu memeriksa setiap langganan yang aktif:

1. Menghitung tanggal dan menit lokal pengguna memakai IANA `timeZone` (`Intl.DateTimeFormat`), dengan cadangan `timezoneOffsetMinutes` jika nama zona waktu tidak valid.
2. Menganggap `todayTotal = 0` jika tanggal lokal pengguna sudah berganti hari dibandingkan `profile.todayDate`.
3. Melewati pengiriman bila `pauseWhenGoalMet` aktif dan target harian sudah tercapai.
4. Melewati pengiriman bila waktu lokal berada di luar rentang `startTime` sampai `endTime`.
5. Menghitung slot jatuh tempo sesuai mode `fixed` atau `smart`, dengan deduplikasi `slotKey` agar pengingat tidak terkirim dua kali pada slot yang sama.
6. Menghapus otomatis subscription yang mengembalikan status HTTP `404` atau `410` dari layanan push.

## Kuota paket gratis Cloudflare Workers

Paket gratis Cloudflare Workers mencakup 100.000 request Worker per hari, 100.000 pembacaan KV per hari, 1.000 penulisan KV per hari, dan Cron Trigger per menit. Worker ini hanya menulis ke KV saat notifikasi benar-benar terkirim, saat pengguna mengubah pengaturan, atau saat sinkronisasi progres, sehingga pemakaian kuota harian tetap sangat hemat.

## Pengembangan lokal dan pemantauan log

Untuk menjalankan server secara lokal saat pengujian:

```bash
npm run dev
```

Untuk memantau log real-time dari Worker yang sudah tayang (termasuk eksekusi Cron tiap menit):

```bash
npm run tail
```
