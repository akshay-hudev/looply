from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.core.tenancy import OrgContext, get_org_context
from app.services import speech_service

router = APIRouter(prefix="/voice", tags=["voice"])
MAX_AUDIO = 25 * 1024 * 1024


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: str | None = Form(None),
                     ctx: OrgContext = Depends(get_org_context)):
    audio = await file.read()
    if not audio:
        raise HTTPException(400, "Empty audio")
    if len(audio) > MAX_AUDIO:
        raise HTTPException(413, "Audio must be under 25 MB")
    try:
        return await speech_service.transcribe(audio, file.filename or "audio.webm",
                                               file.content_type or "audio/webm", language)
    except speech_service.SpeechUnavailable as e:
        raise HTTPException(503, str(e)) from e


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    voice: str = "alloy"


@router.post("/speak")
async def speak(body: SpeakIn, ctx: OrgContext = Depends(get_org_context)):
    try:
        return Response(await speech_service.synthesize(body.text, body.voice), media_type="audio/mpeg")
    except speech_service.SpeechUnavailable as e:
        raise HTTPException(503, str(e)) from e
