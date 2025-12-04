from fastapi import APIRouter, Depends

from app.api.v1 import (
    actions,
    agent_memory,
    ai,
    auth,
    chatbot,
    churn,
    data_management,
    employees,
    intelligent_chat,
    license as license_routes,
    projects,
    playground,
    reasoning,
    settings,
)
from app.core.license import get_current_license, require_license_tier

# Apply license validation to all feature routers (except auth/license)
protected_router = APIRouter(dependencies=[Depends(get_current_license)])
protected_router.include_router(employees.router, prefix="/employees", tags=["employees"])
protected_router.include_router(chatbot.router, prefix="/chatbot", tags=["chatbot"])
protected_router.include_router(intelligent_chat.router, prefix="/intelligent-chat", tags=["intelligent-chat"])
protected_router.include_router(churn.router, prefix="/churn", tags=["churn"])
protected_router.include_router(
    playground.router,
    prefix="/playground",
    tags=["playground"],
    dependencies=[Depends(require_license_tier("enterprise"))],
)
protected_router.include_router(data_management.router, prefix="/data-management", tags=["data-management"])
protected_router.include_router(
    ai.router,
    prefix="/ai",
    tags=["ai"],
    dependencies=[Depends(require_license_tier("pro"))],
)
protected_router.include_router(settings.router, prefix="/settings", tags=["settings"])
protected_router.include_router(projects.router, tags=["projects"])
protected_router.include_router(reasoning.router, prefix="/reasoning", tags=["reasoning"])
protected_router.include_router(actions.router, prefix="/actions", tags=["actions"])
protected_router.include_router(agent_memory.router, prefix="/agent-memory", tags=["agent-memory"])

# Expose license routes without the dependency so activation/status endpoints stay reachable
api_router = APIRouter()
api_router.include_router(license_routes.router, prefix="/license", tags=["license"])
# Auth must remain accessible even before a license is installed
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(protected_router)
