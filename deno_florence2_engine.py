"""Florence-2 analysis engine for Ideogram Director (self-contained, no external plugin dep).

Copied from ComfyUI-IdeogramHelper's ``florence_to_ideogram.py`` and stripped of
ComfyUI node registration.  Loads the model from ``ComfyUI/models/llm/`` using
the same custom model code (DaViT + BART) via ``comfy.ops``.
"""

from __future__ import annotations

import os
import re
import torch
import numpy as np
import folder_paths
import comfy.ops
import comfy.model_patcher
import comfy.model_management as mm
from comfy.utils import load_torch_file

from .deno_florence2.config import Florence2Config
from .deno_florence2.model import Florence2
from .deno_florence2.processing import Processor

MODEL_SUBDIR = "llm"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _slug(label):
    label = re.sub(r"</?s>|<pad>|</?[^>]+>", " ", label or "", flags=re.IGNORECASE)
    label = re.sub(r"\s+", " ", label or "").strip()
    label = label.replace('"', "'")
    label = re.sub(r"^[\W_]+|[\W_]+$", "", label)
    return label or "object"


def _norm_bbox_xyxy(pix_box, img_w, img_h):
    x1, y1, x2, y2 = [float(v) for v in pix_box[:4]]
    x1 = max(0, min(x1, img_w))
    x2 = max(0, min(x2, img_w))
    y1 = max(0, min(y1, img_h))
    y2 = max(0, min(y2, img_h))
    if x2 < x1: x1, x2 = x2, x1
    if y2 < y1: y1, y2 = y2, y1
    return [
        round((y1 / img_h) * 1000),
        round((x1 / img_w) * 1000),
        round((y2 / img_h) * 1000),
        round((x2 / img_w) * 1000),
    ]


def _bbox_area(bbox):
    y1, x1, y2, x2 = bbox
    return max(0, y2 - y1) * max(0, x2 - x1)


def _bbox_iou(a, b):
    ay1, ax1, ay2, ax2 = a
    by1, bx1, by2, bx2 = b
    iy1, ix1 = max(ay1, by1), max(ax1, bx1)
    iy2, ix2 = min(ay2, by2), min(ax2, bx2)
    inter = _bbox_area([iy1, ix1, iy2, ix2])
    denom = _bbox_area(a) + _bbox_area(b) - inter
    return inter / denom if denom else 0.0


def _sample_color(img_tensor, bbox, img_w, img_h):
    y1, x1, y2, x2 = bbox
    left = int((x1 / 1000) * img_w)
    top = int((y1 / 1000) * img_h)
    right = max(left + 1, int((x2 / 1000) * img_w))
    bottom = max(top + 1, int((y2 / 1000) * img_h))
    crop = img_tensor[top:bottom, left:right]
    if crop.numel() == 0:
        return "#808080"
    avg = crop.mean(dim=(0, 1)).mul(255).int()
    return f"#{avg[0]:02X}{avg[1]:02X}{avg[2]:02X}"


def _quad_to_bbox(coords):
    xs = coords[0::2]
    ys = coords[1::2]
    return [min(xs), min(ys), max(xs), max(ys)]


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

_MODEL_CACHE = {}


def _discover_models():
    llm_dir = os.path.join(folder_paths.models_dir, MODEL_SUBDIR)
    if not os.path.isdir(llm_dir):
        return []
    return sorted([d for d in os.listdir(llm_dir) if os.path.isdir(os.path.join(llm_dir, d))])


def _load_model(model_path, dtype):
    config_path = os.path.join(model_path, "config.json")
    if os.path.exists(config_path):
        config = Florence2Config.from_json(config_path)
    else:
        sd = load_torch_file(os.path.join(model_path, "model.safetensors"))
        config = Florence2Config.from_state_dict(sd)
        del sd

    model = Florence2(config, dtype=dtype, device="cpu", operations=comfy.ops.manual_cast)

    ckpt_path = os.path.join(model_path, "model.safetensors")
    if not os.path.exists(ckpt_path):
        ckpt_path = os.path.join(model_path, "pytorch_model.bin")
    sd = load_torch_file(ckpt_path)

    for key in ["language_model.model.encoder.embed_tokens.weight",
                 "language_model.model.decoder.embed_tokens.weight"]:
        if key in sd and "language_model.model.shared.weight" in sd:
            sd.pop(key, None)

    m, u = model.load_state_dict(sd, strict=False)
    if m:
        print(f"[Florence2Engine] missing keys: {m}")
    if u:
        print(f"[Florence2Engine] unexpected keys: {u}")
    del sd

    model.to(dtype)
    model.language_model.tie_weights()
    model.eval()

    load_device = mm.text_encoder_device()
    offload_device = mm.text_encoder_offload_device()
    patcher = comfy.model_patcher.ModelPatcher(model, load_device=load_device, offload_device=offload_device)

    processor = Processor(model_path=model_path)

    return patcher, processor


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

class Florence2Engine:
    """Florence-2 analysis engine — run tasks: caption, dense_region, od, ocr."""

    def analyze(self, image, model_name, precision,
                task_caption=True, task_dense_region=True,
                task_od=True, task_ocr=True,
                max_new_tokens=512, num_beams=3, do_sample=False):
        model_path = os.path.join(folder_paths.models_dir, MODEL_SUBDIR, model_name)
        if not os.path.isdir(model_path):
            raise FileNotFoundError(f"Florence model not found: {model_path}")

        dtype = {"fp16": torch.float16, "bf16": torch.bfloat16, "fp32": torch.float32}[precision]
        ck = f"{model_path}|{precision}"

        if ck not in _MODEL_CACHE:
            patcher, processor = _load_model(model_path, dtype)
            _MODEL_CACHE[ck] = {"patcher": patcher, "processor": processor}
        else:
            patcher = _MODEL_CACHE[ck]["patcher"]
            processor = _MODEL_CACHE[ck]["processor"]

        mm.load_model_gpu(patcher)
        model = patcher.model
        load_device = patcher.load_device

        B, H, W, C = image.shape

        image_tensor = image.permute(0, 3, 1, 2).contiguous()
        pixel_values = processor.preprocess(image_tensor)
        img_np = image[0].cpu()

        del image_tensor
        if image.device.type != "cpu":
            del image

        tasks = []
        if task_caption:
            tasks.append(("caption", "<MORE_DETAILED_CAPTION>"))
        if task_dense_region:
            tasks.append(("dense_region", "<DENSE_REGION_CAPTION>"))
        if task_od:
            tasks.append(("od", "<OD>"))
        if task_ocr:
            tasks.append(("ocr", "<OCR_WITH_REGION>"))

        raw_results = {}
        for task_name, task_token in tasks:
            prompt = processor._construct_prompts(task_token)
            encoded = processor.tokenizer.encode(prompt)
            input_ids = encoded["input_ids"]

            generated_ids = model.generate(
                input_ids=input_ids.to(load_device),
                pixel_values=pixel_values.to(dtype=dtype, device=load_device),
                max_new_tokens=max_new_tokens,
                num_beams=num_beams,
                do_sample=do_sample,
            )
            text = processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
            parsed = processor.post_process_generation(text, task=task_token, image_size=(W, H))
            raw_results[task_name] = {"text": text, "parsed": parsed.get(task_token)}

            del generated_ids, input_ids, encoded, prompt
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        dense_items = []
        if "dense_region" in raw_results:
            dr = raw_results["dense_region"]["parsed"]
            if isinstance(dr, dict) and "bboxes" in dr and "labels" in dr:
                for bbox_pix, label in zip(dr["bboxes"], dr["labels"]):
                    bbox = _norm_bbox_xyxy(bbox_pix, W, H)
                    if _bbox_area(bbox) > 40:
                        dense_items.append({
                            "label": _slug(label),
                            "description": _slug(label),
                            "bbox": bbox,
                            "_pix_bbox": bbox_pix,
                        })

        elements = []
        if "od" in raw_results:
            od = raw_results["od"]["parsed"]
            if isinstance(od, dict) and "bboxes" in od and "labels" in od:
                for bbox_pix, label in zip(od["bboxes"], od["labels"]):
                    bbox = _norm_bbox_xyxy(bbox_pix, W, H)
                    if _bbox_area(bbox) <= 40:
                        continue
                    desc = _slug(label)
                    best = max(dense_items, key=lambda di: _bbox_iou(bbox, di["bbox"]), default=None)
                    if best and _bbox_iou(bbox, best["bbox"]) > 0.2:
                        desc = best["description"]
                    elements.append({
                        "type": "obj",
                        "desc": desc,
                        "bbox": bbox,
                        "color_palette": [_sample_color(img_np, bbox, W, H)],
                    })

        if not elements:
            for di in dense_items:
                elements.append({
                    "type": "obj",
                    "desc": di["description"],
                    "bbox": di["bbox"],
                    "color_palette": [_sample_color(img_np, di["bbox"], W, H)],
                })

        if "ocr" in raw_results:
            ocr = raw_results["ocr"]["parsed"]
            ocr_bboxes = ocr.get("bboxes") if isinstance(ocr, dict) else None
            ocr_quads = ocr.get("quad_boxes") if isinstance(ocr, dict) else None
            ocr_labels = ocr.get("labels") if isinstance(ocr, dict) else []
            if ocr_bboxes:
                for label, box in zip(ocr_labels, ocr_bboxes):
                    bbox = _norm_bbox_xyxy(box, W, H)
                    text = _slug(label)
                    if _bbox_area(bbox) > 20 and text:
                        elements.append({
                            "type": "text",
                            "text": text,
                            "desc": text,
                            "bbox": bbox,
                            "color_palette": [_sample_color(img_np, bbox, W, H)],
                        })
            elif ocr_quads:
                for label, quad in zip(ocr_labels, ocr_quads):
                    coords = [float(v) for v in quad]
                    pix_box = _quad_to_bbox(coords) if len(coords) >= 8 else coords[:4]
                    bbox = _norm_bbox_xyxy(pix_box, W, H)
                    text = _slug(label)
                    if _bbox_area(bbox) > 20 and text:
                        elements.append({
                            "type": "text",
                            "text": text,
                            "desc": text,
                            "bbox": bbox,
                            "color_palette": [_sample_color(img_np, bbox, W, H)],
                        })

        seen = []
        for el in sorted(elements, key=lambda e: (e["bbox"][0], e["bbox"][1])):
            dup = any(
                _bbox_iou(el["bbox"], other["bbox"]) > 0.85
                for other in seen
            )
            if not dup:
                el["label"] = el["desc"]
                seen.append(el)
        elements = seen[:40]

        caption_text = ""
        if "caption" in raw_results:
            cp = raw_results["caption"]["parsed"]
            cp_str = cp if isinstance(cp, str) else str(cp) if cp else ""
            caption_text = _slug(cp_str)

        return (caption_text, elements)
