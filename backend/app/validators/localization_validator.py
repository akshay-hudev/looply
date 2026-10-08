"""Script-aware normalization so numbers written in any Indic script compare equal to ASCII digits."""

import re
import unicodedata

# Zero code point of each Unicode decimal digit block we expect in Indian marketing copy.
_DIGIT_ZEROS = (
    0x0966,  # Devanagari (Hindi, Marathi)
    0x09E6,  # Bengali / Assamese
    0x0A66,  # Gurmukhi (Punjabi)
    0x0AE6,  # Gujarati
    0x0B66,  # Odia
    0x0BE6,  # Tamil
    0x0C66,  # Telugu
    0x0CE6,  # Kannada
    0x0D66,  # Malayalam
    0x06F0,  # Extended Arabic-Indic (Urdu)
    0x0660,  # Arabic-Indic
)
_DIGIT_MAP = {zero + i: str(i) for zero in _DIGIT_ZEROS for i in range(10)}

# Words meaning "percent" across languages, normalized to "%".
PERCENT_WORDS = [
    r"per\s?cent", r"percent", r"pct",
    "प्रतिशत", "टक्के", "শতাংশ", "ટકા", "ਪ੍ਰਤੀਸ਼ਤ", "ଶତକଡ଼ା",
    "சதவீதம்", "శాతం", "ಶೇಕಡಾ", "ಶೇಕಡ", "ಶೇ\\.?", "ശതമാനം", "فیصد",
]
CURRENCY_WORDS = [r"rs\.?", r"inr", "रुपये", "रुपए", "रु\\.?", "ರೂ\\.?", "ರೂಪಾಯಿ", "ரூ\\.?", "రూ\\.?", "രൂ\\.?", "টাকা", "રૂ\\.?"]


def normalize_digits(text: str) -> str:
    return text.translate(_DIGIT_MAP)


def normalize(text: str) -> str:
    """NFC, ASCII digits, unified percent and rupee markers, thousands separators removed."""
    t = normalize_digits(unicodedata.normalize("NFC", text))
    t = re.sub(r"(?<=\d)[,\u066C](?=\d{2,3}\b)", "", t)
    t = t.replace("％", "%")
    # "ಶೇ 20" / "20 प्रतिशत" -> "20%"
    for w in PERCENT_WORDS:
        t = re.sub(rf"(\d+(?:\.\d+)?)\s*(?:{w})", r"\1%", t, flags=re.IGNORECASE)
        t = re.sub(rf"(?:{w})\s*(\d+(?:\.\d+)?)", r"\1%", t, flags=re.IGNORECASE)
    for w in CURRENCY_WORDS:
        t = re.sub(rf"(?<![A-Za-z])(?:{w})\s*(?=\d)", "₹", t, flags=re.IGNORECASE)
        t = re.sub(rf"(\d+(?:\.\d+)?)\s*(?:{w})(?![A-Za-z])", r"₹\1", t, flags=re.IGNORECASE)
    return t
