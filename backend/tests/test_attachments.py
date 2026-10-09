"""Owner files attached to a campaign brief are stored and read as input."""

import io

from app.services.model_gateway import set_gateway
from app.services.model_gateway.demo import demo_gateway
from tests.conftest import register


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def test_upload_reads_text_and_images(client):
    auth = register(client)
    note = client.post("/api/campaigns/attachments", headers=auth, files={
        "file": ("offer.txt", io.BytesIO(b"Rooftop seating, open till 11"), "text/plain"),
    })
    assert note.status_code == 201, note.text
    body = note.json()
    assert body["kind"] == "text"
    assert "Rooftop seating" in body["text"]

    image = client.post("/api/campaigns/attachments", headers=auth, files={
        "file": ("cafe-logo.png", io.BytesIO(PNG), "image/png"),
    })
    assert image.status_code == 201, image.text
    logo = image.json()
    assert logo["kind"] == "image"
    assert logo["role"] == "logo"
    assert logo["url"].endswith(".png")

    blocked = client.post("/api/campaigns/attachments", headers=auth, files={
        "file": ("run.exe", io.BytesIO(b"MZ"), "application/octet-stream"),
    })
    assert blocked.status_code == 400


def test_campaign_keeps_attachments(client, monkeypatch):
    async def _no_plan(*_args, **_kwargs):
        return None

    monkeypatch.setattr("app.api.campaigns.dispatch", _no_plan)
    set_gateway(demo_gateway())
    try:
        auth = register(client, email="files@cafe.in")
        biz = client.post("/api/businesses", headers=auth, json={"name": "ABC Cafe", "city": "Bengaluru"}).json()
        uploaded = client.post("/api/campaigns/attachments", headers=auth, files={
            "file": ("menu.txt", io.BytesIO(b"Cold coffee is the hero"), "text/plain"),
        }).json()
        created = client.post("/api/campaigns", headers=auth, json={
            "business_id": biz["id"], "message": "Promote the new menu", "attachments": [uploaded],
        })
        assert created.status_code == 201, created.text
        files = created.json()["brain"]["files"]
        assert files[0]["filename"] == "menu.txt"
        assert "Cold coffee" in files[0]["text"]
    finally:
        set_gateway(None)
