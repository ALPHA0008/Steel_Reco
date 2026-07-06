import uuid

from sqlalchemy import select

from app.models.masters import Contractor, DiaGrade, RuleThreshold, Vendor
from app.repositories.base import BaseRepository


class VendorRepository(BaseRepository[Vendor]):
    model = Vendor


class ContractorRepository(BaseRepository[Contractor]):
    model = Contractor


class DiaGradeRepository(BaseRepository[DiaGrade]):
    model = DiaGrade


class RuleThresholdRepository(BaseRepository[RuleThreshold]):
    model = RuleThreshold

    async def get_mode(self, rule_name: str, project_id: uuid.UUID) -> str | None:
        """Per-project override wins over the global default (project_id IS
        NULL); no row at all means the rule's own default_mode applies
        (plan §5.3: 'a rule_thresholds config flip, no deploy needed').

        threshold_key='mode' is a reserved sentinel row per rule that carries
        only the advisory/blocking flip -- distinct from any numeric tunable
        thresholds (e.g. bundle-weight variance %) the same rule_name might
        also have rows for, since the table's unique key is
        (rule_name, project_id, threshold_key), not just (rule_name, project_id).
        """
        project_row = await self.session.execute(
            select(RuleThreshold.mode).where(
                RuleThreshold.rule_name == rule_name,
                RuleThreshold.threshold_key == "mode",
                RuleThreshold.project_id == project_id,
                RuleThreshold.is_active.is_(True),
            )
        )
        mode = project_row.scalar_one_or_none()
        if mode is not None:
            return mode

        default_row = await self.session.execute(
            select(RuleThreshold.mode).where(
                RuleThreshold.rule_name == rule_name,
                RuleThreshold.threshold_key == "mode",
                RuleThreshold.project_id.is_(None),
                RuleThreshold.is_active.is_(True),
            )
        )
        return default_row.scalar_one_or_none()
