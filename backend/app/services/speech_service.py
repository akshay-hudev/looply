"""Speech-to-text (local Whisper, OpenAI Whisper-compatible, or Bhashini) and optional text-to-speech."""

import asyncio
import base64
import tempfile
import threading
from pathlib import Path

import httpx

from app.core.config import get_settings


class SpeechUnavailable(Exception):
    pass


_model = None
_model_lock = threading.Lock()


def _local_model():
    """Load multilingual Whisper once. The transcript is not rewritten afterwards."""
    global _model
    with _model_lock:
        if _model is None:
            try:
                from faster_whisper import WhisperModel
            except ImportError as e:
                raise SpeechUnavailable("Local speech is not installed") from e
            s = get_settings()
            _model = WhisperModel(s.stt_local_model, device=s.stt_local_device, compute_type=s.stt_local_compute_type)
        return _model


def _load_audio(path: str):
    """Decode a browser recording to 16 kHz mono. PyAV 19 has no metadata_errors argument."""
    import av
    import numpy as np

    resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=16000)
    chunks = []
    try:
        with av.open(path, mode="r") as container:
            for frame in container.decode(audio=0):
                frame.pts = None
                chunks.extend(resampler.resample(frame))
            chunks.extend(resampler.resample(None))
    except av.error.FFmpegError as e:
        raise SpeechUnavailable("Couldn't read that recording") from e
    if not chunks:
        return None
    samples = np.concatenate([frame.to_ndarray().reshape(-1) for frame in chunks])
    return np.ascontiguousarray(samples.astype(np.float32) / 32768.0)


def _transcribe_local(audio: bytes, filename: str, language: str | None) -> dict:
    suffix = Path(filename).suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        handle.write(audio)
        path = handle.name
    try:
        samples = _load_audio(path)
        if samples is None or samples.size == 0:
            raise SpeechUnavailable("Didn't catch any words")
        model = _local_model()
        with _model_lock:
            segments, info = model.transcribe(samples, language=language, task="transcribe")
            text = "".join(segment.text for segment in segments).strip()
        if not text:
            raise SpeechUnavailable("Didn't catch any words")
        heard = getattr(info, "language", None) or language
        return {"text": text, "language": heard, "provider": "local"}
    finally:
        Path(path).unlink(missing_ok=True)


async def transcribe(audio: bytes, filename: str, content_type: str, language: str | None = None) -> dict:
    s = get_settings()
    if s.stt_provider == "local":
        return await asyncio.to_thread(_transcribe_local, audio, filename, language)
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
