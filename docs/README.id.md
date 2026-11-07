<p align="center">
  <img src="images/deno-custom-nodes-banner.jpg" alt="Deno Custom Nodes" width="100%">
</p>

<p align="center">
  <a href="https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/Deno2026/comfyui-deno-custom-nodes?style=flat-square&label=release&labelColor=0F0E12&color=F2FF59"></a>
  <a href="https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes"><img alt="Comfy Registry" src="https://img.shields.io/badge/Comfy_Registry-deno--custom--nodes-2E1E38?style=flat-square&labelColor=0F0E12"></a>
  <a href="https://github.com/Deno2026/comfyui-deno-custom-nodes/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Deno2026/comfyui-deno-custom-nodes/ci.yml?branch=main&style=flat-square&label=CI&labelColor=0F0E12"></a>
  <a href="../LICENSE"><img alt="License: GPL-3.0-only" src="https://img.shields.io/badge/license-GPL--3.0--only-2E1E38?style=flat-square&labelColor=0F0E12"></a>
  <a href="https://www.youtube.com/@Denoise-AI"><img alt="YouTube" src="https://img.shields.io/badge/YouTube-Denoise--AI-2E1E38?style=flat-square&labelColor=0F0E12"></a>
</p>

<p align="center">
  <b>Node ComfyUI praktis untuk seluruh siklus produksi.</b><br>
  Siapkan input, arahkan model, bandingkan hasil, selesaikan tampilan akhir, dan jaga graph besar tetap mudah dibaca.
</p>

<p align="center">
  <a href="../README.md">English</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja.md">日本語</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.es.md">Español</a> · <a href="README.pt-PT.md">Português (PT)</a> · <a href="README.pt-BR.md">Português (BR)</a> · Bahasa Indonesia
</p>

<p align="center">
  <a href="#mulai-cepat">Mulai Cepat</a> · <a href="#peta-workflow">Peta Workflow</a> · <a href="#alat-web">Alat Web</a> · <a href="#node-yang-disertakan">Referensi Node</a> · <a href="#keamanan-dan-privasi">Keamanan</a> · <a href="https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/latest">Rilis Terbaru</a>
</p>

> [!NOTE]
> **Baru di v0.7.126:** [`(Deno) MiniMax H3 Tiled Sampler`](#deno-minimax-h3-tiled-sampler) menyelesaikan latent video+audio MiniMax H3 yang sudah di-upscale dalam tile yang saling tumpang tindih, sehingga GPU 16GB dapat menjalankan pass akhir beresolusi tinggi.
>
> **v0.7.125** memperketat alamat server Local LLM, tautan Easy Model Download Helper, dan penyimpanan gambar Ideogram Director. ID node, input, dan workflow tersimpan tidak berubah. Lihat [CHANGELOG](../CHANGELOG.md).

## Mulai Cepat

Mulai dengan ComfyUI yang sudah terinstal.

1. Buka **ComfyUI Manager**, cari `Deno Custom Nodes`, lalu instal package tersebut.
2. Restart ComfyUI dan muat ulang halaman browsernya.
3. Klik dua kali area kosong pada canvas, cari `(Deno) Resize Box`, lalu tambahkan node tersebut.
4. Tambahkan node standar `Load Image` dan pilih sebuah gambar. Hubungkan ke Resize Box, lalu hubungkan output `image` Resize Box ke `Preview Image`. Pilih ukuran dan jalankan workflow untuk melihat gambar hasil resize.

Contoh pertama ini tidak membutuhkan model generasi. Setiap node model dan RTX mencantumkan persyaratannya sendiri di bawah. Jika kamu tidak memakai Manager, lihat [instalasi manual](#instalasi).

Sebagian besar node Deno memiliki tombol hijau kecil `i` di pojok kanan atas untuk info node singkat tanpa meninggalkan canvas. Jika versi Deno Custom Nodes yang lebih baru tersedia, tombol berubah menjadi kuning dan menampilkan badge `!` kecil.

## Peta Workflow

<p align="center">
  <img src="images/readme/workflow-map.webp" alt="Peta workflow: Persiapan, Generate, Perbandingan, Finishing, Penataan" width="920">
</p>

Setiap node Deno termasuk dalam satu langkah siklus produksi ComfyUI. Mulailah dari langkah yang sedang kamu kerjakan.

### 01 · Persiapan

Pastikan setiap gambar, referensi, dan ukuran sudah tepat sebelum model berjalan.

<p align="center">
  <img src="images/readme/multi-image-loader.webp" alt="Multi Image Loader dengan enam gambar, satu dinonaktifkan" width="370">&nbsp;&nbsp;
  <img src="images/readme/h3-reference-loader.webp" alt="MiniMax H3 Multi Reference Image Loader dengan tiga gambar dan dua referensi audio" width="370">
</p>

| Node | Fungsinya | Kebutuhan |
| --- | --- | --- |
| [Resize Box](#deno-resize-box) | Resize dengan rasio, megapixel, dan crop disertai preview crop yang live dan bisa diseret | — |
| [Multi Image Loader](#deno-multi-image-loader) | Satu galeri berurutan dan satu kabel; klik kartu untuk melewatinya tanpa menghapus | — |
| [Advanced Image Source Loader](#deno-advanced-image-source-loader) | Upload folder, batch berantai, dan output `image_list` berukuran campuran | — |
| [MiniMax H3 Multi Reference Image Loader](#deno-minimax-h3-multi-reference-image-loader) | Hingga 9 gambar dan 3 file audio, masing-masing dengan ukurannya sendiri | ComfyUI 0.30.0+ |

### 02 · Pembuatan

Arahkan model dengan layout, referensi, prompt, dan LoRA yang tetap mudah dibaca di canvas.

<p align="center">
  <img src="images/readme/ideogram-director.webp" alt="Board Ideogram Director dengan kotak judul, subjek, mobil, dan tagline di atas poster hasil generate" width="640">
</p>

| Node | Fungsinya | Kebutuhan |
| --- | --- | --- |
| [Ideogram Director](#deno-ideogram-director) | Menggambar layout bbox dan menyusun caption JSON Ideogram 4 yang siap dipakai model | Workflow Ideogram 4 |
| [MiniMax H3 Acc LoRA Loader](#deno-minimax-h3-acc-lora-loader) | Memuat Acc-LoRA H3 8 langkah resmi Alibaba tanpa konversi | Bobot Acc-LoRA resmi |
| [MiniMax H3 Tiled Sampler](#deno-minimax-h3-tiled-sampler) | Menyelesaikan video H3 yang sudah di-upscale dalam tile tumpang tindih di GPU 16GB | ComfyUI 0.30.0+ dengan H3 native |
| [MiniMax H3 R2V Audio Reference workflow](#minimax-h3-r2v-audio-reference-workflow) | `(Deno) Audio Transcript` dan `(Deno) Audio Analysis Finalizer` mengubah audio sumber menjadi arahan prompt | VideoHelperSuite, LM Studio |
| [LTX Model Loader](#deno-ltx-model-loader) | Pola pemuatan Checkpoint, KJ, dan GGUF dalam satu node ringkas | KJNodes atau ComfyUI-GGUF untuk mode tersebut |
| [LTX Sequencer](#deno-ltx-sequencer) | Sequencing guide multi-gambar dengan frame dan strength per gambar | — |
| [LTX Multi LoRA Loader](#deno-ltx-multi-lora-loader) | Baris ala Power-LoRA dengan strength video dan audio terpisah | — |
| [LTX Prompt Guide](#deno-ltx-prompt-guide) | Encoding prompt LTX dengan panjang minimum dari dialog dalam tanda kutip | — |
| [LTX Tiled Spatial Upscaler](#deno-ltx-tiled-spatial-upscaler) | Upscale latent video dalam tile spasial yang saling tumpang tindih | Upscaler latent LTX |
| [LTX High resolution Tiled Sampler](#deno-ltx-high-resolution-tiled-sampler) | Refinement LTX AV beresolusi tinggi melalui tile spasial yang digabung | — |
| [Bernini Prompt Guide](#deno-bernini-prompt-guide) | Prompt positive dan negative bergaya instruksi dalam satu node | Conditioning Bernini native |
| [Multi LoRA Loader](#deno-multi-lora-loader) | Hingga 64 LoRA dengan toggle, strength, dan catatan per slot | — |
| [Easy Model Download Helper](#deno-easy-model-download-helper) | Tautan model resmi plus pemeriksaan path target yang tepat | — |
| [Text Encoder Unload](#deno-text-encoder-unload) | Titik pelepasan VRAM opsional setelah encoding prompt | — |
| [Prompt Text](#deno-prompt-text) | Sumber STRING multiline yang mudah dibaca untuk prompt panjang | — |
| [Local LLM Loader and Reviewer](#deno-local-llm-loader-and-deno-local-llm-reviewer) | Prompt LLM lokal dari ComfyUI dan gate review sebelum menyimpan | Server LLM lokal |

### 03 · Perbandingan

Lihat perbedaannya di canvas sebelum menyimpan apa pun.

<p align="center">
  <img src="images/readme/video-compare.webp" alt="Slider Video Compare antara video danau yang tajam dan beresolusi rendah" width="370">&nbsp;&nbsp;
  <img src="images/readme/image-compare.webp" alt="Slider Image Compare antara gambar kota yang tajam dan yang berpiksel" width="370">
</p>

| Node | Fungsinya | Kebutuhan |
| --- | --- | --- |
| [Image Compare](#deno-image-compare) | Tampilan slider, side-by-side, difference, dan toggle di dalam node | — |
| [Video Compare](#deno-video-compare) | Pemutaran video A/B yang frame-exact dengan audio dan output perbandingan lossless | — |
| [Video Preview](#deno-video-preview) | Preview H.264 inline beresolusi penuh di titik mana pun dalam graph | PyAV (disertakan di ComfyUI terbaru) |

### 04 · Penyelesaian

Tentukan tampilan dan resolusi akhir.

<p align="center">
  <img src="images/readme/film-grain.webp" alt="Kontrol Film Grain di samping potret yang diberi grain" width="370">&nbsp;&nbsp;
  <img src="images/readme/rtx-vsr.webp" alt="Panel RTX Video Super Resolution" width="370">
</p>

| Node | Fungsinya | Kebutuhan |
| --- | --- | --- |
| [Film Grain](#deno-film-grain) | Film grain CPU untuk foto dan video, disesuaikan dengan resolusi | — |
| [RTX Video Super Resolution](#deno-rtx-video-super-resolution) | NVIDIA VSR, High Bitrate, Denoise, dan Deblur dengan pilihan resize yang jelas | Windows, NVIDIA RTX, `nvidia-vfx` 0.2+ |
| [RTX Video Super Resolution (2 Pass)](#deno-rtx-video-super-resolution-2-pass) | Satu pass pembersihan dan satu pass upscale untuk workflow video lengkap | Windows, NVIDIA RTX, `nvidia-vfx` 0.2+ |

### 05 · Penataan

Jaga graph besar tetap mudah dibaca.

<p align="center">
  <img src="images/readme/visual-fold.webp" alt="Visual Fold: tiga node terpilih dilipat menjadi satu pill Folded · 3" width="880">
</p>

| Alat | Fungsinya | Kebutuhan |
| --- | --- | --- |
| [Visual Fold](#deno-visual-fold) | Melipat node terpilih atau sebuah group menjadi satu pill ringkas, tanpa subgraph | — |
| [Floating Tools](#deno-floating-tools) | Free VRAM, status update ComfyUI Stable, dan Error Help siap-GPT/Gemini | Nonaktif secara default |
| [Node info button](#node-info-button) | Bantuan singkat dan catatan update pada setiap node Deno | — |

## Alat Web

Jalankan langsung di browser. Tidak ada yang perlu diinstal.

- [Deno Video Compare](https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/) - membandingkan dua video hasil render dengan tampilan slider, side-by-side, difference, dan toggle, lalu menyimpan perbandingannya sebagai MP4.
- [Deno Video to GIF/WebP](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/) - memotong, crop, resize, dan mengekspor klip pendek sebagai GIF atau file WebP yang lebih kecil.
- [Deno Discord Media Compressor](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-discord/) - mengompresi video atau gambar untuk dibagikan di Discord, dengan target file di bawah 10 MB jika memungkinkan. Antarmuka alat ini hanya tersedia dalam bahasa Korea.

## Node yang Disertakan

Referensi lengkap, berurutan sesuai workflow. Setiap bagian dimulai dengan fungsi node; buka **Detail** untuk kasus khusus dan catatan kompatibilitas.

### 01 · Persiapan

#### `(Deno) Resize Box`

Node pembantu resolusi dan resize gambar untuk ComfyUI.

<img src="images/readme/resize-box.webp" alt="Resize Box dalam mode Crop Position dengan kotak crop di atas sumber dan preview hasil" width="652">

Fitur utama:

- mode `Preset Ratio` dan `Manual Input`
- preset rasio umum
- kalkulasi ukuran berbasis megapixel
- alignment `divisible_by`
- mode resize `Center Crop (Fill)`, `Crop Position (Fill)` dengan rasio terkunci dan bisa di-zoom, serta `Fit (Letterbox/Pillarbox)`
- interpolasi default `lanczos`
- preview rasio live; `Crop Position (Fill)` menampilkan seluruh sumber yang terhubung, memungkinkan kamu menyeret kotak crop untuk mengubah posisinya, dan menyeret sudut mana pun untuk zoom sambil menjaga rasio output dan megapixel tetap
- output: `image`, `width`, `height`

#### `(Deno) Multi Image Loader`

Loader beberapa gambar yang dirancang untuk workflow batch guide. Terinspirasi dari ide workflow asli **WhatDreamsCost**, lalu disesuaikan dan disempurnakan untuk gaya workflow Deno.

<img src="images/readme/multi-image-loader.webp" alt="Galeri Multi Image Loader dengan kartu bernomor dan satu kartu dinonaktifkan" width="452">

Fitur utama:

- galeri tinggi tetap yang bisa di-scroll, bukan tinggi node yang terus bertambah
- drag reorder dengan penyisipan placeholder yang stabil
- klik thumbnail untuk menonaktifkan/mengaktifkan gambar tanpa menghapusnya; hanya gambar yang aktif yang dikeluarkan, bernomor 1, 2, 3… sesuai urutan kartu, dengan jumlah dan nomor yang langsung diperbarui
- gambar yang dinonaktifkan beserta posisinya tetap tersimpan bersama workflow; aktifkan minimal satu gambar untuk menjalankan
- tombol upload, upload drag-and-drop, dan dukungan paste gambar
- browser `Input Folder` untuk memakai ulang gambar yang sudah ada di `input` ComfyUI
- mode ukuran `Keep Input Ratio`, `Preset Ratio`, atau `Manual Input` dengan preset rasio, megapixel, ukuran divisible-by, atau kontrol width/height langsung
- pilihan metode resize dan interpolasi, dengan resize crop atau fit opsional saat ekspor
- output: `multi_output`, `width`, `height`

<details>
<summary>Detail</summary>

- penelusuran subfolder input dengan tile folder, navigasi klik dua kali, dan tombol `Parent`
- gambar input bersarang dapat ditambahkan dengan tetap mempertahankan path subfolder ComfyUI-nya
- symlink atau junction eksternal yang keluar dari folder `input` ComfyUI dilewati demi keamanan; upload gambar tersebut ke `input`
- gambar input diurutkan dari yang terbaru berdasarkan waktu modifikasi file
- thumbnail input-folder yang responsif agar penelusuran lebih lancar saat gambar banyak

</details>

#### `(Deno) Advanced Image Source Loader`

Loader sumber gambar lanjutan untuk gambar yang diunggah, folder `input` ComfyUI, batch IMAGE yang terhubung, dan output image-list berukuran campuran. `(Deno) Multi Image Loader` standar tetap menjadi pilihan yang lebih sederhana dan direkomendasikan untuk workflow folder `input` ComfyUI biasa.

<img src="images/readme/advanced-loader.webp" alt="Advanced Image Source Loader dengan tombol upload, paste, folder, dan path di atas galeri masonry" width="612">

Fitur utama:

- mempertahankan alur galeri loader gambar Deno yang sudah dikenal
- mendukung penelusuran folder `input` ComfyUI yang ada serta entri `Input Path` relatif
- `Upload Folder` mengimpor folder yang dipilih di browser ke input ComfyUI
- mendukung upload, drag-and-drop, paste, dan upload folder lewat browser jika browser mengizinkan, plus tombol `Paste` yang terlihat dan paste gambar Ctrl+V biasa
- klik thumbnail untuk menonaktifkan/mengaktifkan sumber tanpa menghapusnya; hanya kartu yang aktif yang menerima nomor output berurutan
- seret kartu thumbnail untuk mengurutkan ulang urutan output
- input `images` opsional dapat menyambungkan batch/list gambar dari upstream ke aliran output yang sama
- mengeluarkan tensor `batch` yang sudah di-resize untuk workflow batch biasa dan `image_list` untuk penanganan list per gambar
- output: `batch`, `image_list`, `width`, `height`, `image_count`

<details>
<summary>Detail</summary>

**Migrasi dari 0.7.120 atau lebih lama:** folder eksternal dan URL gambar tidak lagi dibaca atau diunduh. Gunakan `Upload` atau `Upload Folder`, lalu ganti setiap sumber lama yang aktif dengan path input hasil upload. Sumber tersimpan, urutan, status aktif, dan koneksi tetap dipertahankan. Sumber lama yang dinonaktifkan tidak menghalangi eksekusi. `DENO_EXTERNAL_IMAGE_ROOTS` tidak lagi memberi akses. Path absolut tersimpan di dalam input ComfyUI tetap dieksekusi; pilih path input relatifnya untuk memulihkan thumbnail.

- mendukung tile folder, penelusuran folder bersarang, dan tombol `Parent`
- gunakan `Refresh previews` untuk mencoba ulang thumbnail tanpa mengubah sumber, status aktif, atau urutan; arahkan kursor ke preview yang gagal untuk melihat bantuan
- sumber yang dinonaktifkan tetap bisa dibaca dan tetap tersimpan bersama workflow sampai diaktifkan kembali atau dihapus; mengaktifkan/menonaktifkan atau mengurutkan ulang langsung memperbarui nomor output
- galeri mengikuti tinggi node yang tersedia, baik di canvas klasik maupun Nodes 2.0
- thumbnail memakai alur ala masonry sehingga referensi potret/lanskap campuran lebih mudah dipindai
- opsi `recursive_folders` untuk memuat gambar dari folder bersarang
- mode ukuran `Keep Input Ratio`, `Preset Ratio`, atau `Manual Input` dengan preset rasio, megapixel, ukuran divisible-by, atau kontrol width/height langsung
- pilihan metode resize dan interpolasi, termasuk mode crop fill tengah, atas, atau bawah
- mode list `Original Size` dapat mempertahankan resolusi sumber yang berbeda-beda dalam `image_list`
- mode list `Match Batch Size` membuat `image_list` sesuai dengan dimensi batch yang sudah di-resize

</details>

#### `(Deno) MiniMax H3 Multi Reference Image Loader`

Loader referensi untuk workflow MiniMax H3, dengan gambar satu kabel dan output audio individual.

<img src="images/readme/h3-reference-loader.webp" alt="Loader referensi MiniMax H3 dengan tiga referensi dan dua baris audio dengan waveform" width="483">

Fitur utama:

- alur upload, paste, drag-and-drop, Input Folder, pengurutan kartu, dan clear yang sama seperti `(Deno) Multi Image Loader`
- hingga 9 gambar referensi berurutan melalui satu socket khusus
- mempertahankan dimensi dan rasio aspek asli tiap gambar yang didekode tanpa proses resize, crop, pad, atau letterbox
- menampilkan setiap kartu preview dengan rasio aspek gambar sumbernya sendiri, sehingga referensi lanskap dan potret campuran tetap terlihat utuh tanpa pemotongan preview
- klik thumbnail untuk menonaktifkan/mengaktifkan referensi; kartu yang aktif langsung dinomori ulang agar sesuai dengan `<Picture 1>`, `<Picture 2>`, dan seterusnya, dan hanya gambar-gambar itu yang sampai ke kedua output
- gambar yang dinonaktifkan tetap tersimpan di posisi kartunya dan tetap memakai salah satu dari 9 slot galeri; aktifkan minimal satu gambar atau referensi audio untuk menjalankan
- terhubung ke input tunggal `ref_images` pada `(Deno) MiniMax H3 Reference to Video`
- juga menyediakan sumber berurutan yang sama sebagai output `image_list` yang langsung terhubung ke input `image` pada `(Deno) Local LLM Loader`
- node H3 mempertahankan input Autogrow bawaan ComfyUI untuk video referensi, audio pasangan video, dan audio mandiri

Bagian audio yang dapat dilipat di bawah galeri gambar menerima hingga 3 file audio melalui `Add audio`, Input Folder, atau drop file. Setiap file memiliki waveform, durasi terukur, pemutaran preview, toggle Use tersendiri, handle pengurutan, dan kontrol hapus. Pemutaran tidak mengubah apakah sebuah file dipakai untuk generasi. File video tidak diterima oleh loader ini.

Kedua node MiniMax H3 ini membutuhkan ComfyUI 0.30.0 atau lebih baru. Lihat [workflow multi-reference MiniMax H3](workflows/minimax-h3-multi-reference.json) yang portabel untuk pipeline H3 native lengkap, dengan dua node `Load Image` bawaan diganti oleh loader Deno satu kabel.

<details>
<summary>Detail</summary>

Setiap audio yang terdaftar menambahkan satu output `AUDIO` individual setelah dua output gambar yang sudah ada. Hubungkan output tersebut ke input audio mandiri yang bertambah otomatis pada `(Deno) MiniMax H3 Reference to Video`, lalu hubungkan `audio_vae` untuk meng-encode suaranya. Hanya kartu audio yang aktif yang menerima `<Audio 1>`, `<Audio 2>`, dan seterusnya sesuai urutan kartu. Misalnya, dengan tiga file terdaftar dan dua yang pertama dinonaktifkan, file ketiga ditampilkan dan di-encode sebagai `<Audio 1>`. File yang dinonaktifkan beserta kabelnya tetap tersimpan; cabang audio downstream biasa dari file tersebut dilewati. Pengurutan ulang menjaga setiap kabel tetap terpasang pada file yang sama, dan menghapus file hanya menghapus kabel audio file itu. Pemuatan khusus audio juga didukung.

Node bertambah tinggi secara otomatis saat file audio ditambahkan sehingga setiap baris audio tetap terlihat tanpa scrollbar internal. Menghapus file atau melipat bagian audio akan melepaskan ruang tersebut. Tinggi dan lebar yang ditambahkan secara manual dipertahankan, dan membuka kembali workflow lama yang ringkas akan memperluasnya cukup untuk menampilkan baris audio yang tersimpan.

Agar tag yang ditampilkan dan referensi H3 identik, hubungkan semua output audio yang aktif dari satu loader DENO ke node DENO H3 yang sama. Nonaktifkan file yang tidak ingin kamu hubungkan. Saat memakai output audio DENO ini, sumber audio mandiri lain dan soundtrack video referensi harus diputus dari node H3 tersebut; node akan menjelaskan konflik penomoran, bukan diam-diam menetapkan tag yang berbeda. Workflow lama yang hanya memakai loader audio lain mempertahankan perilaku input bawaannya.

File audio dibaca dari folder input ComfyUI. Ekstensi yang didukung adalah WAV, MP3, FLAC, OGG/OGA, Opus, M4A, AAC, AIF, dan AIFF, bergantung pada decoder PyAV yang terpasang. Pemuatan dibatasi hingga 256 MiB per file, 128 MiB PCM hasil dekode, dan 30 detik dekode CPU. Kegagalan preview menyediakan aksi Retry dan tidak mengubah file yang tersimpan maupun koneksinya.

Socket H3 khusus ini disengaja: batch `IMAGE` ComfyUI biasa mensyaratkan width dan height yang sama, sehingga tidak dapat mempertahankan ukuran referensi yang berbeda-beda. `image_list` tambahan adalah output list, bukan batch berukuran sama, sehingga dimensi asli, urutan, dan rasio aspek tetap terpisah saat dipakai ulang oleh node yang mendukung list. MiniMax H3 mungkin tetap memperkecil referensi dalam pemrosesan `ref_image_size` normalnya sambil menjaga rasio aspeknya.

Pada build ComfyUI yang mendukung VAE H3 opsional, `(Deno) MiniMax H3 Reference to Video` juga menerima input `vae` atau `audio_vae` yang tidak terhubung. Menghubungkan keduanya mempertahankan perilaku encoding referensi yang sudah ada.

- Tanpa `vae`, gambar dan video referensi tetap sampai ke text/vision encoder, tetapi latent referensi hasil encode VAE-nya dihilangkan.
- Tanpa `audio_vae`, suara referensi yang sebenarnya tidak di-encode. Text encoder hanya menyimpan label seperti `<Audio 1>`, bukan gelombang audionya; hubungkan `audio_vae` untuk mereferensikan suara. Menghilangkannya tidak menonaktifkan audio yang dihasilkan.

Audio yang berpasangan dengan video referensi (`ref_video_audio`) memerlukan `vae` dan `audio_vae` terhubung untuk meng-encode video referensi beserta suaranya; audio referensi mandiri (`ref_audio`) hanya memerlukan `audio_vae`.

Pilihan ini hanya berlaku untuk encoding referensi di node ini. Pertahankan VAE yang dibutuhkan node decoding video dan audio di downstream. Build ComfyUI lama yang node H3 native-nya mensyaratkan kedua VAE tetap memerlukan kedua koneksi; update ComfyUI untuk memakai encoding referensi opsional.

</details>

### 02 · Pembuatan

#### `(Deno) Ideogram Director`

Builder prompt visual Ideogram 4 untuk caption JSON terstruktur dan pekerjaan layout bbox. [Tonton demo workflow Ideogram Director](https://youtu.be/Z8s27skkIDM).

<img src="images/readme/ideogram-director.webp" alt="Board Ideogram Director dengan empat kotak layout di atas poster yang dihasilkan dari layout yang sama" width="640">

Latar di atas adalah hasil Ideogram 4 lokal yang dihasilkan dari keempat kotak yang sama.

Fitur utama:

- menggambar dan mengedit area bbox langsung di canvas ComfyUI
- menonaktifkan elemen bbox tertentu sementara tanpa menghapus atau mengubah urutannya
- klik dua kali bbox untuk mengedit di dekat penunjuk, atau `Alt`+klik berulang kali pada area tumpang tindih untuk memilih kotak di bawahnya secara bergantian
- mengimpor prompt JSON dari Local LLM Loader atau sumber STRING lain
- secara opsional menghubungkan input STRING Summary dan Background untuk menggantikan kedua field board tersebut saat eksekusi; input yang tidak terhubung tetap memakai teks board yang tersimpan
- bertanya sebelum mengganti board yang ada, atau beralih ke selalu mengganti
- menolak JSON yang salah format dengan jelas, bukan meneruskan teks prompt yang rusak ke downstream
- galeri preset style dan layout dengan thumbnail preview ringan
- Language view untuk membaca dan mengedit deskripsi board dalam bahasamu sementara output akhir tetap berbahasa Inggris siap-model. Kata literal pada kotak TEXT seperti papan, logo, dan judul dipertahankan persis
- output: `prompt`, `width`, `height`, `seed`, `bboxes`

<details>
<summary>Detail</summary>

Output `bboxes` yang sudah ada terhubung ke konsumen `BBOX` standar maupun input `BOUNDING_BOX` seperti `Ideogram4_MultiLora_BoundingBoxNode_Fedor`; jumlah baris region pada node itu mengikuti kotak aktif Director tanpa menambah field Director yang disimpan. Sinkronisasi berbasis jumlah saat ini tidak mengikuti identitas kotak, jadi periksa penetapan baris LoRA setelah menghapus atau mengurutkan ulang kotak di tengah.

Terjemahan hanya memakai layanan bawaan Google, MyMemory, dan LibreTranslate. Lihat [akses file dan terjemahan](SECURITY_CONFIGURATION.md).

</details>

#### `(Deno) MiniMax H3 Acc LoRA Loader`

Memuat [MiniMax-H3-Acc-LoRAs](https://huggingface.co/alibaba-pai/MiniMax-H3-Acc-LoRAs) resmi Alibaba PAI secara langsung tanpa mengonversi atau menggandakan file safetensors.

1. Unduh file resmi `Acc-8Step.safetensors` untuk FL2VA atau Ref2VA, lalu letakkan di folder biasa `ComfyUI/models/loras/` atau folder khusus `ComfyUI/models/minimax_h3_acc_loras/`.
2. Hubungkan model diffusion MiniMax H3 native yang sesuai ke `model`; model penuh dan varian `*_pruned_*` dari Comfy-Org didukung.
3. Pilih Acc-LoRA yang sesuai: FL2VA untuk FL2VA/T2VA, atau Ref2VA untuk Ref2VA.
4. Hubungkan satu-satunya output `model` node ini ke jalur guider biasa.
5. Susun jalur sampling dengan node standar ComfyUI. Titik awal yang disarankan adalah `BasicScheduler: simple, steps: 8` dan `KSamplerSelect: euler`, terhubung ke `SamplerCustomAdvanced`.

Bobot LoRA dan workflow tidak disertakan bersama Deno Custom Nodes. Unduh bobot dari Alibaba, lalu susun atau sesuaikan workflow ComfyUI native milikmu.

<details>
<summary>Detail</summary>

Node menerapkan bobot LoRA statis dan 32 output head PDD checkpoint yang bergantung pada waktu. Saat sampling, node membaca batas sigma aktual dari ComfyUI dan secara otomatis menggabungkan head PDD untuk interval tersebut. Dengan demikian, kontrol sampler, scheduler, dan langkah tetap berada di node ComfyUI biasa. Konfigurasi resmi Simple/Euler 8 langkah tetap menjadi konfigurasi yang dilatih dan direkomendasikan; kamu dapat memilih jumlah langkah Simple Scheduler dari 4 hingga 12 tanpa mengubah loader ini, sedangkan schedule menurun lain atau pass sigma terpisah untuk workflow latent upscale tersedia untuk eksperimen, bukan jaminan peningkatan kualitas. Pertahankan sigma shift video/audio MiniMax H3 native pada `12.0 / 3.0` dan kekuatan LoRA pada `1.0`.

Model penuh yang tidak dipangkas, termasuk varian INT8 native ComfyUI, menerapkan seluruh adapter melalui jalur LoRA ComfyUI yang mendukung kuantisasi. Untuk model curve-pruned, loader mencari checkpoint MiniMax H3 penuh yang sesuai dan sudah ada di `models/diffusion_models/`, membaca hanya bagian FP32 time-embedder yang kecil, lalu menghitung bridge di memori yang menyesuaikan seluruh 50 pembaruan AdaLN LoRA berlebar penuh ke curve terpangkas selebar 8. Seluruh checkpoint tidak dimuat untuk perhitungan ini. Jika checkpoint penuh yang sesuai tidak terpasang, loader tetap dapat dipakai dalam mode kompatibilitas: memberi satu peringatan, melewati 50 pembaruan AdaLN tersebut, dan tetap menerapkan seluruh pembaruan LoRA lainnya serta head PDD.

Workflow UI standar yang aktif dan disimpan dengan loader tiga output v0.7.92–v0.7.94 akan dimigrasikan saat dibuka di canvas ComfyUI. Sambungan model tetap dipertahankan, sedangkan sambungan sampler dan sigmas lama dipindahkan ke node standar yang dapat diedit, yaitu `KSamplerSelect: euler` dan `BasicScheduler: simple, steps: 8`. Simpan workflow UI sekali setelah dibuka. Workflow satu output saat ini tidak diubah. Node yang dibisukan/di-bypass, tata letak kustom yang tidak dikenal, dan graph yang rusak dibiarkan apa adanya, bukan ditebak. JSON prompt API mentah tidak menjalankan migrasi frontend ini; ekspor kembali dari workflow UI yang telah dimigrasikan. Jika file sudah disimpan setelah sambungan sampler/sigmas lamanya hilang, hubungkan kembali node standar tersebut secara manual.

</details>

#### `(Deno) MiniMax H3 Tiled Sampler`

Menyelesaikan latent video+audio MiniMax H3 yang sudah di-upscale dalam tile yang saling tumpang tindih, sehingga GPU 16GB dapat menjalankan pass akhir beresolusi tinggi. Pada setiap langkah, semua tile membaca frame yang sama, prediksinya digabung dengan bobot cosine di area tumpang tindih, lalu satu pembaruan bersama dijalankan. Model dimuat sekali untuk semua tile, dan latent audio asli diteruskan tanpa perubahan.

<img src="images/readme/h3-tiled-sampler.webp" alt="MiniMax H3 Tiled Sampler dengan pengaturan tile dan overlap" width="375">

Posisi umum dalam graph H3 native:

```text
First pass: SamplerCustomAdvanced with SplitSigmas high_sigmas
-> MiniMax H3 Latent Upscale With Model (ComfyUI 0.44.0+) or another H3 latent upscaler
-> (Deno) MiniMax H3 Tiled Sampler with SplitSigmas low_sigmas
-> VAE Decode for video, audio decode for sound
```

- `model`: model H3 setelah LoRA, sigma shift, dan node attention atau memori apa pun. Sparse attention dan optimasi memori dari H3-Optimizations bekerja di depan node ini. `BlockSparseAttention` inti ComfyUI untuk sementara ditolak dengan pesan.
- `positive`: conditioning positive yang sama dengan pass pertama. Gambar referensi R2V tetap global. Conditioning keyframe dipotong untuk setiap tile dan disiapkan per tile. Conditioning regional dan ControlNet ditolak.
- `latent`: latent H3 yang sudah di-upscale, tanpa noise mask.
- `sigmas`: hanya 1-3 langkah terakhir dari jadwal pass pertama, misalnya `low_sigmas` dari `SplitSigmas`. Jadwal lain ditolak disertai petunjuk.
- `seed`: noise yang mengembalikan latent hasil upscale ke sigma pertama dari langkah-langkah tersebut.
- `Tile width`, `Tile height`, `Overlap X`, `Overlap Y`: ukuran piksel dalam kelipatan 32. Overlap harus lebih kecil dari tile. Jumlah tile mengikuti ukuran frame. Tile yang sama besar atau lebih besar dari frame memproses frame tersebut sekaligus.

Nilai default (tile 896 x 704, overlap minimal 256 x 320) adalah pengaturan 16GB yang telah diuji. Pada GPU 16GB dengan RAM sistem 32GB, klip 15 detik 1920 x 1088 berjalan sebagai 6 tile, dan satu langkah akhirnya memakan waktu sekitar 520 detik. Tile yang lebih besar mengulang lebih sedikit pekerjaan overlap tetapi membutuhkan lebih banyak VRAM. Ukuran di atas default ini belum diukur oleh DENO.

Setiap eksekusi mencetak jumlah tile, grid, ukuran, detik per tile, dan puncak memori PyTorch ke console serta menambahkan laporan yang sama ke teks output node, sehingga kamu atau agen dapat memilih ukuran berikutnya. Memerlukan ComfyUI dengan dukungan MiniMax H3 native (0.30.0 atau lebih baru); diuji pada ComfyUI 0.41.3 hingga 0.44.0.

#### MiniMax H3 R2V Audio Reference workflow

[Workflow referensi audio untuk pemula](workflows/minimax-h3-r2v-audio-reference.json) mempertahankan jalur audio referensi MiniMax H3 bawaan ComfyUI dan menambahkan jalur pengarahan prompt otomatis:

- `(Deno) Audio Transcript` memakai OpenAI Whisper lokal untuk lirik atau dialog, waktu per segmen, bahasa yang terdeteksi, dan ringkasan confidence. Lirik yang dimasukkan pengguna secara opsional tetap menjadi acuan utama untuk susunan katanya.
- `(Deno) Audio Analysis Finalizer` hanya menyimpan field analisis akustik yang didokumentasikan dari hasil `TextGenerate` ComfyUI, dan dapat melakukan unload model CLIP tersebut setelah analisis.
- `(Deno) Local LLM Loader` menerima transkrip dan laporan akustik melalui input STRING opsional `audio_context`. AUDIO mentah tidak dikirim ke LLM lokal, dan analisis dari upstream diperlakukan sebagai data, bukan instruksi.
- Bagian audio sumber yang dipilih sekaligus menjadi referensi `<Audio 1>` H3 dan audio yang dimux ke MP4 akhir. Audio yang dihasilkan secara internal oleh H3 tidak didekode dalam workflow ini.

Persyaratan:

- ComfyUI Stable terbaru dengan MiniMax H3 dan dukungan `TextGenerate` yang mampu memproses audio
- [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) untuk `Load Audio (Upload)`
- `gemma4_e4b_it_fp8_scaled.safetensors` di `ComfyUI/models/text_encoders/` untuk analisis akustik
- LM Studio dengan `google/gemma-4-12b-qat` yang sudah dimuat dan Local Server-nya aktif untuk tahap akhir pengarah prompt

`openai-whisper` diinstal sebagai dependency node. Checkpoint Whisper yang dipilih diunduh dari OpenAI saat `(Deno) Audio Transcript` pertama kali dijalankan, checksum-nya divalidasi oleh loader Whisper resmi, lalu disimpan di cache `ComfyUI/models/stt/whisper/`.

#### `(Deno) LTX Model Loader`

Satu loader ringkas untuk pola pemuatan model LTX 2.3 yang umum.

<img src="images/readme/ltx-model-loader.webp" alt="LTX Model Loader dengan tombol Checkpoint, KJ Style, dan GGUF Style" width="372">

Fitur utama:

- mode `Checkpoint Style`, `KJ Style`, dan `GGUF Style`
- output: `model`, `clip`, `video_vae`, `audio_vae`
- memakai jalur pemuatan checkpoint / diffusion / DualCLIP bawaan ComfyUI jika memungkinkan
- memakai `VAELoaderKJ` dari KJNodes untuk workflow VAE video/audio terpisah
- memakai pemuatan UNet ComfyUI-GGUF untuk workflow GGUF; kedua pack hanya dipakai setelah ComfyUI memuatnya, dan pack yang terpasang tetapi belum dimuat dilaporkan dengan jelas
- menyertakan pesan error dependency yang lebih jelas dan fallback kompatibilitas audio VAE untuk lingkungan ComfyUI/KJNodes campuran

#### `(Deno) LTX Sequencer`

Guide sequencer LTX yang disesuaikan untuk workflow multi-gambar. Terinspirasi dari pendekatan workflow LTX **WhatDreamsCost**, dengan penyesuaian di sisi Deno yang berfokus pada kemudahan penggunaan sehari-hari.

<img src="images/readme/ltx-sequencer.webp" alt="Multi Image Loader terhubung ke LTX Sequencer dengan baris frame dan strength per gambar" width="720">

Fitur utama:

- bekerja dengan output batch dari `(Deno) Multi Image Loader`
- mengisi otomatis `num_images` dari loader yang terhubung jika memungkinkan
- mempertahankan alur ala sync yang sudah ada
- memungkinkan hanya nilai `strength` yang dilepas ke kontrol manual saat diperlukan
- switch `bypass` meneruskan `positive`, `negative`, dan `latent` tanpa perubahan untuk tes A/B cepat

#### `(Deno) LTX Multi LoRA Loader`

Loader multi LoRA gaya Power-LoRA untuk workflow LTX.

<img src="images/readme/ltx-multi-lora.webp" alt="LTX Multi LoRA Loader dengan kolom strength, video, dan audio" width="502">

Fitur utama:

- menambahkan banyak LoRA dalam satu node ringkas
- toggle enable per slot
- kontrol `strength`, `video`, dan `audio` strength per slot
- editor trigger word dan catatan LoRA per slot
- menyalin trigger word tersimpan dari baris LoRA
- output `model` dan `clip` yang sudah dipatch
- dirancang tetap dekat dengan alur Power LoRA Loader yang sudah dikenal sambil menambahkan kontrol A/V yang ramah LTX dan catatan referensi LoRA yang ringan

#### `(Deno) LTX Prompt Guide`

Helper prompt yang menggabungkan prompt encoding LTX, penanganan negative prompt opsional, LTX conditioning bawaan, dan perencanaan panjang dialog.

<img src="images/readme/ltx-prompt-guide.webp" alt="LTX Prompt Guide menampilkan panjang video minimum yang dihitung dari dialog dalam tanda kutip" width="572">

Fitur utama:

- encoding teks positive prompt
- negative prompt opsional yang bisa dilipat
- LTX conditioning bawaan dengan `frame_rate`
- memperkirakan panjang video minimum dari dialog dalam tanda kutip
- mendukung estimasi dialog Auto, Korea, Inggris, Jepang, dan Tionghoa
- output: `positive`, `negative`, `frame_rate`

#### `(Deno) LTX Tiled Spatial Upscaler`

Helper untuk second pass latent video LTX beresolusi tinggi. Node ini membagi setiap frame menjadi tile spasial yang saling tumpang tindih, menjalankan upscaler spasial latent LTX per tile, lalu menggabungkan hasilnya kembali menjadi satu latent.

Gunakan pada latent LTX khusus video. Jika workflow membawa latent video/audio gabungan, pisahkan jalur audio lebih dulu dan gabungkan kembali setelah tiled video pass.

#### `(Deno) LTX High resolution Tiled Sampler`

Sampler untuk pass refinement LTX AV beresolusi tinggi. Sampler mempertahankan satu trajektori sampler global, sementara prediksi video dievaluasi melalui tile spasial yang saling tumpang tindih dan digabung sebelum pembaruan sampler.

Latent audio lengkap diberikan ke setiap tile video sebagai konteks, sementara latent audio yang dikembalikan tetap tidak berubah dalam mode `freeze`.

#### `(Deno) Bernini Prompt Guide`

Helper prompt Bernini ala KJ yang menggabungkan encoding prompt positive dan negative dalam satu node yang ramah pemula.

<img src="images/readme/bernini-prompt-guide.webp" alt="Bernini Prompt Guide dalam mode Image Edit dengan preset negative Official Wan2.2" width="640">

Preset negative `Official Wan2.2` yang ditampilkan di atas ditulis dalam bahasa Tionghoa.

Fitur utama:

- pemilih `System Prompt` dengan mode yang mudah dibaca seperti `Text to Video`, `Image to Video`, dan `Reference Video Edit`
- menampilkan prefix system prompt yang aktif langsung di bagian atas node
- menulis prompt dalam gaya instruksi, misalnya `Replace the jacket with the shirt from image0. Keep the camera motion, background, lighting, and shadows unchanged.`
- mode referensi otomatis menambahkan petunjuk penamaan singkat `image0`, `image1`, `image2` secara internal
- bagian negative prompt yang bisa dilipat
- preset negative mengisi kotak negative prompt yang terlihat; edit kotak itu langsung untuk mengubah negative prompt akhir yang di-encode
- output: `positive`, `negative`

Node ini hanya menyiapkan text conditioning. Hubungkan output `positive` dan `negative` ke node `(Bernini) Conditioning` native pada ComfyUI Stable untuk visual/context-latent conditioning Bernini. ComfyUI terbaru sudah menyertakan [backend Bernini native yang telah digabung](https://github.com/Comfy-Org/ComfyUI/pull/14216), jadi updater backend preview lama tidak lagi diperlukan; update ComfyUI Stable jika node conditioning native belum terlihat.

#### `(Deno) Multi LoRA Loader`

Loader multi LoRA serbaguna untuk workflow diffusion ComfyUI biasa.

<img src="images/readme/multi-lora.webp" alt="Multi LoRA Loader dengan empat slot, satu dimatikan" width="502">

Terapkan hingga 64 LoRA pada `MODEL` yang terhubung dan `CLIP` opsional, aktifkan atau nonaktifkan setiap slot tersimpan tanpa kehilangan pilihannya, atur strength model dan CLIP secara terpisah, simpan trigger word dan catatan di samping setiap LoRA, ubah urutan slot, lalu teruskan `model` dan `clip` yang sudah dipatch ke downstream. Gunakan `+ Add LoRA` untuk menambah slot sesuai kebutuhan. Workflow dan prompt API delapan slot yang sudah ada tetap mempertahankan pilihan, strength, trigger word, catatan, dan koneksi yang tersimpan.

#### `(Deno) Easy Model Download Helper`

Helper setup berbasis preset untuk kumpulan file model yang direkomendasikan. Preset bawaan mencakup set pemula LTX 2.3 GGUF untuk VRAM 8GB dan set model resmi LTX 2.5 Distilled INT8 dua tahap.

<img src="images/readme/model-download-helper.webp" alt="Easy Model Download Helper dengan preset LTX 2.3 VRAM 8GB dan baris file yang hilang" width="612">

Fitur utama:

- membuka tautan model resmi di browser, bukan mengunduh file lewat Python
- mencakup diffusion model LTX 2.5, text encoder Gemma 4 berproyeksi, VAE video dan audio, serta x2 spatial upscaler yang dibutuhkan workflow dua tahap
- menampilkan root model ComfyUI yang terdeteksi dan memungkinkan pengguna menyalin root yang dipilih
- mendukung creator preset tersimpan di dalam workflow dan memulihkannya dari penyimpanan browser setelah halaman dimuat ulang
- mendukung tautan langsung Hugging Face dan tautan halaman/unduhan Civitai tanpa request jaringan dari sisi Python
- memeriksa folder model terdaftar ComfyUI, termasuk nama folder kustom dari `extra_model_paths`
- memeriksa path target tepat setiap preset di dalam folder model terdaftar tersebut tanpa memindai folder proyek bersarang yang tidak terkait
- menampilkan subfolder model ComfyUI target agar pengguna tahu persis ke mana file harus diletakkan

Repository LTX 2.5 mensyaratkan akun Hugging Face dan **Agree and Access** sebelum file-nya dapat diunduh. Helper ini tidak melewati pembatasan tersebut dan tidak mengunduh file secara otomatis. Baca [LTX-2 Community License](https://github.com/Lightricks/LTX-2/blob/main/LICENSE.md), minta akses di [repository resmi LTX 2.5](https://huggingface.co/Lightricks/LTX-2.5), lalu gunakan tautan browser dari helper dan pindahkan setiap file yang diunduh ke folder model ComfyUI yang ditampilkan.

<details>
<summary>Panduan tautan creator preset</summary>

- Hugging Face: klik kanan ikon unduh kecil di samping file target, pilih `Copy link address`, lalu tempel URL file langsung itu ke field `URL` preset.
- Civitai: salin URL halaman model dari address bar browser, tempel ke field `URL` preset, lalu tekan tombol `Civitai` di editor untuk mengubahnya menjadi tautan unduhan browser langsung. Jika nama file tidak terlihat di URL, masukkan nama file yang diunduh secara manual.
- Untuk halaman Civitai, jangan salin tautan tombol biru `Download` kecuali kamu memang sengaja ingin memberikan URL unduhan API langsung.
- `File name` hanya dipakai untuk pemeriksaan path target. Nilainya harus sesuai dengan file yang diunduh di disk, terutama untuk tautan Civitai/API.

![Panduan tautan Hugging Face](images/easy-model-download-helper-huggingface-link.png)

[Contoh halaman model Civitai (berisi teks model berbahasa Tionghoa)](images/easy-model-download-helper-civitai-link.png).

![Panduan editor preset Civitai](images/easy-model-download-helper-civitai-node.png)

</details>

#### `(Deno) Text Encoder Unload`

Barrier VRAM inline opsional untuk alur prompt umum yang hanya memakai positive atau memakai positive/negative.

<img src="images/text-encoder-unload-workflow.png" alt="Text Encoder Unload ditempatkan setelah encoding prompt" width="720">

- hubungkan conditioning positive melalui `Positive Conditioning`; input ini wajib dan diteruskan tanpa perubahan
- secara opsional, hubungkan prompt negative yang sudah di-encode atau `Conditioning Zero Out` melalui `Negative Conditioning`; input ini juga diteruskan tanpa perubahan
- hubungkan `CLIP` persis yang dipakai text encoder di upstream ke `Text Encoder (CLIP)`
- biarkan `Negative Conditioning` kosong untuk workflow guider yang hanya memakai positive
- hanya melakukan unload pada CLIP / text encoder tersebut, clone, dan komponen terkelolanya lewat pengelolaan model ComfyUI; diffusion model, VAE, dan ControlNet tidak di-unload secara global
- mengikuti cache input normal ComfyUI, sehingga sampling preview yang tidak berubah dapat digunakan kembali, sementara perubahan pada conditioning atau jalur CLIP tetap memicu unload

<details>
<summary>Detail</summary>

Dynamic VRAM memindahkan weight sesuai tekanan memori dan dapat sengaja membiarkan sebagian halaman text encoder tetap resident. Node ini menyediakan titik pelepasan opt-in yang deterministik, tetapi tidak dapat membuat seluruh proses memakai `0 MiB`: CUDA context, conditioning tensor, model lain, alokasi custom node, dan aplikasi lain tetap terpisah. Node ini juga tidak meningkatkan kualitas sampling dengan sendirinya; fungsinya menyediakan ruang VRAM yang dapat mengurangi model offload atau mencegah error out-of-memory. Text encode berikutnya harus memuat ulang model, dan `--gpu-only` tidak dapat memindahkan encoder keluar dari VRAM.

</details>

#### `(Deno) Prompt Text`

Sumber STRING multiline kecil untuk system prompt, user prompt, template, atau teks JSON. Gunakan saat prompt panjang yang dipakai ulang perlu tetap mudah dibaca dalam node tersendiri dan terhubung ke Ideogram Director, Local LLM Loader, atau input STRING lain tanpa mengubah teksnya.

<img src="images/readme/prompt-text.webp" alt="Node Prompt Text berisi system prompt multiline" width="472">

#### `(Deno) Local LLM Loader` and `(Deno) Local LLM Reviewer`

Helper workflow LLM lokal untuk memanggil model yang sudah berjalan di PC-mu dan memakai review teks untuk mengatur apa yang disimpan.

<p>
  <img src="images/readme/local-llm.webp" alt="Local LLM Loader diatur ke LM Studio dengan panel Thinking dan Result" width="370">&nbsp;&nbsp;
  <img src="images/readme/review-gate.webp" alt="Local LLM Reviewer dengan kontrol Review, Pass, dan Approve Once" width="300">
</p>

Fitur utama:

- memanggil model lokal Ollama, LM Studio, llama.cpp, vLLM, Custom OpenAI-compatible, llama-swap, atau Unsloth Studio dari ComfyUI
- keamanan server localhost secara default: gunakan `127.0.0.1` atau `localhost`, atau izinkan secara eksplisit satu `IP:port` LAN privat dengan `DENO_LOCAL_LLM_ALLOWED_HOSTS`
- me-refresh daftar model khusus provider dari node
- menghentikan request LLM lokal yang sedang berjalan sebelum meng-unload model
- menghubungkan batch prompt melalui satu eksekusi node sehingga model lokal tetap termuat sampai batch selesai
- secara opsional melampirkan IMAGE ke panggilan model lokal yang mendukung vision
- menampilkan preview teks Thinking dan Result langsung di node
- menyematkan Result akhir node ke metadata PNG/workflow yang disimpan setiap kali node Local LLM dieksekusi, sehingga membuka kembali file memulihkannya di dalam node; Thinking/reasoning hanya untuk preview dan tidak disimpan
- menyimpan preset System Prompt bernama di user data ComfyUI sehingga tetap ada setelah pembersihan profil browser
- menghubungkan FLOAT positif ke `video seconds` untuk menambahkan kalimat seperti `This is an 8-second video.` ke setiap user prompt LLM tanpa mengubah teks Prompt yang tersimpan
- memakai `(Deno) Local LLM Reviewer` sebagai gate sebelum node Save: meneruskan atau memblokir output IMAGE dan AUDIO berdasarkan hasil teks review, menyetujui sekali hasil review saat ini, atau menjalankan ulang jalur sebelum reviewer

<details>
<summary>Alamat server, API key, dan catatan provider</summary>

Field server Custom, llama.cpp, vLLM, llama-swap, dan Unsloth hanya menerima alamat server dan port dengan `/v1` opsional, misalnya `http://127.0.0.1:8000/v1`; query dan path lain ditolak disertai petunjuk. Refresh Models, Unload, dan Stop untuk Ollama dan LM Studio selalu memakai server lokal tetap mereka, yaitu server yang sama yang dipakai node saat berjalan. Error server menampilkan pesan error JSON dari server, bukan respons mentahnya.

- mempertahankan satu pemilih model terdeteksi di seluruh refresh berulang dan pergantian provider, serta menghapus pemilih ganda yang dikenal dari sesi frontend lama sambil mempertahankan model yang dipilih
- memakai API status berjalan dan manajemen llama-swap yang live untuk unload manual atau setelah proses; timeout server llama-swap yang dikonfigurasi tetap menentukan unload otomatis
- gunakan provider `Unsloth` hanya dengan server Unsloth Studio (default `http://127.0.0.1:8888/v1`); jika GGUF Unsloth berjalan di dalam LM Studio, pilih `LM Studio`
- menampilkan daftar model Unsloth Studio, mengirim request chat OpenAI-compatible tanpa field tool-definition atau tool-choice, dan memakai API manajemen Unsloth Studio untuk unload manual atau setelah proses; `Keep for minutes` tidak menjadwalkan unload Unsloth berwaktu
- preset System Prompt browser yang sudah ada dapat diimpor sekali sementara salinan di browser tetap tidak tersentuh sebagai cadangan
- menampilkan nama preset System Prompt yang benar-benar diterapkan pada node dan di editor; teks yang diedit dan tidak cocok ditampilkan sebagai `Custom`

Autentikasi API dibaca dari environment host ComfyUI:

| Provider | Environment variable API key |
| --- | --- |
| LM Studio | `DENO_LOCAL_LLM_LM_STUDIO_API_KEY` opsional; kembali ke `DENO_LOCAL_LLM_API_KEY` jika key khususnya tidak diset |
| llama.cpp, vLLM, Custom, llama-swap | `DENO_LOCAL_LLM_API_KEY` opsional |
| Unsloth | `DENO_LOCAL_LLM_UNSLOTH_API_KEY` wajib; key umum tidak dipakai |
| Ollama | Key umum tidak dikirim |

Set variable yang sesuai sebelum memulai ComfyUI, dan restart ComfyUI setelah mengubahnya. Key dikirim sebagai Bearer token untuk penemuan model, chat, dan request manajemen yang didukung provider, termasuk unload LM Studio dan manajemen llama-swap. Provider opsional tetap berfungsi tanpa header autentikasi jika tidak ada key yang dikonfigurasi. Key tidak pernah disimpan di workflow atau metadata PNG.

Untuk server LLM yang di-host Docker di PC yang sama, publikasikan port server pada loopback host dan gunakan URL lokal yang sesuai. Autentikasi tidak mengubah aturan URL localhost/LAN privat; gunakan hanya server tepercaya karena key yang dikonfigurasi dikirim ke provider didukung yang dipilih.

Catatan LM Studio jarak jauh: provider khusus `LM Studio` saat ini memakai `http://127.0.0.1:1234/v1`. Untuk menghubungi LM Studio di PC lain milikmu dalam LAN tepercaya yang sama, aktifkan **Serve on Local Network** di PC tersebut, tetapkan allowlist yang tepat sebelum memulai ComfyUI (misalnya `DENO_LOCAL_LLM_ALLOWED_HOSTS=192.168.1.50:1234`), restart ComfyUI, lalu pilih `Custom` dan gunakan `http://192.168.1.50:1234/v1` sebagai Custom Server URL. Jika server itu memerlukan autentikasi, set juga `DENO_LOCAL_LLM_API_KEY` di host ComfyUI sebelum restart. Allowlist hanya menerima pasangan IP privat dan port yang tepat, dan tidak pernah disimpan dalam workflow atau metadata PNG. Custom tidak memakai helper unload khusus LM Studio, jadi batasi port server hanya untuk PC ComfyUI melalui firewall host dan kelola model jarak jauh dari LM Studio.

Catatan kompatibilitas LM Studio: jika LM Studio menolak field kontrol reasoning opsionalnya sebelum output apa pun dihasilkan, node mencoba satu kali lagi tanpa field itu. Server dan model yang dipilih kemudian menentukan perilaku reasoning defaultnya; toggle Thinking tidak dapat memaksakan mode reasoning yang tidak disediakan server.

Catatan audio: Local LLM Loader tidak mengirim AUDIO mentah ke model lokal. Input STRING opsional `audio_context` dapat membawa transkrip dan laporan akustik dari upstream sebagai data sambil mempertahankan prompt pengguna. Reviewer dapat menjadi gate AUDIO saat node text generation lain, termasuk text generation ComfyUI yang mendukung audio, membuat teks review.

</details>

### 03 · Perbandingan

#### `(Deno) Image Compare`

Node perbandingan A/B visual untuk memeriksa dua gambar dengan cepat di canvas ComfyUI.

<img src="images/readme/image-compare.webp" alt="Slider Image Compare antara gambar kota yang tajam dan yang berpiksel" width="640">

Fitur utama:

- membandingkan `image_a` dan `image_b` langsung di dalam node
- mode: `Slider`, `Side by Side`, `Difference`, dan `Toggle`
- interaksi slider hover-move untuk inspeksi before/after yang cepat
- label A/B yang terlihat dan tombol `Swap` untuk memeriksa dari kedua arah
- area preview internal berubah ukuran mengikuti node sehingga gambar potret dan lanskap tetap terbaca
- node khusus visual tanpa koneksi output, menjaga graph tetap rapi saat perbandingan hanya untuk inspeksi

#### `(Deno) Video Compare`

Node perbandingan A/B visual untuk video, dibuat untuk memeriksa hasil upscale dan interpolasi FPS langsung di canvas ComfyUI.

<img src="images/readme/video-compare.webp" alt="Video Compare dengan slider, tombol mode, dan kontrol pemutaran" width="720">

Fitur utama:

- `video_a` / `video_b` (batch IMAGE) dan `audio_a` / `audio_b` opsional (AUDIO, misalnya dari VHS *Load Video*)
- mode: `Slider`, `Side by Side`, `Difference`, `Toggle` (flip A/B freeze-frame), plus `Swap`
- slider hover-move, klik = play/pause, scrub bar, frame step, speed, loop; arahkan kursor ke preview untuk mendengar sisi yang dipilih
- node menyesuaikan ukuran dengan aspek klip; wheel dan middle-drag diteruskan ke canvas ComfyUI
- toggle `🏷 Output Badges`: secara opsional menambahkan badge A/B + resolusi ke output yang disimpan (nonaktif secara default; preview di dalam node selalu menampilkannya)
- `comparison`: output IMAGE **lossless** beresolusi penuh dari mode yang dipilih (Slider / Side by Side / Difference / Toggle), siap dihubungkan ke node save/encode seperti VHS *Video Combine* pada FPS yang dipilih. `Toggle` mengeluarkan sisi A/B yang dipilih sepanjang urutan.

Terlalu berat untuk menjalankan node ini? Gunakan alat browser tanpa instalasi: **https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/** (juga ditautkan di bagian bawah node).

<details>
<summary>Detail dan alat browser</summary>

Semua compositing adalah pekerjaan tensor murni, tanpa encoder eksternal. Pemutar di dalam node menggambar urutan frame WebP yang sudah diperkecil pada `<canvas>` dengan virtual clock (sehingga A/B tetap frame-exact) dan memutar audio lewat WebAudio; file ditulis ke direktori temp ComfyUI dan disajikan oleh route `/view` yang sudah ada, lalu dibersihkan otomatis saat restart.

Timeline bersama: jumlah frame input A dan FPS terpilih menentukan durasi (B dipakai jika A tidak ada). Kedua sisi preview dan output yang disimpan memakai durasi ini, termasuk setelah `Swap`; B disampel di seluruh urutannya agar sesuai dengan jumlah frame output A. Hasil interpolasi FPS tetap dapat terlihat lebih halus di preview pada panjang yang sama.

Pada alat browser, arahkan kursor ke nama file yang dimuat untuk melihat nama lengkapnya. Pilih **Side by Side**, lalu **Left / Right** atau **Top / Bottom** untuk melihat preview layout gabungan. **Save MP4** mengekspor kedua video penuh sebagai MP4 H.264 pada 24, 30 (default), atau 60 fps, dengan urutan Swap saat ini, mode Sync, dan audio A/B terpilih (atau bisu). Kedua video disesuaikan ke tinggi yang sama untuk output horizontal, atau lebar yang sama untuk output vertikal, dengan proporsi tetap terjaga tanpa crop. Output memakai durasi penuh A: Time sync menahan frame terakhir B jika B selesai lebih dulu; Ratio sync menyesuaikan seluruh durasi B ke A, termasuk audio B jika dipilih. Zoom dan kecepatan pemutaran preview tidak memengaruhi video yang disimpan.

Penyimpanan berjalan secara lokal di browser-mu; file tidak pernah diunggah. Mesin video mengunduh sekitar 30 MB pada penggunaan pertama, jadi koneksi internet diperlukan untuk menyiapkannya. Video yang besar atau panjang dapat memakan waktu dan memori browser; **Cancel** menghentikan ekspor, dan MP4 yang sudah selesai dapat diunduh kembali dari dialog simpan.

</details>

#### `(Deno) Video Preview`

Preview beresolusi penuh yang siap pakai untuk memeriksa output encoded sungguhan di titik mana pun dalam graph. Node ini meng-encode video H.264 asli pada resolusi aslinya secara in-process dengan PyAV (tanpa menjalankan proses eksternal) menggunakan `+faststart` agar browser memutarnya inline dengan andal, lalu meneruskan gambar apa adanya, sehingga kamu dapat menyisipkannya **inline di beberapa titik sampling** tanpa membuat cabang kabel.

<img src="images/readme/video-preview.webp" alt="Video Preview memutar klip ter-encode dengan badge resolusi, FPS, dan jumlah frame" width="692">

Fitur utama:

- `images` (batch IMAGE) masuk, `images` pass-through keluar, `frame_rate`, dan input `audio` opsional yang di-mux ke preview sebagai AAC (toleran terhadap AUDIO berbentuk dict / object / `(waveform, sr)` dan bentuk `[C,N]` / `[N,C]`; jika audio tidak dapat dipakai, hal itu dicatat di log dan video tetap dipreview)
- pemutar auto-loop di dalam node yang bersih seperti preview VHS: tanpa chrome kontrol, **hover untuk mendengar audio**, **klik = play/pause**, tombol **Full screen**, dan wheel diteruskan ke canvas ComfyUI
- badge info ringkas di kiri atas menampilkan resolusi, FPS, jumlah frame, dan durasi preview saat ini
- node menyesuaikan aspek klip dan tetap sesuai saat ukurannya diubah
- setiap node memakai ulang satu file temp yang ditimpa setiap eksekusi, sehingga iterasi berat tidak menumpuk penyimpanan temp
- membutuhkan PyAV (`pip install av`); jika tidak ada, node menampilkan petunjuk instalasi satu baris yang jelas, bukan menggagalkan graph

### 04 · Penyelesaian

#### `(Deno) Film Grain`

Menambahkan film grain monokrom ke foto atau batch `IMAGE` video yang sudah didekode menggunakan pemrosesan CPU. Tidak diperlukan model atau instalasi package tambahan. Default-nya memadukan grain halus dan kasar pada 75:25, melunakkan partikel ekstrem, dan mengurangi grain di dekat hitam dan putih murni. Hanya pola grain yang di-blur; detail gambar dipertahankan.

<img src="images/readme/film-grain.webp" alt="Kontrol Film Grain di samping preview potret yang diberi grain" width="720">

Hubungkan di akhir rantai pemrosesan gambar:

- Foto: gambar akhir / resize → **Film Grain** → **Save Image**.
- Video native: frame hasil dekode / resize akhir → **Film Grain** → **Create Video** → **Save Video**. Biarkan audio asli dan frame rate tetap terhubung ke Create Video.
- Video Helper Suite: frame hasil dekode → **Film Grain** → **Video Combine**. Pertahankan pengaturan audio dan frame-rate-nya.

Panel memakai kontrol berbahasa Inggris dan gaya hijau ringkas seperti node Deno lainnya, apa pun locale ComfyUI. Panel menampilkan **Strength**, **Grain size**, **Roughness**, **Tone protection**, dan satu pilihan **Processing**. **Strength berkisar dari 0 hingga 1**: default terpilih `0.50` setara dengan code amount `6`, sedangkan `1.00` setara dengan amount `12`. **Low RAM** (default) memproses satu frame sekaligus, **Balanced** dua, dan **Faster** empat. Output grain-nya identik; pemrosesan yang lebih cepat dapat memakai lebih banyak RAM sementara.

<details>
<summary>Pengaturan, penyesuaian resolusi, dan memori</summary>

**Frames at once** di bawah **Advanced** menyediakan nilai persis 1–4, termasuk nilai kustom 3 yang dipertahankan. Pemrosesan memakai CPU dan tidak mengubah VRAM generasi di upstream maupun memecah video tersimpan menjadi beberapa klip. Batch frame output yang lengkap tetap membutuhkan RAM; lihat tooltip Processing. Seed dan pengaturan chunk video juga ada di bawah Advanced.

Workflow yang sudah ada mempertahankan nilai dan kabel yang tersimpan. Amount tersimpan di atas maksimum baru pada panel tetap utuh sampai kamu sengaja menyesuaikan slider. Parameter input yang terhubung mengendalikan pengaturan masing-masing; panel menonaktifkan kontrol tersebut dan menjaga socket native-nya tetap terlihat.

Node baru memakai default **Advanced → Grain scale → Match resolution**. Grain size bersifat relatif terhadap frame: node membuat grain asli pada grid yang cocok dengan aspek dengan **sisi terpendek 1536px** (referensi 2752×1536 yang dipilih), lalu me-resample hanya grain monokrom itu ke ukuran input. Strength dan campuran halus/kasar tidak berubah. Pada 2752×1536 hasilnya persis sama dengan preset asli. Workflow tersimpan yang sudah ada mempertahankan **Fixed pixels** dan hasil sebelumnya; pilih Match resolution untuk mengaktifkan perilaku baru. Prompt API lama yang tidak menyertakan `grain_scale_mode` juga mempertahankan hasil berbasis piksel.

Pola referensi difilter saat disampel ke frame yang lebih kecil, bukan diperkuat kembali ke varians per-piksel yang sama. Ini menjaga ukuran partikel dan kekuatan yang terlihat lebih konsisten saat resolusi berbeda ditampilkan pada ukuran layar yang sama. Grain yang sangat halus, kompresi codec, dan penskalaan pemutaran masih bisa berbeda; tampilan yang identik di setiap pemutar tidak dijamin. Input yang sangat teregang dengan grid referensi lebih dari 16.777.216 piksel gagal sebelum mengalokasikannya dan dapat memakai Fixed pixels.

| Pengaturan | Default | Efek |
| --- | --- | --- |
| `enabled` | on | Off meneruskan input asli tanpa menyalinnya. |
| `amount` | `6` | Strength tersimpan/API dalam satuan kecerahan 8-bit. Strength panel `0.5` = amount `6`, `1` = amount `12`; `0` meneruskan apa adanya. Rentang backend yang lebih besar mempertahankan workflow lama. |
| `grain_size` | `1` | Ukuran halus/kasar relatif pada Match resolution; sigma asli `0.45 / 1.15 px` pada referensi 1536px. Fixed pixels memakai sigma ini pada resolusi input. |
| `roughness` | `0.25` | Proporsi grain kasar; campuran halus/kasar default `75:25`. |
| `tone_weighted` | on | Menekankan midtone yang lebih gelap dan melindungi ujung paling terang dan paling gelap. |
| `temporal_mode` | `changing` | Mengubah pola per frame. `fixed` mengulang satu pola untuk perbandingan. |
| `seed` | `2026100701` | Mereproduksi pola dan urutan frame yang sama. |
| `frame_offset` | `0` | Indeks global frame pertama saat chunk video diproses terpisah. |
| `processing_batch_size` | `1` | Frame yang diproses bersama di CPU, dari 1 hingga 4. 1 meminimalkan RAM sementara. |
| `grain_scale_mode` | `resolution` untuk node baru | Match resolution mengambil sampel grain referensi ke dalam frame. `pixels` mempertahankan grain berbasis piksel yang asli; jika tidak ada di prompt API lama, dipakai `pixels`. |

Untuk membandingkan pengaturan dengan pola yang sama di beberapa eksekusi, biarkan `seed` tidak berubah dan set **control after generate** seed ComfyUI ke `fixed`.

Memori scratch dibatasi pada grup pemrosesan yang dipilih (1–4 frame), dan output yang aktif disimpan di CPU, bukan mengalokasikan batch penuh kedua di VRAM. Match resolution juga membutuhkan grid grain referensi, sehingga frame beresolusi lebih rendah dapat memakai lebih banyak RAM sementara dibanding Fixed pixels; Low RAM menjaga pekerjaan ini pada satu frame sekaligus. **Batch IMAGE output yang lengkap tetap membutuhkan RAM**, di luar input upstream dan cache ComfyUI. Untuk float32 RGB, output ini memakai `frames × width × height × 12` byte: sekitar **23,7 MiB per frame 1080p**, atau **2,78 GiB untuk 120 frame**. Node ini tidak men-stream seluruh file video dan tidak menghapus memori cache upstream; gunakan batch yang lebih pendek untuk klip yang panjang atau beresolusi tinggi. Eksekusi yang dinonaktifkan/berstrength nol mengembalikan objek input yang sama.

Ukuran, jumlah channel, dan dtype dipertahankan; alpha RGBA tidak berubah. Node bekerja pada piksel, sedangkan Save Image/Save Video tetap bertanggung jawab atas metadata workflow, encoding, dan pembuatan file. Socket `VIDEO` native terhubung setelah Create Video, bukan langsung ke node ini. Kompresi video dapat melunakkan grain halus atau memperbesar ukuran file yang disimpan.

</details>

#### `(Deno) RTX Video Super Resolution`

Node helper RTX Video Super Resolution opsional untuk Windows/NVIDIA RTX bagi pengguna yang ingin mencoba NVIDIA VFX di dalam ComfyUI tanpa harus mencari environment Python yang tepat secara manual.

<img src="images/readme/rtx-vsr.webp" alt="Panel RTX Video Super Resolution dengan kontrol efek, kualitas, dan resize" width="612">

Node ini sengaja dipisahkan dari node inti Deno. Node ini hanya mengimpor NVIDIA VFX saat eksekusi upscale, sehingga instalasi node Deno biasa tidak memerlukan NVIDIA VFX. ComfyUI Manager menginstal node pack tanpa menginstal NVIDIA VFX secara otomatis.

| Jika gambarmu... | Gunakan |
| --- | --- |
| kecil, beresolusi rendah, atau terkompresi | `VSR` |
| sudah bersih, tetapi perlu output yang lebih besar dan lebih tajam | `High Bitrate` |
| berisik atau berbintik | `Denoise` |
| lembut, tidak fokus, atau sedikit buram | `Deblur` |

Alur instalasi untuk pemula:

1. Instal atau update `deno-custom-nodes`, lalu mulai ComfyUI.
2. Tambahkan `(Deno) RTX Video Super Resolution` dan jalankan sekali dengan sebuah gambar.
3. Klik tombol `How to install` pada node jika NVIDIA VFX belum ada atau kamu ingin memperbarui instalasi yang lebih lama.
4. Tutup semua jendela/proses ComfyUI sebelum menjalankan installer.
5. Ikuti panduan instalasi web visual: unduh ZIP dari halaman itu, pindahkan ke `ComfyUI\custom_nodes\deno-custom-nodes\tools`, pilih `Extract All` dengan tujuan diatur ke folder `tools` itu sendiri, lalu jalankan `tools\install_rtx_vfx.bat`. Jika Windows membuat subfolder `install_rtx_vfx_bat`, pindahkan `install_rtx_vfx.bat` dan `README_RTX_VFX_EASY_INSTALL.md` langsung ke `tools` sebelum menjalankan BAT.
6. Jika BAT menanyakan `Install RTX VFX here?`, ketik `Y` hanya bila path Windows yang ditampilkan berada di dalam aplikasi ComfyUI yang baru saja kamu tutup. Jika terlihat salah, ketik `N` dan berhenti.
7. Tunggu pesan hijau `INSTALL COMPLETE`.
8. Restart ComfyUI sepenuhnya, lalu gunakan `(Deno) RTX Video Super Resolution` lagi.

Untuk panduan visual lengkap yang ramah pemula, buka [halaman instalasi Deno RTX VFX](https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/).
Jika video tutorial menyuruhmu membuka folder `tools` setelah menginstal dari ComfyUI Manager, buka `tools/OPEN_INSTALL_GUIDE.txt`; file itu mengarah ke halaman instalasi terkini yang sama.

<details>
<summary>Persyaratan runtime, upgrade, dan semua fitur</summary>

Runtime NVIDIA yang direkomendasikan: `nvidia-vfx 0.2.0.0` atau lebih baru (VFX SDK 1.3); installer saat ini mensyaratkan minimal versi ini. Pada perbandingan kami di Windows, `0.2.0.0` menghindari penumpukan proses pengecekan update NVIDIA yang berulang seperti pada `0.1.0.1`. Ini adalah hasil dari lingkungan yang diuji, bukan jaminan untuk setiap PC.

Untuk runtime saat ini, gunakan Windows 10/11 x64, GPU NVIDIA RTX yang didukung, dan Python 3.10 atau lebih baru. PyTorch CUDA 13 atau lebih baru direkomendasikan, sesuai dengan [node NVIDIA Comfy Org saat ini](https://github.com/Comfy-Org/ComfyUI_Nvidia_VFX_Nodes#requirements). Driver minimum NVIDIA untuk Windows x64 adalah 570.65 (595 untuk perangkat TCC). Installer memeriksa efek NVIDIA di environment ComfyUI-mu yang sebenarnya dan tidak otomatis mengganti PyTorch atau memperbarui driver; ikuti petunjuknya jika verifikasi gagal. Package NVIDIA menyertakan runtime VFX-nya, jadi kamu tidak memerlukan installer VFX SDK terpisah atau CUDA Toolkit untuk instalasi ini.

Sudah memakai `nvidia-vfx 0.1.x`? Memperbarui DENO Custom Nodes saja tidak memperbarui library NVIDIA opsional ini. Tutup ComfyUI sepenuhnya dan jalankan ulang installer terbaru dari panduan yang sama di atas. Koneksi dan pengaturan workflow yang sudah ada tetap sama, tetapi hasil pemrosesan NVIDIA dapat berbeda setelah upgrade library. Pertahankan environment sebelumnya jika kamu perlu mereproduksi render sebelumnya dengan persis.

Referensi resmi NVIDIA:

- [Filter Video Super Resolution](https://docs.nvidia.com/maxine/vfx/latest/Filters/VideoSuperResolution.html)
- [Python bindings NVIDIA VFX](https://docs.nvidia.com/maxine/vfx-python/latest/index.html)
- [Persyaratan dan riwayat rilis package NVIDIA saat ini](https://pypi.org/project/nvidia-vfx/)
- [Persyaratan VFX SDK Windows saat ini](https://docs.nvidia.com/maxine/vfx/latest/WindowsVFXSDK/GetStartedonWindows.html)
- [API Python VideoSuperRes](https://docs.nvidia.com/maxine/vfx-python/latest/api.html)

Fitur utama:

- memakai jalur package resmi NVIDIA `nvidia-vfx` / `nvvfx.VideoSuperRes`
- tautan dari UI node ke dokumentasi Video Super Resolution resmi NVIDIA
- menampilkan panel RTX ringkas dengan tombol efek, pemilih kualitas terpisah, baris mode-coach, dan hanya kontrol resize yang berlaku untuk efek terpilih
- panel RTX single-pass dan 2-pass meneruskan scroll mouse wheel ke canvas ComfyUI, sehingga zoom canvas normal tetap berfungsi saat penunjuk berada di atas node
- installer menargetkan Python yang dipakai instalasi ComfyUI saat ini
- installer menolak melanjutkan jika ComfyUI masih berjalan dengan Python tersebut
- installer bertanya sebelum menginstal ke Python yang terdeteksi
- installer berhenti jika tidak ada GPU NVIDIA yang terdeteksi kecuali pengguna secara eksplisit menimpa pemeriksaan tersebut
- installer menginstal ulang `nvidia-vfx >= 0.2.0.0` secara bersih saat pengguna mengonfirmasi Python target, termasuk upgrade dari instalasi `0.1.x` yang lebih lama
- installer lebih dulu memverifikasi jalur package `nvvfx` normal yang dipakai Python ComfyUI saat ini
- installer memakai fallback runtime Windows ASCII hanya jika jalur `nvvfx` normal gagal verifikasi
- saat startup, node memilih jalur fallback ASCII yang tercatat hanya jika fallback itu benar-benar terpilih
- jika modul native NVIDIA VFX lain sudah dimuat dari path yang bertentangan, node berhenti dan meminta restart ComfyUI sepenuhnya, bukan mencoba memuat ulang ekstensi native
- installer memverifikasi bahwa efek `VideoSuperRes` NVIDIA benar-benar dapat dibuat setelah instalasi
- jika NVIDIA VFX melaporkan fitur runtime yang tidak didukung, node menampilkan pesan GPU/driver/path runtime yang mudah dibaca, bukan stack trace mentah
- jika DLL NVIDIA Broadcast/NGX VFX dari node RTX lain sudah dimuat, node melaporkan konflik runtime native itu secara terpisah dari dukungan GPU/driver
- jika node RTX lain berbasis Broadcast berfungsi sementara Deno gagal, anggap itu sebagai konflik runtime native, bukan bukti bahwa instalasi Deno rusak
- menyimpan BAT installer dan ZIP di GitHub, bukan di dalam package Manager, sementara UI node menyediakan tombol `How to install` yang membuka halaman instalasi web visual plus helper `Copy steps`
- menyimpan file kecil `tools/OPEN_INSTALL_GUIDE.txt` pada instalasi Manager sehingga folder `tools` tetap ada bagi pengguna yang mengikuti video tutorial lama
- menyediakan empat tombol efek yang jelas: Video SR, High Bitrate, Denoise, dan Deblur
- menampilkan baris mode coach ringkas yang menjelaskan efek terpilih dengan bahasa sederhana
- mempertahankan kualitas Low, Medium, High, dan Ultra sebagai pemilih terpisah
- untuk Video SR dan High Bitrate, mendukung pilihan resize `Scale`, `Keep Ratio`, `Manual`, dan `Preset Ratio`
- `Keep Ratio` dan `Preset Ratio` memakai megapixel target; `Manual` memakai width dan height
- menyediakan alignment `divisible_by` untuk mode yang dapat di-resize, dengan `1` sebagai default sehingga ukuran video standar seperti 1920x1080 tetap persis
- nilai alignment yang lebih tinggi seperti `32` tetap tersedia saat workflow secara khusus memerlukan output kelipatan-N yang dipaksakan
- menampilkan `Center Crop (Fill)` / `Fit (Letterbox/Pillarbox)` saat resize manual, preset-ratio, atau keep-ratio dengan alignment dapat mengubah rasio aspek
- `Denoise` dan `Deblur` mempertahankan ukuran asli dan menyembunyikan kontrol resize, sesuai dengan mode VSR berukuran sama dari NVIDIA
- output Easy Upscale: `images`
- Node hanya menampilkan kontrol. Hubungkan output `images`-nya ke Preview Image atau Image Compare untuk melihat hasil yang diproses.

</details>

#### `(Deno) RTX Video Super Resolution (2 Pass)`

Node finishing RTX dua pass untuk workflow video lengkap. Node ini dapat menjalankan pass `Denoise` atau `Deblur` berukuran sama yang opsional lebih dulu, lalu pass upscale `VSR` atau `High Bitrate` yang opsional.

<img src="images/readme/rtx-2pass.webp" alt="Panel RTX Video Super Resolution 2 Pass dengan satu pass pembersihan dan satu pass upscale" width="632">

Contoh workflow: [workflow upscale RTX 2-pass](workflows/deno-rtx-lowram-metabatch.json)

Fitur utama:

- menyertakan jalur `Low System Memory` dan `High System Memory` dalam workflow contoh
- jalur low-memory memakai VHS Meta Batch sehingga video yang lebih panjang dapat diproses dalam chunk frame yang lebih kecil
- memakai `VHS_VideoInfoSource` untuk membawa FPS sumber ke `VHS_VideoCombine`
- mempertahankan audio sumber melalui jalur VHS load/combine
- berguna saat menyelesaikan output video ter-encode yang sebenarnya, bukan hanya menguji satu batch gambar
- output: `images`

### 05 · Penataan

#### Deno Visual Fold

Deno Visual Fold adalah helper pembersih khusus visual untuk graph ComfyUI yang besar. Fitur ini aktif otomatis saat package Deno Custom Nodes terbaru diinstal atau diperbarui.

<img src="images/readme/visual-fold.webp" alt="Node terpilih dengan badge hijau Fold, dilipat menjadi satu pill Folded · 3" width="880">

Pilih dua node atau lebih dan toolbar pemilihan ComfyUI native menampilkan badge hijau `Fold` yang mudah dibaca. Klik untuk melipat node terpilih menjadi satu group visual ringkas; gunakan `Unfold` untuk memulihkannya.

Kamu juga dapat memilih satu group ComfyUI biasa dan menggunakan `Fold Group` untuk melipat node di dalam group itu tanpa menyentuh logika workflow. Saat dua group atau lebih dipilih, toolbar yang sama menambahkan badge `Align` yang mudah dibaca untuk alignment kiri/kanan/atas/bawah serta jarak horizontal/vertikal.

Ini berbeda dari Subgraph ComfyUI. Subgraph memindahkan node ke child graph, yang bisa sangat berguna, tetapi mungkin kurang ideal saat workflow bergantung pada node `Get` / `Set` atau struktur parent-child graph yang tetap terlihat di graph utama. Visual Fold hanya ditujukan untuk perapian visual yang sederhana. Fitur ini tidak mengubah node terpilih menjadi subgraph atau mengubah logika workflow.

#### Deno Floating Tools

Deno Floating Tools adalah helper opsional di `Settings > DENO > Tools`. Fitur ini nonaktif secara default.

Saat diaktifkan, sebuah ikon Deno kecil yang bisa diseret muncul di layar ComfyUI. Panelnya dapat membebaskan VRAM ComfyUI melalui endpoint pembersihan memori bawaan ComfyUI, menampilkan status read-only versi saat ini/terbaru untuk rilis inti ComfyUI Stable, serta membuka laporan Error Help saat sebuah eksekusi gagal.

Error Help membuat laporan siap-GPT/Gemini yang berisi workflow saat ini, executable dan jenis environment Python, versi package, detail GPU, konteks traceback/log terbaru, dan ringkasan custom node. Fitur ini read-only, membuka jendela laporan terlebih dahulu, dan hanya menyalin saat kamu mengklik `Copy Report`. Rahasia umum seperti token, cookie, password, private key, dan kredensial URL disamarkan sebelum disalin.

Floating Tools tidak menginstal, meng-update, me-restart, memperbaiki, atau mengubah workflow. Fitur ini hanya mengaitkan fungsi request ComfyUI selama alat tersebut diaktifkan.

#### Node info button

Sebagian besar node Deno memiliki tombol hijau kecil `i` di pojok kanan atas. Klik untuk melihat tujuan node, pengaturan utama, dan catatan rilis terkini tanpa meninggalkan canvas. Jika versi Deno Custom Nodes yang lebih baru tersedia, tombol berubah menjadi kuning dan menampilkan badge `!` kecil.

<img src="images/readme/node-help.webp" alt="Popup info node untuk Resize Box dengan versi dan catatan rilis" width="720">

## Keamanan dan Privasi

Deno Custom Nodes menjaga penanganan file, jaringan, dan rahasia tetap sempit secara default.

- **File:** loader gambar hanya membaca folder `input` ComfyUI. Upload gambar eksternal sebelum membuka kembali workflow yang memakai path atau URL eksternal. Save Image milik Ideogram Director hanya menyalin file gambar.
- **Local LLM:** server secara default adalah localhost. Server LAN privat hanya berfungsi melalui allowlist `DENO_LOCAL_LLM_ALLOWED_HOSTS` yang tepat, dan API key dibaca dari environment host ComfyUI, tidak pernah disimpan di workflow atau metadata PNG.
- **Terjemahan:** terjemahan Ideogram hanya memakai layanan bawaan Google, MyMemory, dan LibreTranslate.
- **Tautan model:** Easy Model Download Helper membuka tautan web resmi di browser-mu dan tidak pernah mengunduh file lewat Python.
- **Laporan:** Error Help bersifat read-only, menampilkan laporan sebelum disalin, dan menyamarkan rahasia umum seperti token, cookie, password, dan private key.

Lihat [akses file dan terjemahan](SECURITY_CONFIGURATION.md) untuk aturan yang tepat.

## Mengapa Ini Dibuat

Node ini dibuat untuk mengurangi gesekan setup yang berulang dalam pekerjaan produksi ComfyUI yang nyata. Tujuannya bukan mengejar daftar fitur yang besar, tetapi membuat workflow yang diulang orang setiap hari terasa lebih cepat, lebih rapi, dan lebih mudah diajarkan.

## Tips Pencarian

- Di ComfyUI Manager atau Registry, cari `Deno Custom Nodes`.
- Di canvas, cari `(Deno)` atau nama node, seperti `Resize Box`.
- Gunakan [Peta Workflow](#peta-workflow) untuk menemukan alat beserta persyaratannya.

## Instalasi

Untuk instalasi Manager yang direkomendasikan, ikuti [Mulai Cepat](#mulai-cepat).

<details>
<summary>Instalasi dan pembaruan manual</summary>

Untuk instalasi manual, clone di dalam folder `custom_nodes` lalu instal dependency dengan executable Python yang sama dengan yang menjalankan ComfyUI:

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
cd comfyui-deno-custom-nodes
python -m pip install -r requirements.txt
```

Untuk update manual, jalankan `git pull --ff-only`, instal ulang `requirements.txt` dengan Python yang sama, lalu restart ComfyUI. Instalasi Manager/Registry menangani dependency package secara otomatis.

</details>

## Lisensi

Node, dokumen, contoh, workflow, dan aset lokal proyek milik Deno di repo ini dirilis di bawah GNU GPL v3.0 (`GPL-3.0-only`). Kamu dapat menggunakan, mempelajari, memodifikasi, dan mendistribusikan ulang semuanya, termasuk secara komersial, berdasarkan [ketentuan GPL-3.0](../LICENSE). Versi modifikasi yang didistribusikan harus mengikuti GPL-3.0 dan mempertahankan pemberitahuan lisensi serta hak cipta yang diperlukan.

Model, checkpoint, LoRA, library, tool, dan layanan pihak ketiga tetap mengikuti lisensi dan ketentuannya masing-masing. Periksa lisensi yang berlaku sebelum menggunakan, membagikan, atau menjual output dari model atau aset tertentu.

## Catatan Rilis

Lihat [rilis terbaru](https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/latest) dan [CHANGELOG.md](../CHANGELOG.md) untuk pembaruan.

## Tautan

- YouTube: https://www.youtube.com/@Denoise-AI
- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
