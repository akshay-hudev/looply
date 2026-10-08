"""Agent 11: Optimization. Critique -> rewrite -> re-verify -> re-predict; keep only real improvements."""

from pydantic import BaseModel, Field

from app.agents import fact_checker, performance
from app.agents.base import call_agent
from app.agents.copy import AssetCopy, copy_from_content
from app.graph.context import PipelineContext
from app.models import Asset


class OptimizationOutput(BaseModel):
    critique: str
    changes: list[str] = Field(default_factory=list)
    improved: AssetCopy


def _snapshot(group: list[Asset]) -> dict:
    return {a.id: (dict(a.content or {}), dict(a.verification or {}), a.status, dict(a.prediction or {}), a.is_selected)
            for a in group}


def _restore(group: list[Asset], snap: dict) -> None:
    for a in group:
        a.content, a.verification, a.status, a.prediction, a.is_selected = snap[a.id]


async def optimize(ctx: PipelineContext, selected: Asset, group: list[Asset], *, rounds: int) -> list[dict]:
    brain = ctx.brain()
    history = []
    for round_no in range(1, rounds + 1):
        snap = _snapshot(group)
        before_score = (selected.prediction or {}).get("predicted_score") or 0
        payload = {
            "platform": selected.platform, "format": selected.format, "language": selected.language,
            "offer_locked": brain.offer.model_dump(),
            "supported_claims": brain.business.supported_claims,
            "audience": brain.strategy.primary_audience,
            "current": copy_from_content(selected.content or {}).model_dump(),
            "prediction": selected.prediction,
        }
        out = await call_agent(ctx, "optimizer", OptimizationOutput, payload, temperature=0.6)
        selected.content = {**(selected.content or {}), **out.improved.model_dump(exclude_none=True)}
        verdict = (await fact_checker.verify(ctx, [selected]))[selected.id]
        if verdict["verdict"] != "PASS":
            _restore(group, snap)
            history.append({"round": round_no, "kept": False, "reason": "optimized copy failed the fact check",
                            "critique": out.critique})
            break
        scores = await performance.predict(ctx, group)
        after = scores.get(selected.id)
        after_score = after.predicted_score if after else 0
        kept = after_score >= before_score
        if not kept:
            _restore(group, snap)
        else:
            # Re-prediction may move the selection; the optimized variant stays the chosen one.
            for a in group:
                a.is_selected = a.id == selected.id
        history.append({"round": round_no, "kept": kept, "critique": out.critique, "changes": out.changes,
                        "score_before": before_score, "score_after": after_score})
        if not kept or after_score >= 90:
            break
    selected.optimization_history = [*(selected.optimization_history or []), *history]
    ctx.db.commit()
    return history
