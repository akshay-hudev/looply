import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.api import analytics, assets, auth, businesses, campaigns, orgs, publishing, social, voice
from app.core.config import get_settings
from app.core.db import Base, engine

settings = get_settings()
log = logging.getLogger(__name__)


async def _in_process_scheduler() -> None:
    from app.workers.tasks import run_due_jobs

    while True:
        try:
            await run_due_jobs()
        except Exception:
            log.exception("scheduler tick failed")
        await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Alembic owns the schema in Postgres; create_all keeps SQLite dev/test setups zero-config.
    if settings.database_url.startswith("sqlite"):
        Base.metadata.create_all(engine)
    if settings.demo_mode:
        from app.services.model_gateway.demo import install_demo_gateway

        install_demo_gateway()
    task = None
    if not settings.use_worker and settings.environment != "test":
        task = asyncio.create_task(_in_process_scheduler())
    yield
    if task:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="Looply API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "demo_mode": settings.demo_mode}


@app.get("/", response_class=HTMLResponse)
def root():
    ui = settings.frontend_url
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Looply API</title></head>
<body style="font-family:sans-serif;max-width:36rem;margin:4rem auto">
<h1>Looply API is running</h1>
<p>The app UI is at <a href="{ui}">{ui}</a>.</p>
<p>Interactive API docs are at <a href="/docs">/docs</a>.</p>
</body></html>"""


for r in (auth.router, orgs.router, businesses.router, campaigns.router, assets.router, social.router,
          publishing.router, analytics.router, voice.router):
    app.include_router(r, prefix="/api")

media_dir = Path(settings.local_media_dir)
media_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=media_dir), name="media")
