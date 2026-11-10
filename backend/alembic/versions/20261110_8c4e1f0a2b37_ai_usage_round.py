"""ai_usage round

Revision ID: 8c4e1f0a2b37
Revises: 3f1c8a2d7b90
Create Date: 2026-11-10 13:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "8c4e1f0a2b37"
down_revision: str | None = "3f1c8a2d7b90"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Уже внесённые расходы: круг = число переходов «на правки» по задаче не позже записи.
# Это ровно те события, на которых растёт tasks.revision_count (проверяется тестом на сиде)
BACKFILL_SQL = """
update ai_usage u
set round = (
    select count(*) from task_events e
    where e.task_id = u.task_id
      and e.created_at <= u.created_at
      and (
        e.type in ('revision_requested', 'reopened')
        or (e.type = 'moved' and e.to_status = 'revision')
      )
)
"""


def upgrade() -> None:
    op.add_column("ai_usage", sa.Column("round", sa.Integer(), server_default="0", nullable=False))
    op.create_check_constraint(op.f("ck_ai_usage_round_non_negative"), "ai_usage", "round >= 0")
    op.execute(BACKFILL_SQL)


def downgrade() -> None:
    op.drop_constraint(op.f("ck_ai_usage_round_non_negative"), "ai_usage", type_="check")
    op.drop_column("ai_usage", "round")
