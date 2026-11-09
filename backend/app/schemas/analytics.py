from datetime import date, datetime
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
    avg_work_seconds: int | None
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


class ServiceCredits(BaseModel):
    service_id: int
    service: str
    credits: float


class ExecutorCredits(BaseModel):
    user: UserBrief
    service_id: int
    service: str
    credits: float


class AiCredits(BaseModel):
    by_service: list[ServiceCredits]
    by_executor: list[ExecutorCredits]


class DayPoint(BaseModel):
    day: date
    created: int
    completed: int


class AnalyticsOut(BaseModel):
    date_from: datetime
    date_to: datetime
    summary: Summary
    by_status: list[StatusCount]
    workload: list[WorkloadRow]
    overdue: OverdueStats
    ai_credits: AiCredits
    timeline: list[DayPoint]
