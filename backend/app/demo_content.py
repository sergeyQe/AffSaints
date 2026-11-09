"""Демо-контент: AI-сервисы и 20 задач во всех статусах.

Задачи проходят через те же сервисы, что и API, а время подменяется: так история, отрезки работы,
снимки дедлайна и просрочки получаются ровно такими, какими их сделал бы реальный сценарий.
Все даты — относительно текущего момента, поэтому аналитика за неделю/месяц/квартал не пустая.
"""

import io
import struct
import zlib
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, ClassVar

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.models.ai import AiService
from app.models.attachment import AttachmentKind
from app.models.task import CreativeType, Priority
from app.models.user import User
from app.schemas.ai import AiUsageCreate
from app.schemas.task import TaskCreate, TaskUpdate
from app.services import ai as ai_service
from app.services import attachments as attachment_service
from app.services import tasks as task_service
from app.services.storage import get_storage

AI_SERVICES = (
    "Midjourney",
    "Runway",
    "Kling",
    "ElevenLabs",
    "ChatGPT",
    "HeyGen",
    "Suno",
    "Leonardo AI",
)
# Отключённый сервис — чтобы в демо было видно, как работает справочник
INACTIVE_SERVICES = frozenset({"Leonardo AI"})


# ---------- картинки-заглушки для файлов ----------


def _png(
    width: int, height: int, color: tuple[int, int, int], stripe: tuple[int, int, int]
) -> bytes:
    """Минимальный PNG без сторонних библиотек: фон с диагональными полосами."""
    rows = bytearray()
    for y in range(height):
        rows.append(0)  # фильтр строки: none
        for x in range(width):
            rows.extend(stripe if (x + y) // 24 % 2 else color)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + chunk(b"IEND", b"")
    )


_PALETTE = [
    ((42, 120, 214), (57, 135, 229)),
    ((235, 104, 52), (217, 89, 38)),
    ((27, 175, 122), (25, 158, 112)),
    ((98, 80, 214), (144, 133, 233)),
]


def demo_image(index: int) -> bytes:
    color, stripe = _PALETTE[index % len(_PALETTE)]
    return _png(320, 180, color, stripe)


# ---------- сценарий ----------


@dataclass
class Step:
    """Шаг сценария: через сколько часов после предыдущего и что сделать."""

    hours: float
    action: str
    actor: str | None = None
    arg: Any = None


@dataclass
class Story:
    offer: str
    geo: str
    creative_type: CreativeType
    quantity: int
    priority: Priority
    author: str
    days_ago: float
    deadline_hours: float | None
    description: str
    steps: list[Step] = field(default_factory=list)
    reference_link: str | None = None
    reference_image: bool = False


def S(hours: float, action: str, actor: str | None = None, arg: Any = None) -> Step:
    return Step(hours, action, actor, arg)


V, ST, AN, UGC, PL = (
    CreativeType.VIDEO,
    CreativeType.STATIC,
    CreativeType.ANIMATION,
    CreativeType.UGC,
    CreativeType.PLAYABLE,
)
LOW, NORMAL, HIGH, URGENT = Priority.LOW, Priority.NORMAL, Priority.HIGH, Priority.URGENT

STORIES: list[Story] = [
    # ---------- Готово ----------
    Story("Vavada Casino", "BR", V, 5, URGENT, "anna", 70, 48,
          "Вертикаль 9:16, 15 сек. Хук в первые 2 секунды, бонус 150% в финале.",
          [S(2, "take", "ivan"), S(1, "ai", "ivan", ("Midjourney", "30")),
           S(5, "ai", "ivan", ("Runway", "80")), S(0.5, "submit", "ivan"), S(3, "accept", "anna")],
          reference_link="https://www.tiktok.com/@reference/video/7351234567"),
    Story("Pin-Up Bet", "KZ", ST, 10, NORMAL, "dmitry", 62, 72,
          "Серия баннеров 1080×1080 под лайв-ставки, акцент на коэффициенты.",
          [S(5, "take", "maria"), S(18, "ai", "maria", ("Midjourney", "45")), S(2, "submit", "maria"),
           S(4, "revision", "dmitry", "Сделайте бонус 100% крупнее и уберите мелкий текст снизу"),
           S(3, "submit", "maria"), S(2, "accept", "dmitry")]),
    Story("1win Aviator", "IN", AN, 4, HIGH, "anna", 55, 24,
          "Анимация самолёта с растущим коэффициентом, 6–8 сек, луп.",
          [S(3, "take", "sergey"), S(20, "ai", "sergey", ("Runway", "60")),
           S(8, "ai", "sergey", ("Kling", "25")), S(2, "submit", "sergey"), S(5, "accept", "anna")]),
    Story("Mostbet", "AZ", PL, 1, NORMAL, "kate", 40, 120,
          "Плейабл «крути колесо» на 15 сек, три вращения и CTA.",
          [S(10, "take", "ivan"), S(38, "ai", "ivan", ("ChatGPT", "12")), S(2, "submit", "ivan"),
           S(6, "accept", "kate")]),
    Story("Melbet", "UZ", UGC, 3, HIGH, "dmitry", 30, 48,
          "UGC-отзывы «выиграл с первого депозита», живая подача, субтитры.",
          [S(1, "take", "kate"), S(10, "ai", "kate", ("HeyGen", "150")), S(2, "submit", "kate"),
           S(3, "revision", "dmitry", "Нужен другой актёр — этот уже выгорел в связке"),
           S(6, "ai", "kate", ("ElevenLabs", "35")), S(2, "submit", "kate"),
           S(2, "revision", "dmitry", "Добавьте субтитры на узбекском"), S(4, "submit", "kate"),
           S(1, "accept", "dmitry")]),
    Story("Joycasino", "MX", V, 6, NORMAL, "anna", 14, 96,
          "Видео 16:9 и 9:16, слот-геймплей, крупный выигрыш на 10-й секунде.",
          [S(4, "take", "maria"), S(30, "ai", "maria", ("Kling", "90")),
           S(18, "ai", "maria", ("Suno", "20")), S(2, "submit", "maria"), S(10, "accept", "anna")],
          reference_image=True),
    Story("Betwinner", "PE", ST, 8, LOW, "dmitry", 6, None,
          "Статика под футбольные матчи выходных, шаблон под замену команд.",
          [S(20, "take", "sergey"), S(13, "ai", "sergey", ("Midjourney", "25")),
           S(2, "submit", "sergey"), S(8, "accept", "dmitry")]),
    Story("Gama Casino", "CL", V, 3, URGENT, "anna", 3, 30,
          "Срочно: новая связка, видео с хуком «последний шанс».",
          [S(1, "take", "ivan"), S(30, "ai", "ivan", ("Runway", "70")), S(4, "submit", "ivan"),
           S(2, "revision", "anna", "Хук слабый — начните сразу с выигрыша"),
           S(4, "ai", "ivan", ("ElevenLabs", "15")), S(1, "submit", "ivan"), S(3, "accept", "anna")]),
    # ---------- На проверке ----------
    Story("Leon Bet", "TR", V, 4, HIGH, "dmitry", 2, 72,
          "Видео под Лигу чемпионов, 20 сек, турецкая озвучка.",
          [S(3, "take", "maria"), S(2, "edit", "dmitry", {"quantity": 5}),
           S(16, "ai", "maria", ("Kling", "40")), S(2, "submit", "maria")],
          reference_image=True),
    Story("Vavada Casino", "MX", UGC, 2, NORMAL, "anna", 1.5, 60,
          "UGC с распаковкой бонуса, разговорная подача.",
          [S(2, "take", "kate"), S(23, "ai", "kate", ("HeyGen", "80")), S(2, "submit", "kate")]),
    # ---------- Правки ----------
    Story("Pin-Up Casino", "BR", ST, 12, NORMAL, "anna", 4, 120,
          "Баннеры под ретаргет, тёмная и светлая версии.",
          [S(6, "take", "ivan"), S(28, "ai", "ivan", ("Midjourney", "55")), S(2, "submit", "ivan"),
           S(10, "revision", "anna", "Поменяйте фон на тёмный и добавьте таймер акции")]),
    Story("Mostbet", "KZ", V, 3, URGENT, "dmitry", 2, 36,
          "Видео 9:16 под казахстанскую аудиторию, казахские субтитры.",
          [S(2, "take", "sergey"), S(8, "reassign", "head", "maria"),
           S(10, "ai", "maria", ("Runway", "45")), S(2, "submit", "maria"),
           S(4, "revision", "dmitry", "Замените текст CTA на «Забрать бонус»")]),
    # ---------- В работе ----------
    Story("1win", "KZ", AN, 6, HIGH, "anna", 3, 48,
          "Анимированные баннеры для пуш-рассылки, 6 размеров.",
          [S(4, "take", "ivan"), S(6, "ai", "ivan", ("Midjourney", "20"))]),
    Story("Melbet", "IN", V, 2, NORMAL, "dmitry", 1, 72,
          "Видео с крикетом, 15 сек, хинди-озвучка.",
          [S(3, "assign", "head", "maria"), S(4, "ai", "maria", ("Runway", "30"))],
          reference_link="https://drive.google.com/drive/folders/cricket-refs"),
    Story("Joycasino", "BR", PL, 1, LOW, "kate", 2, None,
          "Плейабл с выбором сундука, бразильская стилистика.",
          [S(10, "take", "sergey"), S(5, "unassign", "head"), S(3, "take", "ivan")]),
    # ---------- Новые ----------
    Story("Betwinner", "MX", ST, 15, NORMAL, "dmitry", 5 / 24, 96,
          "Пак статики под Liga MX на месяц.", [], reference_image=True),
    Story("Gama Casino", "PE", V, 4, URGENT, "anna", 2, 24,
          "Видео под новый бонус без депозита — горит.", []),
    Story("Leon Bet", "UZ", UGC, 2, LOW, "anna", 1 / 24, None,
          "UGC-тест новой связки, без спешки.", []),
    # ---------- Отменены ----------
    Story("Mostbet", "TR", V, 3, NORMAL, "dmitry", 20, 72,
          "Видео под турецкий рынок.",
          [S(5, "take", "maria"), S(6, "ai", "maria", ("Kling", "15")),
           S(4, "cancel", "dmitry", "Оффер остановлен рекламодателем")]),
    Story("Vavada Casino", "AZ", ST, 5, LOW, "anna", 9, None,
          "Статика под Азербайджан.", [S(24, "cancel", "anna", "Дубль — объединили с задачей по AZ")]),
]  # fmt: skip


@contextmanager
def _frozen(get_time: Callable[[], datetime]) -> Iterator[None]:
    # Сервисы берут время из app.core.clock — подменяем на время сценария
    original = clock.now
    clock.now = get_time
    try:
        yield
    finally:
        clock.now = original


async def _create_services(session: AsyncSession, now: datetime) -> dict[str, AiService]:
    services = {
        name: AiService(name=name, is_active=name not in INACTIVE_SERVICES, created_at=now)
        for name in AI_SERVICES
    }
    session.add_all(services.values())
    await session.commit()
    return services


@dataclass
class _Player:
    """Проигрывает шаги сценария одной задачи. Новый тип шага — новый метод и имя в STEP_TYPES."""

    session: AsyncSession
    task_id: int
    users: dict[str, User]
    services: dict[str, AiService]
    image_counter: int
    # Номер версии результата = номер сдачи (первая сдача — v1, после правок — v2…)
    version: int = 0

    async def take(self, actor: User, _: Any) -> None:
        await task_service.take(self.session, self.task_id, actor)

    async def submit(self, actor: User, _: Any) -> None:
        # Перед сдачей — результат: каждый второй круг файлом-картинкой, иначе ссылкой
        self.image_counter += 1
        self.version += 1
        if self.image_counter % 2:
            await attachment_service.add_file(
                self.session,
                get_storage(),
                self.task_id,
                actor,
                AttachmentKind.RESULT,
                io.BytesIO(demo_image(self.image_counter)),
                f"креатив_v{self.version}.png",
            )
        else:
            await attachment_service.add_link(
                self.session,
                self.task_id,
                actor,
                AttachmentKind.RESULT,
                f"https://drive.google.com/drive/folders/demo-{self.task_id}-v{self.version}",
            )
        await task_service.submit(self.session, self.task_id, actor)

    async def accept(self, actor: User, _: Any) -> None:
        await task_service.accept(self.session, self.task_id, actor)

    async def revision(self, actor: User, comment: str) -> None:
        await task_service.request_revision(self.session, self.task_id, actor, comment)

    async def cancel(self, actor: User, reason: str) -> None:
        await task_service.cancel(self.session, self.task_id, actor, reason)

    async def reassign(self, actor: User, login: str) -> None:
        await task_service.reassign(self.session, self.task_id, actor, self.users[login].id)

    async def assign(self, actor: User, login: str) -> None:
        await task_service.assign(self.session, self.task_id, actor, self.users[login].id)

    async def unassign(self, actor: User, _: Any) -> None:
        await task_service.unassign(self.session, self.task_id, actor)

    async def edit(self, actor: User, changes: dict[str, Any]) -> None:
        await task_service.update_task(self.session, self.task_id, TaskUpdate(**changes), actor)

    async def ai(self, actor: User, usage: tuple[str, str]) -> None:
        name, credits = usage
        await ai_service.add_usage(
            self.session,
            self.task_id,
            actor,
            AiUsageCreate(service_id=self.services[name].id, credits=Decimal(credits)),
        )

    # Допустимые типы шагов — каждому соответствует одноимённый метод
    STEP_TYPES: ClassVar[frozenset[str]] = frozenset(
        {
            "take",
            "assign",
            "submit",
            "accept",
            "revision",
            "cancel",
            "reassign",
            "unassign",
            "edit",
            "ai",
        }
    )

    async def run(self, step: Step, actor: User) -> None:
        if step.action not in self.STEP_TYPES:
            raise ValueError(f"Неизвестный шаг сценария: {step.action}")
        await getattr(self, step.action)(actor, step.arg)


async def _play(
    session: AsyncSession,
    story: Story,
    index: int,
    users: dict[str, User],
    services: dict[str, AiService],
    real_now: datetime,
) -> None:
    current = real_now - timedelta(days=story.days_ago)

    def at() -> datetime:
        return current

    with _frozen(at):
        # Создание ТЗ и референсы
        deadline = (
            None
            if story.deadline_hours is None
            else current + timedelta(hours=story.deadline_hours)
        )
        task = await task_service.create_task(
            session,
            TaskCreate(
                offer=story.offer,
                geo=story.geo,
                creative_type=story.creative_type,
                quantity=story.quantity,
                description=story.description,
                priority=story.priority,
                deadline=deadline,
            ),
            users[story.author],
        )
        player = _Player(session, task.id, users, services, image_counter=index * 3)
        if story.reference_link:
            await attachment_service.add_link(
                session,
                task.id,
                users[story.author],
                AttachmentKind.REFERENCE,
                story.reference_link,
            )
        if story.reference_image:
            await attachment_service.add_file(
                session,
                get_storage(),
                task.id,
                users[story.author],
                AttachmentKind.REFERENCE,
                io.BytesIO(demo_image(player.image_counter)),
                "референс.png",
            )

        # Шаги сценария — каждый со своим временем
        for step in story.steps:
            current += timedelta(hours=step.hours)
            if current > real_now:
                raise RuntimeError(f"Сценарий «{story.offer}» уходит в будущее")
            if step.actor is None:
                raise ValueError(f"У шага «{step.action}» не указан исполнитель")
            await player.run(step, users[step.actor])


async def seed_content(session: AsyncSession, users: dict[str, User]) -> None:
    real_now = clock.now()
    services = await _create_services(session, real_now)
    for index, story in enumerate(STORIES):
        await _play(session, story, index, users, services, real_now)
