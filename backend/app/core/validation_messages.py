"""Перевод типовых ошибок валидации pydantic на русский (интерфейс только на русском)."""

from typing import Any

_TEMPLATES: dict[str, str] = {
    "missing": "Обязательное поле",
    "string_too_short": "Минимум символов: {min_length}",
    "string_too_long": "Максимум символов: {max_length}",
    "string_pattern_mismatch": "Недопустимый формат",
    "string_type": "Ожидается строка",
    "int_parsing": "Ожидается целое число",
    "int_type": "Ожидается целое число",
    "int_from_float": "Ожидается целое число",
    "float_parsing": "Ожидается число",
    "decimal_parsing": "Ожидается число",
    "decimal_max_places": "Не больше {decimal_places} знаков после запятой",
    "decimal_max_digits": "Слишком большое число",
    "decimal_whole_digits": "Слишком большое число",
    "greater_than": "Должно быть больше {gt}",
    "greater_than_equal": "Должно быть не меньше {ge}",
    "less_than": "Должно быть меньше {lt}",
    "less_than_equal": "Должно быть не больше {le}",
    "bool_parsing": "Ожидается да/нет",
    "bool_type": "Ожидается да/нет",
    "enum": "Недопустимое значение",
    "literal_error": "Недопустимое значение",
    "datetime_parsing": "Неверный формат даты и времени",
    "datetime_from_date_parsing": "Неверный формат даты и времени",
    "datetime_type": "Неверный формат даты и времени",
    "timezone_aware": "Дата должна содержать часовой пояс",
    "date_parsing": "Неверный формат даты",
    "url_parsing": "Неверная ссылка",
    "url_scheme": "Ссылка должна начинаться с http:// или https://",
    "url_type": "Неверная ссылка",
    "list_type": "Ожидается список",
    "too_short": "Нужно хотя бы {min_length}",
    "too_long": "Не больше {max_length} элементов",
    "json_invalid": "Некорректный JSON",
    "extra_forbidden": "Лишнее поле",
    "uuid_parsing": "Неверный идентификатор",
}

_VALUE_ERROR_PREFIXES = ("Value error, ", "Assertion failed, ")


def translate(error: dict[str, Any]) -> str:
    error_type = error.get("type", "")
    message = str(error.get("msg", ""))

    # Свои сообщения из валидаторов (ValueError) уже на русском — только срезаем префикс
    if error_type in {"value_error", "assertion_error"}:
        for prefix in _VALUE_ERROR_PREFIXES:
            if message.startswith(prefix):
                return message[len(prefix) :]
        return message

    template = _TEMPLATES.get(error_type)
    if template is None:
        return message
    try:
        return template.format(**(error.get("ctx") or {}))
    except (KeyError, IndexError):
        return template.split("{")[0].strip() or message
