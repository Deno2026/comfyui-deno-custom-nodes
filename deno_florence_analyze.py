"""Florence-2 image analysis entry point for Ideogram Director.

Uses the self-contained ``deno_florence2_engine.Florence2Engine`` which loads
the model from ``ComfyUI/models/llm/`` using the same custom model code
(DaViT + BART) via ComfyUI's ``comfy.ops``.
"""

from __future__ import annotations

import os
import logging

import torch
import numpy as np

log = logging.getLogger("deno_florence_analyze")

# ---------------------------------------------------------------------------
# Model discovery
# ---------------------------------------------------------------------------

FLORENCE_MODEL_SUBDIR = "llm"
DEFAULT_MODEL_NAME = "Florence-2-large-PromptGen-v2.0"


def _discover_local_florence_models():
    try:
        import folder_paths
    except ImportError:
        return []
    llm_dir = os.path.join(folder_paths.models_dir, FLORENCE_MODEL_SUBDIR)
    if not os.path.isdir(llm_dir):
        return []
    return sorted([
        d for d in os.listdir(llm_dir)
        if os.path.isdir(os.path.join(llm_dir, d))
        and any(f in os.listdir(os.path.join(llm_dir, d))
                for f in ("model.safetensors", "pytorch_model.bin"))
    ])


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_image(pil_image, tasks=None, model_name=None, precision="fp16",
                  max_new_tokens=512, num_beams=3, do_sample=False):
    """Analyze a PIL image with Florence-2 using the local ComfyUI model.

    Returns
    -------
    (ideogram_data: dict, image_size: [W, H])
    ``ideogram_data`` has the shape the Director frontend expects:
    ``{high_level_description, compositional_deconstruction: {background, elements}}``.
    """
    if tasks is None:
        tasks = ("caption", "dense_region", "od", "ocr")

    W, H = pil_image.size

    # Pick a model name if not given.
    if not model_name:
        models = _discover_local_florence_models()
        model_name = DEFAULT_MODEL_NAME if DEFAULT_MODEL_NAME in models else (models[0] if models else "")
    if not model_name:
        raise FileNotFoundError("No Florence-2 model found in ComfyUI/models/llm/")

    from .deno_florence2_engine import Florence2Engine

    img_comfy = torch.from_numpy(
        np.array(pil_image, dtype=np.float32) / 255.0
    ).unsqueeze(0)

    engine = Florence2Engine()
    caption_str, elements = engine.analyze(
        image=img_comfy,
        model_name=model_name,
        precision=precision,
        task_caption="caption" in tasks,
        task_dense_region="dense_region" in tasks,
        task_od="od" in tasks,
        task_ocr="ocr" in tasks,
        max_new_tokens=max_new_tokens,
        num_beams=num_beams,
        do_sample=do_sample,
    )

    bg = caption_str or "Background and setting inferred from the uploaded image."
    ideogram_data = {
        "high_level_description": caption_str,
        "compositional_deconstruction": {
            "background": bg,
            "elements": elements if isinstance(elements, list) else [],
        },
    }
    return ideogram_data, [W, H]
