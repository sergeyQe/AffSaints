"""Консольные команды: python -m app.cli <команда>."""

import argparse
import asyncio
import sys

from app.core.db import SessionFactory, engine
from app.seed import is_empty, seed, wipe


async def _seed(if_empty: bool, reset: bool) -> str:
    try:
        async with SessionFactory() as session:
            # Сброс демо: очищаем всё и заполняем заново
            if reset:
                await wipe(session)
                await session.commit()
            elif not await is_empty(session):
                if if_empty:
                    return "seed: БД не пуста, пропускаем"
                return "seed: БД не пуста — используйте --reset для пересоздания"
            await seed(session)
        return "seed: демо-данные созданы"
    finally:
        await engine.dispose()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    seed_cmd = sub.add_parser("seed", help="заполнить БД демо-данными")
    mode = seed_cmd.add_mutually_exclusive_group()
    mode.add_argument("--if-empty", action="store_true", help="только если пользователей нет")
    mode.add_argument("--reset", action="store_true", help="удалить все данные и создать заново")

    args = parser.parse_args(argv)
    if args.command == "seed":
        print(asyncio.run(_seed(args.if_empty, args.reset)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
