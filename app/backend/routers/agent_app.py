"""智能体应用生成 API：自然语言描述 -> 可运行的单文件 HTML 应用。"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.generation_history import Generation_history
from schemas.agent_app import (
    AgentGenerateRequest,
    AgentGenerateResponse,
    AgentModelInfo,
    AgentModelListResponse,
)
from services.agent_app import AgentAppService, AgentGenerationError, MODEL_CATALOG

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/agent", tags=["agent"])


@router.get("/models", response_model=AgentModelListResponse)
async def list_models() -> AgentModelListResponse:
    """返回可用于应用生成的模型列表，供前端展示与选择。"""
    return AgentModelListResponse(
        models=[AgentModelInfo(**item) for item in MODEL_CATALOG],
        default=MODEL_CATALOG[0]["id"],
    )


@router.post("/generate_app", response_model=AgentGenerateResponse)
async def generate_app(
    data: AgentGenerateRequest,
    db: AsyncSession = Depends(get_db),
) -> AgentGenerateResponse:
    """调用智能体生成应用代码，并把生成结果写入生成历史。"""
    description = (data.description or "").strip()
    if not description:
        raise HTTPException(status_code=400, detail="应用描述不能为空")

    # 慢速 AI 调用发生在任何数据库事务之前，避免长事务占用连接。
    service = AgentAppService()
    try:
        result = await service.generate(data)
    except AgentGenerationError as exc:
        # 额度不足、渠道不可用等可预期失败：按异常自带状态码返回明确文案。
        logger.warning("agent generate_app rejected: %s", exc)
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except ValueError as exc:
        logger.warning("agent output rejected: %s", exc)
        raise HTTPException(
            status_code=502, detail=f"智能体输出不符合要求，请重试：{exc}"
        ) from exc
    except Exception as exc:
        logger.error("agent generate_app failed: %s", exc)
        raise HTTPException(
            status_code=500, detail=f"智能体生成失败，请稍后重试：{exc}"
        ) from exc

    version = data.version if data.version and data.version > 0 else 1
    record_id = None
    try:
        record = Generation_history(
            description=description,
            template_name="",
            app_title=result["app_title"],
            category=result["category"],
            kind="agent",
            html_code=result["html_code"],
            plan_summary=result["plan_summary"],
            model=result["model"],
            version=version,
            instruction=(data.instruction or "").strip()[:2000],
        )
        db.add(record)
        await db.commit()
        record_id = record.id
    except Exception as exc:
        # 代码已生成，落库失败不应让用户丢掉结果；仅记录错误并返回 record_id=None。
        await db.rollback()
        logger.error("agent generate_app persist failed: %s", exc)

    return AgentGenerateResponse(
        app_title=result["app_title"],
        category=result["category"],
        plan_summary=result["plan_summary"],
        html_code=result["html_code"],
        model=result["model"],
        version=version,
        record_id=record_id,
    )
