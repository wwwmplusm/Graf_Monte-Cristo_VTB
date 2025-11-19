from fastapi import APIRouter, HTTPException
from hktn.backend.schemas import LoginRequest, LoginResponse, UserProfile

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Mock database for demo purposes
USERS_DB = {}

@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    """
    Simple login endpoint. 
    In a real app, this would verify credentials.
    Here it just gets or creates a user.
    """
    user_id = req.user_id
    
    if user_id not in USERS_DB:
        USERS_DB[user_id] = {
            "user_id": user_id,
            "name": req.user_name or f"User {user_id}",
            "subscription_plan": "free",
            "is_active": True
        }
    
    user_data = USERS_DB[user_id]
    profile = UserProfile(**user_data)
    
    # In a real app, generate a JWT token here
    token = f"mock-token-for-{user_id}"
    
    return LoginResponse(token=token, profile=profile)
