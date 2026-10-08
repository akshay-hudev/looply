from functools import lru_cache

from cryptography.fernet import Fernet

from app.core.config import get_settings


@lru_cache
def _fernet() -> Fernet:
    key = get_settings().token_encryption_key
    return Fernet(key.encode() if key else Fernet.generate_key())


def encrypt(value: str | None) -> str | None:
    if value is None:
        return None
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str | None) -> str | None:
    if value is None:
        return None
    return _fernet().decrypt(value.encode()).decode()
