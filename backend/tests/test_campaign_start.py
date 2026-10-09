"""The next campaign prefills place and languages from the last locked campaign."""

from app.core.db import SessionLocal
from app.models import Campaign
from tests.conftest import register


def test_start_uses_last_locked_campaign(client):
    auth = register(client, email="start@cafe.in")
    biz = client.post("/api/businesses", headers=auth, json={
        "name": "Filter Coffee", "category": "Cafe", "city": "Bengaluru",
    }).json()
    created = client.post("/api/campaigns", headers=auth, json={
        "business_id": biz["id"],
        "brief": {"product": "Cold coffee", "region": "Indiranagar, Bengaluru", "offer": "₹49"},
        "requested_languages": ["en", "kn"],
        "content_mode": "ai",
        "message": "Families nearby",
    })
    assert created.status_code == 201, created.text
    # A campaign still waiting on the owner is not the "last time" record.
    db = SessionLocal()
    row = db.get(Campaign, created.json()["id"])
    row.status = "published"
    db.commit()
    db.close()
    start = client.get("/api/campaigns/start", headers=auth)
    assert start.status_code == 200, start.text
    body = start.json()
    assert body["business_id"] == biz["id"]
    saved = client.get(f"/api/campaigns/{created.json()['id']}", headers=auth).json()
    assert body["region"] == saved["brain"]["brief"]["region"]
    assert body["languages"] == saved["brain"]["strategy"]["languages"]
    assert body["note"] is None
    assert body["offer"] is None
    again = client.get(f"/api/campaigns/start?from={created.json()['id']}", headers=auth)
    assert again.status_code == 200, again.text
    facts = again.json()
    assert facts["offer"] == saved["brain"]["brief"].get("offer")
    assert facts["product"] == saved["brain"]["brief"].get("product")
    assert facts["region"] == saved["brain"]["brief"]["region"]
