# app/supply/router.py
import logging
import uuid
from decimal import Decimal
from typing import List, Dict, Any, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, func, cast, String

from app.database.session import get_db
from app.database.models import (
    ExistingInventory, 
    Department, 
    User, 
    RoleTag, 
    OfficeLocation, 
    AssetStatus,
    DictAssetCategory
)
from app.schemas import SupplyInventoryCreate, SupplyInventoryResponse
from app.auth.router import get_current_user
from app.utils.helpers import log_audit_event

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/supply", tags=["Supply Master Inventory Subsystem"])

# Canonical DICT ISSP Annex 1 Categories (Template Pages 1–3)
DICT_STD_EQUIPMENT = [
    DictAssetCategory.SERVERS.value,
    DictAssetCategory.DESKTOP.value,
    DictAssetCategory.LAPTOP.value,
    DictAssetCategory.MOBILE_PHONE.value,
    DictAssetCategory.TABLET.value,
    DictAssetCategory.PRINTER.value,
    DictAssetCategory.NETWORK_SWITCH.value,
    DictAssetCategory.OTHERS_EQUIPMENT.value
]

DICT_STD_SOFTWARE = [
    DictAssetCategory.OFFICE_PRODUCTIVITY.value,
    DictAssetCategory.GRAMMAR_CHECKER.value,
    DictAssetCategory.GRAPHICS_SIMULATION.value,
    DictAssetCategory.ANTIVIRUS.value,
    DictAssetCategory.IT_HELPDESK.value,
    DictAssetCategory.PHOTO_VIDEO_EDITING.value,
    DictAssetCategory.WAF.value,
    DictAssetCategory.OTHERS_SOFTWARE.value
]


def require_supply_or_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    Enforces authorization checks: access is strictly restricted to designated
    Supply Officers (ROLE_SUPPLY_USER) and MIS Administrators (ROLE_MIS_ADMIN).
    """
    if current_user.role_tag not in [RoleTag.ROLE_SUPPLY_USER, RoleTag.ROLE_MIS_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authorization Failed: Access restricted to authorized Supply Staff or MIS Administrators."
        )
    return current_user


def infer_dict_category(item_name: str, is_software: bool) -> str:
    """
    Intelligently infers canonical DICT Annex 1 category from item names.
    Specific hardware types (switches, printers, laptops) are checked before
    generic terms (servers, desktop) to avoid false substring collisions.
    """
    name_clean = (item_name or "").strip().lower()
    if is_software:
        if any(k in name_clean for k in ["antivirus", "anti-virus", "edr", "endpoint security"]):
            return DictAssetCategory.ANTIVIRUS.value
        if any(k in name_clean for k in ["grammar", "grammarly"]):
            return DictAssetCategory.GRAMMAR_CHECKER.value
        if any(k in name_clean for k in ["graphics", "simulation", "cad", "autocad", "3d", "revit", "solidworks"]):
            return DictAssetCategory.GRAPHICS_SIMULATION.value
        if any(k in name_clean for k in ["help desk", "helpdesk", "ticketing", "service desk", "jira"]):
            return DictAssetCategory.IT_HELPDESK.value
        if any(k in name_clean for k in ["photo", "video", "premiere", "photoshop", "creative cloud", "editing"]):
            return DictAssetCategory.PHOTO_VIDEO_EDITING.value
        if any(k in name_clean for k in ["waf", "web application firewall", "cloudflare waf"]):
            return DictAssetCategory.WAF.value
        if any(k in name_clean for k in ["office", "productivity", "word", "excel", "suite", "docs", "365", "workspace"]):
            return DictAssetCategory.OFFICE_PRODUCTIVITY.value
        return DictAssetCategory.OTHERS_SOFTWARE.value
    else:
        # Check network appliances and imaging devices first to prevent false server/desktop collisions
        if any(k in name_clean for k in ["switch", "router", "access point", "patch panel", "gateway", "firewall appliance"]):
            return DictAssetCategory.NETWORK_SWITCH.value
        if any(k in name_clean for k in ["printer", "scanner", "plotter", "copier", "laserjet", "inkjet"]):
            return DictAssetCategory.PRINTER.value
        if any(k in name_clean for k in ["tablet", "ipad", "surface"]):
            return DictAssetCategory.TABLET.value
        if any(k in name_clean for k in ["mobile", "phone", "smartphone", "cellular"]):
            return DictAssetCategory.MOBILE_PHONE.value
        if any(k in name_clean for k in ["laptop", "notebook", "thinkpad", "macbook"]):
            return DictAssetCategory.LAPTOP.value
        if any(k in name_clean for k in ["desktop", "pc", "optiplex", "prodesk", "all-in-one", "clerical"]):
            return DictAssetCategory.DESKTOP.value
        if any(k in name_clean for k in ["server", "poweredge", "blade", "rackmount", "san storage", "nas"]):
            return DictAssetCategory.SERVERS.value
        return DictAssetCategory.OTHERS_EQUIPMENT.value


@router.get("/departments", response_model=List[Dict[str, Any]])
def get_departments_registry(
    db: Session = Depends(get_db),
    supply_user: User = Depends(require_supply_or_admin)
):
    """
    Returns the active list of organizational departments to populate
    selection dropdowns on the Supply User inventory management interface.
    """
    try:
        depts = db.query(Department).order_by(Department.name.asc()).all()
        return [{"department_id": d.id, "department_name": d.name} for d in depts]
    except Exception as e:
        logger.error(f"Failed to query departments: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load department directory."
        )


@router.get("/inventory", response_model=List[SupplyInventoryResponse])
def get_master_inventory(
    search: Optional[str] = Query(None, description="Search by item name, specs, or model"),
    dept_id: Optional[int] = Query(None, description="Filter by department ID"),
    dict_category: Optional[str] = Query(None, description="Filter by DICT Annex 1 Category"),
    is_software: Optional[bool] = Query(None, description="Filter by hardware (false) or software (true)"),
    is_end_of_life: Optional[bool] = Query(None, description="Filter by End-of-Life obsolescence status"),
    is_backup: Optional[bool] = Query(None, description="Filter by backup unit status"),
    status_filter: Optional[str] = Query(None, description="Filter by operational condition status"),
    office_location: Optional[str] = Query(None, description="Filter by Central vs Field/Regional location"),
    skip: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=10000),
    db: Session = Depends(get_db),
    supply_user: User = Depends(require_supply_or_admin)
):
    """
    Retrieves the global master ICT asset inventory across all collegiate departments.
    Handled exclusively by ROLE_SUPPLY_USER and ROLE_MIS_ADMIN.
    """
    try:
        query = db.query(ExistingInventory).options(joinedload(ExistingInventory.department))

        if dept_id:
            query = query.filter(ExistingInventory.department_id == dept_id)
        if is_software is not None:
            query = query.filter(ExistingInventory.is_software == is_software)
        if is_end_of_life is not None:
            query = query.filter(ExistingInventory.is_end_of_life == is_end_of_life)
        if is_backup is not None:
            query = query.filter(ExistingInventory.is_backup == is_backup)

        if dict_category and dict_category.strip().lower() != "all":
            clean_cat = dict_category.strip()
            is_others = clean_cat.lower().startswith("others")
            if is_others:
                query = query.filter(
                    or_(
                        ExistingInventory.dict_category == DictAssetCategory.OTHERS_EQUIPMENT,
                        ExistingInventory.dict_category == DictAssetCategory.OTHERS_SOFTWARE,
                        ExistingInventory.dict_category == "Others",
                        cast(ExistingInventory.dict_category, String).ilike("others%")
                    )
                )
            else:
                query = query.filter(
                    or_(
                        ExistingInventory.dict_category == clean_cat,
                        cast(ExistingInventory.dict_category, String).ilike(f"%{clean_cat}%")
                    )
                )
            
        if status_filter and status_filter.strip().lower() != "all":
            clean_status = status_filter.strip().lower()
            matched_status = next(
                (s for s in AssetStatus if s.value.lower() == clean_status or s.name.lower() == clean_status), 
                None
            )
            if matched_status:
                query = query.filter(ExistingInventory.status == matched_status)

        if office_location and office_location.strip().lower() != "all":
            clean_loc = office_location.strip().lower()
            matched_loc = next(
                (l for l in OfficeLocation if l.value.lower() == clean_loc or l.name.lower() == clean_loc), 
                None
            )
            if matched_loc:
                query = query.filter(ExistingInventory.office_location == matched_loc)

        if search:
            q_str = f"%{search.strip()}%"
            search_conditions = [
                ExistingInventory.item_name.ilike(q_str),
                ExistingInventory.exact_model.ilike(q_str),
                ExistingInventory.specs.ilike(q_str),
                cast(ExistingInventory.dict_category, String).ilike(q_str)
            ]
            if hasattr(ExistingInventory, "other_category_name"):
                search_conditions.append(ExistingInventory.other_category_name.ilike(q_str))
            query = query.filter(or_(*search_conditions))

        return query.order_by(ExistingInventory.date_acquired.desc()).offset(skip).limit(limit).all()
    except Exception as e:
        logger.error(f"Failed to query master inventory list: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve master inventory ledger."
        )


@router.get("/inventory/annex1-summary")
def get_annex1_inventory_summary(
    db: Session = Depends(get_db),
    supply_user: User = Depends(require_supply_or_admin)
):
    """
    Returns an aggregated breakdown of existing ICT Equipment and Software
    formatted strictly according to the official DICT ISSP v.2026 Annex 1 tables,
    including both macro totals and granular resource category rows.
    """
    try:
        all_items = db.query(ExistingInventory).all()

        def is_status_functional(item_status):
            val = getattr(item_status, "value", str(item_status)).lower()
            return val == "functional"

        def is_status_condemned(item_status):
            val = getattr(item_status, "value", str(item_status)).lower()
            return val in ["condemned", "unserviceable"]

        def get_item_category(item, is_sw: bool) -> str:
            cat = getattr(item, "dict_category", None)
            if cat:
                val = getattr(cat, "value", str(cat)).strip()
                if val in ["Others", "Others, please specify"]:
                    return DictAssetCategory.OTHERS_SOFTWARE.value if is_sw else DictAssetCategory.OTHERS_EQUIPMENT.value
                return val
            return infer_dict_category(item.item_name, is_sw)

        # 1. ICT Equipment Summary (Central vs Field/Regional)
        equipment_items = [i for i in all_items if not i.is_software]
        eq_central = [i for i in equipment_items if i.is_central_office]
        eq_regional = [i for i in equipment_items if not i.is_central_office]

        def summarize_equipment(group):
            return {
                "total_quantity": sum(i.quantity for i in group),
                "operational": sum(
                    i.quantity for i in group 
                    if is_status_functional(i.status) and not i.is_end_of_life
                ),
                "end_of_life": sum(
                    i.quantity for i in group 
                    if i.is_end_of_life or is_status_condemned(i.status)
                ),
                "backup": sum(
                    i.quantity for i in group 
                    if i.is_backup
                )
            }

        # Detailed Table 1: Equipment Breakdown by DICT Category
        equipment_matrix = []
        for cat in DICT_STD_EQUIPMENT[:-1]:
            cat_items = [i for i in equipment_items if get_item_category(i, False).lower() == cat.lower()]
            c_items = [i for i in cat_items if i.is_central_office]
            r_items = [i for i in cat_items if not i.is_central_office]

            equipment_matrix.append({
                "category": cat,
                "central_office": summarize_equipment(c_items),
                "regional_office": summarize_equipment(r_items),
                "total": summarize_equipment(cat_items)
            })

        # Specified "Others (ICT Equipment)"
        other_eq_items = [
            i for i in equipment_items 
            if get_item_category(i, False).lower() in ["others", "others (ict equipment)"]
            or not any(get_item_category(i, False).lower() == c.lower() for c in DICT_STD_EQUIPMENT[:-1])
        ]
        other_eq_central = [i for i in other_eq_items if i.is_central_office]
        other_eq_regional = [i for i in other_eq_items if not i.is_central_office]
        
        equipment_matrix.append({
            "category": "Others, please specify",
            "specified_items": sorted(list(set(
                (getattr(i, "other_category_name", None) or i.item_name).strip() 
                for i in other_eq_items 
                if (getattr(i, "other_category_name", None) or i.item_name)
            ))),
            "central_office": summarize_equipment(other_eq_central),
            "regional_office": summarize_equipment(other_eq_regional),
            "total": summarize_equipment(other_eq_items)
        })

        # 2. ICT Software Summary (Central vs Field/Regional)
        software_items = [i for i in all_items if i.is_software]
        sw_central = [i for i in software_items if i.is_central_office]
        sw_regional = [i for i in software_items if not i.is_central_office]

        def summarize_software(group):
            return {
                "total_licenses": sum(i.quantity for i in group),
                "perpetual": sum(i.quantity for i in group if i.is_perpetual),
                "subscription": sum(i.quantity for i in group if not i.is_perpetual)
            }

        # Detailed Table 2: Software Breakdown by DICT Category
        software_matrix = []
        for scat in DICT_STD_SOFTWARE[:-1]:
            scat_items = [i for i in software_items if get_item_category(i, True).lower() == scat.lower()]
            c_items = [i for i in scat_items if i.is_central_office]
            r_items = [i for i in scat_items if not i.is_central_office]

            software_matrix.append({
                "category": scat,
                "central_office": summarize_software(c_items),
                "regional_office": summarize_software(r_items),
                "total": summarize_software(scat_items)
            })

        # Specified "Others (ICT Software)"
        other_sw_items = [
            i for i in software_items 
            if get_item_category(i, True).lower() in ["others", "others (ict software)"]
            or not any(get_item_category(i, True).lower() == c.lower() for c in DICT_STD_SOFTWARE[:-1])
        ]
        other_sw_central = [i for i in other_sw_items if i.is_central_office]
        other_sw_regional = [i for i in other_sw_items if not i.is_central_office]
        
        software_matrix.append({
            "category": "Others, please specify",
            "specified_items": sorted(list(set(
                (getattr(i, "other_category_name", None) or i.item_name).strip() 
                for i in other_sw_items 
                if (getattr(i, "other_category_name", None) or i.item_name)
            ))),
            "central_office": summarize_software(other_sw_central),
            "regional_office": summarize_software(other_sw_regional),
            "total": summarize_software(other_sw_items)
        })

        total_value = sum(
            ((i.acquired_price or Decimal("0.00")) * Decimal(i.quantity or 1)) 
            for i in all_items
        )

        return {
            "equipment_inventory": {
                "central_office": summarize_equipment(eq_central),
                "regional_office": summarize_equipment(eq_regional),
                "total": summarize_equipment(equipment_items)
            },
            "software_inventory": {
                "central_office": summarize_software(sw_central),
                "regional_office": summarize_software(sw_regional),
                "total": summarize_software(software_items)
            },
            "equipment_by_category": equipment_matrix,
            "software_by_category": software_matrix,
            "total_assets_cataloged": len(all_items),
            "total_acquisition_value_php": float(total_value)
        }
    except Exception as e:
        logger.error(f"Failed to generate Annex 1 inventory summary: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compile Annex 1 summary."
        )


@router.post("/inventory", response_model=SupplyInventoryResponse, status_code=status.HTTP_201_CREATED)
def record_inventory_item(
    request: Request,
    payload: SupplyInventoryCreate,
    db: Session = Depends(get_db),
    supply_user: User = Depends(require_supply_or_admin)
):
    """
    Registers a new physical hardware or software license asset entry into Annex 1.
    Supports DICT Standard Category and 'Others, please specify' designations.
    Handled by the Supply Officer for any department.
    """
    dept = db.query(Department).filter(Department.id == payload.department_id).first()
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Target Department ID {payload.department_id} does not exist."
        )

    resolved_location = OfficeLocation.CENTRAL_OFFICE if payload.is_central_office else OfficeLocation.REGIONAL_OFFICE
    resolved_category = getattr(payload, "dict_category", None) or infer_dict_category(
        payload.item_name, payload.is_software
    )
    
    resolved_other_name = getattr(payload, "other_category_name", None)
    if str(resolved_category).startswith("Others") and not resolved_other_name:
        resolved_other_name = payload.item_name.strip()

    try:
        db_item = ExistingInventory(
            department_id=payload.department_id,
            item_name=payload.item_name.strip(),
            specs=payload.specs.strip() if payload.specs else None,
            exact_model=payload.exact_model.strip() if payload.exact_model else None,
            quantity=payload.quantity,
            status=payload.status,
            date_acquired=payload.date_acquired,
            acquired_price=payload.acquired_price,
            office_location=resolved_location,
            is_central_office=payload.is_central_office,
            is_end_of_life=payload.is_end_of_life,
            is_backup=payload.is_backup,
            is_software=payload.is_software,
            is_perpetual=payload.is_perpetual,
            unserviceable_report_url=payload.unserviceable_report_url
        )

        if hasattr(db_item, "dict_category"):
            setattr(db_item, "dict_category", resolved_category)
        if hasattr(db_item, "other_category_name"):
            setattr(db_item, "other_category_name", resolved_other_name)

        db.add(db_item)
        db.flush()

        # Immutable COA Audit Log Commit
        client_ip = request.client.host if request.client else "Unknown"
        log_audit_event(
            db=db,
            action="INVENTORY_ITEM_CREATED",
            module="INVENTORY",
            user_id=supply_user.id,
            department_id=db_item.department_id,
            ip_address=client_ip,
            old_value=None,
            new_value={
                "id": str(db_item.id),
                "item_name": db_item.item_name,
                "dict_category": str(getattr(db_item.dict_category, "value", db_item.dict_category)),
                "other_category_name": db_item.other_category_name,
                "quantity": db_item.quantity,
                "status": str(getattr(db_item.status, "value", db_item.status)),
                "acquired_price": str(db_item.acquired_price),
                "is_central_office": db_item.is_central_office,
                "department_id": db_item.department_id
            }
        )

        db.commit()
        db.refresh(db_item)
        return db_item
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to save baseline inventory entry: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to register asset: {str(e)}"
        )


@router.put("/inventory/{inventory_id}", response_model=SupplyInventoryResponse)
def update_inventory_item(
    request: Request,
    inventory_id: uuid.UUID,
    payload: SupplyInventoryCreate,
    db: Session = Depends(get_db),
    supply_user: User = Depends(require_supply_or_admin)
):
    """
    Updates the physical specifications, exact model, acquisition data,
    or condition/EOL state of an existing inventory asset.
    """
    item = db.query(ExistingInventory).filter(ExistingInventory.id == inventory_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Inventory record not found."
        )

    dept = db.query(Department).filter(Department.id == payload.department_id).first()
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Department ID {payload.department_id} does not exist."
        )

    resolved_location = OfficeLocation.CENTRAL_OFFICE if payload.is_central_office else OfficeLocation.REGIONAL_OFFICE
    resolved_category = getattr(payload, "dict_category", None) or infer_dict_category(
        payload.item_name, payload.is_software
    )
    
    resolved_other_name = getattr(payload, "other_category_name", None)
    if str(resolved_category).startswith("Others") and not resolved_other_name:
        resolved_other_name = payload.item_name.strip()

    try:
        old_state = {
            "department_id": item.department_id,
            "dict_category": str(getattr(item.dict_category, "value", item.dict_category)),
            "other_category_name": item.other_category_name,
            "item_name": item.item_name,
            "specs": item.specs,
            "exact_model": item.exact_model,
            "quantity": item.quantity,
            "status": str(getattr(item.status, "value", item.status)),
            "date_acquired": item.date_acquired.isoformat() if item.date_acquired else None,
            "acquired_price": str(item.acquired_price),
            "office_location": str(getattr(item.office_location, "value", item.office_location)),
            "is_central_office": item.is_central_office,
            "is_end_of_life": item.is_end_of_life,
            "is_backup": item.is_backup,
            "is_software": item.is_software,
            "is_perpetual": item.is_perpetual,
            "unserviceable_report_url": item.unserviceable_report_url
        }

        item.department_id = payload.department_id
        item.item_name = payload.item_name.strip()
        item.specs = payload.specs.strip() if payload.specs else None
        item.exact_model = payload.exact_model.strip() if payload.exact_model else None
        item.quantity = payload.quantity
        item.status = payload.status
        item.date_acquired = payload.date_acquired
        item.acquired_price = payload.acquired_price
        item.office_location = resolved_location
        item.is_central_office = payload.is_central_office
        item.is_end_of_life = payload.is_end_of_life
        item.is_backup = payload.is_backup
        item.is_software = payload.is_software
        item.is_perpetual = payload.is_perpetual
        item.unserviceable_report_url = payload.unserviceable_report_url

        if hasattr(item, "dict_category"):
            setattr(item, "dict_category", resolved_category)
        if hasattr(item, "other_category_name"):
            setattr(item, "other_category_name", resolved_other_name)

        new_state = {
            "department_id": item.department_id,
            "dict_category": str(getattr(item.dict_category, "value", item.dict_category)),
            "other_category_name": item.other_category_name,
            "item_name": item.item_name,
            "specs": item.specs,
            "exact_model": item.exact_model,
            "quantity": item.quantity,
            "status": str(getattr(item.status, "value", item.status)),
            "date_acquired": item.date_acquired.isoformat() if item.date_acquired else None,
            "acquired_price": str(item.acquired_price),
            "office_location": str(getattr(item.office_location, "value", item.office_location)),
            "is_central_office": item.is_central_office,
            "is_end_of_life": item.is_end_of_life,
            "is_backup": item.is_backup,
            "is_software": item.is_software,
            "is_perpetual": item.is_perpetual,
            "unserviceable_report_url": item.unserviceable_report_url
        }

        # Immutable COA Audit Log Commit
        client_ip = request.client.host if request.client else "Unknown"
        log_audit_event(
            db=db,
            action="INVENTORY_ITEM_UPDATED",
            module="INVENTORY",
            user_id=supply_user.id,
            department_id=item.department_id,
            ip_address=client_ip,
            old_value=old_state,
            new_value=new_state
        )

        db.commit()
        db.refresh(item)
        return item
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update baseline inventory item: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist inventory modifications."
        )


@router.delete("/inventory/{inventory_id}", status_code=status.HTTP_200_OK)
def delete_inventory_item(
    request: Request,
    inventory_id: uuid.UUID,
    db: Session = Depends(get_db),
    supply_user: User = Depends(require_supply_or_admin)
):
    """
    Permanently purges an asset record from the global baseline inventory.
    """
    item = db.query(ExistingInventory).filter(ExistingInventory.id == inventory_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Inventory record not found."
        )

    try:
        deleted_state = {
            "id": str(item.id),
            "department_id": item.department_id,
            "item_name": item.item_name,
            "dict_category": str(getattr(item.dict_category, "value", item.dict_category)),
            "other_category_name": item.other_category_name,
            "quantity": item.quantity,
            "status": str(getattr(item.status, "value", item.status)),
            "acquired_price": str(item.acquired_price),
            "is_central_office": item.is_central_office
        }

        # Immutable COA Audit Log Commit
        client_ip = request.client.host if request.client else "Unknown"
        log_audit_event(
            db=db,
            action="INVENTORY_ITEM_DELETED",
            module="INVENTORY",
            user_id=supply_user.id,
            department_id=item.department_id,
            ip_address=client_ip,
            old_value=deleted_state,
            new_value=None
        )

        db.delete(item)
        db.commit()
        return {"status": "success", "message": "Inventory asset record successfully deleted."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete baseline inventory item: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to purge inventory record."
        )