"""The readings index must not silently degrade when pypdf is unavailable.

Without pypdf every PDF yields no page count, no embedded title, and no
excerpt, so category and title inference falls back to the filename. The
resulting index is structurally valid and materially worse. Before this guard
existed, such a run would overwrite a good index and nothing would report it.
"""

from __future__ import annotations

import json

import pytest

from dashboard.pipelines import build_readings_index as builder


@pytest.fixture()
def index_path(tmp_path):
    return tmp_path / "readings_data.json"


def write_index(path, *, pdf_metadata_enabled: bool) -> None:
    path.write_text(
        json.dumps({"meta": {"pdf_metadata_enabled": pdf_metadata_enabled}}),
        encoding="utf-8",
    )


def test_existing_index_is_recognized_as_pdf_backed(index_path):
    write_index(index_path, pdf_metadata_enabled=True)
    assert builder._existing_index_used_pdf(index_path) is True


def test_degraded_existing_index_does_not_block_a_rewrite(index_path):
    write_index(index_path, pdf_metadata_enabled=False)
    assert builder._existing_index_used_pdf(index_path) is False


def test_absent_or_unreadable_index_never_blocks_a_write(tmp_path, index_path):
    assert builder._existing_index_used_pdf(index_path) is False
    broken = tmp_path / "broken.json"
    broken.write_text("{not json", encoding="utf-8")
    assert builder._existing_index_used_pdf(broken) is False


def test_pypdf_less_run_refuses_to_overwrite_a_pdf_backed_index(
    monkeypatch, tmp_path, index_path, capsys
):
    monkeypatch.setattr(builder, "PdfReader", None)
    write_index(index_path, pdf_metadata_enabled=True)
    original = index_path.read_text(encoding="utf-8")

    exit_code = builder.main(
        [
            "--readings-dir",
            str(tmp_path),
            "--output",
            str(index_path),
            "--cache",
            str(tmp_path / "cache.json"),
        ]
    )

    assert exit_code == 1
    # The good index is still on disk, byte for byte.
    assert index_path.read_text(encoding="utf-8") == original
    assert "refusing to overwrite" in capsys.readouterr().err


def test_require_pdf_metadata_fails_before_touching_anything(
    monkeypatch, tmp_path, index_path, capsys
):
    monkeypatch.setattr(builder, "PdfReader", None)

    exit_code = builder.main(
        [
            "--readings-dir",
            str(tmp_path),
            "--output",
            str(index_path),
            "--cache",
            str(tmp_path / "cache.json"),
            "--require-pdf-metadata",
        ]
    )

    assert exit_code == 1
    assert not index_path.exists()
    assert "--require-pdf-metadata" in capsys.readouterr().err


def test_degraded_overwrite_is_possible_when_explicitly_allowed(
    monkeypatch, tmp_path, index_path
):
    monkeypatch.setattr(builder, "PdfReader", None)
    write_index(index_path, pdf_metadata_enabled=True)

    exit_code = builder.main(
        [
            "--readings-dir",
            str(tmp_path),
            "--output",
            str(index_path),
            "--cache",
            str(tmp_path / "cache.json"),
            "--allow-degraded-overwrite",
        ]
    )

    assert exit_code == 0
    payload = json.loads(index_path.read_text(encoding="utf-8"))
    # The replacement records that it was built without PDF metadata, so the
    # next run can tell the difference.
    assert payload["meta"]["pdf_metadata_enabled"] is False


def test_a_pypdf_capable_run_writes_without_a_guard(monkeypatch, tmp_path, index_path):
    monkeypatch.setattr(builder, "PdfReader", object)
    write_index(index_path, pdf_metadata_enabled=True)

    exit_code = builder.main(
        [
            "--readings-dir",
            str(tmp_path),
            "--output",
            str(index_path),
            "--cache",
            str(tmp_path / "cache.json"),
        ]
    )

    assert exit_code == 0
    assert json.loads(index_path.read_text(encoding="utf-8"))["meta"][
        "pdf_metadata_enabled"
    ]
