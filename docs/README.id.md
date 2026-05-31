# Deno Custom Nodes

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md) | [Português](README.pt-PT.md) | [Português (Brasil)](README.pt-BR.md) | [Bahasa Indonesia](README.id.md)

Deno Custom Nodes adalah kumpulan custom node untuk ComfyUI yang membantu workflow gambar, video, LTX, RTX, dan persiapan model terasa lebih cepat, rapi, dan mudah dipakai.

Halaman ini adalah panduan cepat dalam Bahasa Indonesia. Detail lengkap setiap node tetap menggunakan [README](../README.md) berbahasa Inggris sebagai sumber utama.

![DENO Visual Fold](images/deno-visual-fold.webp)

## Link Cepat

- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- ComfyUI Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
- YouTube: https://www.youtube.com/@Denoise-AI
- Video Compare: https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/
- Video to GIF/WebP: https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/
- Panduan instalasi RTX VFX: https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/

## Instalasi

Cara paling mudah adalah memasang `deno-custom-nodes` lewat ComfyUI Manager atau Registry.

Untuk instalasi manual, jalankan perintah ini di dalam folder `custom_nodes` ComfyUI, lalu restart ComfyUI.

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
```

## Fitur Utama

- DENO Visual Fold: melipat beberapa node atau group secara visual tanpa mengubah logika workflow.
- Video Compare Web Tool: membandingkan dua video di browser dengan slider, side-by-side, dan difference.
- Video to GIF/WebP Web Tool: memotong klip pendek dan mengekspor GIF atau WebP yang lebih kecil.
- RTX Video Super Resolution Node: membantu mencoba NVIDIA RTX VFX di dalam ComfyUI.
- LTX Tools: merapikan pemuatan model LTX 2.3, sequence, LoRA, dan alur prompt.
- Image Loader and Compare Nodes: memuat banyak gambar, resize, dan membandingkan hasil langsung di canvas.

## Ringkasan Node

- `(Deno) Resize Box`: mengatur resolusi, rasio, megapixel, dan mode crop/fit.
- `(Deno) Multi Image Loader`: memuat banyak gambar lewat upload, paste, dan folder browser.
- `(Deno) Advanced Image Source Loader`: memakai folder eksternal, path lokal, URL gambar web, dan daftar gambar dengan ukuran berbeda.
- `(Deno) Image Compare`: membandingkan dua gambar langsung di canvas ComfyUI.
- `(Deno) Video Compare`: membandingkan dua batch video per frame dan menghasilkan output gambar perbandingan.
- `(Deno) Video Preview`: melihat preview video antara dalam kondisi encoded yang sebenarnya.
- `(Deno) RTX Video Super Resolution`: menjalankan upscale NVIDIA VFX dengan lebih sederhana.
- `(Deno) RTX Video Super Resolution (2 Pass)`: memisahkan Denoise/Deblur dan upscale menjadi dua pass.
- `(Deno) LTX Sequencer`: merapikan alur strength untuk workflow LTX multi-gambar.
- `(Deno) LTX Model Loader`: menyatukan pola pemuatan Checkpoint, KJ, dan GGUF untuk LTX 2.3.
- `(Deno) Easy Model Download Helper`: membantu memasang file model rekomendasi dengan link dan folder tujuan yang jelas.
- `(Deno) LTX Multi LoRA Loader`: mengelola beberapa LoRA LTX dan trigger word dalam satu node.
- `(Deno) LTX Prompt Guide`: merapikan prompt LTX, negative prompt, dan estimasi durasi dialog.

## Untuk Pemula

- Jika ada masalah, bagikan pesan error dan screenshot layar ComfyUI.
- Sembunyikan token, password, dan kode verifikasi sebelum membagikan screenshot.
- Untuk masalah RTX VFX, tutup ComfyUI sepenuhnya lalu ikuti panduan instalasi langkah demi langkah.
- Lihat [README](../README.md) berbahasa Inggris untuk semua opsi dan screenshot node.
