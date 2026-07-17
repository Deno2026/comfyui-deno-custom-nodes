from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_downloader_readme_does_not_advertise_unavailable_deep_scan() -> None:
    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    section = readme.split("### `(Deno) Easy Model Download Helper`", 1)[1].split("\n### `", 1)[0]

    assert "can find matching files inside model subfolders" not in section
    assert "exact target path" in section
    assert "without scanning unrelated nested project folders" in section
