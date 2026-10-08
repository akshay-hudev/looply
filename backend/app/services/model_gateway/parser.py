import json
import re
from typing import TypeVar

from pydantic import BaseModel, ValidationError

M = TypeVar("M", bound=BaseModel)

_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


class ParseError(Exception):
    pass


def extract_json(text: str):
    """Pull the first JSON object/array out of a model response (handles code fences and chatter)."""
    text = text.strip()
    fenced = _FENCE.search(text)
    if fenced:
        text = fenced.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for open_ch, close_ch in (("{", "}"), ("[", "]")):
        start = text.find(open_ch)
        end = text.rfind(close_ch)
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                continue
    raise ParseError("No valid JSON found in model output")


def parse_model(text: str, schema: type[M]) -> M:
    try:
        return schema.model_validate(extract_json(text))
    except ValidationError as e:
        raise ParseError(str(e)) from e
