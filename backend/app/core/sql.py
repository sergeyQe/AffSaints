"""Общие SQL-хелперы."""

LIKE_ESCAPE = "\\"


def contains_pattern(value: str) -> str:
    """Шаблон ILIKE «содержит»: спецсимволы LIKE (%, _) в пользовательском вводе экранируются."""
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
