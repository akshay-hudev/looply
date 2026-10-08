"""LangGraph orchestration. Two graphs share the Campaign Brain stored in Postgres:

plan:    intake -> (clarify | business -> locality -> audience -> strategy) -> strategy review
produce: text -> director -> copy -> localize -> truth <-> regenerate -> performance/optimize -> media -> review

`produce` also serves the Change Agent: mode="regen" regenerates only the stale asset ids it is given.
"""

import logging
from typing import Literal, TypedDict

from langgraph.graph import END, StateGraph

from app.agents import audience, business, campaign_manager, content_director, locality, strategy, text
from app.graph import production
from app.graph.context import PipelineContext
from app.models import Asset

log = logging.getLogger(__name__)


class RunState(TypedDict, total=False):
    message: str
    mode: Literal["full", "regen"]
    asset_ids: list[str]
    retry_round: int
    needs_clarification: bool
    auto_accept_strategy: bool
    pending_videos: list[str]


def build_plan_graph(ctx: PipelineContext):
    async def intake(state: RunState) -> RunState:
        ctx.set_status("generating", "intake")
        ctx.emit("campaign_manager", "started", "Understanding your request")
        brain, ex = await campaign_manager.run(ctx, state["message"])
        ctx.save_brain(brain)
        ctx.emit("campaign_manager", "completed", ex.summary, {"missing_info": brain.missing_info})
        return {"needs_clarification": bool(brain.missing_info)}

    async def clarify(state: RunState) -> RunState:
        brain = ctx.brain()
        ctx.set_status("clarifying", "intake")
        ctx.emit("campaign_manager", "info", "I need a little more information",
                 {"questions": brain.clarifying_questions})
        return {}

    async def business_node(state: RunState) -> RunState:
        ctx.set_status("generating", "business")
        ctx.emit("business_agent", "started", "Building the business profile")
        brain = ctx.brain()
        brain.business = await business.run(ctx)
        ctx.save_brain(brain)
        ctx.emit("business_agent", "completed", brain.business.brand_voice or "")
        return {}

    async def locality_node(state: RunState) -> RunState:
        ctx.set_status("generating", "locality")
        ctx.emit("locality_agent", "started", "Analyzing the neighbourhood")
        brain = ctx.brain()
        brain.locality = await locality.run(ctx)
        ctx.save_brain(brain)
        ctx.emit("locality_agent", "completed", brain.locality.summary or "",
                 {"signals": len(brain.locality.signals), "verified": brain.locality.verified})
        return {}

    async def audience_node(state: RunState) -> RunState:
        ctx.set_status("generating", "audience")
        ctx.emit("audience_agent", "started", "Identifying audience segments")
        brain = ctx.brain()
        brain.audiences = await audience.run(ctx)
        ctx.save_brain(brain)
        ctx.emit("audience_agent", "completed", ", ".join(a.name for a in brain.audiences))
        return {}

    async def strategy_node(state: RunState) -> RunState:
        ctx.set_status("generating", "strategy")
        ctx.emit("strategy_agent", "started", "Building the campaign strategy")
        brain = ctx.brain()
        brain.strategy = await strategy.run(ctx)
        brain.strategy.accepted = bool(state.get("auto_accept_strategy"))
        ctx.snapshot_version(brain, {"reason": "strategy created"})
        ctx.set_status("strategy_review", "strategy")
        ctx.emit("strategy_agent", "completed", brain.strategy.rationale,
                 {"platforms": brain.strategy.platforms, "languages": brain.strategy.languages})
        return {}

    g = StateGraph(RunState)
    for name, fn in (("intake", intake), ("clarify", clarify), ("business", business_node),
                     ("locality", locality_node), ("audience", audience_node), ("strategy", strategy_node)):
        g.add_node(name, fn)
    g.set_entry_point("intake")
    g.add_conditional_edges("intake", lambda s: "clarify" if s.get("needs_clarification") else "business",
                            {"clarify": "clarify", "business": "business"})
    g.add_edge("clarify", END)
    g.add_edge("business", "locality")
    g.add_edge("locality", "audience")
    g.add_edge("audience", "strategy")
    g.add_edge("strategy", END)
    return g.compile()


def build_produce_graph(ctx: PipelineContext):
    max_retries = ctx.settings.max_truth_retries

    def working_set(state: RunState) -> list[Asset]:
        return production.campaign_assets(ctx, state.get("asset_ids"))

    async def core_message(state: RunState) -> RunState:
        ctx.set_status("generating", "content")
        ctx.emit("text_agent", "started", "Writing the core campaign message")
        brain = ctx.brain()
        brain.core_message = await text.run(ctx)
        ctx.save_brain(brain)
        ctx.emit("text_agent", "completed", brain.core_message.key_message)
        return {}

    async def director(state: RunState) -> RunState:
        ctx.emit("content_director", "started", "Planning assets and creative briefs")
        brain = ctx.brain()
        brain.briefs = await content_director.run(ctx)
        ctx.save_brain(brain)
        ctx.emit("content_director", "completed", f"{len(brain.briefs)} asset types planned",
                 {"plan": [f"{b.platform}:{b.format}" for b in brain.briefs]})
        return {}

    async def copy(state: RunState) -> RunState:
        if state.get("mode") == "regen":
            stale = [a for a in working_set(state) if a.status == "stale"]
            if stale:
                ctx.emit("platform_agent", "started", f"Regenerating {len(stale)} affected assets")
                await production.recreate_copy(ctx, stale)
            return {"retry_round": 0}
        assets = await production.create_copy(ctx)
        return {"asset_ids": [a.id for a in assets], "retry_round": 0}

    async def localize(state: RunState) -> RunState:
        ctx.set_status("generating", "localization")
        await production.localize(ctx, [a for a in working_set(state) if a.status == "pending_localization"])
        ctx.emit("language_culture_agent", "completed", "Localization done")
        return {}

    async def truth(state: RunState) -> RunState:
        ctx.set_status("generating", "verification")
        assets = working_set(state)
        to_check = [a for a in assets if a.status in ("draft", "failed")]
        ctx.emit("truth_engine", "started", f"Verifying {len(to_check)} assets against the offer facts")
        failed = await production.verify(ctx, to_check)
        ctx.emit("truth_engine", "completed", f"{len(to_check) - len(failed)} passed, {len(failed)} need work",
                 {"failed": [a.id for a in failed]})
        return {}

    def route_after_truth(state: RunState) -> str:
        failed = [a for a in working_set(state) if a.status == "failed"]
        if failed and state.get("retry_round", 0) < max_retries:
            return "regenerate"
        return "escalate" if failed else "performance"

    async def regenerate(state: RunState) -> RunState:
        failed = [a for a in working_set(state) if a.status == "failed"]
        round_no = state.get("retry_round", 0) + 1
        ctx.emit("campaign_manager", "info", f"Regenerating {len(failed)} assets with fact-check feedback "
                                             f"(attempt {round_no}/{max_retries})")
        await production.regenerate_failed(ctx, failed)
        return {"retry_round": round_no}

    async def escalate(state: RunState) -> RunState:
        failed = [a for a in working_set(state) if a.status == "failed"]
        brain = ctx.brain()
        brain.escalations.append({"type": "fact_check_failed", "asset_ids": [a.id for a in failed],
                                  "message": f"{len(failed)} assets still fail verification after {max_retries} "
                                             "attempts. Edit them manually or adjust the offer."})
        ctx.save_brain(brain)
        ctx.emit("campaign_manager", "info", f"{len(failed)} assets need your attention", {"asset_ids": [a.id for a in failed]})
        return {}

    async def performance_node(state: RunState) -> RunState:
        ctx.set_status("generating", "performance")
        await production.predict_and_optimize(ctx, working_set(state))
        ctx.emit("optimization_agent", "completed", "Variants scored and optimized")
        return {}

    async def media(state: RunState) -> RunState:
        ctx.set_status("generating", "media")
        pending = await production.generate_media(ctx, working_set(state))
        ctx.emit("visual_agent", "completed", "Media generation finished or submitted",
                 {"pending_videos": [a.id for a in pending]})
        return {"pending_videos": [a.id for a in pending]}

    async def finalize(state: RunState) -> RunState:
        brain = ctx.brain()
        brain.approval.status = "pending"
        ctx.save_brain(brain)
        ctx.set_status("review", "review")
        ctx.emit("campaign_manager", "completed", "Campaign ready for your review")
        return {}

    g = StateGraph(RunState)
    for name, fn in (("core_message", core_message), ("director", director), ("copy", copy),
                     ("localize", localize), ("truth", truth), ("regenerate", regenerate), ("escalate", escalate),
                     ("performance", performance_node), ("media", media), ("finalize", finalize)):
        g.add_node(name, fn)
    g.set_entry_point("core_message")
    g.add_edge("core_message", "director")
    g.add_edge("director", "copy")
    g.add_edge("copy", "localize")
    g.add_edge("localize", "truth")
    g.add_conditional_edges("truth", route_after_truth,
                            {"regenerate": "regenerate", "escalate": "escalate", "performance": "performance"})
    g.add_edge("regenerate", "truth")
    g.add_edge("escalate", "performance")
    g.add_edge("performance", "media")
    g.add_edge("media", "finalize")
    g.add_edge("finalize", END)
    return g.compile()


async def _guarded(ctx: PipelineContext, graph, state: RunState) -> RunState:
    try:
        return await graph.ainvoke(state, {"recursion_limit": 60})
    except Exception as e:
        log.exception("pipeline failed for campaign %s", ctx.campaign.id)
        ctx.db.rollback()
        ctx.set_status("failed", ctx.campaign.stage)
        ctx.emit("campaign_manager", "failed", f"Pipeline error: {e}")
        raise


async def run_plan(ctx: PipelineContext, message: str, *, auto_accept_strategy: bool = False) -> RunState:
    return await _guarded(ctx, build_plan_graph(ctx), {"message": message, "auto_accept_strategy": auto_accept_strategy})


async def run_produce(ctx: PipelineContext, *, mode: Literal["full", "regen"] = "full",
                      asset_ids: list[str] | None = None) -> RunState:
    state: RunState = {"mode": mode}
    if asset_ids is not None:
        state["asset_ids"] = asset_ids
    return await _guarded(ctx, build_produce_graph(ctx), state)
