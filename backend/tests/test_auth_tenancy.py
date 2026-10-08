from tests.conftest import register


def test_register_login_me(client):
    h = register(client)
    r = client.post("/api/auth/login", json={"email": "owner@cafe.in", "password": "password123"})
    assert r.status_code == 200
    me = client.get("/api/auth/me", headers={"Authorization": h["Authorization"]}).json()
    assert me["organizations"][0]["role"] == "owner"


def test_wrong_password(client):
    register(client)
    r = client.post("/api/auth/login", json={"email": "owner@cafe.in", "password": "nope-nope"})
    assert r.status_code == 401


def test_businesses_are_isolated_between_orgs(client):
    a = register(client, "a@x.in", "Vendor A")
    b = register(client, "b@x.in", "Vendor B")
    biz = client.post("/api/businesses", json={"name": "A Cafe", "city": "Bengaluru"}, headers=a).json()

    assert client.get(f"/api/businesses/{biz['id']}", headers=b).status_code == 404
    assert client.get("/api/businesses", headers=b).json() == []
    # Using another org's id in the header is rejected outright.
    spoof = {**b, "X-Org-Id": a["X-Org-Id"]}
    assert client.get("/api/businesses", headers=spoof).status_code == 403
