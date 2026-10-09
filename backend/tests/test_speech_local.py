import asyncio
import io
import wave

from app.core.config import get_settings
from app.services import speech_service


def _wav() -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(16000)
        handle.writeframes(b"\x00\x00" * 1600)
    return buf.getvalue()


class _Segment:
    def __init__(self, text: str):
        self.text = text


class _Info:
    language = "en"


class _Model:
    def transcribe(self, path, language=None, task="transcribe"):
        assert task == "transcribe"
        return [_Segment(" Cold cofee, 10% off for 70")], _Info()


def test_local_transcript_is_returned_unchanged(monkeypatch):
    monkeypatch.setenv("STT_PROVIDER", "local")
    monkeypatch.delenv("STT_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    get_settings.cache_clear()
    monkeypatch.setattr(speech_service, "_local_model", lambda: _Model())

    heard = asyncio.run(speech_service.transcribe(_wav(), "voice.wav", "audio/wav"))

    get_settings.cache_clear()
    assert heard == {"text": "Cold cofee, 10% off for 70", "language": "en", "provider": "local"}
