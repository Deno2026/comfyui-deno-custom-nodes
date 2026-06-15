from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def read_text(path: str) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def test_doc_routing_chain_is_declared_in_authority_docs():
    agents = read_text("AGENTS.md")
    handoff = read_text("SESSION_HANDOFF.md")
    retrospective = read_text("docs/DENO_NODE_RETROSPECTIVE.md")

    for text in (agents, handoff, retrospective):
        assert "docs/NODE_WORK_INDEX.md" in text

    assert "Before implementation, route the work through `docs/NODE_WORK_INDEX.md`." in agents
    assert "docs/nodes/<node>.md" in agents
    assert "Do not read archive handoffs" in agents


def test_node_work_index_routes_active_node_files_to_node_docs():
    index = read_text("docs/NODE_WORK_INDEX.md")

    required_markers = [
        "## Routing Protocol",
        "## Task Trigger Table",
        "## File Trigger Table",
        "If the user changes scope mid-session",
        "deno_local_llm_refiner.py",
        "web/js/deno_local_llm_refiner.js",
        "docs/nodes/LOCAL_LLM_LOADER_REVIEWER.md",
        "deno_ideogram_director.py",
        "web/js/deno_ideogram_director.js",
        "docs/nodes/ideogram-director/README.md",
        "deno_caption_translate.py",
        "docs/nodes/CAPTION_TRANSLATE.md",
        "deno_random_prompt_box.py",
        "docs/nodes/RANDOM_PROMPT_BOX.md",
        "only after explicit user restart",
        "docs/CLAUDE_NODE_FRONTEND_GUIDE.md",
        "docs/IDEOGRAM_DIRECTOR_DESIGN_DNA.md",
    ]
    for marker in required_markers:
        assert marker in index


def test_routed_documents_exist():
    routed_paths = [
        "docs/NODE_WORK_INDEX.md",
        "docs/DENO_NODE_RETROSPECTIVE.md",
        "docs/DENO_NODE_VISUAL_IDENTITY.md",
        "docs/nodes/LOCAL_LLM_LOADER_REVIEWER.md",
        "docs/nodes/ideogram-director/README.md",
        "docs/nodes/CAPTION_TRANSLATE.md",
        "docs/nodes/RANDOM_PROMPT_BOX.md",
        "docs/CLAUDE_NODE_FRONTEND_GUIDE.md",
        "docs/IDEOGRAM_DIRECTOR_DESIGN_DNA.md",
    ]
    for path in routed_paths:
        assert (REPO_ROOT / path).exists(), path


def test_internal_routing_docs_stay_out_of_registry_package():
    comfyignore = read_text(".comfyignore")

    excluded_docs = [
        "AGENTS.md",
        "SESSION_HANDOFF.md",
        "docs/NODE_WORK_INDEX.md",
        "docs/DENO_NODE_RETROSPECTIVE.md",
        "docs/DENO_NODE_VISUAL_IDENTITY.md",
        "docs/CLAUDE_NODE_FRONTEND_GUIDE.md",
        "docs/IDEOGRAM_DIRECTOR_DESIGN_DNA.md",
        "docs/nodes/RANDOM_PROMPT_BOX.md",
        "docs/handoff_archive/",
        "tmp/",
    ]
    for path in excluded_docs:
        assert path in comfyignore
