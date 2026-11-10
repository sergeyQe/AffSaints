from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AwareDatetime, BaseModel, Field, field_validator, model_validator

from app.models.task import TaskStatus
from app.schemas.user import UserBrief


class AnalyticsQuery(BaseModel):
    date_from: AwareDatetime
    date_to: AwareDatetime
    buyer_id: int | None = None
    creative_id: int | None = None
    offer: str | None = Field(default=None, max_length=200)
    # Таймзона браузера — для группировки по дням
    tz: str = "UTC"

    @field_validator("tz")
    @classmethod
    def _valid_tz(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("Неизвестный часовой пояс") from exc
        return v

    @model_validator(mode="after")
    def _range(self) -> "AnalyticsQuery":
        if self.date_to <= self.date_from:
            raise ValueError("Конец периода должен быть позже начала")
        if (self.date_to - self.date_from).days > 731:
            raise ValueError("Период не длиннее двух лет")
        return self


class Summary(BaseModel):
    created: int
    completed: int
    cancelled: int
    active_now: int
    overdue_now: int
    revisions_per_task: float | None


class StatusCount(BaseModel):
    status: TaskStatus
    count: int


class WorkloadRow(BaseModel):
    user: UserBrief
    in_progress: int
    review: int
    revision: int
    active_tasks: int
    active_creatives: int
    completed_in_period: int
    avg_work_seconds: int | None


class OverdueRow(BaseModel):
    user: UserBrief | None
    on_time: int
    late: int
    missed: int
    current: int


class OverdueStats(BaseModel):
    # По дедлайнам, попавшим в период (решение №17): сдано вовремя / сдано поздно / не сдано
    on_time: int
    late: int
    missed: int
    late_rate: float | None
    # Текущие просрочки на этот момент — без привязки к периоду
    current: int
    by_executor: list[OverdueRow]


class DayPoint(BaseModel):
    day: date
    created: int
    completed: int


class OverviewOut(BaseModel):
    """Вкладка «Пользователи и задачи»."""

    date_from: datetime
    date_to: datetime
    summary: Summary
    by_status: list[StatusCount]
    workload: list[WorkloadRow]
    timeline: list[DayPoint]


# ---------- учёт AI-расходов ----------


class RoundCredits(BaseModel):
    """Кредиты одного круга: 0 — первая версия, 1, 2… — правки."""

    round: int
    credits: float


class ServiceCredits(BaseModel):
    service_id: int
    service: str
    credits: float
    first_version: float
    revisions: float
    # Доля кредитов сервиса, потраченных на правки (0..1)
    revision_share: float | None


class ExecutorCredits(BaseModel):
    user: UserBrief
    service_id: int
    service: str
    credits: float
    first_version: float
    revisions: float


class TaskCredits(BaseModel):
    task_id: int
    offer: str
    geo: str
    user: UserBrief
    service_id: int
    service: str
    credits: float
    first_version: float
    revisions: float
    # Правки по кругам — для подсказки «№1: 10, №2: 5»
    rounds: list[RoundCredits]


class AiOut(BaseModel):
    """Вкладка «Учёт AI-расходов». Период — по дате записи расхода."""

    date_from: datetime
    date_to: datetime
    records: int
    # Общая доля на правки по всем сервисам (0..1); None — расходов за период нет
    revision_share: float | None
    by_service: list[ServiceCredits]
    by_executor: list[ExecutorCredits]
    by_task: list[TaskCredits]
    # Строк по задачам больше лимита — показаны самые затратные
    by_task_truncated: bool


# ---------- учёт времени ----------


class TimeTiles(BaseModel):
    """Средние по задачам, принятым в периоде (секунды)."""

    completed: int
    avg_work_seconds: int | None
    avg_revision_seconds: int | None
    avg_review_wait_seconds: int | None
    avg_pool_wait_seconds: int | None


class CreativeTime(BaseModel):
    user: UserBrief
    # Принято задач этого исполнителя за период
    completed: int
    work_seconds: int
    revision_seconds: int
    # Среднее (работа + правки) на задачу, в которой он работал
    avg_task_seconds: int | None
    revisions_per_task: float | None


class TaskTime(BaseModel):
    task_id: int
    offer: str
    geo: str
    user: UserBrief | None
    completed_at: datetime
    work_seconds: int
    revision_seconds: int
    revision_count: int
    review_wait_seconds: int
    pool_wait_seconds: int
    # Срок по первой сдаче: вовремя / поздно / без дедлайна
    deadline: Literal["on_time", "late", "none"]


class ReviewWaitRow(BaseModel):
    """Ожидание проверки — за тем, кто фактически принял работу."""

    user: UserBrief | None
    tasks: int
    avg_seconds: int
    max_seconds: int


class WaitingNow(BaseModel):
    """Сейчас ждут проверки — без периода."""

    count: int
    oldest_task_id: int | None
    oldest_seconds: int | None


class TimeOut(BaseModel):
    """Вкладка «Учёт времени»."""

    date_from: datetime
    date_to: datetime
    tiles: TimeTiles
    by_creative: list[CreativeTime]
    by_task: list[TaskTime]
    by_task_truncated: bool
    review_wait_by_reviewer: list[ReviewWaitRow]
    waiting_now: WaitingNow
    overdue: OverdueStats
