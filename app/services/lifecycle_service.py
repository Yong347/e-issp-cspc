# app/services/lifecycle_service.py
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, Any, Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.config import settings
from app.database.models import (
    MasterNarrative,
    OrganizationalOutcome,
    BudgetCeiling,
    Department,
    SystemSetting,
    AuditTrail
)
from app.storage.s3_client import storage_client

logger = logging.getLogger("app.services.lifecycle")


class ISSPLifecycleEngine:
    @staticmethod
    def evaluate_and_rollover_cycle(db: Session, force: bool = False) -> Dict[str, Any]:
        """
        Evaluates the active ISSP planning cycle against the current calendar year.
        
        Trigger condition:
          current_calendar_year > active_cycle.issp_period_to (or force=True).
          
        Lifecycle Actions:
          1. IMMUTABLE FREEZE: Compiles final certified PDF snapshot for the expiring cycle.
          2. COLD ARCHIVE: Transitions the final PDF to AWS S3 Glacier storage tier.
          3. CYCLE RETIREMENT: Marks expired cycle as is_active = False, is_archived = True.
          4. SUCCESSOR ROLLOVER:
             - Calculates dynamic span: cycle_span = (to_year - from_year + 1).
             - Next Start Year = Previous End Year + 1.
             - Next End Year   = Next Start Year + (cycle_span - 1).
             - Sets up new MasterNarrative, cloning institutional mandates and leadership defaults.
          5. BASELINE CLONING:
             - Clones OrganizationalOutcomes (Part I.A.4).
             - Clones Departmental BudgetCeilings (Part IV.B allocations).
          6. SYSTEM SETTINGS UPDATE:
             - Synchronizes the active cycle key in system_settings.
          7. AUDIT LOGGING: Records immutable system audit trail entry.
        """
        current_year = datetime.now(timezone.utc).year

        active_cycle = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
        if not active_cycle:
            logger.info("Lifecycle Check: No active ISSP planning cycle is currently configured.")
            return {
                "status": "NO_ACTIVE_CYCLE",
                "message": "No active ISSP planning cycle found in database."
            }

        # Validate whether cycle has actually concluded
        if not force and current_year <= active_cycle.issp_period_to:
            logger.info(
                f"Lifecycle Check: Cycle '{active_cycle.issp_period}' is current and active "
                f"(Valid through calendar year {active_cycle.issp_period_to}; Current year is {current_year})."
            )
            return {
                "status": "ACTIVE_CYCLE_VALID",
                "expired_cycle": None,
                "new_active_cycle": active_cycle.issp_period,
                "message": f"Planning cycle '{active_cycle.issp_period}' is current and within active duration.",
                "final_pdf_vault_url": getattr(active_cycle, "final_pdf_vault_url", None)
            }

        expired_period = active_cycle.issp_period
        start_year = active_cycle.issp_period_from
        end_year = active_cycle.issp_period_to
        cycle_span = max(1, end_year - start_year + 1)

        logger.warning(
            f"LIFECYCLE TRIGGER: Cycle '{expired_period}' has concluded! "
            f"(Current Year: {current_year} > Plan Horizon End: {end_year} | Span: {cycle_span} years). "
            "Commencing automated freeze, Glacier archival, and rollover..."
        )

        # -------------------------------------------------------------
        # 1. IMMUTABLE FINAL PDF COMPILATION SNAPSHOT
        # -------------------------------------------------------------
        final_url = None
        try:
            from app.tasks.pdf_tasks import compile_issp_document
            
            # Execute compilation to generate the final certified archive
            compile_task = compile_issp_document.apply(args=[{"issp_period_years": expired_period}])
            compile_result = compile_task.result if compile_task.successful() else None
            
            if isinstance(compile_result, dict) and "file_url" in compile_result:
                final_url = compile_result["file_url"]
                setattr(active_cycle, "final_pdf_vault_url", final_url)
                logger.info(f"Final compilation snapshot certified: {final_url}")
        except Exception as compile_err:
            logger.error(f"Error compiling final snapshot for expired cycle '{expired_period}': {compile_err}")

        # -------------------------------------------------------------
        # 2. TRANSITION COMPILED PDF TO AWS S3 GLACIER STORAGE TIER
        # -------------------------------------------------------------
        if storage_client.storage_type == "s3" and storage_client.client:
            pdf_s3_key = storage_client.get_generated_pdf_key(f"ISSP-{expired_period}-FINAL")
            try:
                storage_client.client.copy_object(
                    Bucket=storage_client.bucket_name,
                    Key=pdf_s3_key,
                    CopySource={'Bucket': storage_client.bucket_name, 'Key': pdf_s3_key},
                    StorageClass='GLACIER'
                )
                logger.info(f"S3 Object '{pdf_s3_key}' transitioned to GLACIER storage tier.")
            except Exception as s3_err:
                logger.warning(f"Unable to transition S3 object to Glacier: {s3_err}")

        # -------------------------------------------------------------
        # 3. RETIRE & ARCHIVE CONCLUDED CYCLE
        # -------------------------------------------------------------
        active_cycle.is_active = False
        setattr(active_cycle, "is_archived", True)

        # -------------------------------------------------------------
        # 4. PROVISION SUCCESSOR CYCLE WITH DYNAMIC N-YEAR HORIZON
        # -------------------------------------------------------------
        new_start_year = end_year + 1
        new_end_year = new_start_year + cycle_span - 1
        new_period = f"{new_start_year}-{new_end_year}"

        # Defensively verify if target successor cycle narrative was already created
        new_cycle = db.query(MasterNarrative).filter(MasterNarrative.issp_period == new_period).first()
        
        agency_name_clean = active_cycle.agency_name or settings.DEFAULT_AGENCY_NAME
        agency_url_clean = active_cycle.agency_website_url or settings.DEFAULT_AGENCY_WEBSITE
        head_title_clean = getattr(active_cycle, "agency_head_position", None) or settings.DEFAULT_AGENCY_HEAD_TITLE

        if not new_cycle:
            new_cycle = MasterNarrative(
                issp_period=new_period,
                agency_name=agency_name_clean,
                issp_period_from=new_start_year,
                issp_period_to=new_end_year,
                agency_website_url=agency_url_clean,
                is_active=True,
                is_amendment=False,
                amendment_number=None,
                scope_choice=active_cycle.scope_choice,
                scope_json=active_cycle.scope_json or {},
                mandate_html=active_cycle.mandate_html,
                functions=active_cycle.functions,
                vision_html=active_cycle.vision_html,
                mission_html=active_cycle.mission_html,
                present_situation_html=f"Strategic plan baseline for FY {new_period}.",
                signatory_prepared_by=active_cycle.signatory_prepared_by or "Chief Information Officer",
                preparer_position=active_cycle.preparer_position,
                cio_organizational_unit=active_cycle.cio_organizational_unit,
                preparer_tel=active_cycle.preparer_tel,
                preparer_fax=active_cycle.preparer_fax,
                preparer_email=active_cycle.preparer_email,
                focal_name=active_cycle.focal_name,
                focal_position=active_cycle.focal_position,
                focal_organizational_unit=active_cycle.focal_organizational_unit,
                focal_email=active_cycle.focal_email,
                focal_contact_no=active_cycle.focal_contact_no,
                signatory_approved_by=active_cycle.signatory_approved_by or head_title_clean,
                agency_head_position=head_title_clean,
                drbcp_approval_date=None,  # Reset approval date for the new cycle
                authoring_cycle_duration=cycle_span,
                annual_ict_budget=active_cycle.annual_ict_budget or Decimal("0.00"),
                agency_logo_url=active_cycle.agency_logo_url,
                cert_logo_url=active_cycle.cert_logo_url,
                site_development_plan_url=active_cycle.site_development_plan_url,
                fiber_backbone_url=active_cycle.fiber_backbone_url,
                system_architecture_url=active_cycle.system_architecture_url,
                process_flow_diagram_url=active_cycle.process_flow_diagram_url,
                network_diagram_url=active_cycle.network_diagram_url,
                b_3_a_ict_org_url=getattr(active_cycle, "b_3_a_ict_org_url", None),
                net_layout_sias_url=getattr(active_cycle, "net_layout_sias_url", None),
                net_layout_library_url=getattr(active_cycle, "net_layout_library_url", None),
                net_layout_security_url=getattr(active_cycle, "net_layout_security_url", None),
                net_layout_hris_url=getattr(active_cycle, "net_layout_hris_url", None),
                net_layout_dms_url=getattr(active_cycle, "net_layout_dms_url", None),
                net_layout_supplies_url=getattr(active_cycle, "net_layout_supplies_url", None),
                net_layout_budget_url=getattr(active_cycle, "net_layout_budget_url", None),
                net_layout_sias_upgrade_url=getattr(active_cycle, "net_layout_sias_upgrade_url", None),
                net_layout_extension_url=getattr(active_cycle, "net_layout_extension_url", None),
                enterprise_architecture_narrative=getattr(active_cycle, "enterprise_architecture_narrative", None),
                drbcp_affected_assets_json=getattr(active_cycle, "drbcp_affected_assets_json", []) or [],
                drbcp_recovery_strategy_html=getattr(active_cycle, "drbcp_recovery_strategy_html", None),
                drbcp_sop_phases_html=getattr(active_cycle, "drbcp_sop_phases_html", None),
                drbcp_compliance_narrative_html=getattr(active_cycle, "drbcp_compliance_narrative_html", None),
                is_archived=False
            )
            db.add(new_cycle)
            db.flush()
        else:
            new_cycle.is_active = True
            new_cycle.is_archived = False
            new_cycle.issp_period_from = new_start_year
            new_cycle.issp_period_to = new_end_year
            if hasattr(new_cycle, "authoring_cycle_duration"):
                new_cycle.authoring_cycle_duration = cycle_span
            if hasattr(new_cycle, "agency_head_position") and not new_cycle.agency_head_position:
                new_cycle.agency_head_position = head_title_clean
            if hasattr(new_cycle, "drbcp_compliance_narrative_html") and not new_cycle.drbcp_compliance_narrative_html:
                new_cycle.drbcp_compliance_narrative_html = getattr(active_cycle, "drbcp_compliance_narrative_html", None)
            db.flush()

        # -------------------------------------------------------------
        # 5. CLONE ORGANIZATIONAL OUTCOMES (PART I.A.4 BASELINE)
        # -------------------------------------------------------------
        existing_new_outcomes = db.query(OrganizationalOutcome).filter(
            OrganizationalOutcome.issp_period == new_period
        ).count()

        if existing_new_outcomes == 0:
            old_outcomes = db.query(OrganizationalOutcome).filter(
                OrganizationalOutcome.issp_period == expired_period
            ).all()

            for old_oo in old_outcomes:
                cloned_oo = OrganizationalOutcome(
                    issp_period=new_period,
                    type_label=old_oo.type_label,
                    outcome_name=old_oo.outcome_name,
                    description=old_oo.description
                )
                db.add(cloned_oo)

        # -------------------------------------------------------------
        # 6. CLONE DEPARTMENTAL BUDGET CEILINGS (PART IV.B BASELINE)
        # -------------------------------------------------------------
        departments = db.query(Department).all()
        for dept in departments:
            has_new_ceiling = db.query(BudgetCeiling).filter(
                BudgetCeiling.department_id == dept.id,
                BudgetCeiling.issp_period == new_period
            ).first()

            if not has_new_ceiling:
                old_ceiling = db.query(BudgetCeiling).filter(
                    BudgetCeiling.department_id == dept.id,
                    BudgetCeiling.issp_period == expired_period
                ).first()

                capex = old_ceiling.allocated_capex if old_ceiling else Decimal("0.00")
                mooe = old_ceiling.allocated_mooe if old_ceiling else Decimal("0.00")

                new_ceiling = BudgetCeiling(
                    department_id=dept.id,
                    issp_period=new_period,
                    allocated_capex=capex,
                    allocated_mooe=mooe
                )
                db.add(new_ceiling)

        # -------------------------------------------------------------
        # 7. UPDATE SYSTEM SETTINGS (ACTIVE CYCLE POINTER)
        # -------------------------------------------------------------
        active_setting = db.query(SystemSetting).filter(SystemSetting.key == "issp_active_cycle").first()
        if active_setting:
            active_setting.value = new_period
        else:
            db.add(SystemSetting(key="issp_active_cycle", value=new_period))

        # -------------------------------------------------------------
        # 8. LOG TRANSACTIONAL SECURITY AUDIT TRAIL
        # -------------------------------------------------------------
        audit = AuditTrail(
            action="ISSP_CYCLE_AUTO_ROLLED_OVER",
            user_id=None,
            old_value={"expired_cycle": expired_period, "final_pdf_url": final_url},
            new_value={
                "active_cycle": new_period,
                "start_year": new_start_year,
                "end_year": new_end_year,
                "span_years": cycle_span,
                "execution_mode": "FORCED_OVERRIDE" if force else "CALENDAR_EXPIRATION"
            }
        )
        db.add(audit)

        try:
            db.commit()
            logger.info(f"SUCCESS: Automatic rollover complete. Concluded: '{expired_period}' -> Activated: '{new_period}'.")
        except Exception as commit_err:
            db.rollback()
            logger.error(f"FATAL: Database error committing cycle rollover: {commit_err}", exc_info=True)
            raise commit_err

        return {
            "status": "ROLLED_OVER_SUCCESS",
            "expired_cycle": expired_period,
            "new_active_cycle": new_period,
            "message": f"Cycle '{expired_period}' successfully archived to Glacier. New planning cycle '{new_period}' active.",
            "final_pdf_vault_url": final_url
        }