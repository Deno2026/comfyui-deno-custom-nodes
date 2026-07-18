# Deno Custom Nodes

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md) | [Português](README.pt-PT.md) | [Português (Brasil)](README.pt-BR.md) | [Bahasa Indonesia](README.id.md)

[YouTube Channel](https://www.youtube.com/@Denoise-AI)

![Deno Custom Nodes banner](images/deno-custom-nodes-banner.jpg)

Kamu dapat menggunakan, mempelajari, memodifikasi, dan mendistribusikan ulang repo ini di bawah GPL-3.0.

Node, dokumen, contoh, workflow, dan aset proyek milik DENO di repo ini dirilis dengan GNU GPL v3.0 (`GPL-3.0-only`). Penggunaan komersial diizinkan, tetapi versi modifikasi yang kamu distribusikan harus mengikuti GPL-3.0 dan mempertahankan pemberitahuan lisensi serta hak cipta yang diperlukan.

Model, checkpoint, LoRA, library, tool, dan layanan pihak ketiga tetap mengikuti lisensi dan ketentuannya masing-masing. Jika sebuah workflow memakai model atau aset tertentu, periksa dan ikuti lisensi tersebut sebelum membagikan atau menjual output.

Deno Custom Nodes adalah kumpulan custom node untuk ComfyUI yang membantu workflow nyata untuk gambar, video, LTX, RTX, dan persiapan model terasa lebih cepat, jelas, dan nyaman dipakai setiap hari.

Sebagian besar node Deno memiliki tombol hijau kecil `i` untuk membuka bantuan cepat tanpa meninggalkan canvas ComfyUI. Jika versi Deno Custom Nodes yang lebih baru tersedia, tombol berubah menjadi kuning dan menampilkan badge `!` kecil.

## Release Notes

Catatan pembaruan publik disimpan secara ringkas di [CHANGELOG.md](../CHANGELOG.md).

## Web Tools

Alat berikut bisa dibuka langsung di browser.

- [DENO Video Compare](https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/) - membandingkan dua video render dengan slider, side-by-side, difference, dan toggle.
- [DENO Video to GIF/WebP](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/) - memotong, crop, resize, lalu mengekspor klip pendek sebagai GIF atau WebP kecil.
- [DENO 디스코드용 영상 / 이미지 압축](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-discord/) - 영상이나 이미지를 줄여 가능하면 10MB 이하 디스코드용 파일로 저장합니다.

## DENO Visual Fold

![DENO Visual Fold](images/deno-visual-fold.webp)

DENO Visual Fold adalah alat visual untuk merapikan graph ComfyUI yang besar. Melipat node atau group tidak mengubah logika workflow.

Saat memilih dua node atau lebih, tombol hijau `Fold` muncul di dekat kanan atas canvas. Klik tombol itu untuk melipat node terpilih menjadi satu group visual yang ringkas, lalu gunakan `Unfold` untuk membukanya kembali. Jika memilih satu group ComfyUI biasa, `Fold Group` melipat node di dalam group tersebut; jika memilih beberapa group, aksi align juga muncul.

Berbeda dari Subgraph, Visual Fold tidak memindahkan node ke child graph. Ini hanya untuk kerapian visual, berguna saat node `Get` / `Set` atau struktur parent-child tetap ingin terlihat di graph utama.

## Included Nodes

### `(Deno) Ideogram Director`

Visual Ideogram 4 prompt builder for structured JSON captions and bbox layout work.

![Deno Ideogram Director](images/ideogram-director.png)

Main features: draw and edit bbox regions, import JSON prompts from Local LLM Loader or another STRING source, ask before replacing an existing board, reject malformed JSON clearly, use style/layout preset galleries, and use Language view to read/edit board descriptions in your language while final output stays model-ready English and literal TEXT box words stay exact.

### `(Deno) Resize Box`

Node pembantu resolusi dan resize gambar untuk ComfyUI.

![Deno Resize Box](images/resize-box.jpg)

Fitur utama: preset rasio, input manual, kalkulasi megapixel, alignment `divisible_by`, mode Center Crop dan Fit, preview rasio di dalam node, output `image`, `width`, `height`.

### `(Deno) Multi Image Loader`

Loader beberapa gambar untuk workflow batch guide.

![Deno Multi Image Loader](images/multi-image-loader.jpg)

Fitur utama: galeri tinggi tetap, drag reorder, upload, drag-and-drop, paste gambar, browser folder `input`, dukungan nested folder, sorting terbaru, resize Keep Ratio/Preset/Manual, output `multi_output`, `width`, `height`.

### `(Deno) Advanced Image Source Loader`

Loader sumber gambar lanjutan untuk folder eksternal, path lokal, URL gambar web, dan daftar gambar dengan ukuran campuran.

![Deno Advanced Image Source Loader](images/advanced-image-source-loader.png)

Fitur utama: dukungan folder `input` dan folder lokal eksternal, input URL/Path, upload dan paste, enable/disable thumbnail, drag reorder, galeri masonry, recursive folder, output batch tensor dan `image_list`.

### `(Deno) Image Compare`

Node A/B compare untuk membandingkan dua gambar langsung di canvas ComfyUI.

![Deno Image Compare](images/image-compare.jpg)

Fitur utama: membandingkan `image_a` dan `image_b`, mode Slider/Side by Side/Difference/Toggle, slider hover, label A/B, tombol Swap, preview internal yang mengikuti ukuran node.

### `(Deno) Video Compare`

Node A/B compare untuk mengecek hasil upscale dan interpolasi FPS langsung di canvas ComfyUI.

Fitur utama: `video_a`, `video_b`, audio opsional, mode Slider/Side by Side/Difference/Toggle, play/pause, scrub, frame step, speed, loop, output badges opsional, dan output gambar `comparison`.

Jika node terasa berat, gunakan alat web: https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/

![Deno Video Compare - Slider](images/video-compare.png)

![Deno Video Compare - Side by Side](images/video-compare-sbs.png)

![Deno Video Compare - Difference](images/video-compare-diff.png)

### `(Deno) Video Preview`

Preview video resolusi penuh untuk mengecek output encoded sungguhan di titik mana pun dalam graph.

![Deno Video Preview](images/video-preview.jpg)

Fitur utama: input IMAGE batch dan output pass-through, audio opsional, hover untuk mendengar audio, klik untuk play/pause, tombol Full screen, badge resolusi/FPS/frame/durasi, dan petunjuk jelas jika PyAV belum terpasang.

### `(Deno) RTX Video Super Resolution`

Node opsional untuk Windows/NVIDIA RTX agar pengguna bisa mencoba NVIDIA RTX Video Super Resolution di dalam ComfyUI.

![Deno RTX Video Super Resolution](images/rtx-vfx-easy-upscale-node.png)

Alur pemula: instal atau update `deno-custom-nodes`, jalankan ComfyUI, tambahkan node lalu jalankan sekali. Jika NVIDIA VFX belum ada, tutup ComfyUI sepenuhnya, buka `How to install`, ikuti panduan, pastikan path BAT berada di ComfyUI yang benar, lalu restart ComfyUI setelah selesai.

Link resmi NVIDIA: [NVIDIA Maxine Windows Getting Started](https://docs.nvidia.com/deeplearning/maxine/vfx-sdk-programming-guide/index.html), [RTX Video FAQ](https://nvidia.custhelp.com/app/answers/detail/a_id/5448/~/rtx-video-faq).

### `(Deno) RTX Video Super Resolution (2 Pass)`

Node RTX dua pass untuk finishing video. Node ini bisa menjalankan `Denoise` atau `Deblur` pada ukuran yang sama terlebih dahulu, lalu menjalankan upscale `VSR` atau `High Bitrate`.

Contoh workflow: [RTX 2-pass upscale workflow](workflows/deno-rtx-lowram-metabatch.json)

Fitur utama: jalur Low System Memory dan High System Memory, proses chunk dengan VHS Meta Batch, mempertahankan FPS dan audio sumber, cocok untuk output video encoded nyata.

### `(Deno) LTX Sequencer`

Guide sequencer untuk workflow LTX multi-gambar.

![Deno LTX Sequencer](images/ltx-sequencer.jpg)

Fitur utama: bekerja dengan output batch dari `(Deno) Multi Image Loader`, bisa mengisi `num_images`, mempertahankan alur sync, memungkinkan kontrol manual strength saat perlu, dan menyediakan bypass untuk A/B cepat.

### `(Deno) LTX Model Loader`

Loader ringkas untuk pola loading model LTX 2.3 yang umum.

![Deno LTX Model Loader](images/ltx-model-loader.jpg)

Fitur utama: Checkpoint Style, KJ Style, GGUF Style, output `model`, `clip`, `video_vae`, `audio_vae`, kompatibel dengan loader ComfyUI, KJNodes, dan ComfyUI-GGUF.

### `(Deno) LTX Tiled Spatial Upscaler`

Helper untuk second pass video latent LTX resolusi tinggi. Node ini membagi video latent menjadi spatial tile yang saling overlap, menjalankan upscaler per tile, lalu menggabungkannya kembali menjadi satu latent.

Gunakan untuk latent LTX khusus video. Jika workflow membawa latent video/audio gabungan, pisahkan jalur audio lebih dulu dan gabungkan lagi setelah tiled video pass.

### `(Deno) LTX High resolution Tiled Sampler`

Sampler untuk refinement LTX AV. Sampler mempertahankan satu global sampler trajectory, sementara prediksi video dihitung lewat spatial tile yang overlap dan digabungkan sebelum update sampler.

Audio lengkap diberikan ke setiap video tile sebagai konteks, sementara latent audio yang dikembalikan tetap tidak berubah dalam mode `freeze`.

### `(Deno) Easy Model Download Helper`

Helper setup berbasis preset untuk kumpulan file model yang direkomendasikan.

![Deno Easy Model Download Helper](images/easy-model-download-helper.png)

Fitur utama: membuka link model resmi di browser, bukan mengunduh lewat Python; menampilkan root folder model ComfyUI; menyimpan creator preset di workflow; mendukung Hugging Face dan Civitai; memeriksa apakah file sudah berada di folder yang benar.

![Hugging Face link guide](images/easy-model-download-helper-huggingface-link.png)

![Civitai page URL guide](images/easy-model-download-helper-civitai-link.png)

![Civitai preset editor guide](images/easy-model-download-helper-civitai-node.png)

### `(Deno) LTX Multi LoRA Loader`

Loader multi LoRA gaya Power-LoRA untuk workflow LTX.

![Deno LTX Multi LoRA Loader](images/ltx-multi-lora-loader.png)

Fitur utama: banyak LoRA dalam satu node, enable per slot, strength/video/audio strength, trigger word dan catatan LoRA, copy trigger word, output `model` dan `clip` yang sudah dipatch.

### `(Deno) LTX Prompt Guide`

Helper prompt yang menggabungkan prompt encoding LTX, negative prompt opsional, LTX conditioning, dan perencanaan durasi dialog.

![Deno LTX Prompt Guide](images/ltx-prompt-guide.png)

Fitur utama: positive prompt encoding, negative prompt yang bisa dilipat, LTX conditioning dengan `frame_rate`, estimasi durasi dari dialog di dalam tanda kutip, dukungan Auto/Korean/English/Japanese/Chinese.

### `(Deno) Bernini Prompt Guide`

Helper prompt untuk prefix KJ-style Bernini. Node ini menggabungkan positive dan negative prompt encoding dalam satu node yang lebih mudah untuk pemula, lalu menampilkan system prompt aktif sesuai mode `System Prompt` yang dipilih.

![Deno Bernini Prompt Guide](images/bernini-prompt-guide.jpg)

Fitur utama: pilihan `System Prompt` yang mudah dibaca seperti `Text to Video`, `Image to Video`, dan `Reference Video Edit`, hint nama `image0` / `image1` otomatis untuk mode reference, negative prompt yang bisa dilipat, autofill preset negative Official Wan2.2, dan output `positive` / `negative`.

Negative preset bukan mode output. Preset itu hanya mengisi kotak negative prompt; setelah itu kamu bisa mengedit kotak tersebut langsung, dan teks terakhir akan dipakai sebagai negative conditioning.

Tulis prompt seperti memberi instruksi ke chatbot, bukan hanya daftar tag. Contoh: `Replace the jacket with the shirt from image0. Keep the camera motion, background, lighting, and shadows unchanged.`

Catatan: node ini hanya menyiapkan text conditioning. Bernini visual conditioning masih membutuhkan backend ComfyUI/KJ yang mendukung Bernini context latents.
Selama dukungan itu masih berupa draft PR ComfyUI, gunakan `tools/DENO_Bernini_Preview_Backend_Update.bat` hanya di folder portable ComfyUI salinan untuk testing.

## Why This Exists

Node ini dibuat untuk mengurangi gesekan setup yang berulang dalam pekerjaan ComfyUI nyata. Tujuannya bukan mengejar daftar fitur besar, tetapi membuat workflow harian lebih cepat, rapi, dan mudah diajarkan.

## Search Tips

Kata kunci yang berguna: `deno custom nodes`, `ideogram`, `ideogram 4`, `ideogram director`, `json prompt`, `bbox`, `bounding boxes`, `layout prompt`, `rtx video super resolution`, `nvidia vfx`, `image compare`, `video compare`, `video preview`, `video to gif`, `gif webp`, `ltx 2.3`, `ltx model loader`, `ltx tiled`, `ltx tiled sampler`, `ltx spatial upscaler`, `ltx multi lora`, `prompt guide`, `system prompt`, `local llm loader`, `local llm prompt`, `local llm reviewer`, `prompt only`, `final prompt`, `bernini`, `bernini prompt guide`, `reference video edit`, `wan2.2`, `visual fold`, `floating tools`, `free vram`, `comfyui stable`, `stable update check`, `error help`, `comfyui error help`, `sos report`, `gpt gemini report`, `workflow diagnostics`.

## Install

Clone di dalam folder `custom_nodes` ComfyUI:

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
```

Lalu restart ComfyUI.

## Links

- YouTube: https://www.youtube.com/@Denoise-AI
- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
