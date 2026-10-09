from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Always read backend/.env, even when the API is started from another folder.
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Looply"
    environment: str = "development"
    public_base_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:5173"

    database_url: str = "sqlite:///./localmind.db"
    redis_url: str = "redis://localhost:6379/0"
    # When false, background jobs (video polling, publishing) run in-process instead of on arq.
    use_worker: bool = False
    # Offline demo: a deterministic built-in model stands in for Agnes so the full flow runs without keys.
    demo_mode: bool = False

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 60 * 24
    # Fernet key (urlsafe base64, 32 bytes). Generated per-process if blank, which breaks token
    # decryption across restarts, so always set it outside development.
    token_encryption_key: str = ""

    # Model providers. Each capability picks a primary and an ordered fallback list.
    agnes_api_key: str = ""
    agnes_base_url: str = "https://apihub.agnes-ai.com/v1"
    agnes_text_model: str = "agnes-3.0-flash"
    agnes_image_model: str = "agnes-image-2.5-flash"
    agnes_video_model: str = "agnes-video-2.5"
    agnes_chat_path: str = "/chat/completions"
    agnes_image_path: str = "/images/generations"
    agnes_video_path: str = "/videos"
    agnes_video_status_path: str = "/agnesapi"

    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_text_model: str = "gpt-4o-mini"
    openai_image_model: str = "gpt-image-1"

    gemini_api_key: str = ""
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    gemini_text_model: str = "gemini-2.0-flash"

    # Claude designs posters and reel storyboards as SVG when a key is set (Claude does not output
    # raster images). Each poster is also rendered to PNG so the platforms can publish it.
    anthropic_api_key: str = ""
    claude_design_model: str = "claude-sonnet-5-5"
    claude_design_effort: str = "medium"  # low | medium | high | xhigh | max
    claude_design_concurrency: int = 4

    text_providers: str = "agnes,openai,gemini"
    image_providers: str = "agnes,openai"
    video_providers: str = "agnes"
    model_requests_per_minute: int = 60
    model_max_retries: int = 4

    # Locality
    locality_provider: str = "osm"  # osm | google
    google_places_api_key: str = ""
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    nominatim_url: str = "https://nominatim.openstreetmap.org"
    locality_radius_m: int = 1500

    # Media storage (S3 / MinIO). Falls back to local disk when s3_endpoint is blank.
    s3_endpoint: str = ""
    s3_public_endpoint: str = ""
    s3_bucket: str = "localmind-media"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "us-east-1"
    local_media_dir: str = "./media"

    # Speech. "local" runs multilingual Whisper on this machine and needs no speech key.
    stt_provider: str = "openai"  # local | openai (whisper) | bhashini
    stt_api_key: str = ""
    stt_base_url: str = "https://api.openai.com/v1"
    stt_model: str = "whisper-1"
    stt_local_model: str = "small"  # multilingual; not small.en
    stt_local_device: str = "cpu"
    stt_local_compute_type: str = "int8"
    tts_model: str = "tts-1"
    bhashini_api_key: str = ""
    bhashini_url: str = ""  # inference callback URL from the Bhashini pipeline config call
    bhashini_asr_service_id: str = ""

    # Social platforms
    meta_app_id: str = ""
    meta_app_secret: str = ""
    # Instagram Login uses the Instagram App ID from the Instagram product setup.
    # When blank, the Meta app id and secret are used.
    instagram_app_id: str = ""
    instagram_app_secret: str = ""
    meta_graph_version: str = "v21.0"
    whatsapp_phone_number_id: str = ""
    whatsapp_business_account_id: str = ""
    whatsapp_verify_token: str = ""
    linkedin_client_id: str = ""
    linkedin_client_secret: str = ""
    youtube_client_id: str = ""
    youtube_client_secret: str = ""

    max_truth_retries: int = 3
    max_optimization_rounds: int = 2

    def provider_list(self, capability: str) -> list[str]:
        raw = getattr(self, f"{capability}_providers")
        return [p.strip() for p in raw.split(",") if p.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
