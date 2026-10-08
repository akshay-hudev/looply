import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="localmind-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["LOCAL_MEDIA_DIR"] = f"{_tmp}/media"
os.environ["USE_WORKER"] = "false"
os.environ["ENVIRONMENT"] = "test"
os.environ["TOKEN_ENCRYPTION_KEY"] = "kZ3oQf3Y0g0Q2l0x8x7m3g7mQvF1s5bq8b2c6sJt0bE="

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def _db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def register(client, email="owner@cafe.in", org="ABC Cafe Group"):
    r = client.post("/api/auth/register", json={
        "email": email, "name": "Owner", "password": "password123", "organization_name": org,
    })
    assert r.status_code == 201, r.text
    body = r.json()
    return {"Authorization": f"Bearer {body['access_token']}", "X-Org-Id": body["user"]["organizations"][0]["id"]}


@pytest.fixture
def auth(client):
    return register(client)
