"""Консольные команды: python -m app.cli <команда>."""

import argparse
import asyncio
import sys


async def _seed(if_empty: bool) -> None:
    # Сид появится на этапе 7
    print("seed: пока не реализован", "(if-empty)" if if_empty else "")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    seed = sub.add_parser("seed", help="заполнить БД демо-данными")
    seed.add_argument("--if-empty", action="store_true", help="только если пользователей нет")

    args = parser.parse_args(argv)
    if args.command == "seed":
        asyncio.run(_seed(args.if_empty))
    return 0


if __name__ == "__main__":
    sys.exit(main())
