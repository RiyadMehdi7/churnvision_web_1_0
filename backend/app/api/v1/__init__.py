from fastapi import APIRouter
from app.api.v1 import auth, chatbot

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(chatbot.router, prefix="/chatbot", tags=["chatbot"])
