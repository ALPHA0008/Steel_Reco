import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session, set_rls_context
from app.dependencies import ProjectScope, ScopedSession
from app.models.structure import Element, Floor, Project, Tower
from app.repositories.structure_repository import (
    ElementRepository,
    FloorRepository,
    ProjectRepository,
    TowerRepository,
)
from app.schemas.structure import (
    ElementCreate,
    ElementResponse,
    FloorCreate,
    FloorResponse,
    ProjectPickerResponse,
    ProjectResponse,
    TowerCreate,
    TowerResponse,
)

router = APIRouter(prefix="/api/v1", tags=["projects"])


@router.get("/projects", response_model=list[ProjectPickerResponse])
async def list_projects_for_signup(session: AsyncSession = Depends(get_session)) -> list[ProjectPickerResponse]:
    """Public, unauthenticated -- feeds the signup page's project picker.
    Deliberately minimal (id + name only, see ProjectPickerResponse) and
    ordered by name, not by anything that would hint at size/activity.

    `projects` carries RLS; this pre-auth read needs the same admin-context
    grant used in auth_service.signup for the same reason -- there is no
    caller identity yet to scope a normal session to.
    """
    await set_rls_context(session, user_id=None, user_role="admin")
    result = await session.execute(select(Project).where(Project.status == "active").order_by(Project.name))
    return [ProjectPickerResponse.model_validate(p) for p in result.scalars().all()]


@router.get("/projects/me", response_model=ProjectResponse)
async def get_my_project(project_id: ProjectScope, session: ScopedSession) -> ProjectResponse:
    """The QS's own project -- lands them directly on it without picking
    from a list (PRD §4.5 story 22)."""
    project = await ProjectRepository(session).get(project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return ProjectResponse.model_validate(project)


# NOTE: no {project_id} path parameter on any route below. project_id comes
# ONLY from ProjectScope (resolved server-side from the JWT via
# project_assignments, plan §5.4) -- never from the URL/body/query. An
# earlier draft took project_id as a path param here; RLS caught the
# resulting cross-project write attempt at the DB layer (defense in depth
# worked), but the route itself was wrong and has been corrected to not
# trust client input for tenant scope in the first place.


@router.get("/towers", response_model=list[TowerResponse])
async def list_towers(project_id: ProjectScope, session: ScopedSession) -> list[TowerResponse]:
    repo = TowerRepository(session, project_id=project_id)
    towers = await repo.list_for_project()
    return [TowerResponse.model_validate(t) for t in towers]


@router.post("/towers", response_model=TowerResponse, status_code=status.HTTP_201_CREATED)
async def create_tower(payload: TowerCreate, project_id: ProjectScope, session: ScopedSession) -> TowerResponse:
    repo = TowerRepository(session, project_id=project_id)
    tower = await repo.add(Tower(**payload.model_dump()))
    await session.commit()
    return TowerResponse.model_validate(tower)


@router.get("/towers/{tower_id}/floors", response_model=list[FloorResponse])
async def list_floors(tower_id: uuid.UUID, project_id: ProjectScope, session: ScopedSession) -> list[FloorResponse]:
    repo = FloorRepository(session, project_id=project_id)
    floors = await repo.list_for_tower(tower_id)
    return [FloorResponse.model_validate(f) for f in floors]


@router.post("/towers/{tower_id}/floors", response_model=FloorResponse, status_code=status.HTTP_201_CREATED)
async def create_floor(
    tower_id: uuid.UUID, payload: FloorCreate, project_id: ProjectScope, session: ScopedSession
) -> FloorResponse:
    repo = FloorRepository(session, project_id=project_id)
    floor = await repo.add(Floor(tower_id=tower_id, level_name=payload.level_name, sequence=payload.sequence))
    await session.commit()
    return FloorResponse.model_validate(floor)


@router.get("/floors/{floor_id}/elements", response_model=list[ElementResponse])
async def list_elements(
    floor_id: uuid.UUID, project_id: ProjectScope, session: ScopedSession
) -> list[ElementResponse]:
    repo = ElementRepository(session, project_id=project_id)
    elements = await repo.list_for_floor(floor_id)
    return [ElementResponse.model_validate(e) for e in elements]


@router.post("/floors/{floor_id}/elements", response_model=ElementResponse, status_code=status.HTTP_201_CREATED)
async def create_element(
    floor_id: uuid.UUID, payload: ElementCreate, project_id: ProjectScope, session: ScopedSession
) -> ElementResponse:
    repo = ElementRepository(session, project_id=project_id)
    element = await repo.add(
        Element(
            tower_id=payload.tower_id,
            floor_id=floor_id,
            element_type=payload.element_type,
            name=payload.name,
        )
    )
    await session.commit()
    return ElementResponse.model_validate(element)
