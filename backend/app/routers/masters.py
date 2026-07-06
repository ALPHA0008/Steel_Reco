from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.dependencies import ScopedSession
from app.models.masters import Contractor, DiaGrade, Vendor
from app.repositories.masters_repository import ContractorRepository, DiaGradeRepository, VendorRepository
from app.schemas.masters import (
    ContractorCreate,
    ContractorResponse,
    DiaGradeCreate,
    DiaGradeResponse,
    VendorCreate,
    VendorResponse,
)

router = APIRouter(prefix="/api/v1", tags=["masters"])


@router.get("/vendors", response_model=list[VendorResponse])
async def list_vendors(session: ScopedSession) -> list[VendorResponse]:
    items, _total = await VendorRepository(session).list(limit=500)
    return [VendorResponse.model_validate(v) for v in items]


@router.post("/vendors", response_model=VendorResponse, status_code=status.HTTP_201_CREATED)
async def create_vendor(payload: VendorCreate, session: ScopedSession) -> VendorResponse:
    repo = VendorRepository(session)
    vendor = await repo.add(Vendor(**payload.model_dump()))
    await session.commit()
    return VendorResponse.model_validate(vendor)


@router.get("/contractors", response_model=list[ContractorResponse])
async def list_contractors(session: ScopedSession) -> list[ContractorResponse]:
    items, _total = await ContractorRepository(session).list(limit=500)
    return [ContractorResponse.model_validate(c) for c in items]


@router.post("/contractors", response_model=ContractorResponse, status_code=status.HTTP_201_CREATED)
async def create_contractor(payload: ContractorCreate, session: ScopedSession) -> ContractorResponse:
    repo = ContractorRepository(session)
    try:
        contractor = await repo.add(Contractor(**payload.model_dump()))
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, f"Contractor code '{payload.code}' already exists") from exc
    return ContractorResponse.model_validate(contractor)


@router.get("/dia-grades", response_model=list[DiaGradeResponse])
async def list_dia_grades(session: ScopedSession) -> list[DiaGradeResponse]:
    items, _total = await DiaGradeRepository(session).list(limit=500)
    return [DiaGradeResponse.model_validate(d) for d in items]


@router.post("/dia-grades", response_model=DiaGradeResponse, status_code=status.HTTP_201_CREATED)
async def create_dia_grade(payload: DiaGradeCreate, session: ScopedSession) -> DiaGradeResponse:
    repo = DiaGradeRepository(session)
    grade = await repo.add(DiaGrade(**payload.model_dump()))
    await session.commit()
    return DiaGradeResponse.model_validate(grade)
