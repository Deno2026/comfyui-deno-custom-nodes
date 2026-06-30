import sys
from pathlib import Path

import deno_sos_report


def test_sos_prompt_includes_python_environment_and_error():
    report, warnings = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "frontend": {
            "origin": "http://127.0.0.1:8188",
            "href": "http://127.0.0.1:8188/",
            "language": "ko-KR",
            "languages": ["ko-KR", "en-US"],
        },
        "last_error": {
            "node_id": "7",
            "node_type": "KSampler",
            "exception_message": "CUDA out of memory",
            "exception_type": "RuntimeError",
            "traceback": ["line one", "line two"],
        },
        "queue": {"queue_running": [], "queue_pending": []},
        "system_stats": {"system": {"comfyui_version": "0.3.test"}},
    })

    assert warnings is not None
    assert "나는 ComfyUI 초보입니다." in report
    assert "python.exe" in report
    assert "브라우저 언어: ko-KR, en-US" in report
    assert "LLM 계정/앱의 선호 응답 언어" in report
    assert "에러 메시지, traceback, 경로, 패키지명, 노드명, 명령어는 번역하지 말고" in report
    assert "판별:" in report
    assert "sys.prefix" in report
    assert "VIRTUAL_ENV" in report
    assert "CONDA_PREFIX" in report
    assert "CUDA out of memory" in report
    assert "KSampler" in report
    assert "현재 workflow JSON" not in report


def test_frontend_snapshot_drops_non_language_payload_text():
    sentinel = "DENO_SECRET_SENTINEL_PRIVATE_PROMPT"

    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "frontend": {
            "origin": "http://127.0.0.1:8188/path?token=abc",
            "href": f"http://127.0.0.1:8188/?prompt={sentinel}",
            "language": "ko-KR",
            "languages": ["ko-KR", sentinel, "en-US"],
            "user_agent": sentinel,
        },
    })

    assert sentinel not in report
    assert "ComfyUI 주소: http://127.0.0.1:8188" in report
    assert "브라우저 언어: ko-KR, en-US" in report


def test_execution_error_frontend_url_does_not_leak_raw_href():
    sentinel = "DENO_SECRET_SENTINEL_PRIVATE_PROMPT"

    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "frontend_url": f"http://127.0.0.1:8188/?prompt={sentinel}#workflow={sentinel}",
            "exception_message": "boom",
        },
    })

    assert sentinel not in report
    assert "?prompt=" not in report
    assert "#workflow=" not in report
    assert "frontend_url" not in report
    assert '"frontend_origin": "http://127.0.0.1:8188"' in report


def test_sos_prompt_includes_workflow_only_when_requested():
    workflow = {"nodes": [{"id": 1, "type": "DefinitelyMissingNodeForTest"}]}

    without_workflow, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "workflow": workflow,
        "history_errors": [{"node_type": "HistoryNode", "exception_message": "history failure"}],
    })
    with_workflow, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": True,
        "workflow": workflow,
    })

    assert "현재 workflow JSON" not in without_workflow
    assert "DefinitelyMissingNodeForTest" not in without_workflow
    assert "현재 workflow JSON" in with_workflow
    assert "DefinitelyMissingNodeForTest" in with_workflow


def test_workflow_section_keeps_priority_over_large_tail_sections(monkeypatch):
    monkeypatch.setattr(deno_sos_report, "_package_versions", lambda warnings: {})
    monkeypatch.setattr(deno_sos_report, "_recent_logs", lambda warnings: "large log line\n" * 2000)
    monkeypatch.setattr(
        deno_sos_report,
        "_custom_nodes_snapshot",
        lambda custom_nodes_dir, warnings: [
            {
                "name": f"CustomNode{i:03d}",
                "remote": f"https://example.com/node{i:03d}.git",
                "branch": "main",
                "commit": "abcdef123456",
            }
            for i in range(160)
        ],
    )
    workflow = {
        "nodes": [
            {
                "id": 1,
                "type": "DenoWorkflowPriorityProbe",
                "widgets_values": ["x" * 30000, "WORKFLOW_SENTINEL_END"],
            }
        ]
    }

    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": True,
        "workflow": workflow,
    })

    assert "WORKFLOW_SENTINEL_END" in report
    assert report.index("### 현재 workflow JSON") < report.index("## custom_nodes 목록")
    assert report.index("### 현재 workflow JSON") < report.index("## 최근 로그 마지막 부분")


def test_python_snapshot_classifies_embedded_python(monkeypatch, tmp_path):
    exe = tmp_path / "python_embeded" / "python.exe"
    exe.parent.mkdir()
    exe.write_text("", encoding="utf-8")
    (exe.parent / "python311._pth").write_text(".", encoding="utf-8")

    monkeypatch.setattr(sys, "executable", str(exe))
    monkeypatch.setattr(sys, "prefix", str(exe.parent))
    monkeypatch.setattr(sys, "base_prefix", str(exe.parent))
    monkeypatch.delenv("VIRTUAL_ENV", raising=False)
    monkeypatch.delenv("CONDA_PREFIX", raising=False)

    snapshot = deno_sos_report._python_snapshot()

    assert snapshot["kind"] == "embedded/portable"
    assert "python_embeded" in snapshot["evidence"]
    assert "python*._pth" in snapshot["evidence"]


def test_git_snapshot_reads_metadata_without_process_calls(tmp_path):
    repo = tmp_path / "SomeNode"
    git_dir = repo / ".git"
    refs_dir = git_dir / "refs" / "heads"
    refs_dir.mkdir(parents=True)
    (git_dir / "HEAD").write_text("ref: refs/heads/main\n", encoding="utf-8")
    (refs_dir / "main").write_text("abcdef1234567890abcdef1234567890abcdef12\n", encoding="utf-8")
    (git_dir / "config").write_text(
        "[remote \"origin\"]\n\turl = https://example.com/node.git\n",
        encoding="utf-8",
    )

    snapshot = deno_sos_report._git_snapshot(repo)

    assert snapshot == {
        "remote": "https://example.com/node.git",
        "branch": "main",
        "commit": "abcdef123456",
    }


def test_git_snapshot_ignores_unsafe_head_refs(tmp_path):
    repo = tmp_path / "SomeNode"
    git_dir = repo / ".git"
    git_dir.mkdir(parents=True)
    (git_dir / "HEAD").write_text("ref: ../../outside-secret\n", encoding="utf-8")
    (tmp_path / "outside-secret").write_text("abcdef1234567890abcdef1234567890abcdef12\n", encoding="utf-8")

    snapshot = deno_sos_report._git_snapshot(repo)

    assert snapshot["branch"] == ""
    assert snapshot["commit"] == ""


def test_git_snapshot_ignores_gitdir_outside_expected_git_storage(tmp_path):
    repo = tmp_path / "SomeNode"
    outside = tmp_path / "outside-storage"
    outside.mkdir(parents=True)
    (outside / "HEAD").write_text("abcdef1234567890abcdef1234567890abcdef12\n", encoding="utf-8")
    repo.mkdir()
    (repo / ".git").write_text(f"gitdir: {outside}\n", encoding="utf-8")

    assert deno_sos_report._git_snapshot(repo) == {}


def test_git_snapshot_accepts_raw_config_percent_urls(tmp_path):
    repo = tmp_path / "SomeNode"
    git_dir = repo / ".git"
    refs_dir = git_dir / "refs" / "heads"
    refs_dir.mkdir(parents=True)
    (git_dir / "HEAD").write_text("ref: refs/heads/main\n", encoding="utf-8")
    (refs_dir / "main").write_text("abcdef1234567890abcdef1234567890abcdef12\n", encoding="utf-8")
    (git_dir / "config").write_text(
        "[remote \"origin\"]\n\turl = https://example.com/%group/node.git\n",
        encoding="utf-8",
    )

    snapshot = deno_sos_report._git_snapshot(repo)

    assert snapshot["remote"] == "https://example.com/%group/node.git"
    assert snapshot["commit"] == "abcdef123456"


def test_sos_report_source_has_no_execution_helpers():
    source = Path(deno_sos_report.__file__).read_text(encoding="utf-8")

    forbidden = (
        "sub" + "process",
        "os." + "system(",
        "os." + "popen(",
        "Po" + "pen(",
        "startfile",
        "pip " + "install",
        "git " + "pull",
    )
    for token in forbidden:
        assert token not in source


def test_sos_report_redacts_common_secret_shapes():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                "remote=https://ghp_abcdefghijklmnopqrstuvwxyz123456@github.com/private/repo.git "
                "Authorization: Bearer sk-proj-abcdefghijklmnopqrstuvwxyz123456 "
                "hf_abcdefghijklmnopqrstuvwxyz123456 token=my-secret api_key=abc123"
            )
        },
        "history_errors": [
            {"exception_message": "github_pat_abcdefghijklmnopqrstuvwxyz_1234567890"}
        ],
    })

    assert "ghp_abcdefghijklmnopqrstuvwxyz123456" not in report
    assert "sk-proj-abcdefghijklmnopqrstuvwxyz123456" not in report
    assert "hf_abcdefghijklmnopqrstuvwxyz123456" not in report
    assert "my-secret" not in report
    assert "abc123" not in report
    assert "github_pat_abcdefghijklmnopqrstuvwxyz_1234567890" not in report
    assert "https://***@github.com/private/repo.git" in report
    assert "Authorization: ***" in report


def test_sos_report_redacts_expanded_secret_shapes():
    text = " ".join([
        "CIVITAI_API_TOKEN=abc123secretvalue",
        "HF_TOKEN=hf_xxxxx",
        "OPENAI_API_KEY=sk-xxxxx",
        "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        "AWS_ACCESS_KEY_ID=AKIAABCDEFGHIJKLMNOP",
        "MY_SECRET_KEY=abc123",
        "secret_key=abc123",
        "private_key=abc123",
        "client_secret=abc123",
        "auth_token=abc123",
        "apiToken=abc123",
        "password=hunter2",
        "https://x.test/?client_secret=abc123&token=def456",
        "Bearer abcdefghijklmnopqrstuvwxyz",
    ])

    redacted = deno_sos_report._redact_text(text)

    for secret in (
        "abc123secretvalue",
        "hf_xxxxx",
        "sk-xxxxx",
        "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        "AKIAABCDEFGHIJKLMNOP",
        "hunter2",
        "def456",
        "abcdefghijklmnopqrstuvwxyz",
    ):
        assert secret not in redacted
    assert "CIVITAI_API_TOKEN=***" in redacted
    assert "client_secret=***" in redacted
    assert "auth_token=***" in redacted
    assert "apiToken=***" in redacted
    assert "password=***" in redacted
    assert "Bearer ***" in redacted


def test_sos_report_redacts_json_sensitive_keys():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": True,
        "workflow": {
            "CIVITAI_API_TOKEN": "abc123secretvalue",
            "OPENAI_API_KEY": "sk-testsecret",
            "nodes": [{
                "id": 1,
                "type": "SafeNode",
                "inputs": {
                    "api_key": "abc123",
                    "client_secret": "def456",
                    "auth_token": "ghi789",
                    "password": "hunter2",
                    "nested": {
                        "AWS_SECRET_ACCESS_KEY": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
                        "private_key": "private-secret",
                        "Authorization": "shortsecret",
                        "Cookie": "sessionid=abc",
                        "jwt": "jwtsecret",
                        "credential": "credsecret",
                    },
                },
            }],
        },
        "last_error": {
            "node_type": "SecretNode",
            "exception_message": "normal error",
        },
        "history_errors": [
            {"exception_message": "normal error", "secret_key": "history-secret"},
        ],
    })

    for secret in (
        "abc123secretvalue",
        "abc123",
        "def456",
        "ghi789",
        "hunter2",
        "wJalrXUtnFEMI",
        "private-secret",
        "history-secret",
        "sk-testsecret",
        "shortsecret",
        "sessionid=abc",
        "jwtsecret",
        "credsecret",
    ):
        assert secret not in report
    assert '"CIVITAI_API_TOKEN": "***"' in report
    assert '"api_key": "***"' in report
    assert '"client_secret": "***"' in report
    assert '"auth_token": "***"' in report
    assert '"password": "***"' in report
    assert '"AWS_SECRET_ACCESS_KEY": "***"' in report
    assert '"private_key": "***"' in report
    assert '"OPENAI_API_KEY": "***"' in report
    assert '"Authorization": "***"' in report
    assert '"Cookie": "***"' in report
    assert '"jwt": "***"' in report
    assert '"credential": "***"' in report


def test_workflow_off_does_not_leak_workflow_through_execution_error_or_history():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "node_type": "X",
            "exception_message": "boom",
            "traceback": ["line 1", "line 2"],
            "executed": ["1"],
            "current_inputs": {
                "text": "private prompt text",
                "workflow": {"nodes": [{"type": "SecretWorkflowNode"}]},
            },
            "extra_pnginfo": {
                "workflow": {"nodes": [{"type": "FullWorkflowNode"}]},
            },
        },
        "history_errors": [{
            "prompt_id": "p",
            "node_type": "HistoryNode",
            "exception_message": "history boom",
            "current_outputs": {"text": "history private text"},
            "workflow": {"nodes": [{"type": "HistoryWorkflowNode"}]},
        }],
    })

    for leaked in (
        "private prompt text",
        "SecretWorkflowNode",
        "FullWorkflowNode",
        "history private text",
        "HistoryWorkflowNode",
        "current_inputs",
        "current_outputs",
        "extra_pnginfo",
    ):
        assert leaked not in report

    assert "boom" in report
    assert "history boom" in report
    assert "node_type" in report
    assert "traceback" in report


def test_sos_report_redacts_string_cookie_jwt_session_credential_shapes():
    report, _ = deno_sos_report.build_sos_prompt({
        "last_error": {
            "exception_message": (
                "Cookie: sessionid=abc "
                "Set-Cookie: sid=def "
                "JWT=jwtsecret "
                "credential=credsecret "
                "Authorization=Bearer shortsecret "
                "Authorization=shortsecret2 "
                "session_id=abcdef "
                "auth=authsecret "
                "https://x.test/?session_id=urlsession&jwt=urljwt&credential=urlcred"
            )
        },
        "history_errors": [
            {"exception_message": "auth=secret jwt=jwtsecret2"}
        ],
    })

    for secret in (
        "sessionid=abc",
        "sid=def",
        "jwtsecret",
        "credsecret",
        "shortsecret",
        "shortsecret2",
        "abcdef",
        "authsecret",
        "urlsession",
        "urljwt",
        "urlcred",
        "jwtsecret2",
    ):
        assert secret not in report


def test_sos_report_redacts_jsonish_secret_strings():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                'headers={"Authorization":"Bearer shortsecret",'
                '"api_key":"abc123",'
                '"password":"hunter2",'
                '\\"access_token\\":\\"escapedtoken\\"}'
            )
        },
        "history_errors": [
            {"exception_message": '{"client_secret":"def456","Cookie":"siddef"}'}
        ],
    })

    for secret in (
        "shortsecret",
        "abc123",
        "hunter2",
        "escapedtoken",
        "def456",
        "siddef",
    ):
        assert secret not in report
    for key in ("Authorization", "api_key", "password", "access_token", "client_secret", "Cookie"):
        assert key in report


def test_sos_report_redacts_full_cookie_header_and_quoted_secret_assignments():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                "Cookie: first=alphaSecret; second=betaSecret; third=gammaSecret\n"
                "Set-Cookie: sid=deltaSecret; Path=/; HttpOnly\n"
                "password='correct horse battery staple'\n"
                'api_key="abc def ghi"'
            )
        },
    })

    for secret in (
        "alphaSecret",
        "betaSecret",
        "gammaSecret",
        "deltaSecret",
        "correct horse battery staple",
        "abc def ghi",
        "horse battery staple",
        "def ghi",
    ):
        assert secret not in report


def test_sos_report_redacts_multiline_quoted_secret_values():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                "private_key='-----BEGIN PRIVATE KEY-----\n"
                "ABCDEFSECRET\n"
                "-----END PRIVATE KEY-----'\n"
                'api_key="line1\nline2"'
            )
        },
    })

    for secret in (
        "ABCDEFSECRET",
        "line1",
        "line2",
        "BEGIN PRIVATE KEY",
        "END PRIVATE KEY",
    ):
        assert secret not in report


def test_sos_report_redacts_listish_cookie_assignment_and_quoted_auth_strings():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                'headers={"Authorization":["Bearer tok_abcdefghijklmnopqrstuvwxyz1234567890"],'
                '"api_key":["abc123secretvalue"]}\n'
                "api_key=['abc123secretvalue2']\n"
                "HTTP_COOKIE=first=alphaSecret; second=betaSecret; third=gammaSecret\n"
                'Authorization: Bearer "quotedtokenabcdefghijklmnopqrstuvwxyz"\n'
                "password: correct horsesecret tail"
            )
        },
    })

    for secret in (
        "tok_abcdefghijklmnopqrstuvwxyz1234567890",
        "abc123secretvalue",
        "abc123secretvalue2",
        "alphaSecret",
        "betaSecret",
        "gammaSecret",
        "quotedtokenabcdefghijklmnopqrstuvwxyz",
        "horsesecret tail",
    ):
        assert secret not in report


def test_sos_report_redacts_object_block_and_space_tailed_secret_strings():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                "api_key: abc def ghi\n"
                "access_token: abc def ghi\n"
                "credential: abc def ghi\n"
                'headers={"api_key":{"value":"abc123secretvalue"}}\n'
                'headers={"client_secret":{"value":"clientsecretvalue"}}\n'
                "api_key: |\n"
                "  blocksecret1\n"
                "  blocksecret2"
            )
        },
    })

    for secret in (
        "def ghi",
        "abc123secretvalue",
        "clientsecretvalue",
        "blocksecret1",
        "blocksecret2",
    ):
        assert secret not in report


def test_sos_report_redacts_workflow_on_logs_with_object_and_array_secrets(monkeypatch):
    monkeypatch.setattr(
        deno_sos_report,
        "_recent_logs",
        lambda warnings: (
            "headers={\n"
            '  "client_secret": {\n'
            '    "value": "longsecretabcdefghijklmnopqrstuvwxyz"\n'
            "  },\n"
            '  "api_key": [\n'
            '    "abc123secretvalue"\n'
            "  ]\n"
            "}"
        ),
    )

    report, _ = deno_sos_report.build_sos_prompt({"include_workflow": True})

    for secret in (
        "longsecretabcdefghijklmnopqrstuvwxyz",
        "abc123secretvalue",
    ):
        assert secret not in report


def test_sos_report_redacts_equal_space_unquoted_object_and_nested_jsonish_secret_values():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                "api_key=abc def ghi\n"
                "access_token=abc def ghi\n"
                "credential=abc def ghi\n"
                "export API_KEY=export abc tail\n"
                "set CLIENT_SECRET=client secret here\n"
                "client_secret={value: clientsecretvalue}\n"
                "api_key={\"value\":\"abc123secretvalue\"}\n"
                "headers={\"api_key\":{\"meta\":{},\"value\":\"nestedsecret\"}}\n"
                "headers={\"client_secret\":{\"meta\":{\"x\":1},\"value\":\"nestedsecret2\"}}\n"
                "headers={\"api_key\":[[],\"arraysecret\"]}"
            )
        },
    })

    for secret in (
        "def ghi",
        "abc tail",
        "secret here",
        "clientsecretvalue",
        "abc123secretvalue",
        "nestedsecret",
        "nestedsecret2",
        "arraysecret",
    ):
        assert secret not in report


def test_sos_report_redacts_nested_jsonish_secrets_in_workflow_on_logs(monkeypatch):
    monkeypatch.setattr(
        deno_sos_report,
        "_recent_logs",
        lambda warnings: (
            'headers={"api_key":{"meta":{},"value":"logsecret"}}\n'
            'headers={"client_secret":{"meta":{"x":1},"value":"logsecret2"}}\n'
            'headers={"api_key":[[],"arraylogsecret"]}'
        ),
    )

    report, _ = deno_sos_report.build_sos_prompt({"include_workflow": True})

    for secret in ("logsecret", "logsecret2", "arraylogsecret"):
        assert secret not in report


def test_sos_report_redacts_nonindented_multiline_secret_objects_and_arrays():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                'api_key=[\n"ARRAY_MULTILINE_SECRET"\n]\n'
                'api_key={\n"value":"OBJECT_MULTILINE_SECRET"\n}'
            )
        },
    })

    assert "ARRAY_MULTILINE_SECRET" not in report
    assert "OBJECT_MULTILINE_SECRET" not in report


def test_sos_report_redacts_truncated_multiline_secret_objects_and_arrays():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                'api_key=[\n"UNCLOSED_ARRAY_SECRET"\n'
                'client_secret={\n"value":"UNCLOSED_OBJECT_SECRET"\n'
            )
        },
    })

    assert "UNCLOSED_ARRAY_SECRET" not in report
    assert "UNCLOSED_OBJECT_SECRET" not in report


def test_sos_report_redacts_unclosed_multiline_secret_objects_and_arrays():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                'api_key={\n'
                '"value":"UNCLOSED_OBJECT_SECRET"\n'
                '\n'
                'api_key=[\n'
                '"UNCLOSED_ARRAY_SECRET"\n'
            )
        },
    })

    assert "UNCLOSED_OBJECT_SECRET" not in report
    assert "UNCLOSED_ARRAY_SECRET" not in report


def test_sos_report_redacts_later_sensitive_block_assignment_on_same_line():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                'token=SCALAR_SECRET api_key=[\n"SECOND_ARRAY_SECRET"\n]\n'
                'headers={"api_key":"JSONISH_SECRET"} client_secret={\n'
                '"value":"SECOND_OBJECT_SECRET"\n}'
            )
        },
    })

    for secret in (
        "SCALAR_SECRET",
        "SECOND_ARRAY_SECRET",
        "JSONISH_SECRET",
        "SECOND_OBJECT_SECRET",
    ):
        assert secret not in report


def test_sos_report_redacts_bracket_and_encoded_query_secret_keys():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                "https://x.test/callback?api_key[]=BRACKET_QUERY_SECRET&ok=1\n"
                "https://x.test/callback?api%5Fkey=ENCODED_QUERY_SECRET&ok=1\n"
                "Authorization: [Bearer BRACKET_AUTH_SECRET]"
            )
        },
    })

    for secret in (
        "BRACKET_QUERY_SECRET",
        "ENCODED_QUERY_SECRET",
        "BRACKET_AUTH_SECRET",
    ):
        assert secret not in report


def test_sos_report_redacts_tuple_and_bracket_property_header_secrets():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                "headers=[('Authorization', 'Token TUPLE_AUTH_TOKEN_SECRET'), "
                "('Cookie', 'sid=TUPLE_COOKIE_SECRET'), "
                "('X-Api-Key', 'TUPLE_APIKEY_SECRET')]\n"
                "headers['Authorization']=Token JS_BRACKET_AUTH_SECRET\n"
                "headers['Cookie']=sid=JS_BRACKET_COOKIE_SECRET"
            )
        },
    })

    for secret in (
        "TUPLE_AUTH_TOKEN_SECRET",
        "TUPLE_COOKIE_SECRET",
        "TUPLE_APIKEY_SECRET",
        "JS_BRACKET_AUTH_SECRET",
        "JS_BRACKET_COOKIE_SECRET",
    ):
        assert secret not in report


def test_sos_report_redacts_key_value_pair_secret_dumps():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                "headers=[('api_key', 'TUPLE_API_SECRET'), "
                "('client_secret', 'TUPLE_CLIENT_SECRET')]\n"
                'headers=[["api_key","ARRAY_PAIR_SECRET"]]\n'
                'headers=[{"name":"api_key","value":"NAME_VALUE_SECRET"}]\n'
                'headers=[{"key":"client_secret","value":"KEY_VALUE_SECRET"}]'
            )
        },
    })

    for secret in (
        "TUPLE_API_SECRET",
        "TUPLE_CLIENT_SECRET",
        "ARRAY_PAIR_SECRET",
        "NAME_VALUE_SECRET",
        "KEY_VALUE_SECRET",
    ):
        assert secret not in report


def test_sos_report_redacts_value_first_name_value_secret_dumps():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                '{"value":"VALUE_FIRST_API_SECRET","name":"api_key"}\n'
                '{"value":"VALUE_FIRST_CLIENT_SECRET","key":"client_secret"}\n'
                'headers=[{"value":"VF_ARRAY_SECRET","name":"api_key"}]\n'
                "headers=[{'value':'VF_SINGLE_SECRET','name':'api_key'}]"
            )
        },
    })

    for secret in (
        "VALUE_FIRST_API_SECRET",
        "VALUE_FIRST_CLIENT_SECRET",
        "VF_ARRAY_SECRET",
        "VF_SINGLE_SECRET",
    ):
        assert secret not in report


def test_sos_report_redacts_multi_key_jsonish_secret_strings(monkeypatch):
    monkeypatch.setattr(
        deno_sos_report,
        "_recent_logs",
        lambda warnings: (
            '{"api_key":"LOG_A_SECRET",'
            '"client_secret":"LOG_B_SECRET",'
            '"access_token":"LOG_C_SECRET"}'
        ),
    )

    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": True,
        "last_error": {
            "exception_message": (
                '{"api_key":"A_SECRET",'
                '"client_secret":"B_SECRET",'
                '"access_token":"C_SECRET"}\n'
                '{"apiKey":"CAMEL_A_SECRET",'
                '"clientSecret":"CAMEL_B_SECRET",'
                '"accessToken":"CAMEL_C_SECRET"}'
            ),
            "traceback": (
                '{"apiKey":"TRACE_A_SECRET",'
                '"clientSecret":"TRACE_B_SECRET"}'
            ),
        },
    })

    for secret in (
        "A_SECRET",
        "B_SECRET",
        "C_SECRET",
        "CAMEL_A_SECRET",
        "CAMEL_B_SECRET",
        "CAMEL_C_SECRET",
        "TRACE_A_SECRET",
        "TRACE_B_SECRET",
        "LOG_A_SECRET",
        "LOG_B_SECRET",
        "LOG_C_SECRET",
    ):
        assert secret not in report


def test_sos_report_redacts_spaced_name_value_and_yamlish_secret_records():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                '{"name":"api key","value":"SPACED_NAME_SECRET"}\n'
                '{"value":"VALUE_FIRST_SPACED_NAME_SECRET","name":"api key"}\n'
                "name: api_key\n"
                "value: YAML_NAME_SECRET"
            )
        },
    })

    for secret in (
        "SPACED_NAME_SECRET",
        "VALUE_FIRST_SPACED_NAME_SECRET",
        "YAML_NAME_SECRET",
    ):
        assert secret not in report


def test_sos_report_redacts_spaced_private_key_pem_blocks():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                "private key: -----BEGIN OPENSSH PRIVATE KEY-----\n"
                "OPENSSHSECRET\n"
                "-----END OPENSSH PRIVATE KEY-----"
            )
        },
    })

    assert "OPENSSHSECRET" not in report
    assert "BEGIN OPENSSH PRIVATE KEY" not in report
    assert "END OPENSSH PRIVATE KEY" not in report


def test_sos_report_redacts_empty_username_url_credentials():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": "redis://:REDISSECRET@localhost:6379/0"
        },
    })

    assert "REDISSECRET" not in report
    assert "redis://***@localhost" in report


def test_sos_report_redaction_acceptance_criteria(monkeypatch):
    private_workflow = "ACCEPT_PRIVATE_WORKFLOW_PROMPT"
    monkeypatch.setattr(
        deno_sos_report,
        "_recent_logs",
        lambda warnings: (
            'ACCEPT_RAW_LOG_PROMPT headers={"api_key":"ACCEPT_LOG_API_SECRET"}'
        ),
    )

    off_report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "workflow": {"nodes": [{"type": private_workflow, "widgets_values": [private_workflow]}]},
        "queue": {
            "queue_running": [[1, "pid", {"prompt": private_workflow, "workflow": private_workflow}]],
            "queue_pending": [[2, "pid2", {"extra_pnginfo": {"workflow": private_workflow}}]],
            "error": private_workflow,
        },
        "last_error": {
            "exception_message": "safe scalar error",
            "traceback": ["safe scalar traceback"],
            "current_inputs": {"prompt": private_workflow},
            "current_outputs": {"image": private_workflow},
            "workflow": private_workflow,
            "extra_pnginfo": {"workflow": private_workflow},
        },
        "history_errors": [{
            "exception_message": "safe scalar history",
            "current_inputs": {"prompt": private_workflow},
            "workflow": private_workflow,
            "extra_pnginfo": {"workflow": private_workflow},
        }],
        "system_stats": {
            "system": {"comfyui_version": "test", "workflow": private_workflow, "prompt": private_workflow},
            "devices": [{"name": "gpu", "workflow": private_workflow}],
        },
    })

    for sentinel in (
        private_workflow,
        "ACCEPT_RAW_LOG_PROMPT",
        "ACCEPT_LOG_API_SECRET",
    ):
        assert sentinel not in off_report

    on_report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": True,
        "workflow": {
            "api_key": "ACCEPT_WORKFLOW_API_SECRET",
            "nodes": [{
                "id": 1,
                "type": "SafeNode",
                "inputs": {
                    "Authorization": "Bearer ACCEPT_WORKFLOW_AUTH_SECRET",
                    "Cookie": "sid=ACCEPT_WORKFLOW_COOKIE_SECRET",
                },
            }],
        },
        "last_error": {
            "exception_message": (
                'api_key=ACCEPT_SNAKE_SECRET\n'
                'api-key=ACCEPT_DASH_SECRET\n'
                'api.key=ACCEPT_DOT_SECRET\n'
                'API key: ACCEPT_SPACE_SECRET\n'
                'apiKey=ACCEPT_CAMEL_SECRET\n'
                "headers=[('X-Api-Key', 'ACCEPT_X_HEADER_SECRET')]\n"
                'https://x.test/?api%5Fkey=ACCEPT_ENCODED_UNDERSCORE_SECRET&ok=1\n'
                'https://x.test/#api%2Ekey=ACCEPT_ENCODED_DOT_SECRET\n'
                'password="ACCEPT QUOTED SPACE SECRET"\n'
                'client_secret=["ACCEPT_LIST_SECRET"]\n'
                'auth_token={"value":"ACCEPT_OBJECT_SECRET"}\n'
                'headers=[("api_key", "ACCEPT_TUPLE_SECRET")]\n'
                '{"name":"api key","value":"ACCEPT_NAME_VALUE_SECRET"}\n'
                'name: api_key\n'
                'value: ACCEPT_YAML_SECRET\n'
                'private_key={\n"value":"ACCEPT_UNCLOSED_SECRET"\n'
            ),
            "traceback": (
                '{"api_key":"ACCEPT_JSON_A_SECRET",'
                '"client_secret":"ACCEPT_JSON_B_SECRET",'
                '"access_token":"ACCEPT_JSON_C_SECRET"}\n'
                '{"apiKey":"ACCEPT_CAMEL_JSON_A_SECRET",'
                '"clientSecret":"ACCEPT_CAMEL_JSON_B_SECRET"}'
            ),
        },
    })

    for secret in (
        "ACCEPT_WORKFLOW_API_SECRET",
        "ACCEPT_WORKFLOW_AUTH_SECRET",
        "ACCEPT_WORKFLOW_COOKIE_SECRET",
        "ACCEPT_LOG_API_SECRET",
        "ACCEPT_SNAKE_SECRET",
        "ACCEPT_DASH_SECRET",
        "ACCEPT_DOT_SECRET",
        "ACCEPT_SPACE_SECRET",
        "ACCEPT_CAMEL_SECRET",
        "ACCEPT_X_HEADER_SECRET",
        "ACCEPT_ENCODED_UNDERSCORE_SECRET",
        "ACCEPT_ENCODED_DOT_SECRET",
        "ACCEPT QUOTED SPACE SECRET",
        "ACCEPT_LIST_SECRET",
        "ACCEPT_OBJECT_SECRET",
        "ACCEPT_TUPLE_SECRET",
        "ACCEPT_NAME_VALUE_SECRET",
        "ACCEPT_YAML_SECRET",
        "ACCEPT_UNCLOSED_SECRET",
        "ACCEPT_JSON_A_SECRET",
        "ACCEPT_JSON_B_SECRET",
        "ACCEPT_JSON_C_SECRET",
        "ACCEPT_CAMEL_JSON_A_SECRET",
        "ACCEPT_CAMEL_JSON_B_SECRET",
    ):
        assert secret not in on_report

    for key in ("api_key", "client_secret", "access_token", "apiKey", "clientSecret"):
        assert key in on_report

    special_report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                "Authorization: Bearer\n"
                " ACCEPT_FOLDED_AUTH_SECRET\n"
                "Cookie: sid=\n"
                " ACCEPT_FOLDED_COOKIE_SECRET\n"
                "Set-Cookie: sid=ACCEPT_SET_COOKIE_SECRET; Path=/\n"
                " continuation=ACCEPT_SET_COOKIE_TAIL\n"
                "private key: -----BEGIN OPENSSH PRIVATE KEY-----\n"
                "ACCEPT_OPENSSH_SECRET\n"
                "-----END OPENSSH PRIVATE KEY-----\n"
                "https://user:ACCEPT_HTTPS_PASS@host/path\n"
                "redis://:ACCEPT_REDIS_PASS@localhost:6379/0\n"
                "tokenizer: CLIPTokenizer failed"
            )
        },
    })

    for secret in (
        "ACCEPT_FOLDED_AUTH_SECRET",
        "ACCEPT_FOLDED_COOKIE_SECRET",
        "ACCEPT_SET_COOKIE_SECRET",
        "ACCEPT_SET_COOKIE_TAIL",
        "ACCEPT_OPENSSH_SECRET",
        "BEGIN OPENSSH PRIVATE KEY",
        "END OPENSSH PRIVATE KEY",
        "ACCEPT_HTTPS_PASS",
        "ACCEPT_REDIS_PASS",
    ):
        assert secret not in special_report

    assert "https://***@host" in special_report
    assert "redis://***@localhost" in special_report
    assert "tokenizer: CLIPTokenizer failed" in special_report


def test_sos_report_redacts_folded_header_and_backslash_continuation_secrets():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                "Authorization: Bearer\n"
                " FOLDED_AUTH_SECRET\n"
                "Cookie: sid=\n"
                " FOLDED_COOKIE_SECRET\n"
                "api_key=\\\n"
                "CONTINUATION_SECRET"
            )
        },
    })

    for secret in (
        "FOLDED_AUTH_SECRET",
        "FOLDED_COOKIE_SECRET",
        "CONTINUATION_SECRET",
    ):
        assert secret not in report


def test_sos_report_redacts_spaced_secret_key_labels_without_masking_tokenizer():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                "API key: SPACE_KEY_SECRET\n"
                "private key: SPACE_PRIVATE_SECRET\n"
                "secret key: SPACE_SECRET_KEY_SECRET\n"
                "access key: SPACE_ACCESS_SECRET\n"
                "tokenizer: CLIPTokenizer failed\n"
                "HF_TOKEN=HF_TOKEN_SECRET"
            )
        },
    })

    for secret in (
        "SPACE_KEY_SECRET",
        "SPACE_PRIVATE_SECRET",
        "SPACE_SECRET_KEY_SECRET",
        "SPACE_ACCESS_SECRET",
        "HF_TOKEN_SECRET",
    ):
        assert secret not in report

    assert "tokenizer: CLIPTokenizer failed" in report


def test_sos_report_redacts_percent_encoded_dot_query_secret_keys():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                "https://x.test/callback?api%2Ekey=ENCODED_DOT_QUERY_SECRET&ok=1\n"
                "https://x.test/callback?ok=1;api%2Ekey=SEMICOLON_DOT_SECRET\n"
                "https://x.test/callback#api%2Ekey=FRAGMENT_DOT_SECRET"
            )
        },
    })

    for secret in (
        "ENCODED_DOT_QUERY_SECRET",
        "SEMICOLON_DOT_SECRET",
        "FRAGMENT_DOT_SECRET",
    ):
        assert secret not in report


def test_sos_report_redacts_dot_separated_secret_keys():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "exception_message": (
                '{"api.key":"DOT_JSON_SECRET"}\n'
                "api.key=DOT_ASSIGNMENT_SECRET tail\n"
                "access.token=DOT_ACCESS_TOKEN_SECRET\n"
                "private.key: DOT_PRIVATE_KEY_SECRET\n"
                '{"client.secret":"DOT_CLIENT_SECRET"}'
            )
        },
    })
    redacted = deno_sos_report._redact_text(
        '{"api.key":"DOT_JSON_SECRET"}\n'
        "api.key=DOT_ASSIGNMENT_SECRET tail"
    )

    for secret in (
        "DOT_JSON_SECRET",
        "DOT_ASSIGNMENT_SECRET",
        "DOT_ACCESS_TOKEN_SECRET",
        "DOT_PRIVATE_KEY_SECRET",
        "DOT_CLIENT_SECRET",
    ):
        assert secret not in report
        assert secret not in redacted

    for key in ("api.key", "access.token", "private.key", "client.secret"):
        assert key in report


def test_frontend_snapshot_does_not_store_raw_href_or_user_agent():
    snapshot = deno_sos_report._frontend_snapshot({
        "frontend": {
            "origin": "http://127.0.0.1:8188",
            "href": "http://127.0.0.1:8188/?prompt=private",
            "language": "ko-KR",
            "languages": ["ko-KR"],
            "user_agent": "private user agent",
        },
    })

    assert snapshot == {
        "origin": "http://127.0.0.1:8188",
        "language": "ko-KR",
        "languages": ["ko-KR"],
    }


def test_system_stats_summary_drops_raw_payload_fields():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "system_stats": {
            "system": {
                "comfyui_version": "0.3.test",
                "python_version": "3.11.test",
                "ram_total": 123,
                "workflow": {"nodes": [{"type": "SecretWorkflowNode"}]},
                "prompt": "private prompt text",
            },
            "devices": [{
                "name": "NVIDIA Test GPU",
                "type": "cuda",
                "vram_total": 1000,
                "vram_free": 500,
                "workflow": {"nodes": [{"type": "DeviceWorkflowNode"}]},
                "inputs": "device private text",
            }],
            "workflow": {"nodes": [{"type": "RootWorkflowNode"}]},
            "prompt": "root private prompt text",
        },
    })

    for leaked in (
        "SecretWorkflowNode",
        "DeviceWorkflowNode",
        "RootWorkflowNode",
        "private prompt text",
        "device private text",
        "root private prompt text",
        '"workflow"',
        '"prompt"',
        '"inputs"',
    ):
        assert leaked not in report

    assert "0.3.test" in report
    assert "3.11.test" in report
    assert "NVIDIA Test GPU" in report
    assert "vram_total" in report


def test_error_summary_does_not_stringify_nested_objects():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "last_error": {
            "node_type": "X",
            "exception_message": {
                "text": "private prompt text",
                "workflow": {"nodes": [{"type": "SecretWorkflowNode"}]},
            },
            "traceback": [
                {
                    "text": "trace private text",
                    "workflow": {"nodes": [{"type": "TraceWorkflowNode"}]},
                },
                "safe scalar traceback line",
            ],
            "executed": [
                {"workflow": "ExecutedWorkflowNode"},
                "7",
            ],
        },
    })

    for leaked in (
        "private prompt text",
        "SecretWorkflowNode",
        "trace private text",
        "TraceWorkflowNode",
        "ExecutedWorkflowNode",
    ):
        assert leaked not in report

    assert "node_type" in report
    assert "safe scalar traceback line" in report
    assert '"7"' in report


def test_queue_error_string_is_not_reported():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "queue": {
            "queue_running": [],
            "queue_pending": [],
            "error": "SecretWorkflowNode private prompt text Cookie: sessionid=abc",
        },
    })

    assert "SecretWorkflowNode" not in report
    assert "private prompt text" not in report
    assert "sessionid=abc" not in report
    assert "running_count" in report
    assert "pending_count" in report
    assert '"error"' not in report


def test_workflow_off_omits_raw_logs(monkeypatch):
    monkeypatch.setattr(
        deno_sos_report,
        "_recent_logs",
        lambda warnings: 'SecretWorkflowNode private prompt text headers={"api_key":"logsecret"}',
    )

    report, _ = deno_sos_report.build_sos_prompt({"include_workflow": False})

    assert "SecretWorkflowNode" not in report
    assert "private prompt text" not in report
    assert "logsecret" not in report
    assert "워크플로우 포함 OFF" in report
    assert "로그는 프롬프트나 워크플로우 텍스트를 담을 수 있어 제외" in report


def test_workflow_off_does_not_leak_workflow_through_queue():
    report, _ = deno_sos_report.build_sos_prompt({
        "include_workflow": False,
        "queue": {
            "queue_running": [[
                0,
                "prompt-id",
                {"1": {"class_type": "SecretWorkflowNode", "inputs": {"prompt": "private prompt text"}}},
                {"extra_pnginfo": {"workflow": {"nodes": [{"type": "FullWorkflowNode"}]}}},
                ["1"],
            ]],
            "queue_pending": [],
        },
    })

    assert "SecretWorkflowNode" not in report
    assert "FullWorkflowNode" not in report
    assert "private prompt text" not in report
    assert "running_count" in report
    assert "prompt-id" in report


def test_sos_report_redacts_warning_strings(monkeypatch):
    def fake_package_versions(warnings):
        warnings.append("CIVITAI_API_TOKEN=abc123secretvalue")
        return {}

    monkeypatch.setattr(deno_sos_report, "_package_versions", fake_package_versions)

    report, warnings = deno_sos_report.build_sos_prompt({"include_workflow": False})

    assert "abc123secretvalue" not in report
    assert "abc123secretvalue" not in "\n".join(warnings)
    assert "CIVITAI_API_TOKEN=***" in report
    assert "CIVITAI_API_TOKEN=***" in warnings


def test_same_origin_request_policy():
    class Request:
        def __init__(self, headers):
            self.headers = headers

    assert deno_sos_report._is_same_origin_request(Request({})) is True
    assert deno_sos_report._is_same_origin_request(Request({
        "Origin": "http://127.0.0.1:8188",
        "Host": "127.0.0.1:8188",
    })) is True
    assert deno_sos_report._is_same_origin_request(Request({
        "Origin": "http://evil.example",
        "Host": "127.0.0.1:8188",
    })) is False
    assert deno_sos_report._is_same_origin_request(Request({
        "Origin": "null",
        "Host": "127.0.0.1:8188",
    })) is False


def test_init_wraps_sos_import_and_registration_together():
    source = (Path(__file__).resolve().parents[1] / "__init__.py").read_text(encoding="utf-8")

    assert "try:\n    try:\n        from .deno_sos_report import register_deno_sos_routes" in source
    assert "register_deno_sos_routes()\nexcept Exception as exc:" in source
    assert "SOS report route unavailable" in source
