import json

import httpx
import pytest
import respx
from pydantic import BaseModel

from app.services.model_gateway import ModelGateway, ModelUnavailable
from app.services.model_gateway.agnes import AgnesProvider
from app.services.model_gateway.base import ProviderError
from app.services.model_gateway.fake import FakeProvider
from app.services.model_gateway.parser import extract_json


class Out(BaseModel):
    value: int


def test_extract_json_handles_fences_and_chatter():
    assert extract_json('Sure!\n```json\n{"value": 3}\n```') == {"value": 3}
    assert extract_json('noise {"value": 4} trailing') == {"value": 4}


@pytest.mark.asyncio
async def test_repair_loop_fixes_invalid_output():
    replies = iter(['{"value": "not-a-number"}', '{"value": 7}'])
    fake = FakeProvider(lambda _: next(replies))
    gw = ModelGateway({"fake": fake}, {"text": ["fake"]})
    out = await gw.chat_json("sys", "user", Out)
    assert out.value == 7
    assert "not valid JSON" in fake.calls[1][-1].content


@pytest.mark.asyncio
async def test_falls_back_to_next_provider():
    class Broken(FakeProvider):
        async def chat(self, *a, **k):
            raise ProviderError("down", retryable=False)

    gw = ModelGateway({"agnes": Broken(lambda _: "", "agnes"), "openai": FakeProvider(lambda _: '{"value": 1}', "openai")},
                      {"text": ["agnes", "openai"]})
    assert (await gw.chat_json("s", "u", Out)).value == 1


@pytest.mark.asyncio
async def test_no_provider_configured():
    with pytest.raises(ModelUnavailable):
        await ModelGateway({}, {"text": ["agnes"]}).chat_json("s", "u", Out)


@pytest.mark.asyncio
@respx.mock
async def test_agnes_chat_and_video_contract():
    from app.core.config import Settings

    s = Settings(agnes_api_key="k", agnes_base_url="https://agnes.test/v1")
    p = AgnesProvider(s)
    respx.post("https://agnes.test/v1/chat/completions").mock(
        return_value=httpx.Response(200, json={"choices": [{"message": {"content": '{"value": 2}'}}]}))
    respx.post("https://agnes.test/v1/videos").mock(
        return_value=httpx.Response(200, json={"video_id": "vid1", "task_id": "t1", "status": "queued"}))
    respx.get("https://agnes.test/agnesapi").mock(
        return_value=httpx.Response(200, json={"status": "completed", "url": "https://cdn/v.mp4"}))

    gw = ModelGateway({"agnes": p}, {"text": ["agnes"], "video": ["agnes"]})
    assert (await gw.chat_json("s", "u", Out)).value == 2
    sent = json.loads(respx.calls[0].request.content)
    assert sent["model"] == "agnes-3.0-flash"

    task = await gw.video_submit("reel")
    st = await gw.video_status(task.provider, task.task_id)
    assert st.status == "ready" and st.url == "https://cdn/v.mp4"
