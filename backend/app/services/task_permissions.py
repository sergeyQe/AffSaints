"""Правила доступа к действиям над задачей — единый источник истины.

Backend проверяет каждое действие через ensure_allowed(); тот же модуль отдаёт клиенту список
доступных действий (allowed_actions), по которому фронт рисует кнопки.
"""

from collections.abc import Callable
from dataclasses import dataclass

from app.core.errors import Conflict, Forbidden
from app.models.task import ACTIVE_STATUSES, CLOSED_STATUSES, Action, Task, TaskStatus
from app.models.user import Role, User

STATUS_LABELS = {
    TaskStatus.NEW: "Новые",
    TaskStatus.IN_PROGRESS: "В работе",
    TaskStatus.REVIEW: "На проверке",
    TaskStatus.REVISION: "Правки",
    TaskStatus.DONE: "Готово",
    TaskStatus.CANCELLED: "Отменена",
}

OPEN_STATUSES = frozenset(TaskStatus) - CLOSED_STATUSES

# Проверка «кто»: возвращает текст отказа или None, если можно
WhoCheck = Callable[[Task, User], str | None]


def _author_or_head(task: Task, user: User) -> str | None:
    if task.author_id == user.id or user.has_role(Role.HEAD):
        return None
    return "Действие доступно автору задачи или руководителю"


def _reviewer(task: Task, user: User) -> str | None:
    # Проверять собственную работу нельзя (актуально для руководителя с ролью креативщика)
    if task.assignee_id == user.id:
        return "Исполнитель не может сам проверять свою работу"
    return _author_or_head(task, user)


def _creative_not_author(task: Task, user: User) -> str | None:
    if not user.has_role(Role.CREATIVE):
        return "Брать задачи в работу могут только креативщики"
    if task.author_id == user.id:
        return "Нельзя взять в работу собственную задачу"
    return None


def _assignee(task: Task, user: User) -> str | None:
    return None if task.assignee_id == user.id else "Действие доступно только исполнителю задачи"


def _assignee_or_head(task: Task, user: User) -> str | None:
    if task.assignee_id == user.id or user.has_role(Role.HEAD):
        return None
    return "Действие доступно исполнителю задачи или руководителю"


def _head(_: Task, user: User) -> str | None:
    return None if user.has_role(Role.HEAD) else "Действие доступно только руководителю"


@dataclass(frozen=True)
class Rule:
    statuses: frozenset[TaskStatus]
    who: WhoCheck
    # Исключение: если вернул True — действие разрешено в любом статусе, без проверки «кто»
    any_status_if: Callable[[Task, User], bool] | None = None
    # Своя ошибка для неподходящего статуса (вместо общей «недоступно в статусе …»)
    status_conflict: Callable[[TaskStatus], Conflict | None] | None = None


def _head_on_assigned_task(task: Task, user: User) -> bool:
    # Руководитель правит AI-расходы и в закрытых задачах (решение №15)
    return user.has_role(Role.HEAD) and task.assignee_id is not None


def _already_taken(status: TaskStatus) -> Conflict | None:
    if status in ACTIVE_STATUSES:
        return Conflict("task_already_taken", "Задачу уже взял в работу другой исполнитель")
    return None


RULES: dict[Action, Rule] = {
    Action.EDIT: Rule(OPEN_STATUSES, _author_or_head),
    Action.CANCEL: Rule(OPEN_STATUSES, _author_or_head),
    Action.TAKE: Rule(
        frozenset({TaskStatus.NEW}), _creative_not_author, status_conflict=_already_taken
    ),
    # Руководитель сам назначает исполнителя на новую задачу (docs/decisions.md, «Роли»)
    Action.ASSIGN: Rule(frozenset({TaskStatus.NEW}), _head, status_conflict=_already_taken),
    Action.SUBMIT: Rule(frozenset({TaskStatus.IN_PROGRESS, TaskStatus.REVISION}), _assignee),
    Action.ACCEPT: Rule(frozenset({TaskStatus.REVIEW}), _reviewer),
    Action.REQUEST_REVISION: Rule(frozenset({TaskStatus.REVIEW}), _reviewer),
    Action.REASSIGN: Rule(ACTIVE_STATUSES, _head),
    Action.UNASSIGN: Rule(frozenset({TaskStatus.IN_PROGRESS, TaskStatus.REVISION}), _head),
    Action.ADD_REFERENCE: Rule(OPEN_STATUSES, _author_or_head),
    Action.ADD_RESULT: Rule(frozenset({TaskStatus.IN_PROGRESS, TaskStatus.REVISION}), _assignee),
    # Расходы: исполнитель до закрытия задачи; руководитель — всегда (решение №15)
    Action.MANAGE_AI_USAGE: Rule(
        ACTIVE_STATUSES, _assignee_or_head, any_status_if=_head_on_assigned_task
    ),
}


def _denial(action: Action, task: Task, user: User) -> Conflict | Forbidden | None:
    # Ядро проверки общее для всех действий; исключения описаны данными в RULES
    rule = RULES[action]
    if rule.any_status_if is not None and rule.any_status_if(task, user):
        return None

    status = task.status_enum
    if status not in rule.statuses:
        special = rule.status_conflict(status) if rule.status_conflict else None
        if special is not None:
            return special
        return Conflict(
            "invalid_status", f"Действие недоступно в статусе «{STATUS_LABELS[status]}»"
        )
    reason = rule.who(task, user)
    return Forbidden("forbidden", reason) if reason else None


def ensure_allowed(action: Action, task: Task, user: User) -> None:
    """Бросает 409 (неподходящий статус) или 403 (нет прав)."""
    denial = _denial(action, task, user)
    if denial is not None:
        raise denial


def allowed_actions(task: Task, user: User) -> list[Action]:
    return [a for a in Action if _denial(a, task, user) is None]
