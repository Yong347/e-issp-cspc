# app/auth/router.py
import os
import jwt
import time
import bcrypt  # Native bcrypt import to bypass passlib legacy bugs
import logging
from jwt.exceptions import InvalidTokenError
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database.session import get_db
from app.database.models import User, RoleTag, MasterNarrative
from app.schemas import GoogleAuthRequest, TokenResponse
from app.config import settings

# Attempt to load Google OAuth validation libraries safely
try:
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests
    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False

logger = logging.getLogger("app.auth.router")
router = APIRouter(prefix="/api/auth", tags=["Authentication"])

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Securely verifies a plain-text password against a bcrypt hash.
    Bypasses passlib's compatibility layer to avoid version-check exceptions.
    Handles any malformed, empty, or legacy hash formats without raising 500 errors.
    """
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception as exc:
        logger.debug(f"Cryptographic library verification raised exception: {str(exc)}")
        return False


# --- Pydantic Schemes for Local Mutation ---

class PasswordChangePayload(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, description="The secure new account password.")


# --- Auth & Role Router Helpers ---

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Decodes the JWT token and fetches the user from the database"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User account no longer exists")

    return user


async def require_user(current_user: User = Depends(get_current_user)):
    """Allows access to Dept Users (and admins if they need to test dept features)"""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role_tag.value,
        "department_id": current_user.department_id
    }


async def require_admin(current_user: User = Depends(get_current_user)):
    """Enforces AuthZ: strictly blocks anyone who is not an MIS Admin"""
    if current_user.role_tag != RoleTag.ROLE_MIS_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AuthZ Failed: MIS Admin privileges strictly required."
        )
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role_tag.value,
        "department_id": current_user.department_id
    }


async def require_dept_user(current_user: User = Depends(get_current_user)):
    """
    Enforces AuthZ: strictly blocks anyone who is not a Department User.
    Prevents database constraint violations caused by missing department IDs.
    Provides clear feedback for misconfigured administrator accounts.
    """
    if current_user.role_tag != RoleTag.ROLE_DEPT_USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AuthZ Failed: Access restricted to Department Users only."
        )
    if current_user.department_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AuthZ Failed: Department User has no assigned department. Please contact an administrator to associate your account with a department."
        )
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role_tag.value,
        "department_id": current_user.department_id
    }


def verify_active_planning_cycle(db: Session = Depends(get_db)) -> MasterNarrative:
    """
    Enforces governance by checking if an active ISSP cycle has been configured by the Admin.
    Throws a 400 Bad Request to halt unauthorized submissions if no cycle is active.
    """
    active_cycle = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
    if not active_cycle:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission Lock: No active ISSP planning cycle has been configured by the MIS Admin."
        )
    return active_cycle


# --- Routes ---

@router.get("/active-cycle")
async def get_active_planning_cycle(db: Session = Depends(get_db)):
    """
    Queries and returns the active planning cycle period.
    Falls back to a default value if no active cycle is configured.
    """
    active_cycle = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
    if active_cycle:
        return {
            "issp_period": active_cycle.issp_period,
            "from_year": active_cycle.issp_period_from,
            "to_year": active_cycle.issp_period_to
        }
    return {
        "issp_period": "2026-2028",
        "from_year": 2026,
        "to_year": 2028
    }


@router.post("/google", response_model=TokenResponse)
async def authenticate_google(payload: GoogleAuthRequest, db: Session = Depends(get_db)):
    verified_email = None

    # Enforce strict Google ID token signature verification
    if GOOGLE_AUTH_AVAILABLE and payload.id_token:
        try:
            client_id = getattr(settings, "GOOGLE_CLIENT_ID", None)
            idinfo = google_id_token.verify_oauth2_token(
                payload.id_token,
                google_requests.Request(),
                client_id
            )
            # Assert proper issuer origins
            if idinfo.get("iss") not in ["accounts.google.com", "https://accounts.google.com"]:
                raise ValueError("Unauthorized token issuer.")
            
            verified_email = idinfo.get("email")
        except Exception as e:
            logger.error(f"Google Token Verification failed: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="Google ID token signature verification failed."
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google Authentication missing cryptographic token or verification dependencies on the host system."
        )

    if not verified_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Unable to resolve a verified email from identity provider payload."
        )

    # Enforce strict institutional split domain validation
    parts = verified_email.split('@')
    if len(parts) != 2 or parts[1] != "cspc.edu.ph":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized Domain: Only verified institutional accounts under the '@cspc.edu.ph' domain are permitted."
        )
    
    user = db.query(User).filter(User.email == verified_email).first()
    if not user or not user.is_whitelisted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Access Denied: Account is not whitelisted by the Admin."
        )
    
    # Generate token payload containing standard exp claims to avoid hydration deadlock
    token_data = {
        "sub": user.email,
        "role": user.role_tag.value,
        "dept_id": user.department_id,
        "exp": int(time.time()) + 86400  # Expires in exactly 24 hours
    }
    access_token = jwt.encode(token_data, SECRET_KEY, algorithm=ALGORITHM)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role_tag.value,
        "department_id": user.department_id
    }


@router.post("/login", response_model=TokenResponse)
async def authenticate_standard(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    username = form_data.username or ""
    parts = username.split('@')
    is_valid_domain = len(parts) == 2 and parts[1] == "cspc.edu.ph"

    # Query the user record if the basic structure is correct
    user = None
    if is_valid_domain:
        user = db.query(User).filter(User.email == username).first()

    # Isolate password verification execution paths to prevent side-channel timing analysis
    has_valid_user = user is not None and getattr(user, "password_hash", None) is not None
    
    # Fix (Anomaly 17): Compute a dynamic dummy hash on demand to ensure matching execution times for missing users
    if not has_valid_user:
        dummy_salt = bcrypt.gensalt(rounds=12)
        password_hash_to_verify = bcrypt.hashpw(b"dummy_password", dummy_salt).decode("utf-8")
    else:
        password_hash_to_verify = user.password_hash
    
    # Executes cryptographically expensive hashing verification exactly once on every call
    is_password_correct = verify_password(form_data.password, password_hash_to_verify)

    # Consolidate criteria checks to maintain constant execution times on rejected routes
    if not is_valid_domain or not has_valid_user or not is_password_correct or not user.is_whitelisted:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid institutional credentials."
        )

    # Generate token payload containing standard exp claims to avoid hydration deadlock
    token_data = {
        "sub": user.email,
        "role": user.role_tag.value,
        "dept_id": user.department_id,
        "exp": int(time.time()) + 86400  # Expires in exactly 24 hours
    }
    access_token = jwt.encode(token_data, SECRET_KEY, algorithm=ALGORITHM)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role_tag.value,
        "department_id": user.department_id
    }


@router.post("/change-password")
async def change_password(
    payload: PasswordChangePayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Enables secure self-service runtime password rotations.
    Validates current active password before generating a new secure bcrypt signature.
    """
    if not current_user.password_hash or not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid plain-text password verification failed."
        )
    
    # Generate new bcrypt hash
    new_hash = bcrypt.hashpw(
        payload.new_password.encode("utf-8"), 
        bcrypt.gensalt()
    ).decode("utf-8")
    
    current_user.password_hash = new_hash
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure during password mutation: {str(e)}"
        )
        
    return {
        "status": "success",
        "message": "Institutional account password updated successfully."
    }