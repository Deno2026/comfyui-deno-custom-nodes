from __future__ import annotations

import ast
import importlib.util
import inspect
import json
import sys
import tomllib
import types
from pathlib import Path

import pytest
import torch

from deno_minimax_h3_tiling import (
    MIN_OVERLAP_X,
    MIN_OVERLAP_Y,
    TILE_HEIGHT,
    TILE_WIDTH,
    axis_starts,
    consensus_euler,
    feather,
    make_tiles,
    schedule_from_sigmas,
    tile_layout,
)
from deno_node_metadata import _with_version_prefix, decorate_node_classes


REPO_ROOT = Path(__file__).resolve().parents[1]
NODE_ID = "DenoMiniMaxH3TiledSampler"
DISPLAY_NAME = "(Deno) MiniMax H3 Tiled Sampler"
TESTED = dict(tile_width=TILE_WIDTH, tile_height=TILE_HEIGHT, overlap_x=MIN_OVERLAP_X, overlap_y=MIN_OVERLAP_Y)
requires_real_torch = pytest.mark.skipif(
    not all(hasattr(torch, name) for name in ("linspace", "testing", "full_like", "cos")),
    reason="tensor math requires the real torch package rather than the lightweight CI stub",
)


def tiles_for(height_px, width_px, **sizes):
    (tile_h, tile_w), (overlap_h, overlap_w) = tile_layout(**{**TESTED, **sizes})
    return make_tiles(height_px // 16, width_px // 16, tile_h, tile_w, overlap_h, overlap_w)


def test_defaults_are_the_tested_six_tiles_for_1088p():
    assert tile_layout(**TESTED) == ((44, 56), (20, 16))
    tiles = tiles_for(1088, 1920)
    assert len(tiles) == 6
    assert sorted({t.x0 for t in tiles}) == [0, 40, 64]
    assert sorted({t.y0 for t in tiles}) == [0, 24]
    assert all((t.x1 - t.x0, t.y1 - t.y0) == (56, 44) for t in tiles)
    assert len(tiles_for(768, 1344)) == 4


def test_given_sizes_drive_the_layout():
    assert len(tiles_for(1088, 1920, tile_width=1920, tile_height=1088)) == 1
    assert len(tiles_for(1088, 1920, tile_width=4096, tile_height=4096)) == 1
    wide = tiles_for(1088, 1920, tile_width=1088, tile_height=1088, overlap_x=256)
    assert len(wide) == 2
    assert wide[0].x1 - wide[1].x0 >= 256 // 16
    assert len(tiles_for(2176, 3840, tile_width=1472, tile_height=2176)) == 3


@pytest.mark.parametrize(
    "bad",
    [
        dict(tile_width=900),
        dict(tile_height=720),
        dict(overlap_x=250),
        dict(overlap_y=0),
        dict(overlap_x=896),
        dict(overlap_y=704),
        dict(tile_height=-704),
    ],
)
def test_rejects_sizes_off_the_32_px_grid_or_overlaps_not_smaller_than_the_tile(bad):
    with pytest.raises(ValueError):
        tile_layout(**{**TESTED, **bad})


def test_schedule_accepts_the_final_steps_and_rejects_others_with_a_hint():
    assert schedule_from_sigmas([0.631578947, 0.0]) == (0.631578947, 0.0)
    for bad in ([1.0, 0.0], [0.6], [0.6, 0.3, 0.3, 0.0], [0.9, 0.8, 0.7, 0.6, 0.0], [0.6, 0.1]):
        with pytest.raises(ValueError, match="SplitSigmas"):
            schedule_from_sigmas(bad)


@pytest.mark.parametrize("args", [(7, 4, 2), (8, 4, 4), (8, 3, 0)])
def test_axis_starts_rejects_odd_or_overlapping_plans(args):
    with pytest.raises(ValueError):
        axis_starts(*args)


@requires_real_torch
def test_single_tile_equals_global_euler_for_one_two_three_steps():
    x = torch.linspace(-1, 1, 2 * 8 * 12).reshape(1, 1, 2, 8, 12)
    audio = torch.arange(16, dtype=torch.float32).reshape(1, 4, 4)
    for sigmas in ((0.6, 0), (0.6, 0.3, 0), (0.6, 0.4, 0.2, 0)):
        expected = x.clone()
        for a, b in zip(sigmas, sigmas[1:]):
            denoised = expected.square() * 0.2 + a
            expected = expected + (expected - denoised) / a * (b - a)
        out, _ = consensus_euler(x, audio, sigmas, lambda v, a, s, t: v.square() * 0.2 + s,
                                 tile_h=8, tile_w=12, overlap_h=0, overlap_w=0)
        torch.testing.assert_close(out, expected)


@requires_real_torch
def test_tiles_blend_without_seams_and_keep_audio_and_inputs():
    x = torch.linspace(-1, 1, 2 * 8 * 12).reshape(1, 1, 2, 8, 12)
    audio = torch.arange(16, dtype=torch.float32).reshape(1, 4, 4)
    layout = dict(tile_h=6, tile_w=8, overlap_h=2, overlap_w=4)
    out, _ = consensus_euler(x, audio, (0.5, 0.2, 0), lambda v, a, s, t: torch.ones_like(v) * 0.75, **layout)
    torch.testing.assert_close(out, torch.full_like(out, 0.75))

    original_x, original_audio = x.clone(), audio.clone()

    def predict(value, tile_audio, sigma, tile):
        tile_audio.zero_()
        result = value.mean().expand_as(value).clone() + tile.x0 * 0.01
        value.zero_()
        return result

    forward, kept_audio = consensus_euler(x, audio, (0.6, 0.3, 0), predict, **layout)
    reverse, _ = consensus_euler(x, audio, (0.6, 0.3, 0), predict, reverse_tiles=True, **layout)
    torch.testing.assert_close(forward, reverse)
    assert torch.equal(x, original_x)
    assert torch.equal(kept_audio, original_audio)


@requires_real_torch
def test_second_step_reads_the_merged_first_step():
    x = torch.linspace(-1, 1, 2 * 8 * 12).reshape(1, 1, 2, 8, 12)
    audio = torch.zeros(1, 4, 4)
    layout = dict(tile_h=6, tile_w=8, overlap_h=2, overlap_w=4)
    merged, second_inputs = [], []

    def predict(value, tile_audio, sigma, tile):
        if sigma == 0.3:
            second_inputs.append((tile, value.clone()))
        return torch.ones_like(value) * (tile.x0 + tile.y0)

    consensus_euler(x, audio, (0.6, 0.3, 0), predict, on_step=lambda i, v: merged.append(v), **layout)
    assert len(merged) == 2
    assert len(second_inputs) == len(make_tiles(8, 12, **layout))
    for tile, value in second_inputs:
        torch.testing.assert_close(value, merged[0][..., tile.y0:tile.y1, tile.x0:tile.x1])


@requires_real_torch
def test_default_plan_covers_the_whole_1088p_canvas():
    tiles = tiles_for(1088, 1920)
    weights = torch.zeros(1088 // 16, 1920 // 16)
    for tile in tiles:
        assert all(n % 2 == 0 for n in (tile.x0, tile.x1, tile.y0, tile.y1))
        weights[tile.y0:tile.y1, tile.x0:tile.x1] += feather(tile)[0, 0, 0]
    assert torch.all(weights > 0)


def test_node_is_registered_with_h3_gate_node_list_and_help():
    source = (REPO_ROOT / "__init__.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    optional = None
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "_OPTIONAL_NODES" for target in node.targets
        ):
            optional = ast.literal_eval(node.value)
    assert ("deno_minimax_h3_tiled_sampler", NODE_ID, DISPLAY_NAME) in optional
    # The pack gates every deno_minimax_h3* module on native H3 support.
    assert 'startswith("deno_minimax_h3")' in source

    node_list = json.loads((REPO_ROOT / "node_list.json").read_text(encoding="utf-8"))
    assert node_list[NODE_ID] == DISPLAY_NAME

    module = (REPO_ROOT / "deno_minimax_h3_tiled_sampler.py").read_text(encoding="utf-8")
    assert f'node_id="{NODE_ID}"' in module
    assert f'display_name="{DISPLAY_NAME}"' in module
    assert 'category=CATEGORY' in module and 'CATEGORY = "Deno/MiniMax H3"' in module
    assert "_with_version_prefix(DESCRIPTION)" in module
    for name in ("tile_width", "tile_height", "overlap_x", "overlap_y"):
        assert f'io.Int.Input("{name}"' in module

    for help_path in ("web/js/docs/DenoMiniMaxH3TiledSampler.md", "web/js/docs/DenoMiniMaxH3TiledSampler/ko.md"):
        text = (REPO_ROOT / help_path).read_text(encoding="utf-8")
        assert text.startswith(f"# {DISPLAY_NAME}")
        for label in ("Tile width", "Tile height", "Overlap X", "Overlap Y"):
            assert label in text


def _fake_v3_io():
    """Records schema arguments the way comfy_api.latest.io receives them."""
    def socket(kind):
        return types.SimpleNamespace(
            Input=lambda name, **options: {"kind": kind, "name": name, **options},
            Output=lambda name, **options: {"kind": kind, "name": name, **options},
        )

    class ComfyNode:
        pass

    return types.SimpleNamespace(
        ComfyNode=ComfyNode,
        Schema=lambda **schema: schema,
        NodeOutput=lambda *values, **extra: (values, extra),
        Model=socket("MODEL"),
        Conditioning=socket("CONDITIONING"),
        Latent=socket("LATENT"),
        Sigmas=socket("SIGMAS"),
        Int=socket("INT"),
    )


def _load_sampler_module(monkeypatch):
    comfy = types.ModuleType("comfy")
    samplers = types.ModuleType("comfy.samplers")

    class KSAMPLER:
        def __init__(self, sampler_function):
            self.sampler_function = sampler_function

    samplers.KSAMPLER = KSAMPLER
    modules = {"comfy": comfy, "comfy.samplers": samplers}
    for name in ("model_management", "nested_tensor", "patcher_extension", "sample", "utils"):
        modules[f"comfy.{name}"] = types.ModuleType(f"comfy.{name}")
    for full_name, module in modules.items():
        if full_name != "comfy":
            setattr(comfy, full_name.split(".", 1)[1], module)
    comfy_api = types.ModuleType("comfy_api")
    latest = types.ModuleType("comfy_api.latest")
    latest.io = _fake_v3_io()
    comfy_api.latest = latest
    modules.update({"comfy_api": comfy_api, "comfy_api.latest": latest})
    for full_name, module in modules.items():
        monkeypatch.setitem(sys.modules, full_name, module)

    spec = importlib.util.spec_from_file_location(
        "deno_minimax_h3_tiled_sampler_schema_check", REPO_ROOT / "deno_minimax_h3_tiled_sampler.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_schema_has_versioned_description_tooltips_and_matching_execute_arguments(monkeypatch):
    module = _load_sampler_module(monkeypatch)
    node_cls = module.DenoMiniMaxH3TiledSampler
    schema = node_cls.define_schema()
    version = tomllib.loads((REPO_ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]["version"]

    assert schema["node_id"] == NODE_ID
    assert schema["display_name"] == DISPLAY_NAME
    assert schema["category"] == "Deno/MiniMax H3"
    assert f"DENO Custom Nodes v{version}" in schema["description"]
    assert module.DESCRIPTION in schema["description"]

    inputs = schema["inputs"]
    names = [entry["name"] for entry in inputs]
    assert names == ["model", "positive", "latent", "sigmas", "seed",
                     "tile_width", "tile_height", "overlap_x", "overlap_y"]
    assert all(isinstance(entry.get("tooltip"), str) and entry["tooltip"].strip() for entry in inputs)
    sizes = {entry["name"]: entry for entry in inputs[5:]}
    assert {name: entry["default"] for name, entry in sizes.items()} == {
        "tile_width": 896, "tile_height": 704, "overlap_x": 256, "overlap_y": 320}
    assert [sizes[name]["display_name"] for name in ("tile_width", "tile_height", "overlap_x", "overlap_y")] == [
        "Tile width", "Tile height", "Overlap X", "Overlap Y"]
    assert all(entry["step"] == 32 for entry in sizes.values())
    assert inputs[4]["control_after_generate"] is True

    outputs = schema["outputs"]
    assert len(outputs) == 1 and outputs[0]["kind"] == "LATENT" and outputs[0]["name"] == "latent"
    assert outputs[0]["tooltip"].strip()

    execute_args = list(inspect.signature(node_cls.execute).parameters)
    assert execute_args == names


def test_pack_decoration_keeps_the_versioned_schema_description_single():
    # The pack decorates every registered class, including V3 schema nodes; a
    # description that already carries the version prefix must stay as it is.
    once = _with_version_prefix("Finishes a latent.")
    assert once.startswith("DENO Custom Nodes v")
    assert _with_version_prefix(once) == once

    class SchemaNode:
        DESCRIPTION = once

        @classmethod
        def INPUT_TYPES(cls):
            return {"required": {"tile_width": ("INT", {"default": 896, "tooltip": "Tile width."})}}

    decorate_node_classes({"SchemaNode": SchemaNode})
    assert SchemaNode.DESCRIPTION == once
    assert SchemaNode.INPUT_TYPES() == {"required": {"tile_width": ("INT", {"default": 896, "tooltip": "Tile width."})}}
