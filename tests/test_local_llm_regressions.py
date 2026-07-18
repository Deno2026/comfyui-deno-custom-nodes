import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

from test_image_resize_node import load_package


REPO_ROOT = Path(__file__).resolve().parents[1]


def _refine_kwargs(prompts):
    return {
        "provider": "Ollama",
        "ollama_model": "qwen3",
        "lm_studio_model": "google/gemma",
        "custom_server_url": "http://127.0.0.1:8000/v1",
        "custom_model": "custom-model",
        "system_prompt": "",
        "prompt": prompts,
        "thinking": False,
        "seed": 7,
        "seed_mode": "fixed",
        "model_memory": "Unload after run",
        "keep_minutes": 5,
        "comfy_vram_policy": "Never unload before LLM call",
        "unique_id": "cleanup-node",
    }


@pytest.mark.parametrize(
    "error_message",
    [
        "mid-batch generation failed",
        "Local LLM generation stopped.",
    ],
)
def test_local_llm_unload_after_run_cleans_aborted_mid_batch_without_masking_error(monkeypatch, error_message):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    calls = []
    unload_calls = []
    events = []
    original_error = RuntimeError(error_message)

    monkeypatch.setattr(module, "_send_progress", lambda payload: events.append(dict(payload)))
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})

    def run_single(**kwargs):
        calls.append(kwargs)
        if len(calls) == 2:
            raise original_error
        return "first answer", "", {}

    def fail_cleanup(provider, server_url, model):
        unload_calls.append((provider, server_url, model))
        raise RuntimeError("cleanup endpoint failed")

    monkeypatch.setattr(node, "_run_single", run_single)
    monkeypatch.setattr(module, "unload_local_llm_model", fail_cleanup)

    with pytest.raises(RuntimeError) as raised:
        node.refine(**_refine_kwargs(["first", "second", "third"]))

    assert raised.value is original_error
    assert [call["is_last"] for call in calls] == [False, False]
    assert unload_calls == [("Ollama", "http://127.0.0.1:11434", "qwen3")]
    assert events[-1]["status"] == "error"
    assert events[-1]["error"] == error_message


def test_local_llm_terminal_preflight_failure_runs_fallback_cleanup_once(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    unload_calls = []
    original_error = RuntimeError("terminal request failed")

    monkeypatch.setattr(module, "_send_progress", lambda _payload: None)
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})
    monkeypatch.setattr(node, "_run_single", lambda **_kwargs: (_ for _ in ()).throw(original_error))
    monkeypatch.setattr(
        module,
        "unload_local_llm_model",
        lambda *args: unload_calls.append(args) or {"ok": True},
    )

    kwargs = _refine_kwargs(["only prompt"])
    kwargs.update({
        "provider": "vLLM",
        "custom_server_url": "http://127.0.0.1:8000/v1",
        "custom_model": "qwen3",
    })
    with pytest.raises(RuntimeError) as raised:
        node.refine(**kwargs)

    assert raised.value is original_error
    assert unload_calls == [("vLLM", "http://127.0.0.1:8000/v1", "qwen3")]


def test_local_llm_terminal_provider_cleanup_is_not_duplicated(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    unload_calls = []
    original_error = RuntimeError("terminal stream failed after provider cleanup")

    monkeypatch.setattr(module, "_send_progress", lambda _payload: None)
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})

    def fail_after_provider_cleanup(**kwargs):
        kwargs["cleanup_state"]["provider_cleanup_attempted"] = True
        raise original_error

    monkeypatch.setattr(node, "_run_single", fail_after_provider_cleanup)
    monkeypatch.setattr(
        module,
        "unload_local_llm_model",
        lambda *args: unload_calls.append(args) or {"ok": True},
    )

    kwargs = _refine_kwargs(["only prompt"])
    kwargs.update({"provider": "LM Studio", "lm_studio_model": "google/gemma"})
    with pytest.raises(RuntimeError) as raised:
        node.refine(**kwargs)

    assert raised.value is original_error
    assert unload_calls == []


def test_local_llm_lm_studio_terminal_stream_failure_runs_one_provider_cleanup(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    unload_calls = []
    original_error = RuntimeError("Local LLM generation stopped.")

    def fail_stream(*_args, **_kwargs):
        yield "chat.start", {"type": "chat.start"}
        raise original_error

    monkeypatch.setattr(module, "_http_stream_sse", fail_stream)
    monkeypatch.setattr(
        node,
        "_lm_unload_best_effort",
        lambda native_base, model: unload_calls.append((native_base, model)),
    )

    with pytest.raises(RuntimeError) as raised:
        node._run_lm_studio(
            server_url="http://127.0.0.1:1234/v1",
            model="google/gemma",
            system_prompt="",
            prompt="hello",
            thinking=True,
            seed=7,
            model_memory="Unload after run",
            keep_minutes=5,
            image_attachments=[],
            is_last=True,
            node_id="cleanup-node",
            index=1,
            total=1,
        )

    assert raised.value is original_error
    assert unload_calls == [("http://127.0.0.1:1234", "google/gemma")]


def test_local_llm_ollama_terminal_failure_uses_explicit_cleanup_once(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    unload_calls = []
    original_error = RuntimeError("Ollama stream stopped before completion")

    monkeypatch.setattr(module, "_send_progress", lambda _payload: None)
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})
    monkeypatch.setattr(node, "_run_single", lambda **_kwargs: (_ for _ in ()).throw(original_error))
    monkeypatch.setattr(
        module,
        "unload_local_llm_model",
        lambda *args: unload_calls.append(args) or {"ok": True},
    )

    with pytest.raises(RuntimeError) as raised:
        node.refine(**_refine_kwargs(["only prompt"]))

    assert raised.value is original_error
    assert unload_calls == [("Ollama", "http://127.0.0.1:11434", "qwen3")]


def test_local_llm_ollama_completed_terminal_request_does_not_unload_twice_on_postprocess_error(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    unload_calls = []

    monkeypatch.setattr(module, "_send_progress", lambda _payload: None)
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})
    def completed_provider_request(**kwargs):
        kwargs["cleanup_state"]["provider_cleanup_attempted"] = True
        return "answer", "", {}

    monkeypatch.setattr(node, "_run_single", completed_provider_request)
    monkeypatch.setattr(
        module,
        "unload_local_llm_model",
        lambda *args: unload_calls.append(args) or {"ok": True},
    )

    kwargs = _refine_kwargs(["only prompt"])
    kwargs["thinking"] = True
    with pytest.raises(RuntimeError, match="no Thinking/reasoning content"):
        node.refine(**kwargs)

    # The completed final Ollama request already used keep_alive=0. The
    # post-processing error must not trigger a second explicit unload call.
    assert unload_calls == []


@pytest.mark.parametrize(
    "review",
    [
        "NOT OK",
        "not approved",
        "cannot approve",
        "not a PASS",
        '{"verdict":"NOT OK","reason":"subject is missing"}',
        '{"status":"not approved","reason":"quality is too low"}',
    ],
)
def test_ai_review_gate_rejects_negated_approval_phrases(review):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    gate = package.DenoAIReviewGate()
    image = object()

    result = gate.gate(review=review, image=image)

    assert result["ui"]["deno_llm_gate"][0]["passed"] is False
    assert result["ui"]["deno_llm_gate"][0]["verdict"] == "FAIL"
    assert isinstance(result["result"][0], module.ExecutionBlocker)


def test_ai_review_gate_keeps_explicit_positive_and_manual_approval_paths():
    package = load_package()
    gate = package.DenoAIReviewGate()
    image = object()

    for review in ("OK", "PASS", "APPROVE", "APPROVED", "not only OK but excellent"):
        result = gate.gate(review=review, image=image)
        assert result["ui"]["deno_llm_gate"][0]["passed"] is True
        assert result["result"][0] is image

    manual_pass = gate.gate(review="NOT OK", review_mode="Pass", image=image)
    approve_once = gate.gate(review="cannot approve", approve_once=True, image=image)
    assert manual_pass["ui"]["deno_llm_gate"][0]["source"] == "Manual pass"
    assert manual_pass["result"][0] is image
    assert approve_once["ui"]["deno_llm_gate"][0]["source"] == "Approve once"
    assert approve_once["result"][0] is image


def test_ai_reviewer_snapshot_paths_are_workflow_scoped_and_legacy_state_still_loads(tmp_path):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    sys.modules["folder_paths"].get_temp_directory = lambda: str(tmp_path)
    gate_cls = package.NODE_CLASS_MAPPINGS["DenoAIReviewGate"]
    gate = package.DenoAIReviewGate()
    image = np.zeros((1, 4, 5, 3), dtype=np.float32)
    image[0, 1, 2, 0] = 0.75
    workflow_a = {"workflow": {"id": "11111111-1111-4111-8111-111111111111"}}
    workflow_b = {"workflow": {"id": "22222222-2222-4222-8222-222222222222"}}

    assert gate_cls.INPUT_TYPES()["hidden"] == {
        "unique_id": "UNIQUE_ID",
        "extra_pnginfo": "EXTRA_PNGINFO",
    }

    preview_a = module._stable_reviewer_preview_path("42", workflow_a)
    preview_a_again = module._stable_reviewer_preview_path("42", workflow_a)
    preview_b = module._stable_reviewer_preview_path("42", workflow_b)
    snapshot_a = module._stable_reviewer_snapshot_path("42", workflow_a)
    snapshot_b = module._stable_reviewer_snapshot_path("42", workflow_b)
    legacy_snapshot = module._stable_reviewer_snapshot_path("42")

    assert preview_a == preview_a_again
    assert preview_a[1] != preview_b[1]
    assert snapshot_a[1] != snapshot_b[1]
    assert legacy_snapshot[1] == "deno_llm_reviewer_42.npy"

    failed_a = gate.gate(review="FAIL", image=image, unique_id="42", extra_pnginfo=workflow_a)
    failed_b = gate.gate(review="FAIL", image=image, unique_id="42", extra_pnginfo=workflow_b)
    info_a = failed_a["ui"]["deno_llm_gate"][0]
    info_b = failed_b["ui"]["deno_llm_gate"][0]
    assert info_a["preview_image"]["filename"] != info_b["preview_image"]["filename"]
    assert info_a["snapshot_image"]["filename"] != info_b["snapshot_image"]["filename"]

    legacy_meta = module._save_reviewer_snapshot_image(image, "42")
    assert legacy_meta["filename"] == "deno_llm_reviewer_42.npy"
    approved = gate.gate(
        review="Approved once.",
        approve_once=True,
        image=None,
        reviewer_state=json.dumps({"snapshot_image": legacy_meta}),
        unique_id="42",
        extra_pnginfo=workflow_b,
    )
    restored = np.asarray(approved["result"][0])
    assert approved["ui"]["deno_llm_gate"][0]["passed"] is True
    assert restored.shape == image.shape
    assert np.isclose(restored[0, 1, 2, 0], 0.75)


def test_local_llm_frontend_async_actions_are_latest_wins():
    node = shutil.which("node")
    assert node, "node executable is required for the Local LLM async-action harness"

    result = subprocess.run(
        [node, str(REPO_ROOT / "tests" / "js" / "local_llm_async_action_harness.mjs")],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"node harness failed:\n{result.stdout}\n{result.stderr}"
