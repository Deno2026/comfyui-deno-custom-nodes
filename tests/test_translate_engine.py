import json
import shutil
import subprocess
from pathlib import Path

import pytest

import deno_ideogram_director
import deno_translate_engine as engine


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_language_display_contract():
    assert len(engine.LANGS) == 106
    assert engine.code_for_display("자동 감지") == "auto"
    assert engine.code_for_display("English") == "en"
    assert engine.code_for_display("한국어") == "ko"
    assert engine.code_for_display("Original") == ""
    assert engine.code_for_display("No translation (keep as written)") == ""
    assert engine.display_for_code("zh-CN") == "中文 (简体)"
    assert engine.DIRECTOR_OUTPUT_CHOICES == ("No translation (keep as written)", "English")


def test_loads_caption_accepts_fenced_json():
    cap = engine.loads_caption('hello\n```json\n{"high_level_description":"안녕"}\n```')
    assert cap == {"high_level_description": "안녕"}


def test_ideogram_director_rejects_duplicate_key_quote_json():
    raw = (
        '{"aspect_ratio":"1:1","high_level_description":"cat scene",'
        '"compositional_deconstruction":{"background":"rainy alley",""elements":['
        '{"type":"obj","bbox":[350,250,850,750],"desc":"cat in yellow raincoat"},'
        '{"type":"obj","bbox":[750,50,980,900,150],"desc":"bad bbox keeps desc"}'
        ']}}'
    )

    cap = deno_ideogram_director._loads_caption(raw)
    assert cap is None


def test_translate_caption_preserves_structure_and_skips_literal_text(monkeypatch):
    calls = []

    def fake_request(text, src, tgt, timeout=10.0):
        calls.append((text, src, tgt))
        return [[["EN:" + text, None, None]]]

    monkeypatch.setattr(engine, "_request_gtx", fake_request)
    engine._CACHE.clear()
    cap = {
        "high_level_description": "고양이가 창가에 앉아 있다",
        "style_description": {"aesthetics": "부드러운 사진", "lighting": "soft daylight"},
        "compositional_deconstruction": {
            "background": "비 오는 거리",
            "elements": [
                {
                    "type": "text",
                    "bbox": [10, 20, 30, 40],
                    "text": "SALE",
                    "desc": "빨간 간판",
                    "color_palette": ["#FF0000"],
                }
            ],
        },
    }

    out, changed, sent = engine.translate_caption(cap, "자동 감지", "English")

    assert out["high_level_description"].startswith("EN:")
    assert out["style_description"]["lighting"] == "soft daylight"
    assert out["compositional_deconstruction"]["elements"][0]["text"] == "SALE"
    assert out["compositional_deconstruction"]["elements"][0]["bbox"] == [10, 20, 30, 40]
    assert changed == sent == 4
    assert len(calls) == 4


def test_ideogram_director_outputs_english_prompt_only(monkeypatch):
    def fake_translate_caption(cap, src, tgt, opts=None):
        assert src == "auto"
        assert tgt == "en"
        assert opts == {"translate_text_fields": False}
        out = dict(cap)
        out["high_level_description"] = "translated english output"
        return out, 1, 1

    monkeypatch.setattr(deno_ideogram_director.translate_engine, "translate_caption", fake_translate_caption)
    node = deno_ideogram_director.DenoIdeogramDirector()

    packet = node.build(
        width=1024,
        height=1024,
        seed=1,
        high_level_description="한국어 원문",
        background="배경",
        style_mode="none",
        translate_output="English",
    )

    assert isinstance(packet, dict)
    prompt = json.loads(packet["result"][0])
    assert prompt["high_level_description"] == "translated english output"
    assert packet["ui"]["idd_translate"][0]["ok"] is True
    assert "English prompt ready" in packet["ui"]["idd_translate"][0]["status"]


def test_ideogram_director_translation_preserves_rendered_text_fields(monkeypatch):
    calls = []

    def fake_request(text, src, tgt, timeout=10.0):
        calls.append((text, src, tgt))
        return [[["EN:" + text, None, None]]]

    monkeypatch.setattr(engine, "_request_gtx", fake_request)
    engine._CACHE.clear()
    node = deno_ideogram_director.DenoIdeogramDirector()
    source = {
        "high_level_description": "깔끔한 세일 포스터",
        "compositional_deconstruction": {
            "background": "밝은 매장 쇼윈도",
            "elements": [
                {
                    "type": "text",
                    "bbox": [100, 100, 300, 700],
                    "text": "SALE",
                    "desc": "포스터 위의 큰 빨간 글자",
                },
                {
                    "type": "obj",
                    "bbox": [360, 120, 860, 900],
                    "desc": "쇼핑백을 든 웃는 모델",
                },
            ],
        },
    }

    packet = node.build(
        width=1024,
        height=1024,
        seed=7,
        import_json=json.dumps(source),
        import_mode="Always Replace",
        translate_output="English",
    )

    prompt = json.loads(packet["result"][0])
    elements = prompt["compositional_deconstruction"]["elements"]
    assert prompt["high_level_description"] == "EN:깔끔한 세일 포스터"
    assert elements[0]["text"] == "SALE"
    assert elements[0]["desc"] == "EN:포스터 위의 큰 빨간 글자"
    assert elements[1]["desc"] == "EN:쇼핑백을 든 웃는 모델"
    assert "SALE" not in [item[0] for item in calls]
    assert packet["ui"]["idd_translate"][0]["ok"] is True


def test_ideogram_director_input_prompt_ask_blocks_non_empty_board_until_choice():
    node = deno_ideogram_director.DenoIdeogramDirector()
    existing_board = {
        "boxes": [
            {
                "id": 1,
                "x": 0.1,
                "y": 0.2,
                "w": 0.3,
                "h": 0.4,
                "type": "obj",
                "desc": "manual square object",
                "text": "",
                "palette": [],
            }
        ]
    }
    upstream = {
        "aspect_ratio": "9:16",
        "high_level_description": "upstream tall prompt",
        "compositional_deconstruction": {
            "background": "upstream background",
            "elements": [
                {
                    "type": "obj",
                    "bbox": [100, 100, 900, 900],
                    "desc": "upstream object",
                }
            ],
        },
    }

    with pytest.raises(RuntimeError, match="A new incoming JSON prompt is waiting"):
        node.build(
            width=1024,
            height=1024,
            seed=11,
            high_level_description="manual square prompt",
            background="manual square background",
            caption_data=json.dumps(existing_board),
            import_json=json.dumps(upstream),
            import_mode="Ask Before Replacing",
        )


def test_ideogram_director_input_prompt_review_fills_empty_board():
    node = deno_ideogram_director.DenoIdeogramDirector()
    upstream = {
        "high_level_description": "empty board fills automatically",
        "compositional_deconstruction": {
            "background": "plain studio",
            "elements": [
                {"type": "obj", "bbox": [100, 100, 900, 900], "desc": "auto object"}
            ],
        },
    }

    packet = node.build(
        width=1024,
        height=1024,
        seed=14,
        import_json=json.dumps(upstream),
        import_mode="Ask Before Replacing",
    )

    prompt, width, height, _seed, bboxes = packet["result"]
    decoded = json.loads(prompt)
    assert width == height == 1024
    assert decoded["high_level_description"] == "empty board fills automatically"
    assert decoded["compositional_deconstruction"]["background"] == "plain studio"
    assert len(decoded["compositional_deconstruction"]["elements"]) == 1
    assert bboxes
    assert packet["ui"]["idd_import"][0]["used"] is True


def test_ideogram_director_cleared_board_does_not_reimport_same_connected_prompt():
    node = deno_ideogram_director.DenoIdeogramDirector()
    upstream_json = json.dumps(
        {
            "aspect_ratio": "9:16",
            "high_level_description": "upstream prompt that should stay cleared",
            "compositional_deconstruction": {
                "background": "upstream background",
                "elements": [
                    {
                        "type": "obj",
                        "bbox": [100, 100, 900, 900],
                        "desc": "upstream object",
                    }
                ],
            },
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    cleared_board = {
        "boxes": [],
        "stylePalette": [],
        "importSig": deno_ideogram_director._import_sig(upstream_json),
    }

    packet = node.build(
        width=1024,
        height=1024,
        seed=13,
        caption_data=json.dumps(cleared_board, ensure_ascii=False, separators=(",", ":")),
        import_json=upstream_json,
        import_mode="Ask Before Replacing",
    )

    assert isinstance(packet, dict)
    prompt, width, height, _seed, bboxes = packet["result"]
    decoded = json.loads(prompt)
    assert width == height == 1024
    assert decoded.get("high_level_description") != "upstream prompt that should stay cleared"
    assert decoded["compositional_deconstruction"]["elements"] == []
    assert bboxes == []
    assert packet["ui"]["idd_import"][0]["used"] is False


def test_ideogram_director_connected_prompt_always_replace_uses_upstream():
    node = deno_ideogram_director.DenoIdeogramDirector()
    existing_board = {
        "boxes": [
            {
                "id": 1,
                "x": 0.1,
                "y": 0.2,
                "w": 0.3,
                "h": 0.4,
                "type": "obj",
                "desc": "manual square object",
                "text": "",
                "palette": [],
            }
        ]
    }
    upstream = {
        "aspect_ratio": "9:16",
        "high_level_description": "upstream tall prompt",
        "compositional_deconstruction": {
            "background": "upstream background",
            "elements": [
                {
                    "type": "obj",
                    "bbox": [100, 100, 900, 900],
                    "desc": "upstream object",
                }
            ],
        },
    }

    packet = node.build(
        width=1024,
        height=1024,
        seed=12,
        high_level_description="manual square prompt",
        caption_data=json.dumps(existing_board),
        import_json=json.dumps(upstream),
        import_mode="Always Replace",
    )

    prompt = json.loads(packet["result"][0])
    assert prompt["high_level_description"] == "upstream tall prompt"
    assert "aspect_ratio" not in prompt
    assert prompt["compositional_deconstruction"]["elements"][0]["desc"] == "upstream object"
    assert packet["ui"]["idd_import"][0]["used"] is True


def test_ideogram_director_legacy_auto_replace_maps_to_safe_review_mode():
    node = deno_ideogram_director.DenoIdeogramDirector()
    existing_board = {
        "boxes": [
            {
                "id": 1,
                "x": 0.1,
                "y": 0.2,
                "w": 0.3,
                "h": 0.4,
                "type": "obj",
                "desc": "manual object should not be replaced by old auto label",
                "text": "",
                "palette": [],
            }
        ]
    }
    upstream = {
        "high_level_description": "upstream prompt must ask first",
        "compositional_deconstruction": {
            "background": "upstream background",
            "elements": [
                {"type": "obj", "bbox": [100, 100, 900, 900], "desc": "upstream object"}
            ],
        },
    }

    assert deno_ideogram_director._normalize_import_mode("Auto Replace") == "Ask Before Replacing"
    assert deno_ideogram_director._normalize_import_mode("auto") == "Ask Before Replacing"

    with pytest.raises(RuntimeError, match="A new incoming JSON prompt is waiting"):
        node.build(
            width=1024,
            height=1024,
            seed=23,
            high_level_description="manual prompt should remain",
            caption_data=json.dumps(existing_board),
            import_json=json.dumps(upstream),
            import_mode="Auto Replace",
        )


def test_ideogram_director_kept_valid_import_preserves_current_style_on_run():
    node = deno_ideogram_director.DenoIdeogramDirector()
    upstream_json = json.dumps(
        {
            "aspect_ratio": "9:16",
            "high_level_description": "upstream prompt that was reviewed and rejected",
            "compositional_deconstruction": {
                "background": "upstream background",
                "elements": [
                    {"type": "obj", "bbox": [100, 100, 900, 900], "desc": "upstream object"}
                ],
            },
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    current_board = {
        "boxes": [
            {
                "id": 1,
                "x": 0.2,
                "y": 0.25,
                "w": 0.45,
                "h": 0.5,
                "type": "obj",
                "desc": "manual cat box",
                "text": "",
                "palette": [],
            }
        ],
        "importSig": deno_ideogram_director._import_sig(upstream_json),
    }

    packet = node.build(
        width=992,
        height=992,
        seed=22,
        high_level_description="current manually edited prompt",
        background="current manually edited background",
        style_mode="art",
        aesthetics="matte, vivid, charming",
        lighting="soft evening light",
        medium="gouache on paper",
        art_style="gouache illustration, matte opaque color",
        caption_data=json.dumps(current_board, ensure_ascii=False, separators=(",", ":")),
        import_json=upstream_json,
        import_mode="Ask Before Replacing",
    )

    prompt = json.loads(packet["result"][0])
    assert prompt["high_level_description"] == "current manually edited prompt"
    assert prompt["style_description"]["medium"] == "gouache on paper"
    assert prompt["style_description"]["art_style"] == "gouache illustration, matte opaque color"
    assert prompt["compositional_deconstruction"]["elements"][0]["desc"] == "manual cat box"
    assert "upstream prompt that was reviewed and rejected" not in packet["result"][0]
    assert packet["ui"]["idd_import"][0]["used"] is False


def test_ideogram_director_invalid_connected_prompt_blocks_stale_board_passthrough():
    node = deno_ideogram_director.DenoIdeogramDirector()
    existing_board = {
        "boxes": [
            {
                "id": 1,
                "x": 0.1,
                "y": 0.2,
                "w": 0.3,
                "h": 0.4,
                "type": "obj",
                "desc": "stale board must not pass through",
                "text": "",
                "palette": [],
            }
        ]
    }
    broken_json = (
        '{"aspect_ratio":"1:1","high_level_description":"broken",'
        '"compositional_deconstruction":{"background":"x","elements":['
        '{"type":"obj","bbox":[100,100,500,500],"desc":"valid first"}},450,380,900,620]}}'
    )

    with pytest.raises(RuntimeError, match="not valid JSON"):
        node.build(
            width=1024,
            height=1024,
            seed=15,
            high_level_description="old prompt",
            caption_data=json.dumps(existing_board),
            import_json=broken_json,
            import_mode="Ask Before Replacing",
        )


def test_ideogram_director_legacy_empty_mode_maps_to_review_first():
    node = deno_ideogram_director.DenoIdeogramDirector()
    existing_board = {
        "boxes": [
            {
                "id": 1,
                "x": 0.1,
                "y": 0.2,
                "w": 0.3,
                "h": 0.4,
                "type": "obj",
                "desc": "manual object should remain",
                "text": "",
                "palette": [],
            }
        ]
    }
    upstream = {
        "high_level_description": "upstream should not replace",
        "compositional_deconstruction": {
            "background": "upstream background",
            "elements": [
                {"type": "obj", "bbox": [100, 100, 900, 900], "desc": "upstream object"}
            ],
        },
    }

    with pytest.raises(RuntimeError, match="A new incoming JSON prompt is waiting"):
        node.build(
            width=1024,
            height=1024,
            seed=16,
            high_level_description="manual prompt should remain",
            caption_data=json.dumps(existing_board),
            import_json=json.dumps(upstream),
            import_mode="Use only when board is empty",
        )


def test_ideogram_director_legacy_ignore_mode_maps_to_review_first():
    node = deno_ideogram_director.DenoIdeogramDirector()
    upstream = {
        "high_level_description": "upstream ignored",
        "compositional_deconstruction": {
            "background": "upstream background",
            "elements": [
                {"type": "obj", "bbox": [100, 100, 900, 900], "desc": "upstream object"}
            ],
        },
    }

    with pytest.raises(RuntimeError, match="A new incoming JSON prompt is waiting"):
        node.build(
            width=1024,
            height=1024,
            seed=17,
            high_level_description="manual empty-board text",
            import_json=json.dumps(upstream),
            import_mode="Ignore input prompt",
        )


def test_ideogram_director_invalid_input_prompt_saved_sig_keeps_current_board():
    node = deno_ideogram_director.DenoIdeogramDirector()
    broken_json = '{"aspect_ratio":"1:1","high_level_description":"broken",'
    existing_board = {
        "boxes": [
            {
                "id": 1,
                "x": 0.1,
                "y": 0.2,
                "w": 0.3,
                "h": 0.4,
                "type": "obj",
                "desc": "kept object",
                "text": "",
                "palette": [],
            }
        ],
        "importSig": deno_ideogram_director._import_sig(broken_json),
    }

    prompt, _width, _height, _seed, bboxes = node.build(
        width=1024,
        height=1024,
        seed=18,
        high_level_description="kept prompt",
        caption_data=json.dumps(existing_board),
        import_json=broken_json,
        import_mode="Ask Before Replacing",
    )

    decoded = json.loads(prompt)
    assert decoded["high_level_description"] == "kept prompt"
    assert decoded["compositional_deconstruction"]["elements"][0]["desc"] == "kept object"
    assert "broken" not in prompt
    assert bboxes


def test_ideogram_director_invalid_input_prompt_never_falls_back_to_text():
    node = deno_ideogram_director.DenoIdeogramDirector()
    broken_json = '{"aspect_ratio":"1:1","prompt":"raw prompt from invalid json",'
    accepted_board = {
        "boxes": [],
        "importSig": deno_ideogram_director._import_sig(broken_json),
    }

    prompt, _width, _height, _seed, bboxes = node.build(
        width=1024,
        height=1024,
        seed=20,
        high_level_description="current manual prompt",
        background="",
        caption_data=json.dumps(accepted_board),
        import_json=broken_json,
        import_mode="Ask Before Replacing",
    )

    decoded = json.loads(prompt)
    assert decoded["high_level_description"] == "current manual prompt"
    assert "raw prompt from invalid json" not in prompt
    assert bboxes == []


def test_ideogram_director_invalid_input_prompt_saved_sig_works_in_always_replace_mode():
    node = deno_ideogram_director.DenoIdeogramDirector()
    broken_json = '{"aspect_ratio":"1:1","high_level_description":"broken",'
    accepted_board = {
        "boxes": [
            {
                "id": 1,
                "x": 0.2,
                "y": 0.2,
                "w": 0.2,
                "h": 0.2,
                "type": "obj",
                "desc": "current object survives always replace bad JSON",
                "text": "",
                "palette": [],
            }
        ],
        "importSig": deno_ideogram_director._import_sig(broken_json),
    }

    prompt, _width, _height, _seed, _bboxes = node.build(
        width=1024,
        height=1024,
        seed=20,
        high_level_description="current board prompt",
        caption_data=json.dumps(accepted_board),
        import_json=broken_json,
        import_mode="Always Replace",
    )

    decoded = json.loads(prompt)
    assert decoded["high_level_description"] == "current board prompt"
    assert decoded["compositional_deconstruction"]["elements"][0]["desc"] == "current object survives always replace bad JSON"
    assert "broken" not in prompt


def test_ideogram_director_invalid_input_prompt_empty_mode_keeps_current_non_empty_board():
    node = deno_ideogram_director.DenoIdeogramDirector()
    broken_json = '{"aspect_ratio":"1:1","high_level_description":"broken",'
    existing_board = {
        "boxes": [
            {
                "id": 1,
                "x": 0.1,
                "y": 0.2,
                "w": 0.3,
                "h": 0.4,
                "type": "obj",
                "desc": "kept object",
                "text": "",
                "palette": [],
            }
        ]
    }

    with pytest.raises(RuntimeError, match="not valid JSON"):
        node.build(
            width=1024,
            height=1024,
            seed=19,
            high_level_description="kept prompt",
            caption_data=json.dumps(existing_board),
            import_json=broken_json,
            import_mode="Use only when board is empty",
        )


def test_ideogram_director_compact_llm_json_normalizes_to_boxes():
    node = deno_ideogram_director.DenoIdeogramDirector()
    compact = {
        "aspect_ratio": "1344:736",
        "prompt": "a calico cat drinking from a ceramic bowl in a kitchen",
        "bg": "a tiled indoor kitchen with a bright window",
        "elements": [
            {
                "type": "obj",
                "bbox": [280, 780, 850, 350],
                "description": "calico cat leaning forward to drink",
            },
            {
                "type": "obj",
                "bbox": [680, 420, 900, 760],
                "desc": "round ceramic bowl on the floor",
            },
        ],
    }

    packet = node.build(
        width=992,
        height=992,
        seed=21,
        import_json=json.dumps(compact, ensure_ascii=False),
        import_mode="Always Replace",
    )

    prompt, _width, _height, _seed, bboxes = packet["result"]
    decoded = json.loads(prompt)
    assert decoded["high_level_description"] == compact["prompt"]
    assert decoded["compositional_deconstruction"]["background"] == compact["bg"]
    assert "bg" not in decoded
    assert "elements" not in decoded
    elements = decoded["compositional_deconstruction"]["elements"]
    assert elements[0]["desc"] == "calico cat leaning forward to drink"
    assert elements[0]["bbox"] == [280, 350, 850, 780]
    assert len(bboxes[0]) == 2
    assert bboxes[0][0]["x"] == 347
    assert packet["ui"]["idd_import"][0]["used"] is True


def test_ideogram_director_frontend_connected_prompt_contract():
    script = (REPO_ROOT / "web" / "js" / "deno_ideogram_director.js").read_text(encoding="utf-8")

    input_types = deno_ideogram_director.DenoIdeogramDirector.INPUT_TYPES()
    assert input_types["hidden"]["unique_id"] == "UNIQUE_ID"
    assert 'const IMPORT_REVIEW = "Ask Before Replacing"' in script
    assert 'const IMPORT_AUTO = "Always Replace"' in script
    assert 'IMPORT_CHOICES = [IMPORT_REVIEW, IMPORT_AUTO]' in script
    assert 'const IMPORT_EMPTY' not in script
    assert 'const IMPORT_IGNORE' not in script
    assert 'const PENDING_EVENT = "deno-ideogram-director-pending"' in script
    assert 'api?.addEventListener?.("execution_error"' in script
    assert "function matchesEventNode(node, detail)" in script
    assert "detail?.display_node" in script
    assert "function normalizeCaption(cap)" in script
    assert 'firstList(cap, ["elements", "objects", "items", "bboxes", "boxes"])' in script
    assert 'const importBtn = mkBtn(IMPORT_REVIEW)' in script
    assert 'const runAlertAccept = el("button", "primary idd-alert-accept")' in script
    assert 'const runAlertKeep = el("button", "idd-alert-keep")' in script
    assert 'top.append(layoutsBtn, el("span", "idd-sp"), importBtn, resWrap, translateBtn, seedPill, regen)' in script
    assert "acceptPrompt" not in script
    assert "keepPrompt" not in script
    assert "function handleConnectedPromptEcho(cap, sig)" in script
    assert "function handleInputPromptRaw(raw)" in script
    assert "function isStaticImportJsonSource(src)" in script
    assert "if (src && isStaticImportJsonSource(src))" in script
    assert "such as Local LLM Loader" in script
    assert "onPendingImport: (p) =>" in script
    assert "onExecutionError: (p) =>" in script
    assert 'const runAlert = el("div", "idd-runalert")' in script
    assert 'function showExecutionError(d)' in script
    assert "function importJsonFromExecutionError(d)" in script
    assert "const raw = importJsonFromExecutionError(d)" in script
    assert "Incoming JSON Prompt" in script
    assert '"auto replace": IMPORT_REVIEW' in script
    assert '"auto": IMPORT_REVIEW' in script
    assert "Check the JSON prompt." in script
    assert "The incoming JSON prompt is not valid JSON" in script
    assert "Please regenerate it, or keep the current board and run again." in script
    assert "A new JSON prompt is waiting." in script
    assert "Apply and Replace" in script
    assert "Keep Current Board" in script
    assert "function showInputPromptNotice()" in script
    assert "function acknowledgeInvalidPromptIfBoardChanged()" in script
    assert "function installDirectorQueuePromptHook()" in script
    assert "preflightIncomingPromptBeforeQueue: () =>" in script
    assert 'deno_ideogram_director: "incoming_prompt_waiting"' in script
    assert "텍스트만 사용" not in script
    assert "Use Text as Prompt" not in script
    assert "function applyInvalidInputAsPrompt()" not in script
    assert "function queueAfterIncomingPromptDecision()" in script
    assert "await app.queuePrompt(0)" in script
    assert "function connectedPromptAlreadyCurrent(sig)" in script
    assert "queueInvalidInputPrompt(p.sig || fnv1a(p.json), p.json)" in script
    assert "handleConnectedPromptEcho(cap, sig)" in script
    assert "queuePendingImport(cap, sig)" in script
    assert 'importBtn.textContent = pendingImport.invalid ? "JSON Needs Review" : "Prompt Needs Review"' in script
    assert 'row.addEventListener("dblclick"' in script
    assert "openElementEditor(idx)" in script
    assert "if (p.used)" not in script
    assert "applyConnectedPrompt(cap, sig, true);       // persist boxes + importSig" not in script


def test_ideogram_director_frontend_preserves_node_size_during_compute_fit():
    script = (REPO_ROOT / "web" / "js" / "deno_ideogram_director.js").read_text(encoding="utf-8")

    assert 'const IDD_REV = "r2026.06.16-recreate-size-j"' in script
    assert "function installIddComputeSizeGuard()" in script
    assert "function installIddResizeIntentGuard()" in script
    assert "const fitTopBarSoon = () =>" in script
    assert "const recreatedTooSmall = marked && (sw < IDD_MIN_W || sh < IDD_MIN_H)" in script
    assert "guardedComputeSize._denoIddComputeSizeGuard = true" in script
    assert "setTimeout(installIddComputeSizeGuard, 250)" in script
    assert "const iddSizeValue = (size, index, fallback = 0) => iddPositive(size && size[index], fallback)" in script
    assert "let iddUseConfiguredSize = true" in script
    assert "let iddUserResizing = false" in script
    assert "const preserveCurrent = !iddUserResizing" in script
    assert "const current = this.size || []" in script
    assert "const configured = iddUseConfiguredSize ? (this._iddConfiguredSize || []) : []" in script
    assert "iddUseConfiguredSize = false" in script
    assert "node._iddConfiguredSize = null" in script
    assert "Array.isArray(this.size)" not in script
    assert "Array.isArray(this._iddConfiguredSize)" not in script
    assert "preserveCurrent ? iddSizeValue(current, 1) : 0" in script
    assert "iddSizeValue(configured, 1)" in script
    assert 'written.then(() => done("✓ Copied"), () => done("Copy failed"))' in script


def test_ideogram_director_compute_size_guard_does_not_restore_stale_saved_size(tmp_path):
    node_bin = shutil.which("node")
    if not node_bin:
        pytest.skip("node runtime not available")

    script = (REPO_ROOT / "web" / "js" / "deno_ideogram_director.js").read_text(encoding="utf-8")
    start = script.index("        const iddPositive =")
    end = script.index("        // Reset stale pre-marker saved sizes once.", start)
    guard_block = "\n".join(
        line[8:] if line.startswith("        ") else line
        for line in script[start:end].splitlines()
    )
    harness = f"""
const IDD_DEFAULT_W = 850;
const IDD_DEFAULT_H = 1000;
const IDD_MIN_W = 760;
const IDD_MIN_H = 560;
let node = {{
  size: {{0: 800, 1: 700}},
  _iddConfiguredSize: {{0: 850, 1: 1000}},
  computeSize() {{ return [760, 598]; }},
}};
let app = {{ canvas: null }};
{guard_block}
function same(a, b) {{ return JSON.stringify(a) === JSON.stringify(b); }}
function check(actual, expected, label) {{
  if (!same(actual, expected)) {{
    console.error(label + " expected " + JSON.stringify(expected) + " got " + JSON.stringify(actual));
    process.exit(1);
  }}
}}
installIddComputeSizeGuard();
check(node.computeSize(), [850, 1000], "configured size participates during initial restore");
iddUseConfiguredSize = false;
node._iddConfiguredSize = null;
check(node.computeSize(), [800, 700], "manual shrink wins after initial restore");
node.size = {{0: 900, 1: 1100}};
check(node.computeSize(), [900, 1100], "manual grow wins after initial restore");
iddUserResizing = true;
check(node.computeSize(), [760, 598], "active user resize ignores current enlarged box");
iddUserResizing = false;
check(node.computeSize(), [900, 1100], "finished resize preserves chosen size again");
node.size = {{0: 850, 1: 1000}};
check(node.computeSize(), [850, 1000], "fit path preserves current default");
"""
    result = subprocess.run([node_bin, "-e", harness], text=True, capture_output=True)
    assert result.returncode == 0, result.stderr


def test_ideogram_director_rejects_non_english_output_language(monkeypatch):
    def explode(*args, **kwargs):
        raise AssertionError("non-English Director translation choices should be ignored")

    monkeypatch.setattr(engine, "_request_gtx", explode)
    node = deno_ideogram_director.DenoIdeogramDirector()

    result = node.build(
        width=1024,
        height=1024,
        seed=9,
        high_level_description="a cat in the sky",
        translate_output="한국어",
    )

    assert not isinstance(result, dict)
    prompt = json.loads(result[0])
    assert prompt["high_level_description"] == "a cat in the sky"
