# Telegram Store Digital + Pakasir QRIS

Versi ini memperbaiki error:

```text
Bad Request: can't parse entities: Character '.' is reserved
```

Penyebab error itu biasanya karena memakai `MarkdownV2` tetapi teks dinamis belum di-escape sempurna. Versi ini memakai `parse_mode: HTML`, placeholder renderer, dan fallback aman.

## Fitur

- `/start` pakai pesan template dari admin
- Semua menu user memakai `editMessageText`
- Produk, harga, tombol, dan stok bisa diatur dari `/admin`
- Template HTML bisa diedit dari `/admin`
- Support tag HTML Telegram:
  - `<b>tebal</b>`
  - `<i>miring</i>`
  - `<u>underline</u>`
  - `<s>coret</s>`
  - `<code>kode</code>`
  - `<pre>blok kode</pre>`
  - `<a href="https://...">link</a>`
  - `<tg-spoiler>spoiler</tg-spoiler>`
  - `<tg-emoji emoji-id="ID_EMOJI">🙂</tg-emoji>`
- Support placeholder:
  - `{NAME}`
  - `{FIRST_NAME}`
  - `{USERNAME}`
  - `{USER_ID}`
  - `{STORE_NAME}`
  - `{PRODUCT_NAME}`
  - `{PRODUCT_DESC}`
  - `{PRICE}`
  - `{STOCK}`
  - `{ORDER_ID}`
  - `{PAYMENT_URL}`
  - `{EXPIRED_AT}`
  - `{ACCESS}`
- Pakasir QRIS via API `transactioncreate/qris`
- Webhook Pakasir `/pakasir/webhook`
- Backup auto-check status via `transactiondetail`
- Detail akses dikirim setelah pembayaran sukses

## Install

```bash
npm install
cp .env.example .env
npm start
```

## Railway

Set environment variables di Railway:

```env
BOT_TOKEN=...
ADMIN_IDS=...
PAKASIR_PROJECT=...
PAKASIR_API_KEY=...
PUBLIC_BASE_URL=https://nama-project.up.railway.app
PORT=3000
ENABLE_STATUS_POLLING=true
SEND_QR_IMAGE=true
```

Webhook Pakasir:

```text
https://nama-project.up.railway.app/pakasir/webhook
```

Cek server:

```text
https://nama-project.up.railway.app/health
```

## Catatan penting soal edit message

Telegram tidak mengizinkan mengubah pesan text biasa menjadi pesan photo. Karena itu:
- Menu dan detail produk memakai edit text.
- Saat checkout QR image, bot menghapus pesan lama lalu mengirim 1 pesan QR.
- Saat pembayaran sukses, bot mengedit caption pesan QR menjadi detail akses, jadi tidak banyak riwayat chat.

Jika ingin benar-benar tidak kirim foto baru, set:

```env
SEND_QR_IMAGE=false
```

Bot akan edit text dan memberi tombol menuju halaman QRIS Pakasir.

## Contoh template premium emoji

Masukkan dari menu `/admin`:

```html
<tg-emoji emoji-id="5368324170671202286">🔥</tg-emoji> <b>Halo {NAME}</b>

Selamat datang di <b>{STORE_NAME}</b>
Silakan pilih produk di bawah ini.
```

Untuk mendapatkan `emoji-id`, biasanya copy dari bot helper/custom emoji parser, atau dari source message bot yang mendukung custom emoji.
