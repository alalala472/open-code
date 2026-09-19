# cx-agent

AI coding agent TUI — sistem & tools ala **OpenCode**, model/API bebas kamu tentukan sendiri.

## Instalasi

```bash
npm install
npm run build
npm start
```

Development tanpa build (pakai tsx):

```bash
npm install
npm run dev
```

## Cara pakai (v2 — command based, bukan Ctrl lagi)

> **Kenapa berubah dari Ctrl ke command?** Di versi pertama, `Ctrl+F` diikat ke
> level layar (screen), tapi kotak input chat selalu dalam mode "menulis" yang
> menahan (grab) semua keypress untuk dirinya sendiri — jadi Ctrl+F di layar
> gak pernah kebaca sama sekali. Ini bug, bukan masalah Termux/keyboard kamu.
> Sekarang jalur utama pakai command yang diketik biasa (`/config`, dst),
> karena itu dijamin selalu bekerja di keyboard/terminal apa pun. `Ctrl+F` di
> kotak chat tetap ada sebagai alias, tapi jangan diandalkan sebagai satu-satunya jalan.

1. Jalankan `npm start` (atau `npm run dev`).
2. Ketik `/config` lalu Enter untuk buka form konfigurasi.
3. Isi field, tekan **Enter** untuk pindah ke field berikutnya. Enter di field
   terakhir (`Model`) langsung menyimpan. **Esc** untuk batal.
4. Ketik pesan biasa untuk chat dengan agent.

### Daftar command

| Command | Fungsi |
|---|---|
| `/config` | buka form isi api key / base url / model |
| `/cd <folder>` | pindah project root (lihat bagian "akses folder internal HP" di bawah) |
| `/pwd` | tampilkan project root yang sedang aktif |
| `/clear` | bersihkan layar percakapan |
| `/help` | tampilkan daftar command |

### Alur izin (approval) sebelum tool jalan

Tool yang **mengubah sesuatu** (`bash`, `write_file`, `edit_file`) tidak langsung
dieksekusi. Agent akan berhenti dan minta izin dulu, contoh:

```
? izin dibutuhkan: jalankan command: rm -rf build
```

Balas dengan mengetik `y` (izinkan) atau `n` (tolak) lalu Enter. Selama menunggu
jawaban ini, pesan yang kamu ketik **tidak** dianggap chat baru — sampai kamu
jawab y/n dulu. Tool yang sifatnya cuma membaca (`read_file`, `list_dir`,
`web_search`) jalan otomatis tanpa tanya, karena tidak mengubah apa pun.

### Status bar

Baris kedua dari atas menunjukkan status agent saat ini: `idle`, `berpikir...`,
`menjalankan tool: ...`, atau `menunggu izin: ... (ketik y/n)`. Ini pengganti
"thinking indicator" yang sebelumnya tidak ada.

## Akses folder/project di internal storage HP (Termux)

Secara default Termux hanya bisa akses folder di dalam sandbox-nya sendiri
(`~/`), **bukan** langsung ke `/storage/emulated/0/...`. Supaya bisa buka
project yang ada di penyimpanan internal HP:

```bash
termux-setup-storage
```

Konfirmasi izin storage yang muncul di Android. Setelah itu folder shared
storage tersedia lewat symlink di `~/storage/shared/`. Baru project di situ
bisa dibuka dengan:

```
/cd ~/storage/shared/NamaFolderProjectKamu
```

Cek berhasil pindah dengan `/pwd`. Semua tool file (`read_file`, `write_file`,
`edit_file`, `list_dir`) dan `bash` akan beroperasi relatif ke project root
yang aktif ini — jadi kalau lupa `/cd` dulu, tool akan tetap kerja di folder
lama (default: folder tempat kamu jalankan `npm run dev`/`npm start`).

**Kalau `/cd` gagal** dengan pesan permission, biasanya artinya:
- `termux-setup-storage` belum dijalankan / izin storage ditolak di Android, atau
- folder tujuan memang read-only (misal folder sistem Android), atau
- kamu salah ketik path — cek dulu dengan `ls ~/storage/shared/` di Termux
  langsung (di luar cx-agent) untuk pastikan nama foldernya benar.

## Web search (DuckDuckGo, tanpa API key)

Tool `web_search` memanggil `https://html.duckduckgo.com/html/?q=...` dan
mem-parsing hasilnya (judul, url, cuplikan) tanpa perlu API key tambahan.
Ini tool baca-saja, jalan otomatis tanpa minta izin. Catatan: ini scraping
HTML biasa, bisa saja berhenti bekerja kalau DuckDuckGo mengubah struktur
halaman mereka — kalau itu terjadi, sesuaikan regex di `web_search` (di
`src/agent/tools.ts`).

## Arsitektur

```
src/
  index.ts             entry point: slash command, alur izin, status bar
  types.ts             tipe bersama
  config/store.ts       load/save api key/base url/model ke ~/.cx-agent/config.json
  ui/screen.ts           layar utama: header, status bar, log, hint bar, input
  ui/settingsModal.ts   form konfigurasi (Enter/Esc + alias Ctrl+S/X/Y)
  agent/agent.ts         loop pemanggilan API + eksekusi tool + gate approval
  agent/tools.ts         read_file, write_file, edit_file, list_dir, bash, web_search
```

Agent loop memanggil `POST {baseUrl}/messages` format Anthropic Messages API.
Untuk provider lain (mis. OpenAI-style `/chat/completions`), sesuaikan
`callApi()` di `src/agent/agent.ts`.

## Menambah tool baru

Tambahkan `ToolDefinition` baru di `src/agent/tools.ts`, daftarkan di array
`allTools`. Kalau tool itu mengubah sesuatu (nulis file, jalankan perintah,
dll), set `requiresApproval: true` dan isi `describeCall()` supaya prompt
izinnya jelas.

## Catatan keamanan

- Semua tool file & `bash` dibatasi ke dalam project root aktif
  (`resolveSafe()` di `tools.ts`), dan project root cuma bisa dipindah lewat
  `/cd` yang eksplisit kamu ketik sendiri.
- `bash` tetap bisa jalankan command apa pun di dalam project root itu — tetap
  hati-hati folder mana yang kamu `/cd` ke situ.
- `config.json` menyimpan API key plain text (permission file 600, hanya
  owner yang bisa baca). Untuk kebutuhan lebih serius, pertimbangkan
  menyimpan di Android Keystore / secret manager lain.

## Belum ada (pengembangan lanjutan)

- Streaming response (saat ini nunggu jawaban lengkap dulu baru muncul)
- Riwayat percakapan tersimpan ke disk antar sesi
- Dukungan format API non-Anthropic secara built-in (OpenAI-style)
