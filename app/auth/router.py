# app/auth/router.py
import jwt
import time
import bcrypt
import logging
from jwt.exceptions import InvalidTokenError
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database.session import get_db
from app.database.models import User, RoleTag, MasterNarrative, AuditTrail
from app.schemas import TokenResponse
from app.config import settings
from app.storage.s3_client import storage_client
from app.utils.helpers import log_audit_event

logger = logging.getLogger("app.auth.router")
router = APIRouter(prefix="/api/auth", tags=["Authentication"])

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception as exc:
        logger.debug(f"Cryptographic verification error: {str(exc)}")
        return False


def is_domain_allowed(email: str) -> bool:
    allowed_domains = getattr(settings, "ALLOWED_EMAIL_DOMAINS", ["*"])
    if not allowed_domains or "*" in allowed_domains:
        return True
    if not email or "@" not in email:
        return False
    parts = email.split("@")
    if len(parts) != 2:
        return False
    domain = parts[1].strip().lower()
    return domain in [d.strip().lower() for d in allowed_domains if d.strip()]


class PasswordChangePayload(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, description="The secure new account password.")


async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials."
            )
    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token."
        )

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists in the registry."
        )

    return user


async def require_user(current_user: User = Depends(get_current_user)) -> dict:
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role_tag.value,
        "department_id": current_user.department_id
    }


async def require_admin(current_user: User = Depends(get_current_user)) -> dict:
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


async def require_dept_user(current_user: User = Depends(get_current_user)) -> dict:
    if current_user.role_tag != RoleTag.ROLE_DEPT_USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AuthZ Failed: Access restricted to Department Users only."
        )
    if current_user.department_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AuthZ Failed: Department User has no assigned department. Please contact your MIS Admin."
        )
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role_tag.value,
        "department_id": current_user.department_id
    }


async def require_supply_user(current_user: User = Depends(get_current_user)) -> dict:
    if current_user.role_tag != RoleTag.ROLE_SUPPLY_USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AuthZ Failed: Access restricted to authorized Supply Officers only."
        )
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role_tag.value,
        "department_id": current_user.department_id
    }


async def require_supply_or_admin(current_user: User = Depends(get_current_user)) -> dict:
    if current_user.role_tag not in [RoleTag.ROLE_SUPPLY_USER, RoleTag.ROLE_MIS_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AuthZ Failed: Access restricted to Supply Officers or MIS Administrators."
        )
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role_tag.value,
        "department_id": current_user.department_id
    }


def verify_active_planning_cycle(db: Session = Depends(get_db)) -> MasterNarrative:
    active_cycle = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
    if not active_cycle:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission Lock: No active ISSP planning cycle has been configured by the MIS Admin."
        )
    return active_cycle


@router.get("/active-cycle")
async def get_active_planning_cycle(db: Session = Depends(get_db)):
    """
    Publicly exposes the active planning cycle, agency name, and institutional logo
    so login and workspace shells can render official branding dynamically.
    """
    try:
        active_cycle = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
        if active_cycle:
            return {
                "issp_period": active_cycle.issp_period,
                "from_year": active_cycle.issp_period_from or 2026,
                "to_year": active_cycle.issp_period_to or 2028,
                "agency_name": active_cycle.agency_name or settings.DEFAULT_AGENCY_NAME,
                "agency_logo_url": storage_client.normalize_asset_url(active_cycle.agency_logo_url),
                "dict_logo_url": storage_client.normalize_asset_url(getattr(active_cycle, "dict_logo_url", None)),
                "bagong_pilipinas_logo_url": storage_client.normalize_asset_url(getattr(active_cycle, "bagong_pilipinas_logo_url", None))
            }
    except Exception as e:
        try:
            db.rollback()
        except Exception:
            pass
        logger.warning(f"Active cycle query notice: {str(e)}")

    return {
        "issp_period": "2026-2028",
        "from_year": 2026,
        "to_year": 2028,
        "agency_name": settings.DEFAULT_AGENCY_NAME,
        "agency_logo_url": None,
        "dict_logo_url": None,
        "bagong_pilipinas_logo_url": None
    }


@router.post("/login", response_model=TokenResponse)
async def authenticate_standard(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    username = (form_data.username or "").strip().lower()
    client_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "Unknown")
    )

    if not is_domain_allowed(username):
        allowed_desc = ", ".join(settings.ALLOWED_EMAIL_DOMAINS)
        log_audit_event(
            db=db,
            action="USER_LOGIN_UNAUTHORIZED_DOMAIN",
            module="AUTHENTICATION",
            ip_address=client_ip,
            new_value={"attempted_username": username}
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Unauthorized Domain: Account must belong to authorized institutional domains: [{allowed_desc}]"
        )

    user = db.query(User).filter(User.email == username).first()
    has_valid_user = user is not None and getattr(user, "password_hash", None) is not None

    if not has_valid_user:
        dummy_salt = bcrypt.gensalt(rounds=12)
        password_hash_to_verify = bcrypt.hashpw(b"dummy_password", dummy_salt).decode("utf-8")
    else:
        password_hash_to_verify = user.password_hash

    is_password_correct = verify_password(form_data.password, password_hash_to_verify)

    if not has_valid_user or not is_password_correct or not user.is_whitelisted:
        log_audit_event(
            db=db,
            action="USER_LOGIN_FAILED",
            module="AUTHENTICATION",
            user_id=user.id if user else None,
            department_id=user.department_id if user else None,
            ip_address=client_ip,
            new_value={"attempted_username": username}
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid institutional credentials. Please verify your email and password."
        )

    log_audit_event(
        db=db,
        action="USER_LOGIN_SUCCESS",
        module="AUTHENTICATION",
        user_id=user.id,
        department_id=user.department_id,
        ip_address=client_ip,
        new_value={"email": user.email, "role": user.role_tag.value}
    )
    db.commit()

    token_data = {
        "sub": user.email,
        "role": user.role_tag.value,
        "dept_id": user.department_id,
        "exp": int(time.time()) + 86400
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
    request: Request,
    payload: PasswordChangePayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    client_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "Unknown")
    )

    if not current_user.password_hash or not verify_password(payload.current_password, current_user.password_hash):
        log_audit_event(
            db=db,
            action="PASSWORD_ROTATION_REJECTED",
            module="AUTHENTICATION",
            user_id=current_user.id,
            department_id=current_user.department_id,
            ip_address=client_ip,
            new_value={"user_email": current_user.email, "reason": "Current password verification failed"}
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password verification failed."
        )

    new_hash = bcrypt.hashpw(
        payload.new_password.encode("utf-8"), 
        bcrypt.gensalt()
    ).decode("utf-8")

    current_user.password_hash = new_hash

    log_audit_event(
        db=db,
        action="SYSTEM_SECURITY_PASSWORD_ROTATED",
        module="AUTHENTICATION",
        user_id=current_user.id,
        department_id=current_user.department_id,
        ip_address=client_ip,
        old_value={"user_email": current_user.email},
        new_value={"event": "Security credentials rotated successfully."}
    )

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure during password update: {str(e)}"
        )

    return {
        "status": "success",
        "message": "Institutional account password updated successfully."
    }
