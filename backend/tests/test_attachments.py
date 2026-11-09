"""Референсы и результаты: ссылки и файлы, ограничения, права, сдача только с результатом."""

import io
from collections.abc import Callable
from pathlib import Path

import pytest
from httpx import AsyncClient

from app.core.config import get_settings
from app.models.user import Role, User
from app.services.storage import safe_filename
from tests.factories import create_user
from tests.helpers import act, create_task, event_types, ok

AsUser = Callable[[User], AsyncClient]

# Минимальные валидные сигнатуры форматов
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PDF = b"%PDF-1.4\n" + b"0" * 64
MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64


async def upload(
    client: AsyncClient,
    task_id: int,
    content: bytes,
    name: str = "a.png",
    kind: str = "reference",
    mime: str = "image/png",
):
    return await client.post(
        f"/api/tasks/{task_id}/attachments/file",
        data={"kind": kind},
        files={"file": (name, io.BytesIO(content), mime)},
    )


async def add_link(client: AsyncClient, task_id: int, url: str, kind: str = "reference"):
    return await client.post(
        f"/api/tasks/{task_id}/attachments/link", json={"kind": kind, "url": url}
    )


async def test_reference_link_and_file(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    tid = (await create_task(buyer))["id"]

    link = ok(await add_link(buyer, tid, "https://drive.google.com/x"), 201)
    assert link["type"] == "link"
    file = ok(await upload(buyer, tid, PNG, name="ref.png"), 201)
    assert file["type"] == "file"
    assert file["content_type"] == "image/png"
    assert file["size"] == len(PNG)

    items = ok(await buyer.get(f"/api/tasks/{tid}/attachments"))
    assert {i["type"] for i in items} == {"link", "file"}
    assert (await event_types(buyer, tid)).count("attachment_added") == 2

    # Файл отдаётся с безопасными заголовками
    resp = await buyer.get(f"/api/attachments/{file['id']}/file")
    assert resp.status_code == 200
    assert resp.content == PNG
    assert resp.headers["content-type"] == "image/png"
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in resp.headers["content-security-policy"]
    assert resp.headers["content-disposition"].startswith("inline;")


@pytest.mark.parametrize(
    "url",
    ["javascript:alert(1)", "ftp://x.com/a", "data:text/html,1", "https://", "https://a b.com"],
)
async def test_unsafe_links_rejected(as_user: AsUser, url: str) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    tid = (await create_task(buyer))["id"]
    assert (await add_link(buyer, tid, url)).status_code == 422


async def test_type_detected_by_content_not_extension(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    tid = (await create_task(buyer))["id"]

    # HTML, переименованный в .png, не проходит
    resp = await upload(buyer, tid, b"<html><script>alert(1)</script></html>", name="x.png")
    assert resp.status_code == 415
    assert resp.json()["error"]["code"] == "file_type_not_allowed"

    # SVG запрещён (может содержать скрипт)
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'
    assert (await upload(buyer, tid, svg, name="a.svg", mime="image/svg+xml")).status_code == 415

    # PDF и MP4 с «неправильным» заявленным типом — определяются верно
    pdf = ok(await upload(buyer, tid, PDF, name="brief.pdf", mime="text/plain"), 201)
    assert pdf["content_type"] == "application/pdf"
    mp4 = ok(await upload(buyer, tid, MP4, name="ref.mp4", mime="application/octet-stream"), 201)
    assert mp4["content_type"] == "video/mp4"


async def test_empty_and_too_large_files(as_user: AsUser, monkeypatch: pytest.MonkeyPatch) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    tid = (await create_task(buyer))["id"]

    assert (await upload(buyer, tid, b"")).status_code == 400

    monkeypatch.setattr(get_settings(), "max_upload_bytes", 1000)
    resp = await upload(buyer, tid, PNG + b"\x00" * 2000)
    assert resp.status_code == 413
    assert resp.json()["error"]["code"] == "file_too_large"
    # Файл, превысивший лимит, не остаётся на диске
    assert _part_files() == []


def _part_files() -> list[Path]:
    return [p for p in Path(get_settings().upload_dir).rglob("*") if p.suffix == ".part"]


async def test_filename_is_sanitized(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    tid = (await create_task(buyer))["id"]
    item = ok(await upload(buyer, tid, PNG, name="../../etc/пример.png"), 201)
    assert item["filename"] == "пример.png"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("C:\\Users\\x\\баннер.png", "баннер.png"),
        ("bad\x07\x00name.png", "badname.png"),
        ("  ..hidden.png ", "hidden.png"),
        ("", "file"),
        (None, "file"),
        ("a" * 300 + ".mp4", "a" * 196 + ".mp4"),
    ],
)
def test_safe_filename(raw: str | None, expected: str) -> None:
    assert safe_filename(raw) == expected


async def test_reference_permissions(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    other_buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]

    assert (await add_link(other_buyer, tid, "https://x.com/1")).status_code == 403
    assert (await add_link(creative, tid, "https://x.com/1")).status_code == 403
    # Результат в «Новых» не приложить
    assert (await add_link(creative, tid, "https://x.com/1", kind="result")).status_code == 409


async def test_submit_requires_result_for_each_round(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))

    resp = await act(creative, tid, "submit")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "result_required"

    first = ok(await upload(creative, tid, PNG, kind="result"), 201)
    assert first["round"] == 0
    ok(await act(creative, tid, "submit"))

    # После правок нужен новый результат
    ok(await act(buyer, tid, "request-revision", comment="ещё"))
    assert (await act(creative, tid, "submit")).status_code == 400
    second = ok(await add_link(creative, tid, "https://drive.google.com/v2", kind="result"), 201)
    assert second["round"] == 1
    ok(await act(creative, tid, "submit"))


async def test_result_only_by_assignee_while_working(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    other = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))

    assert (await upload(other, tid, PNG, kind="result")).status_code == 403
    assert (await upload(buyer, tid, PNG, kind="result")).status_code == 403
    ok(await upload(creative, tid, PNG, kind="result"), 201)
    ok(await act(creative, tid, "submit"))
    # На проверке результат не меняют
    assert (await upload(creative, tid, PNG, kind="result")).status_code == 409


async def test_remove_attachment_soft_deletes(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    other = as_user(await create_user(Role.BUYER))
    tid = (await create_task(buyer))["id"]
    item = ok(await upload(buyer, tid, PNG), 201)

    assert (await other.delete(f"/api/attachments/{item['id']}")).status_code == 403
    assert (await buyer.delete(f"/api/attachments/{item['id']}")).status_code == 204

    assert ok(await buyer.get(f"/api/tasks/{tid}/attachments")) == []
    assert (await buyer.get(f"/api/attachments/{item['id']}/file")).status_code == 404
    assert "attachment_removed" in await event_types(buyer, tid)


async def test_previous_round_result_cannot_be_removed(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    v1 = ok(await upload(creative, tid, PNG, kind="result"), 201)
    ok(await act(creative, tid, "submit"))
    ok(await act(buyer, tid, "request-revision", comment="правки"))

    resp = await creative.delete(f"/api/attachments/{v1['id']}")

    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "result_already_submitted"
    # Свежий результат текущего круга удалить можно
    v2 = ok(await upload(creative, tid, PNG, kind="result"), 201)
    assert (await creative.delete(f"/api/attachments/{v2['id']}")).status_code == 204


async def test_removed_result_does_not_count_for_submit(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    item = ok(await upload(creative, tid, PNG, kind="result"), 201)
    assert (await creative.delete(f"/api/attachments/{item['id']}")).status_code == 204

    assert (await act(creative, tid, "submit")).status_code == 400


async def test_download_requires_auth(as_user: AsUser, client: AsyncClient) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    tid = (await create_task(buyer))["id"]
    item = ok(await upload(buyer, tid, PNG), 201)
    assert (await client.get(f"/api/attachments/{item['id']}/file")).status_code == 401


async def test_link_download_is_404(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    tid = (await create_task(buyer))["id"]
    item = ok(await add_link(buyer, tid, "https://x.com/ref"), 201)
    assert (await buyer.get(f"/api/attachments/{item['id']}/file")).status_code == 404


def test_storage_clear_removes_only_storage_files(tmp_path: Path) -> None:
    from app.services.storage import LocalFileStorage

    storage = LocalFileStorage(tmp_path)
    stored = storage.save(io.BytesIO(PNG), 10_000)
    keep = tmp_path / "readme.txt"
    keep.write_text("не трогать")

    storage.clear()

    assert not storage.path(stored.key).exists()
    assert keep.exists()
