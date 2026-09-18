"""
Request and response models for the agent-driven app generation module.
"""

from typing import Optional

from pydantic import BaseModel, Field


class AgentGenerateRequest(BaseModel):
    """智能体生成请求：自然语言描述（可选迭代指令与上一版代码）。"""

    description: str = Field(..., description="用户最初输入的应用描述")
    instruction: Optional[str] = Field(
        default=None, description="迭代修改要求，首次生成时为空"
    )
    base_html: Optional[str] = Field(
        default=None, description="上一版生成的 HTML 代码，用于按指令迭代修改"
    )
    model: Optional[str] = Field(
        default=None, description="指定使用的文本生成模型；不可用时自动降级到其他候选模型"
    )
    version: Optional[int] = Field(default=1, description="本次生成的迭代版本号")


class AgentModelInfo(BaseModel):
    """单个可选生成模型的描述。"""

    id: str = Field(..., description="模型标识，用于请求参数")
    label: str = Field(..., description="模型展示名称")
    note: str = Field(..., description="模型特点说明")


class AgentModelListResponse(BaseModel):
    """可选模型列表响应。"""

    models: list[AgentModelInfo] = Field(..., description="可选模型列表")
    default: str = Field(..., description="默认使用的模型标识")


class AgentGenerateResponse(BaseModel):
    """智能体生成响应：应用元信息 + 完整可运行代码 + 持久化记录 ID。"""

    app_title: str = Field(..., description="应用标题")
    category: str = Field(..., description="应用分类")
    plan_summary: str = Field(..., description="应用规格摘要")
    html_code: str = Field(..., description="完整单文件 HTML 代码")
    model: str = Field(..., description="实际使用的生成模型")
    version: int = Field(default=1, description="迭代版本号")
    record_id: Optional[int] = Field(
        default=None, description="写入生成历史后的记录 ID，保存失败时为 None"
    )
