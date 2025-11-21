from fastapi import APIRouter
from app.api.v1 import auth, employees, chatbot, intelligent_chat, churn, playground, data_management, license, ai, settings

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(employees.router, prefix="/employees", tags=["employees"])
api_router.include_router(chatbot.router, prefix="/chatbot", tags=["chatbot"])
api_router.include_router(intelligent_chat.router, prefix="/intelligent-chat", tags=["intelligent-chat"])
api_router.include_router(churn.router, prefix="/churn", tags=["churn"])
api_router.include_router(playground.router, prefix="/playground", tags=["playground"])
api_router.include_router(data_management.router, prefix="/data-management", tags=["data-management"])
api_router.include_router(license.router, prefix="/license", tags=["license"])
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
