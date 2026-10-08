"""Speech-to-text (OpenAI Whisper-compatible or Bhashini for Indian languages) and optional text-to-speech."""

import base64

import httpx

from app.core.config import get_settings


class SpeechUnavailable(Exception):
    pass


async def transcribe(audio: bytes, filename: str, content_type: str, language: str | None = None) -> dict:
    s = get_settings()
    if s.stt_provider == "bhashini":
        if not (s.bhashini_api_key and s.bhashini_url):
            raise SpeechUnavailable("Bhashini is not configured (BHASHINI_API_KEY, BHASHINI_URL)")
        cfg: dict = {"language": {"sourceLanguage": language or "hi"}, "audioFormat": filename.rsplit(".", 1)[-1] or "wav",
                     "samplingRate": 16000}
        if s.bhashini_asr_service_id:
            cfg["serviceId"] = s.bhashini_asr_service_id
        async with httpx.AsyncClient(timeout=120) as c:
            r = await c.post(s.bhashini_url, headers={"Authorization": s.bhashini_api_key}, json={
                "pipelineTasks": [{"taskType": "asr", "config": cfg}],
                "inputData": {"audio": [{"audioContent": base64.b64encode(audio).decode()}]}})
        if r.status_code >= 400:
            raise SpeechUnavailable(f"Bhashini ASR failed ({r.status_code}): {r.text[:200]}")
        out = r.json()["pipelineResponse"][0]["output"][0]
        return {"text": out.get("source", ""), "language": language, "provider": "bhashini"}

    key = s.stt_api_key or s.openai_api_key
    if not key:
        raise SpeechUnavailable("Speech-to-text is not configured (STT_API_KEY)")
    data = {"model": s.stt_model, "response_format": "verbose_json"}
    if language:
        data["language"] = language
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.post(f"{s.stt_base_url.rstrip('/')}/audio/transcriptions", headers={"Authorization": f"Bearer {key}"},
                         data=data, files={"file": (filename, audio, content_type)})
    if r.status_code >= 400:
        raise SpeechUnavailable(f"Transcription failed ({r.status_code}): {r.text[:200]}")
    body = r.json()
    return {"text": body.get("text", ""), "language": body.get("language", language), "provider": "openai"}


async def synthesize(text: str, voice: str = "alloy") -> bytes:
    s = get_settings()
    key = s.stt_api_key or s.openai_api_key
    if not key:
        raise SpeechUnavailable("Text-to-speech is not configured")
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.post(f"{s.stt_base_url.rstrip('/')}/audio/speech", headers={"Authorization": f"Bearer {key}"},
                         json={"model": s.tts_model, "input": text[:4000], "voice": voice, "response_format": "mp3"})
    if r.status_code >= 400:
        raise SpeechUnavailable(f"Speech synthesis failed ({r.status_code})")
    return r.content
