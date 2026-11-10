"""task first_submitted_by

Revision ID: 3f1c8a2d7b90
Revises: 6546d62c44f6
Create Date: 2026-11-10 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "3f1c8a2d7b90"
down_revision: str | None = "6546d62c44f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("first_submitted_by_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        op.f("fk_tasks_first_submitted_by_id_users"),
        "tasks",
        "users",
        ["first_submitted_by_id"],
        ["id"],
    )
    # Уже сданные задачи: исполнитель первой сдачи — автор первого события «сдана»
    op.execute(
        """
        update tasks t
        set first_submitted_by_id = (
            select e.actor_id from task_events e
            where e.task_id = t.id and e.type = 'submitted'
            order by e.created_at, e.id
            limit 1
        )
        where t.first_submitted_at is not null
        """
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_tasks_first_submitted_by_id_users"), "tasks", type_="foreignkey")
    op.drop_column("tasks", "first_submitted_by_id")
