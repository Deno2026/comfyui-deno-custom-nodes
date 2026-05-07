from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape


OUT_DIR = Path(__file__).resolve().parent / "images"


BG = "#171717"
NODE = "#303030"
NODE_HEAD = "#393939"
PANEL = "#020704"
GREEN = "#28d978"
GREEN_DARK = "#0f7d3e"
GREEN_SOFT = "#93ffb8"
TEXT = "#f5f5f5"
MUTED = "#a7aaa8"
LINE = "#5c6260"


def t(value: object) -> str:
    return escape(str(value), {'"': "&quot;"})


def rect(x, y, w, h, fill, stroke=None, rx=8, sw=1, extra=""):
    stroke_attr = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{stroke_attr} {extra}/>'


def text(x, y, body, size=14, color=TEXT, weight=500, anchor="start"):
    return (
        f'<text x="{x}" y="{y}" fill="{color}" font-family="Arial, sans-serif" '
        f'font-size="{size}" font-weight="{weight}" text-anchor="{anchor}">{t(body)}</text>'
    )


def circle(x, y, r, fill):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>'


def pill(x, y, w, h, body, fill="#13251a", stroke="#50755c", color="#ecfff1", size=12):
    return rect(x, y, w, h, fill, stroke, rx=h // 2) + text(x + w / 2, y + h / 2 + size / 2 - 3, body, size, color, 800, "middle")


def port(x, y, color):
    return circle(x, y, 5, color)


def widget(x, y, w, label, value, faded=False):
    color = "#d8d8d8" if not faded else "#777"
    val_color = "#f6f6f6" if not faded else "#777"
    return (
        rect(x, y, w, 23, "#252525", "#777", rx=11)
        + text(x + 18, y + 16, label, 12, color, 500)
        + text(x + w - 18, y + 16, value, 12, val_color, 700, "end")
        + text(x + 7, y + 16, "◀", 10, color, 700)
        + text(x + w - 7, y + 16, "▶", 10, color, 700, "end")
    )


def button(x, y, w, label, primary=False):
    fill = GREEN_DARK if primary else "#15231a"
    stroke = "#55ef8f" if primary else "#5e7767"
    return pill(x, y, w, 34, label, fill, stroke, "#ecfff1", 13)


def tag(x, y, label):
    return rect(x, y, 176, 28, "#103916", None, rx=6) + text(x + 88, y + 20, label, 17, "#d8ffe1", 700, "middle")


def frame(width, height, title, body):
    grid = []
    for y in range(36, height, 36):
        grid.append(f'<path d="M0 {y}h{width}" />')
    for x in range(36, width, 36):
        grid.append(f'<path d="M{x} 0v{height}" />')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <defs>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#20c86c"/>
      <stop offset="1" stop-color="#8effb2"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.45"/>
    </filter>
  </defs>
  {rect(0, 0, width, height, BG, None, rx=0)}
  <g opacity="0.18" stroke="#333" stroke-width="1">{"".join(grid)}</g>
  {body}
</svg>
'''


def node(x, y, w, h, title, subtitle="deno-custom-nodes"):
    return (
        rect(x, y, w, h, NODE, "#a6a6a6", rx=14, sw=2, extra='filter="url(#shadow)"')
        + rect(x + 6, y + 6, w - 12, 44, NODE_HEAD, None, rx=10)
        + circle(x + 22, y + 28, 6, "#777")
        + text(x + 44, y + 34, title, 20, TEXT, 700)
        + tag(x + w - 205, y - 28, subtitle)
    )


def section_label(x, y, body):
    return text(x, y, body, 13, GREEN_SOFT, 800)


def callout(x, y, body, w=250):
    return rect(x, y, w, 52, "#07120b", GREEN_DARK, rx=10) + text(x + 14, y + 23, body, 13, GREEN_SOFT, 800)


def write_svg(name, width, height, body):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / name).write_text(frame(width, height, name, body), encoding="utf-8")


def resize_box_overview():
    x, y, w, h = 110, 80, 420, 530
    body = node(x, y, w, h, "(Deno) Resize Box")
    body += port(x + 18, y + 90, "#66c2ff") + text(x + 36, y + 94, "image", 15, MUTED, 600)
    for i, out in enumerate(["image", "width", "height"]):
        body += text(x + w - 34, y + 92 + i * 24, out, 15, MUTED, 600, "end") + port(x + w - 16, y + 88 + i * 24, "#9aa0b5" if i else "#66c2ff")
    widgets = [
        ("mode", "Keep Input Ratio"),
        ("megapixels", "2.10"),
        ("divisible_by", "32"),
        ("resize_method", "Center Crop (Fill)"),
        ("interpolation", "lanczos"),
    ]
    for i, (label, value) in enumerate(widgets):
        body += widget(x + 28, y + 160 + i * 31, w - 56, label, value)
    body += rect(x + 28, y + 335, w - 56, 140, "#030806", GREEN_DARK, rx=10)
    body += rect(x + 78, y + 370, w - 156, 75, "#082414", "#55ef8f", rx=8, sw=2)
    body += f'<path d="M{x+210} {y+370}v75M{x+78} {y+407}h264" stroke="#2e925b" stroke-width="2"/>'
    body += text(x + 44, y + 505, "1920 x 1088 | 16:9 | 2.09 MP | divisible by 32", 13, TEXT, 800)
    body += callout(560, 175, "Resize or create a blank image size.")
    body += callout(560, 245, "Preview updates while ratio or size changes.")
    return body


def resize_box_modes():
    x, y, w, h = 70, 70, 560, 390
    body = node(x, y, w, h, "Resize Box sizing modes")
    modes = [
        ("Keep Input Ratio", "Read the input image ratio, then resize by target megapixels."),
        ("Preset Ratio", "Pick 1:1, 3:4, 16:9, 9:16, 21:9, and other common ratios."),
        ("Manual Input", "Type width and height directly, then align to divisible_by."),
    ]
    for i, (name, desc) in enumerate(modes):
        yy = y + 90 + i * 82
        body += rect(x + 32, yy, w - 64, 58, "#0d1711", "#1d3c29", rx=9)
        body += text(x + 52, yy + 24, name, 15, GREEN_SOFT, 800)
        body += text(x + 52, yy + 44, desc, 12, "#cfead7", 500)
    return body


def multi_image_overview():
    x, y, w, h = 70, 60, 560, 610
    body = node(x, y, w, h, "(Deno) Multi Image Loader")
    body += text(x + w - 44, y + 88, "multi_output", 15, MUTED, 600, "end") + port(x + w - 18, y + 84, "#66c2ff")
    widgets = [
        ("mode", "Keep Input Ratio"),
        ("megapixels", "1.00"),
        ("divisible_by", "32"),
        ("interpolation", "lanczos"),
        ("resize_method", "Center Crop (Fill)"),
    ]
    for i, (label, value) in enumerate(widgets):
        body += widget(x + 28, y + 118 + i * 31, w - 56, label, value)
    panel_y = y + 300
    body += rect(x + 24, panel_y, w - 48, 260, "#020704", GREEN_DARK, rx=11)
    body += button(x + 40, panel_y + 18, 78, "Upload", True)
    body += button(x + 128, panel_y + 18, 112, "Input Folder", False)
    body += button(x + 250, panel_y + 18, 76, "Clear", False)
    body += text(x + w - 70, panel_y + 40, "6 images", 14, "#9cffbd", 800, "end")
    body += text(x + 40, panel_y + 78, "Drag files, press Ctrl+V, use Upload, or add existing input-folder images.", 12, "#9ee3b1", 500)
    card_w, card_h = 98, 78
    for i in range(6):
        cx = x + 44 + (i % 3) * 160
        cy = panel_y + 100 + (i // 3) * 88
        fill = ["#b8c6bd", "#c9a27b", "#4d697e", "#9dbea9", "#47515e", "#d7b899"][i]
        body += rect(cx, cy, card_w, card_h, fill, "#56d886", rx=8, sw=1)
        body += rect(cx, cy + card_h - 20, card_w, 20, "#06100a", None, rx=0)
        body += text(cx + 8, cy + card_h - 6, str(i + 1), 11, TEXT, 800)
        body += circle(cx + card_w - 12, cy + 14, 11, "#050807") + text(cx + card_w - 12, cy + 18, "x", 10, TEXT, 800, "middle")
    return body


def multi_input_folder():
    body = rect(40, 40, 680, 560, "#020704", GREEN_DARK, rx=16, sw=2)
    body += text(62, 76, "Add images from ComfyUI input folder", 20, GREEN_SOFT, 800)
    body += button(628, 55, 70, "Close", False)
    body += rect(62, 100, 636, 36, "#06100a", "#185c33", rx=9)
    body += text(78, 123, "Search input images...", 13, "#6f8d78", 500)
    body += text(62, 164, "Newest files appear first. Only visible thumbnails are rendered.", 13, "#9ee3b1", 700)
    card_w, card_h = 118, 118
    for i in range(15):
        cx = 62 + (i % 5) * 128
        cy = 185 + (i // 5) * 138
        fill = ["#d9d9d9", "#b27b54", "#6083a0", "#b5c4cf", "#2d3542", "#7aa68e", "#617aa0", "#20262e", "#d6c0aa", "#b98f9d", "#ededed", "#b6806c", "#485563", "#d9c5a5", "#b7c7d9"][i]
        body += rect(cx, cy, card_w, card_h, fill, "#237a44", rx=8)
        body += rect(cx, cy + 88, card_w, 30, "#06100a", None, rx=0)
        body += text(cx + 8, cy + 108, f"%view%_{i+1:05d}.png", 10, TEXT, 700)
    body += button(62, 540, 110, "Add Selected", True)
    body += text(186, 562, "0 selected", 13, GREEN_SOFT, 800)
    return body


def ltx_sequencer_overview():
    x, y, w, h = 150, 50, 370, 640
    body = node(x, y, w, h, "(Deno) LTX Sequencer")
    for i, inp in enumerate(["positive", "negative", "vae", "latent", "multi_input"]):
        body += port(x + 18, y + 86 + i * 24, ["#ffa726", "#ffa726", "#ff7581", "#f38bff", "#66c2ff"][i])
        body += text(x + 36, y + 91 + i * 24, inp, 15, MUTED, 600)
    for i, out in enumerate(["positive", "negative", "latent"]):
        body += text(x + w - 34, y + 91 + i * 24, out, 15, MUTED, 600, "end")
        body += port(x + w - 16, y + 86 + i * 24, ["#ffa726", "#ffa726", "#f38bff"][i])
    for i, (label, value) in enumerate([("num_images", "3"), ("insert_mode", "frames"), ("frame_rate", "24"), ("strength_sync", "true"), ("bypass", "false")]):
        body += widget(x + 34, y + 192 + i * 31, w - 68, label, value)
    for i in range(3):
        yy = y + 375 + i * 86
        body += text(x + 34, yy, f"Image #{i+1}", 15, TEXT, 800)
        body += widget(x + 52, yy + 20, w - 104, f"insert_frame_{i+1}", "0")
        body += widget(x + 52, yy + 50, w - 104, f"strength_{i+1}", "1.00")
    return body


def ltx_sequencer_sync():
    x, y, w, h = 60, 80, 600, 360
    body = node(x, y, w, h, "Sequencer sync and bypass")
    rows = [
        ("Connected loader changes image count", "num_images and parameter rows follow the batch size."),
        ("strength_sync = true", "Sequencer nodes share strength values for matching image slots."),
        ("strength_sync = false", "Only that node keeps independent strength values."),
        ("bypass = true", "positive, negative, and latent pass through unchanged."),
    ]
    for i, (a, b) in enumerate(rows):
        yy = y + 92 + i * 58
        body += rect(x + 30, yy, w - 60, 42, "#0d1711", "#1d3c29", rx=8)
        body += text(x + 46, yy + 18, a, 14, GREEN_SOFT, 800)
        body += text(x + 260, yy + 18, b, 12, "#cfead7", 500)
    return body


def ltx_model_loader_modes():
    x, y, w, h = 60, 70, 600, 430
    body = node(x, y, w, h, "(Deno) LTX Model Loader")
    for i, mode in enumerate(["Checkpoint", "KJ Style", "GGUF Style"]):
        body += pill(x + 34 + i * 180, y + 100, 150, 34, mode, GREEN_DARK if i == 2 else "#182129", "#55ef8f" if i == 2 else "#637780")
    fields = [
        ("gguf_unet", "LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf"),
        ("video_vae", "LTX23_video_vae_bf16.safetensors"),
        ("audio_vae", "LTX23_audio_vae_bf16.safetensors"),
        ("text_encoder", "gemma_3_12B_it_fp4_mixed.safetensors"),
        ("text_projection", "ltx-2.3_text_projection_bf16.safetensors"),
        ("clip_device", "default"),
    ]
    for i, (label, value) in enumerate(fields):
        body += widget(x + 34, y + 155 + i * 31, w - 68, label, value)
    for i, out in enumerate(["model", "clip", "video_vae", "audio_vae"]):
        body += text(x + w - 34, y + 80 + i * 25, out, 15, MUTED, 600, "end")
        body += port(x + w - 16, y + 75 + i * 25, ["#c38cff", "#ffd600", "#ff7581", "#ff7581"][i])
    return body


def ltx_model_loader_deps():
    body = rect(60, 60, 600, 390, "#020704", GREEN_DARK, rx=16, sw=2)
    body += text(86, 100, "Dependency-aware LTX loading", 22, GREEN_SOFT, 800)
    rows = [
        ("Checkpoint Style", "ComfyUI checkpoint + LTX audio text/audio VAE loaders"),
        ("KJ Style", "ComfyUI diffusion model + DualCLIP + KJ video/audio VAE"),
        ("GGUF Style", "ComfyUI-GGUF UNet + DualCLIP + KJ video/audio VAE"),
        ("Safety", "Clear messages when KJNodes, GGUF, or ComfyUI core is outdated"),
    ]
    for i, (left, right) in enumerate(rows):
        yy = 135 + i * 65
        body += rect(86, yy, 548, 48, "#0d1711", "#1d3c29", rx=9)
        body += text(104, yy + 28, left, 15, TEXT, 800)
        body += text(250, yy + 28, right, 12, "#cfead7", 600)
    return body


def easy_downloader_overview():
    x, y, w, h = 35, 35, 620, 650
    body = node(x, y, w, h, "(Deno) Easy Model Download Helper")
    body += rect(x + 24, y + 86, w - 48, 532, "#020704", GREEN_DARK, rx=11)
    body += text(x + 38, y + 120, "Easy Model Download Helper", 18, GREEN_SOFT, 800)
    body += button(x + 412, y + 103, 94, "+ Add Preset", False)
    body += button(x + 516, y + 103, 84, "Edit Preset", False)
    body += text(x + 38, y + 155, "Preset List", 13, GREEN_SOFT, 800)
    body += rect(x + 38, y + 166, 290, 36, "#06100a", "#2cba64", rx=9)
    body += text(x + 52, y + 189, "LTX 2.3 8GB VRAM ▼", 13, TEXT, 800)
    body += text(x + 38, y + 228, "Open links, download with your browser, then move files into the shown target paths.", 12, "#9ee3b1", 600)
    body += text(x + 38, y + 260, "Model Roots", 13, GREEN_SOFT, 800)
    body += button(x + 440, y + 238, 150, "Copy selected root", False)
    body += rect(x + 38, y + 276, 552, 34, "#0d5d32", "#42e982", rx=8, sw=2)
    body += text(x + 60, y + 298, "1  D:\\ComfyUI Model\\models", 12, TEXT, 800)
    body += text(x + 548, y + 298, "selected", 11, "#b7ffd0", 800, "end")
    body += rect(x + 38, y + 318, 552, 30, "#07120b", "#203629", rx=8)
    body += text(x + 60, y + 338, "2  D:\\ComfyUI-Easy-Install\\ComfyUI\\models", 11, "#7d9e87", 700)
    body += rect(x + 38, y + 362, 552, 18, "#0a1a10", "#2cba64", rx=9)
    body += rect(x + 38, y + 362, 552, 18, "url(#bar)", None, rx=9)
    body += text(x + 314, y + 375, "6/6 files ready", 12, TEXT, 800, "middle")
    for i, (folder, file) in enumerate([
        ("unet", "LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf"),
        ("text_encoders", "gemma_3_12B_it_fp4_mixed.safetensors"),
        ("vae", "LTX23_audio_vae_bf16.safetensors"),
    ]):
        yy = y + 400 + i * 61
        body += rect(x + 38, yy, 552, 50, "#0d1711", "#1c2a20", rx=8)
        body += text(x + 50, yy + 20, folder, 14, TEXT, 800)
        body += text(x + 50, yy + 38, file, 11, "#95d4a4", 600)
        body += text(x + 496, yy + 30, "ready", 12, "#7dffa9", 800, "end")
        body += button(x + 508, yy + 10, 62, "Down", False)
    body += button(x + 38, y + 594, 128, "Refresh Check", True)
    return body


def easy_downloader_edit():
    x, y, w, h = 35, 35, 620, 690
    body = node(x, y, w, h, "Edit creator preset")
    body += rect(x + 24, y + 86, w - 48, 575, "#020704", GREEN_DARK, rx=11)
    body += text(x + 38, y + 120, "Preset editor", 18, GREEN_SOFT, 800)
    body += button(x + 520, y + 103, 70, "Close", False)
    body += rect(x + 38, y + 140, 552, 132, "#0b2415", "#1f6e3c", rx=10)
    body += text(x + 58, y + 168, "Example", 15, GREEN_SOFT, 800)
    body += text(x + 58, y + 196, "Preset Name", 12, "#cfead7", 800)
    body += text(x + 184, y + 196, "DENO LTX Starter Pack", 12, TEXT, 700)
    body += text(x + 58, y + 220, "Path", 12, "#cfead7", 800)
    body += text(x + 184, y + 220, "unet", 12, TEXT, 700)
    body += text(x + 58, y + 244, "URL", 12, "#cfead7", 800)
    body += text(x + 184, y + 244, "direct file or Civitai page", 12, TEXT, 700)
    body += text(x + 38, y + 304, "Preset Name", 15, TEXT, 800)
    body += rect(x + 38, y + 318, 552, 36, "#06100a", "#185c33", rx=8)
    body += text(x + 52, y + 341, "DENO LTX Starter Pack", 13, TEXT, 700)
    body += text(x + 38, y + 386, "Models", 15, TEXT, 800)
    body += rect(x + 38, y + 406, 552, 166, "#07120b", "#1d3c29", rx=9)
    body += text(x + 58, y + 436, "1", 14, TEXT, 800)
    body += button(x + 510, y + 418, 64, "Remove", False)
    body += text(x + 58, y + 472, "URL", 12, GREEN_SOFT, 800)
    body += rect(x + 58, y + 482, 470, 34, "#06100a", "#185c33", rx=8)
    body += text(x + 70, y + 504, "https://huggingface.co/.../resolve/main/model.safetensors", 11, TEXT, 600)
    body += button(x + 534, y + 482, 56, "Civitai", False)
    body += text(x + 58, y + 540, "Model Path", 12, GREEN_SOFT, 800)
    body += text(x + 358, y + 540, "File name", 12, GREEN_SOFT, 800)
    body += rect(x + 58, y + 550, 250, 34, "#06100a", "#185c33", rx=8)
    body += text(x + 70, y + 572, "unet", 12, TEXT, 700)
    body += rect(x + 322, y + 550, 250, 34, "#06100a", "#185c33", rx=8)
    body += text(x + 334, y + 572, "auto-filled from URL if possible", 11, TEXT, 600)
    body += button(x + 38, y + 604, 90, "+ Add file", False)
    body += button(x + 458, y + 604, 132, "Save preset", True)
    return body


def lora_loader_overview():
    x, y, w, h = 55, 90, 620, 350
    body = node(x, y, w, h, "(Deno) LTX Multi LoRA Loader")
    body += port(x + 18, y + 86, "#c38cff") + text(x + 36, y + 91, "model", 15, MUTED, 600)
    body += port(x + 18, y + 112, "#ffd600") + text(x + 36, y + 117, "clip", 15, MUTED, 600)
    body += text(x + w - 34, y + 91, "model", 15, MUTED, 600, "end") + port(x + w - 16, y + 86, "#c38cff")
    body += text(x + w - 34, y + 117, "clip", 15, MUTED, 600, "end") + port(x + w - 16, y + 112, "#ffd600")
    body += text(x + 80, y + 166, "Toggle All", 14, MUTED, 700)
    body += text(x + 330, y + 166, "Strength", 13, MUTED, 800)
    body += text(x + 430, y + 166, "Video", 13, MUTED, 800)
    body += text(x + 520, y + 166, "Audio", 13, MUTED, 800)
    for i, name in enumerate(["ltx2.3 portrait motion.safetensors", "ltx2.3 tts deno_copy.safetensors"]):
        yy = y + 184 + i * 34
        body += rect(x + 34, yy, w - 68, 27, "#242424", "#777", rx=13)
        body += circle(x + 58, yy + 14, 10, "#8faad0")
        body += text(x + 76, yy + 18, name, 12, TEXT, 700)
        body += text(x + 398, yy + 18, "◀ 1.00 ▶", 12, TEXT, 800, "middle")
        body += text(x + 484, yy + 18, "1.00", 12, TEXT, 800, "middle")
        body += text(x + 568, yy + 18, "1.00", 12, TEXT, 800, "middle")
    body += rect(x + 34, y + 268, w - 68, 34, "#242424", "#777", rx=7)
    body += text(x + w / 2, y + 291, "+ Add LoRA", 16, TEXT, 800, "middle")
    return body


def prompt_guide_overview():
    x, y, w, h = 45, 60, 630, 560
    body = node(x, y, w, h, "(Deno) LTX Prompt Guide")
    body += port(x + 18, y + 88, "#ffd600") + text(x + 36, y + 93, "clip", 15, MUTED, 600)
    for i, out in enumerate(["positive", "negative", "frame_rate"]):
        body += text(x + w - 34, y + 93 + i * 25, out, 15, MUTED, 600, "end")
        body += port(x + w - 16, y + 88 + i * 25, "#ffa726" if i < 2 else "#9aa0b5")
    body += pill(x + 210, y + 126, 260, 30, "Min video length: 5.66s+ | 142 frames+", "#06100a", GREEN, GREEN_SOFT, 13)
    body += rect(x + 36, y + 176, w - 72, 110, "#202020", None, rx=0)
    body += text(x + 52, y + 204, '"Hello world"', 13, TEXT, 600)
    body += widget(x + 36, y + 312, w - 72, "language", "Natural")
    body += widget(x + 36, y + 344, w - 72, "frame_rate", "25")
    body += rect(x + 36, y + 386, w - 72, 30, "#202020", "#777", rx=6)
    body += text(x + w / 2, y + 407, "Show Negative Prompt", 14, TEXT, 700, "middle")
    body += callout(90, 450, "Quote dialogue to estimate minimum video length.", 320)
    body += callout(430, 450, "Negative prompt can be hidden without losing text.", 290)
    return body


def link_guide():
    body = rect(40, 40, 660, 500, "#020704", GREEN_DARK, rx=16, sw=2)
    body += text(70, 82, "Model link patterns", 22, GREEN_SOFT, 800)
    body += rect(70, 112, 600, 170, "#0d1711", "#1d3c29", rx=10)
    body += text(92, 145, "Hugging Face", 18, TEXT, 800)
    body += text(92, 178, "Files and versions -> right-click the download arrow -> Copy link address", 14, "#cfead7", 600)
    body += text(92, 210, "Use a /resolve/main/... URL when possible.", 13, GREEN_SOFT, 700)
    body += rect(500, 144, 80, 42, "#13251a", "#55ef8f", rx=8)
    body += text(540, 171, "↓", 24, GREEN_SOFT, 800, "middle")
    body += text(540, 206, "copy this", 12, GREEN_SOFT, 800, "middle")
    body += rect(70, 310, 600, 170, "#0d1711", "#1d3c29", rx=10)
    body += text(92, 343, "Civitai", 18, TEXT, 800)
    body += text(92, 376, "Copy the model page URL, paste it, then press the Civitai button.", 14, "#cfead7", 600)
    body += text(92, 408, "The helper asks Civitai metadata for the filename and direct download URL.", 13, GREEN_SOFT, 700)
    body += rect(442, 350, 170, 36, "#06100a", "#55ef8f", rx=18)
    body += text(527, 373, "Civitai page URL", 13, TEXT, 800, "middle")
    return body


ASSETS = {
    "resize-box-overview.svg": resize_box_overview,
    "resize-box-modes.svg": resize_box_modes,
    "multi-image-loader-overview.svg": multi_image_overview,
    "multi-image-loader-input-folder.svg": multi_input_folder,
    "ltx-sequencer-overview.svg": ltx_sequencer_overview,
    "ltx-sequencer-sync-bypass.svg": ltx_sequencer_sync,
    "ltx-model-loader-modes.svg": ltx_model_loader_modes,
    "ltx-model-loader-dependencies.svg": ltx_model_loader_deps,
    "easy-model-download-helper-overview.svg": easy_downloader_overview,
    "easy-model-download-helper-edit-preset.svg": easy_downloader_edit,
    "easy-model-download-helper-link-guide.svg": link_guide,
    "ltx-multi-lora-loader-overview.svg": lora_loader_overview,
    "ltx-prompt-guide-overview.svg": prompt_guide_overview,
}


def main():
    for name, builder in ASSETS.items():
        write_svg(name, 760, 760 if "input-folder" not in name else 640, builder())


if __name__ == "__main__":
    main()
