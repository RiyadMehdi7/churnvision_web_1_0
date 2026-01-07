from fastapi import APIRouter, Depends

from app.api.v1 import (
    actions,
    admin,
    agent_memory,
    ai,
    atlas,
    auth,
    chatbot,
    churn,
    connectors,
    data_management,
    employees,
    gdpr,
    intelligent_chat,
    license as license_routes,
    model_monitoring,
    projects,
    playground,
    rag,
    reasoning,
    recommendations,
    settings,
    sso_admin,
)
from app.core.license import get_current_license, require_license_tier
from app.core.sso import oidc_router

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
protected_router.include_router(
    atlas.router,
    prefix="/atlas",
    tags=["atlas"],
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
protected_router.include_router(rag.router, prefix="/rag", tags=["rag"])
protected_router.include_router(admin.router, prefix="/admin", tags=["admin"])
protected_router.include_router(sso_admin.router, prefix="/admin/sso", tags=["admin-sso"])
protected_router.include_router(gdpr.router, prefix="/gdpr", tags=["gdpr"])
protected_router.include_router(
    connectors.router,
    prefix="/connectors",
    tags=["connectors"],
    dependencies=[Depends(require_license_tier("enterprise"))],
)
protected_router.include_router(
    model_monitoring.router,
    prefix="/model-monitoring",
    tags=["model-monitoring"],
)
protected_router.include_router(
    recommendations.router,
    prefix="/recommendations",
    tags=["recommendations"],
    dependencies=[Depends(require_license_tier("enterprise"))],
)

# Expose license routes without the dependency so activation/status endpoints stay reachable
api_router = APIRouter()
api_router.include_router(license_routes.router, prefix="/license", tags=["license"])
# Auth must remain accessible even before a license is installed
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
# SSO routes (OIDC/SAML/LDAP) - accessible without license for enterprise IdP integration
api_router.include_router(oidc_router, tags=["sso"])
api_router.include_router(protected_router)
