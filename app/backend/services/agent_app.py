"""智能体应用生成服务。

把用户的自然语言描述交给大模型，产出可直接运行的单文件 HTML 应用/小游戏。
模型输出采用 ``===META===`` / ``===HTML===`` 分段格式，避免大段代码在 JSON
字符串中被转义破坏；解析后做必要字段与文档完整性校验，失败时纠正重试一次。
"""

import asyncio
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from schemas.agent_app import AgentGenerateRequest
from schemas.aihub import ChatMessage, GenTxtRequest
from services.aihub import AIHubService

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-opus-4.6"
MAX_TOKENS = 8192
MAX_BASE_HTML_CHARS = 40000
MAX_INSTRUCTION_CHARS = 2000
MODEL_CALL_TIMEOUT = 180
# 自动降级的总时间预算，需明显小于前端 600 秒请求超时，避免用户侧先超时。
FALLBACK_BUDGET_SECONDS = 420

# 可供用户选择的生成模型目录，同时作为自动降级的候选顺序。
# 注：claude-opus-5-low / claude-opus-5-high 等变体在网关侧暂无可用渠道，故不列入。
MODEL_CATALOG: Tuple[Dict[str, str], ...] = (
    {"id": "claude-opus-4.6", "label": "Claude Opus 4.6", "note": "代码能力最强，推荐"},
    {"id": "claude-opus-5", "label": "Claude Opus 5", "note": "代码与多模态均衡"},
    {"id": "gpt-5.6-sol", "label": "GPT-5.6 Sol", "note": "结构化输出稳定"},
    {"id": "gpt-5.4", "label": "GPT-5.4", "note": "通用能力强"},
    {"id": "deepseek-v4-pro", "label": "DeepSeek V4 Pro", "note": "高质量、性价比好"},
    {"id": "deepseek-v4-flash", "label": "DeepSeek V4 Flash", "note": "响应最快"},
    {"id": "gemini-3.1-pro-preview", "label": "Gemini 3.1 Pro", "note": "长上下文"},
)
MODEL_IDS: Tuple[str, ...] = tuple(item["id"] for item in MODEL_CATALOG)

META_KEYS = ("app_title", "category", "plan_summary")
CATEGORY_OPTIONS = ("小游戏", "效率工具", "数据展示", "内容生成", "其他")

META_MARKER_PATTERN = re.compile(r"=+\s*META\s*=+", re.IGNORECASE)
HTML_MARKER_PATTERN = re.compile(r"=+\s*HTML\s*=+", re.IGNORECASE)
DOC_START_PATTERN = re.compile(r"<!doctype html|<html", re.IGNORECASE)

BALANCE_ERROR_HINTS = (
    "insufficient_ai_balance",
    "ai balance is insufficient",
    "insufficient balance",
    "balance is insufficient",
)
CHANNEL_ERROR_HINTS = (
    "no available channel",
    "channel is not available",
    "无可用渠道",
)
BALANCE_ERROR_MESSAGE = (
    "AI 额度不足，无法调用生成模型。请在 Atoms 控制台的 Cloud & AI Wallet 充值后重试："
    "https://atoms.dev/dashboard?settings=cloudAiBalance"
)
CHANNEL_ERROR_MESSAGE = (
    "候选模型的调用渠道当前都不可用，已自动尝试多个模型仍未成功，请稍后重试。"
)


class AgentGenerationError(Exception):
    """智能体生成的可预期失败（额度不足、渠道不可用等），携带提示文案与 HTTP 状态码。"""

    def __init__(self, message: str, status_code: int = 402) -> None:
        super().__init__(message)
        self.status_code = status_code

SYSTEM_PROMPT = """你是一名资深前端工程师，负责把用户的自然语言需求实现为可直接运行的单文件 Web 应用或小游戏。

【输出格式】必须严格按下面的结构输出，不要输出任何额外说明：
===META===
app_title: 应用名称（简体中文，不超过 16 个字）
category: 应用分类（只能是 小游戏 / 效率工具 / 数据展示 / 内容生成 / 其他 之一）
plan_summary: 应用规格摘要（简体中文，120 字以内，说明核心功能与交互方式）
===HTML===
<!DOCTYPE html>
（此处输出完整 HTML 文档）

【硬性约束】
1. ===HTML=== 之后必须是完整可运行的 HTML5 文档，从 <!DOCTYPE html> 开始，到 </html> 结束，不得省略或折叠任何代码。
2. 所有样式写在 <style> 标签内，所有脚本写在 <script> 标签内；禁止引用任何外部资源（CDN、外链字体、外链图片、外链脚本），禁止使用 fetch / XMLHttpRequest 发起网络请求。
3. 禁止使用 localStorage / sessionStorage / IndexedDB / cookie，所有状态只保存在内存变量中。
4. 页面文字使用简体中文，视觉要现代美观：合理的留白、圆角、柔和阴影、清晰的视觉层级，按钮与卡片有 hover / active 反馈。
5. 必须适配移动端：包含 viewport meta，布局使用 flex / grid 且能在窄屏自适应，可点击元素高度不小于 40px。
6. 交互必须真实可用：禁止出现占位文案、TODO、示例假数据或空函数；每个按钮都要有真实行为。
7. 若需求是小游戏：必须包含完整可玩逻辑（初始化、合法操作校验、胜负判定、计分、重新开始），并同时支持键盘与鼠标/触屏操作。
8. 不要使用任何构建工具、模块化 import/export 或框架语法，只使用原生 HTML / CSS / JavaScript。"""

REPAIR_PROMPT = """上一次输出未通过格式校验，原因：{reason}

请严格按照要求重新输出**完整**内容：
1. 先输出一行 ===META===，接着依次输出 app_title / category / plan_summary 三行；
2. 再输出一行 ===HTML===，紧接着输出完整的 HTML 文档（从 <!DOCTYPE html> 到 </html>）；
3. 不要输出任何解释文字，不要使用 Markdown 代码块，不要省略或折叠代码。"""


def _is_balance_error(exc: Exception) -> bool:
    """判断异常是否由 AI 钱包余额不足引起，便于给出可执行的充值提示。"""
    text = str(exc).lower()
    return any(hint in text for hint in BALANCE_ERROR_HINTS)


def _is_channel_error(exc: Exception) -> bool:
    """判断异常是否由「模型无可用渠道」引起，这类失败可以换模型重试。"""
    text = str(exc).lower()
    return any(hint in text for hint in CHANNEL_ERROR_HINTS)


def _is_retryable_with_fallback(exc: Exception) -> bool:
    """判断该失败是否值得换下一个模型再试（渠道不可用或单次调用超时）。"""
    return _is_channel_error(exc) or isinstance(exc, asyncio.TimeoutError)


def _strip_code_fences(text: str) -> str:
    """去掉整体包裹的 Markdown 代码块标记。"""
    cleaned = (text or "").replace("\r\n", "\n").strip()
    fence = re.match(r"^```[a-zA-Z]*\s*\n", cleaned)
    if fence:
        cleaned = cleaned[fence.end():]
    cleaned = re.sub(r"\n?```\s*$", "", cleaned)
    return cleaned.strip()


def _parse_meta(meta_text: str) -> Dict[str, str]:
    """解析 ``key: value`` 形式的元信息块。"""
    meta: Dict[str, str] = {}
    for raw_line in meta_text.split("\n"):
        line = raw_line.strip().lstrip("-*# ").strip()
        if not line:
            continue

        separator_index = -1
        for separator in (":", "：", "="):
            index = line.find(separator)
            if index != -1:
                separator_index = index
                break
        if separator_index <= 0:
            continue

        key = line[:separator_index].strip().strip("\"'").lower()
        value = line[separator_index + 1:].strip().strip("\"'").strip()
        if key in META_KEYS and value:
            meta[key] = value
    return meta


def _clean_html(body: str) -> str:
    """清理 HTML 段：去代码块标记，并截断到最后一个 </html>。"""
    html = _strip_code_fences(body)
    end = html.lower().rfind("</html>")
    if end != -1:
        html = html[: end + len("</html>")]
    return html.strip()


def _normalize_category(value: str) -> str:
    """把模型给出的分类收敛到固定枚举值。"""
    text = (value or "").strip()
    for option in CATEGORY_OPTIONS:
        if option in text:
            return option
    lowered = text.lower()
    if "game" in lowered or "游戏" in text:
        return "小游戏"
    return "其他"


def parse_agent_output(raw: str) -> Tuple[Dict[str, str], str]:
    """把模型输出解析为 ``(meta, html)``，格式不合法时抛出 ``ValueError``。"""
    text = _strip_code_fences(raw or "")
    if not text:
        raise ValueError("模型没有返回任何内容")

    html_marker = HTML_MARKER_PATTERN.search(text)
    if html_marker:
        head = text[: html_marker.start()]
        body = text[html_marker.end():]
    else:
        doc_start = DOC_START_PATTERN.search(text)
        if not doc_start:
            raise ValueError("输出中找不到 ===HTML=== 标记，也没有 HTML 文档")
        head = text[: doc_start.start()]
        body = text[doc_start.start():]

    meta_marker = META_MARKER_PATTERN.search(head)
    meta_text = head[meta_marker.end():] if meta_marker else head
    meta = _parse_meta(meta_text)
    html = _clean_html(body)

    missing = [key for key in META_KEYS if not meta.get(key)]
    if missing:
        raise ValueError("缺少必要字段：" + "、".join(missing))

    lowered = html.lower()
    if not (lowered.startswith("<!doctype html") or lowered.startswith("<html")):
        raise ValueError("HTML 文档缺少 <!DOCTYPE html> 起始标记")
    if "</html>" not in lowered:
        raise ValueError("HTML 文档不完整，缺少 </html> 结束标记")
    if "<body" not in lowered:
        raise ValueError("HTML 文档缺少 <body> 内容区")

    return {
        "app_title": meta["app_title"][:60],
        "category": _normalize_category(meta["category"]),
        "plan_summary": meta["plan_summary"][:500],
    }, html


class AgentAppService:
    """调用文本生成模型，产出可运行的应用代码。"""

    def __init__(self) -> None:
        self.ai = AIHubService()

    @staticmethod
    def _build_user_prompt(request: AgentGenerateRequest) -> str:
        """拼装用户侧提示词，迭代时附带上一版代码与修改要求。"""
        parts = [f"用户需求：{request.description.strip()}"]

        instruction = (request.instruction or "").strip()
        base_html = (request.base_html or "").strip()
        if instruction and base_html:
            parts.append(
                "下面是上一版已经生成的 HTML 代码，请在此基础上按修改要求迭代，"
                "保留未被要求改动的功能与视觉风格："
            )
            parts.append("```html\n" + base_html[:MAX_BASE_HTML_CHARS] + "\n```")
            parts.append(f"修改要求：{instruction[:MAX_INSTRUCTION_CHARS]}")

        parts.append("请直接输出 ===META=== / ===HTML=== 结构的完整结果。")
        return "\n\n".join(parts)

    async def _call_model(self, messages: List[ChatMessage], model: str, timeout: float) -> str:
        """流式调用文本生成模型并累积完整输出。

        代码生成属于长输出场景，非流式调用在网关侧容易长时间无响应；
        流式响应能持续回传数据块，既避免请求挂起，也便于后续做进度反馈。
        单次调用受 ``timeout`` 约束，超时后交由上层换模型重试。
        """

        async def _accumulate() -> str:
            request = GenTxtRequest(
                messages=messages,
                model=model,
                stream=True,
                temperature=0.6,
                max_tokens=MAX_TOKENS,
            )
            chunks: List[str] = []
            async for chunk in self.ai.gentxt_stream(request):
                chunks.append(chunk)
            return "".join(chunks).strip()

        return await asyncio.wait_for(_accumulate(), timeout=timeout)

    async def _attempt(
        self,
        messages: List[ChatMessage],
        model: str,
        deadline: float,
    ) -> Tuple[Dict[str, str], str]:
        """用单个模型完成一次生成；输出不合格时按同一模型纠正重试一次。"""

        def remaining() -> float:
            return max(10.0, deadline - asyncio.get_running_loop().time())

        raw = await self._call_model(messages, model, min(MODEL_CALL_TIMEOUT, remaining()))
        try:
            return parse_agent_output(raw)
        except ValueError as first_error:
            logger.warning("agent output invalid on %s, retrying once: %s", model, first_error)
            retry_messages = messages + [
                ChatMessage(
                    role="user",
                    content=REPAIR_PROMPT.format(reason=str(first_error)),
                )
            ]
            raw = await self._call_model(
                retry_messages, model, min(MODEL_CALL_TIMEOUT, remaining())
            )
            return parse_agent_output(raw)

    @staticmethod
    def _candidate_models(primary: str) -> List[str]:
        """构造候选模型顺序：用户指定优先，其后按目录顺序自动降级。"""
        candidates = [primary]
        for model_id in MODEL_IDS:
            if model_id not in candidates:
                candidates.append(model_id)
        return candidates

    async def generate(self, request: AgentGenerateRequest) -> Dict[str, Any]:
        """生成应用代码。

        依次尝试候选模型：渠道不可用或调用超时时自动切换到下一个模型，
        输出格式不合格同样换模型重试；账户级余额不足则立即给出充值提示。
        """
        primary = (request.model or "").strip() or DEFAULT_MODEL
        messages = [
            ChatMessage(role="system", content=SYSTEM_PROMPT),
            ChatMessage(role="user", content=self._build_user_prompt(request)),
        ]

        candidates = self._candidate_models(primary)
        deadline = asyncio.get_running_loop().time() + FALLBACK_BUDGET_SECONDS
        last_error: Optional[Exception] = None
        tried: List[str] = []

        for index, model in enumerate(candidates):
            if index > 0 and deadline - asyncio.get_running_loop().time() <= 15:
                logger.warning("agent fallback budget exhausted after %s", ", ".join(tried))
                break

            tried.append(model)
            try:
                meta, html = await self._attempt(messages, model, deadline)
            except ValueError as exc:
                # 输出格式不合格属于模型侧问题，换下一个模型继续尝试。
                logger.warning("agent output rejected on %s: %s", model, exc)
                last_error = exc
                continue
            except Exception as exc:  # noqa: BLE001 - 需要区分额度、渠道与其他失败
                if _is_balance_error(exc):
                    # 账户级余额不足，换任何模型都无法解决，直接给出充值提示。
                    logger.warning("agent model quota exhausted: %s", exc)
                    raise AgentGenerationError(BALANCE_ERROR_MESSAGE) from exc
                if _is_retryable_with_fallback(exc):
                    logger.warning("model %s unavailable, trying next: %s", model, exc)
                    last_error = exc
                    continue
                raise

            return {
                "app_title": meta["app_title"],
                "category": meta["category"],
                "plan_summary": meta["plan_summary"],
                "html_code": html,
                "model": model,
            }

        # 所有候选模型都未成功，按最后一次失败原因给出可读提示。
        if isinstance(last_error, ValueError):
            raise AgentGenerationError(
                f"智能体输出不符合要求，请重试：{last_error}", status_code=502
            ) from last_error
        raise AgentGenerationError(
            CHANNEL_ERROR_MESSAGE, status_code=503
        ) from last_error
