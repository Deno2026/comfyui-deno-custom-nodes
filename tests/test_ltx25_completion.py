import importlib.util
import shutil
import subprocess
import sys
import types
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]


class FakeTensor:
    def __init__(self, shape):
        self.shape = tuple(shape)

    def __len__(self):
        return self.shape[0]

    def __getitem__(self, key):
        if isinstance(key, slice):
            start, stop, step = key.indices(self.shape[0])
            count = len(range(start, stop, step))
            return FakeTensor((count, *self.shape[1:]))
        raise TypeError(key)


def _load_sequencer(monkeypatch, add_guide, attention_helper=None):
    comfy_extras = types.ModuleType("comfy_extras")
    nodes_lt = types.ModuleType("comfy_extras.nodes_lt")
    nodes_lt.LTXVAddGuide = add_guide
    nodes_lt.get_noise_mask = lambda latent: latent.get("noise_mask")
    if attention_helper is not None:
        nodes_lt._append_guide_attention_entry = attention_helper
    comfy_extras.nodes_lt = nodes_lt
    monkeypatch.setitem(sys.modules, "comfy_extras", comfy_extras)
    monkeypatch.setitem(sys.modules, "comfy_extras.nodes_lt", nodes_lt)

    module_name = "deno_ltx_sequencer_plus_completion_test"
    spec = importlib.util.spec_from_file_location(module_name, REPO_ROOT / "deno_ltx_sequencer_plus.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    monkeypatch.setitem(sys.modules, module_name, module)
    spec.loader.exec_module(module)
    return module


def test_ltx_sequencer_multi_guide_uses_current_latent_shape_and_attention_metadata(monkeypatch):
    calls = {"index": [], "attention": [], "encode": 0}

    class AddGuide:
        @classmethod
        def encode(cls, _vae, _width, _height, image, _scale_factors):
            calls["encode"] += 1
            return image, FakeTensor((1, 128, 1, 2, 3))

        @classmethod
        def get_latent_index(
            cls, _conditioning, latent_length, _guide_length, frame_idx, _scale_factors, latent_shape=None
        ):
            calls["index"].append((latent_length, frame_idx, tuple(latent_shape)))
            return frame_idx, 0

        @classmethod
        def append_keyframe(
            cls, positive, negative, _frame_idx, latent_image, noise_mask, encoded_latent, _strength, _scale_factors
        ):
            next_length = latent_image.shape[2] + encoded_latent.shape[2]
            return (
                positive,
                negative,
                FakeTensor((*latent_image.shape[:2], next_length, *latent_image.shape[3:])),
                FakeTensor((*noise_mask.shape[:2], next_length, *noise_mask.shape[3:])),
            )

    def append_attention(positive, negative, count, latent_shape, strength=1.0, attention_mask=None):
        calls["attention"].append((count, tuple(latent_shape), strength, attention_mask))
        return positive, negative

    module = _load_sequencer(monkeypatch, AddGuide, append_attention)
    latent = {
        "samples": FakeTensor((1, 128, 10, 2, 3)),
        "noise_mask": FakeTensor((1, 1, 10, 1, 1)),
    }
    result = module.DenoLTXSequencer.execute(
        [["positive", {}]],
        [["negative", {}]],
        types.SimpleNamespace(downscale_index_formula=(8, 32, 32)),
        latent,
        FakeTensor((2, 64, 64, 3)),
        2,
        "frames",
        25,
        False,
        False,
        insert_frame_1=17,
        insert_frame_2=-1,
        strength_1=0.65,
        strength_2=0.4,
    )

    assert calls["encode"] == 2
    assert calls["index"] == [
        (10, 17, (1, 128, 10, 2, 3)),
        (11, -1, (1, 128, 11, 2, 3)),
    ]
    assert calls["attention"] == [
        (6, (1, 2, 3), 0.65, None),
        (6, (1, 2, 3), 0.4, None),
    ]
    assert result[2]["samples"].shape == (1, 128, 12, 2, 3)
    assert result[2]["noise_mask"].shape == (1, 1, 12, 1, 1)


def test_ltx_sequencer_keeps_legacy_get_latent_index_signature(monkeypatch):
    calls = []

    class LegacyAddGuide:
        @classmethod
        def get_latent_index(cls, conditioning, latent_length, guide_length, frame_idx, scale_factors):
            calls.append((conditioning, latent_length, guide_length, frame_idx, scale_factors))
            return frame_idx, 0

    module = _load_sequencer(monkeypatch, LegacyAddGuide)
    result = module._get_latent_index("cond", 9, 1, 8, (8, 32, 32), (1, 128, 9, 2, 3))

    assert result == (8, 0)
    assert calls == [("cond", 9, 1, 8, (8, 32, 32))]


def test_ltx_sequencer_lazy_graph_skips_inactive_image_branch_and_rejects_missing_active_input(monkeypatch):
    class AddGuide:
        pass

    module = _load_sequencer(monkeypatch, AddGuide)
    node = module.DenoLTXSequencer
    latent = {"samples": FakeTensor((1, 128, 10, 2, 3))}

    assert node.INPUT_TYPES()["required"]["multi_input"] == ("IMAGE", {"lazy": True})
    assert node.check_lazy_status(True, 2, None) == []
    assert node.check_lazy_status(False, 0, None) == []
    assert node.check_lazy_status(False, 1, None) == ["multi_input"]
    assert node.execute("p", "n", object(), latent, None, 0, "frames", 25, True, False) == ("p", "n", latent)
    assert node.execute("p", "n", object(), latent, None, 1, "frames", 25, True, True) == ("p", "n", latent)
    with pytest.raises(ValueError, match="multi_input is required"):
        node.execute("p", "n", object(), latent, None, 1, "frames", 25, True, False)


def test_ltx_model_downloader_js_migrates_builtins_custom_presets_and_storage():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js is required for the LTX downloader migration harness.")

    result = subprocess.run(
        [
            node,
            str(REPO_ROOT / "tests" / "js" / "ltx_model_downloader_presets_harness.mjs"),
            str(REPO_ROOT / "web" / "js" / "deno_ltx_model_downloader.js"),
        ],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr


def test_ltx25_native_help_documents_manual_gated_access_and_license():
    downloader_en = (REPO_ROOT / "web/js/docs/DenoLTXModelDownloader.md").read_text(encoding="utf-8")
    downloader_ko = (REPO_ROOT / "web/js/docs/DenoLTXModelDownloader/ko.md").read_text(encoding="utf-8")
    sequencer_en = (REPO_ROOT / "web/js/docs/DenoLTXSequencer.md").read_text(encoding="utf-8")
    sequencer_ko = (REPO_ROOT / "web/js/docs/DenoLTXSequencer/ko.md").read_text(encoding="utf-8")

    for text in (downloader_en, downloader_ko):
        assert "Agree and Access" in text
        assert "LTX-2 Community License" in text
        assert "https://huggingface.co/Lightricks/LTX-2.5" in text
        assert "https://github.com/Lightricks/LTX-2/blob/main/LICENSE.md" in text
    for text in (sequencer_en, sequencer_ko):
        assert "lazy" in text
        assert "LTXVCropGuides" in text
