"""Аналитика, вкладка «Учёт AI-расходов»: кредиты по сервисам, исполнителям и задачам
с разбивкой «первая версия / правки». Период — по дате записи расхода (решение №17).

Кредиты разных сервисов несопоставимы, поэтому суммы считаются внутри сервиса; единственное
исключение — общая доля кредитов на правки в процентах.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AiService, AiUsage
from app.models.task import Task
from app.schemas.analytics import (
    AiOut,
    AnalyticsQuery,
    ExecutorCredits,
    RoundCredits,
    ServiceCredits,
    TaskCredits,
)
from app.services.analytics_common import between, task_filters, truncate, user_briefs


@dataclass
class _Split:
    """Кредиты по кругам: 0 — первая версия, остальные — правки."""

    rounds: dict[int, Decimal] = field(default_factory=lambda: defaultdict(Decimal))

    def add(self, round_: int, credits: Decimal) -> None:
        self.rounds[round_] += credits

    @property
    def first(self) -> Decimal:
        return self.rounds.get(0, Decimal(0))

    @property
    def total(self) -> Decimal:
        return sum(self.rounds.values(), Decimal(0))

    @property
    def revisions(self) -> Decimal:
        return self.total - self.first

    def fields(self) -> dict[str, float]:
        """Общие поля строк отчёта: всего, первая версия, правки."""
        return {
            "credits": float(self.total),
            "first_version": float(self.first),
            "revisions": float(self.revisions),
        }


def _share(revisions: Decimal, total: Decimal) -> float | None:
    return None if total == 0 else round(float(revisions / total), 4)


async def build_ai(session: AsyncSession, q: AnalyticsQuery) -> AiOut:
    conds = [between(AiUsage.created_at, q), *task_filters(q, by_assignee=False)]
    # Фильтр по креативщику — по тому, чьи это расходы
    if q.creative_id is not None:
        conds.append(AiUsage.user_id == q.creative_id)

    # Один запрос: задача × исполнитель × сервис × круг; разрезы собираются из него
    rows = await session.execute(
        select(
            Task.id,
            Task.offer,
            Task.geo,
            AiUsage.user_id,
            AiService.id,
            AiService.name,
            AiUsage.round,
            func.sum(AiUsage.credits),
            func.count(),
        )
        .select_from(AiUsage)
        .join(Task, Task.id == AiUsage.task_id)
        .join(AiService, AiService.id == AiUsage.service_id)
        .where(*conds)
        .group_by(
            Task.id,
            Task.offer,
            Task.geo,
            AiUsage.user_id,
            AiService.id,
            AiService.name,
            AiUsage.round,
        )
    )

    users = await user_briefs(session)
    names: dict[int, str] = {}
    tasks: dict[int, tuple[str, str]] = {}
    by_service: dict[int, _Split] = defaultdict(_Split)
    by_executor: dict[tuple[int, int], _Split] = defaultdict(_Split)
    by_task: dict[tuple[int, int, int], _Split] = defaultdict(_Split)
    overall = _Split()
    records = 0
    for task_id, offer, geo, user_id, service_id, service, round_, credits, count in rows:
        names[service_id] = service
        tasks[task_id] = (offer, geo)
        by_service[service_id].add(round_, credits)
        by_executor[(user_id, service_id)].add(round_, credits)
        by_task[(task_id, user_id, service_id)].add(round_, credits)
        overall.add(round_, credits)
        records += int(count)

    # По сервисам — самые затратные сверху; у каждого своя доля правок
    services = [
        ServiceCredits(
            service_id=sid,
            service=names[sid],
            revision_share=_share(s.revisions, s.total),
            **s.fields(),
        )
        for sid, s in sorted(by_service.items(), key=lambda kv: -kv[1].total)
    ]

    # По исполнителям — по имени, внутри — сервисы по убыванию кредитов
    executors = sorted(
        (
            ExecutorCredits(user=users[uid], service_id=sid, service=names[sid], **s.fields())
            for (uid, sid), s in by_executor.items()
            if uid in users
        ),
        key=lambda r: (r.user.full_name, -r.credits),
    )

    # По задачам — самые затратные сверху, не больше лимита
    task_rows, truncated = truncate(sorted(by_task.items(), key=lambda kv: -kv[1].total))
    per_task = [
        TaskCredits(
            task_id=tid,
            offer=tasks[tid][0],
            geo=tasks[tid][1],
            user=users[uid],
            service_id=sid,
            service=names[sid],
            rounds=[
                RoundCredits(round=r, credits=float(c))
                for r, c in sorted(s.rounds.items())
                if r > 0
            ],
            **s.fields(),
        )
        for (tid, uid, sid), s in task_rows
        if uid in users
    ]

    return AiOut(
        date_from=q.date_from,
        date_to=q.date_to,
        records=records,
        revision_share=_share(overall.revisions, overall.total),
        by_service=services,
        by_executor=executors,
        by_task=per_task,
        by_task_truncated=truncated,
    )
