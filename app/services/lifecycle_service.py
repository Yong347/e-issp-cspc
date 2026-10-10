# app/services/lifecycle_service.py
import json
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, Any, Optional, List

from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.config import settings
from app.database.models import (
    MasterNarrative,
    OrganizationalOutcome,
    BudgetCeiling,
    Department,
    SystemSetting,
    AuditTrail,
    ExistingInventory,
    DisasterRecoveryTeam,
    BusinessImpactAnalysis,
    DRBCPMetric,
    NetworkInfrastructure,
    CybersecurityControl,
    EGovernmentChecklist,
    InformationSystem,
    HumanCapital,
    StakeholderAnalysis
)
from app.storage.s3_client import storage_client

logger = logging.getLogger("app.services.lifecycle")


class ISSPLifecycleEngine:
    @staticmethod
    def evaluate_and_rollover_cycle(db: Session, force: bool = False) -> Dict[str, Any]:
        """
        Evaluates the active ISSP planning cycle against the current calendar year.
        
        Trigger Condition:
          current_calendar_year > active_cycle.issp_period_to (or force=True).
          
        Lifecycle Actions Executed:
          1. IMMUTABLE SNAPSHOT FREEZE (Dual-Format: PDF & Word .docx):
             - Synchronously compiles and certifies final document snapshots for the concluded cycle.
          2. OFFICIAL ARCHIVE TRANSITION:
             - Automatically transitions generated document binaries to permanent long-term storage.
          3. CYCLE RETIREMENT:
             - Formally transitions the concluded cycle to is_active = False, is_archived = True.
          4. SUCCESSOR HORIZON PROVISIONING (Dynamic N-Years):
             - Cycle Span = (issp_period_to - issp_period_from + 1).
             - Next Start Year = Previous End Year + 1.
             - Next End Year = Next Start Year + Cycle Span - 1.
             - Provisions MasterNarrative for the new cycle, copying legal mandates,
               institutional branding emblems, and signatories using normalized plain-text fields.
          5. BASELINE INVENTORY CLONING (Snapshot Isolation & Anti-Loop):
             - Clones active operational hardware and software from ExistingInventory into the new cycle.
             - Resets replacement_proposal_id to None to prevent recursive replacement loops.
          6. STATUTORY & OPERATIONAL BASELINE CLONING:
             - Clones OrganizationalOutcome records (Part I.A.4).
             - Clones operational InformationSystem records (Part II.C baseline).
             - Clones BudgetCeiling records with dynamically calculated annual allocations.
             - Clones EGovernmentChecklist, HumanCapital, and StakeholderAnalysis records.
             - Clones Disaster Recovery Teams (DRT), BIA targets, DRBCP KPIs, Network Infrastructures,
               and Cybersecurity Controls into the successor cycle.
          7. INFLATION & SETTINGS SYNCHRONIZATION:
             - Synchronizes issp_active_cycle in system_settings.
             - Generates default annual compounding inflation buffer rates for each new horizon year.
          8. COA AUDIT LOGGING:
             - Records an immutable, JSON-safe audit entry under the GOVERNANCE module.
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
                "final_pdf_vault_url": getattr(active_cycle, "final_pdf_vault_url", None),
                "final_docx_vault_url": getattr(active_cycle, "final_docx_vault_url", None)
            }

        expired_period = active_cycle.issp_period
        start_year = active_cycle.issp_period_from or 2026
        end_year = active_cycle.issp_period_to or (start_year + 2)
        cycle_span = max(1, end_year - start_year + 1)

        logger.warning(
            f"LIFECYCLE TRIGGER: Cycle '{expired_period}' has concluded! "
            f"(Current Year: {current_year} > Plan Horizon End: {end_year} | Span: {cycle_span} years). "
            "Commencing automated freeze, official archival, and successor rollover..."
        )

        # -------------------------------------------------------------
        # 1. IMMUTABLE FINAL DOCUMENT COMPILATION SNAPSHOT (PDF & DOCX)
        # -------------------------------------------------------------
        final_pdf_url = None
        final_docx_url = None
        try:
            from app.tasks.pdf_tasks import compile_issp_document
            
            # 1.1 Compile and certify final PDF snapshot
            try:
                compile_task_pdf = compile_issp_document.apply(args=[{"issp_period_years": expired_period, "export_format": "pdf"}])
                result_pdf = compile_task_pdf.result if compile_task_pdf.successful() else None
                if isinstance(result_pdf, dict) and "file_url" in result_pdf:
                    final_pdf_url = result_pdf["file_url"]
                    active_cycle.final_pdf_vault_url = final_pdf_url
                    logger.info(f"Final compilation PDF snapshot certified: {final_pdf_url}")
            except Exception as pdf_err:
                logger.warning(f"PDF snapshot compilation note during rollover: {pdf_err}")

            # 1.2 Compile and certify final Word (.docx) snapshot
            try:
                compile_task_docx = compile_issp_document.apply(args=[{"issp_period_years": expired_period, "export_format": "docx"}])
                result_docx = compile_task_docx.result if compile_task_docx.successful() else None
                if isinstance(result_docx, dict) and "file_url" in result_docx:
                    final_docx_url = result_docx["file_url"]
                    active_cycle.final_docx_vault_url = final_docx_url
                    logger.info(f"Final compilation DOCX snapshot certified: {final_docx_url}")
            except Exception as docx_err:
                logger.warning(f"DOCX snapshot compilation note during rollover: {docx_err}")

        except Exception as compile_err:
            logger.error(f"Error executing compilation snapshots for expired cycle '{expired_period}': {compile_err}")

        # -------------------------------------------------------------
        # 2. TRANSITION COMPILED DOCUMENTS TO PERMANENT OFFICIAL ARCHIVE
        # -------------------------------------------------------------
        if getattr(storage_client, "storage_type", "local") == "s3" and getattr(storage_client, "client", None):
            for ext, doc_url in [("pdf", final_pdf_url), ("docx", final_docx_url)]:
                if doc_url:
                    doc_storage_key = storage_client.get_generated_document_key(f"ISSP-{expired_period}-FINAL", ext=ext)
                    try:
                        storage_client.client.copy_object(
                            Bucket=storage_client.bucket_name,
                            Key=doc_storage_key,
                            CopySource={'Bucket': storage_client.bucket_name, 'Key': doc_storage_key},
                            StorageClass='GLACIER'
                        )
                        logger.info(f"Official document '{doc_storage_key}' ({ext}) preserved in permanent long-term storage.")
                    except Exception as archive_err:
                        logger.warning(f"Unable to transition storage tier for {ext}: {archive_err}")

        # -------------------------------------------------------------
        # 3. RETIRE & ARCHIVE CONCLUDED CYCLE
        # -------------------------------------------------------------
        active_cycle.is_active = False
        active_cycle.is_archived = True

        # -------------------------------------------------------------
        # 4. PROVISION SUCCESSOR CYCLE WITH DYNAMIC N-YEAR HORIZON
        # -------------------------------------------------------------
        new_start_year = end_year + 1
        new_end_year = new_start_year + cycle_span - 1
        new_period = f"{new_start_year}-{new_end_year}"
        new_years_range = list(range(new_start_year, new_end_year + 1))

        new_cycle = db.query(MasterNarrative).filter(MasterNarrative.issp_period == new_period).first()
        
        agency_name_clean = active_cycle.agency_name or settings.DEFAULT_AGENCY_NAME
        agency_url_clean = active_cycle.agency_website_url or settings.DEFAULT_AGENCY_WEBSITE
        head_title_clean = getattr(active_cycle, "agency_head_position", None) or settings.DEFAULT_AGENCY_HEAD_TITLE

        raw_scope = str(active_cycle.scope_choice or "Department-Wide").strip()
        normalized_scope = "Department-Wide"
        if "agency" in raw_scope.lower():
            normalized_scope = "Agency-Wide"
        elif "lgu" in raw_scope.lower():
            normalized_scope = "LGU"
        elif "other" in raw_scope.lower():
            normalized_scope = "Other Government Entity"

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
                scope_choice=normalized_scope,
                scope_json=dict(active_cycle.scope_json or {}),
                mandate_text=active_cycle.mandate_text or "",
                functions=active_cycle.functions,
                vision_text=active_cycle.vision_text or "",
                mission_text=active_cycle.mission_text or "",
                present_situation_text=f"Strategic plan baseline for FY {new_period}. Focuses on continued digital transformation, PeGIF interoperability, and automated frontline public services.",
                signatory_prepared_by=active_cycle.signatory_prepared_by or "Chief Information Officer",
                preparer_position=active_cycle.preparer_position or "Chief Information Officer",
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
                dict_logo_url=getattr(active_cycle, "dict_logo_url", None),
                bagong_pilipinas_logo_url=getattr(active_cycle, "bagong_pilipinas_logo_url", None),
                existing_ict_org_url=getattr(active_cycle, "existing_ict_org_url", None),
                proposed_ict_org_url=getattr(active_cycle, "proposed_ict_org_url", None),
                site_development_plan_url=active_cycle.site_development_plan_url,
                fiber_backbone_url=active_cycle.fiber_backbone_url,
                system_architecture_url=active_cycle.system_architecture_url,
                process_flow_diagram_url=active_cycle.process_flow_diagram_url,
                network_diagram_url=active_cycle.network_diagram_url,
                subsystem_network_layouts_json=list(getattr(active_cycle, "subsystem_network_layouts_json", []) or []),
                planners_json=list(active_cycle.planners_json or []),
                manpower_json=dict(active_cycle.manpower_json or {}),
                enterprise_architecture_narrative=getattr(active_cycle, "enterprise_architecture_narrative", None),
                drbcp_affected_assets_json=list(getattr(active_cycle, "drbcp_affected_assets_json", []) or []),
                drbcp_recovery_strategy_text=getattr(active_cycle, "drbcp_recovery_strategy_text", None),
                drbcp_sop_phases_text=getattr(active_cycle, "drbcp_sop_phases_text", None),
                drbcp_compliance_narrative_text=getattr(active_cycle, "drbcp_compliance_narrative_text", None),
                is_archived=False,
                final_pdf_vault_url=None,
                final_docx_vault_url=None
            )
            db.add(new_cycle)
            db.flush()
        else:
            new_cycle.is_active = True
            new_cycle.is_archived = False
            new_cycle.issp_period_from = new_start_year
            new_cycle.issp_period_to = new_end_year
            new_cycle.authoring_cycle_duration = cycle_span
            if not new_cycle.agency_head_position:
                new_cycle.agency_head_position = head_title_clean
            if not new_cycle.dict_logo_url:
                new_cycle.dict_logo_url = getattr(active_cycle, "dict_logo_url", None)
            if not new_cycle.bagong_pilipinas_logo_url:
                new_cycle.bagong_pilipinas_logo_url = getattr(active_cycle, "bagong_pilipinas_logo_url", None)
            if not new_cycle.drbcp_compliance_narrative_text:
                new_cycle.drbcp_compliance_narrative_text = getattr(active_cycle, "drbcp_compliance_narrative_text", None)
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
                    program_name=old_oo.program_name or old_oo.outcome_name,
                    description=old_oo.description
                )
                db.add(cloned_oo)

        # -------------------------------------------------------------
        # 6. CLONE OPERATIONAL INFORMATION SYSTEMS (PART II.C BASELINE)
        # -------------------------------------------------------------
        existing_new_systems = db.query(InformationSystem).filter(
            InformationSystem.issp_period == new_period
        ).count()

        if existing_new_systems == 0:
            old_systems = db.query(InformationSystem).filter(
                InformationSystem.issp_period == expired_period,
                or_(
                    InformationSystem.status == "Operational",
                    InformationSystem.status.ilike("%operational%")
                )
            ).all()

            for old_sys in old_systems:
                cloned_sys = InformationSystem(
                    issp_period=new_period,
                    strategic_concern_id=None,
                    department_id=old_sys.department_id,
                    needs_assessment_id=None,
                    project_id=None,
                    submission_status="Approved",
                    rejection_reason=None,
                    name=old_sys.name,
                    status="Operational",
                    classification=old_sys.classification,
                    proposed_cost=Decimal("0.00"),
                    is_client_facing=getattr(old_sys, "is_client_facing", True),
                    is_support_to_operations=old_sys.is_support_to_operations,
                    is_general_administrative=old_sys.is_general_administrative,
                    is_operations=old_sys.is_operations,
                    is_frontline_service=old_sys.is_frontline_service,
                    frontline_hosting_type=old_sys.frontline_hosting_type,
                    online_url=old_sys.online_url,
                    is_non_frontline_service=old_sys.is_non_frontline_service,
                    description_and_purpose=old_sys.description_and_purpose,
                    enhancement_details=None,
                    development_strategy=old_sys.development_strategy,
                    development_platform=old_sys.development_platform,
                    database_name=old_sys.database_name,
                    data_storage_type=old_sys.data_storage_type,
                    internal_users=old_sys.internal_users,
                    external_users=old_sys.external_users,
                    system_owner_office=old_sys.system_owner_office,
                    is_integrated_with_others=old_sys.is_integrated_with_others,
                    internal_integrated_systems=old_sys.internal_integrated_systems,
                    external_integrated_systems=old_sys.external_integrated_systems,
                    generates_data_for_others=old_sys.generates_data_for_others,
                    processes_data_from_others=old_sys.processes_data_from_others,
                    is_deployed_on_shared_platform=old_sys.is_deployed_on_shared_platform,
                    processes_personal_information=old_sys.processes_personal_information,
                    has_undergone_pia=old_sys.has_undergone_pia,
                    pia_target_date_text=old_sys.pia_target_date_text
                )
                db.add(cloned_sys)

        # Flush to register newly cloned systems so BIA references resolve safely
        db.flush()

        # -------------------------------------------------------------
        # 7. CLONE DEPARTMENTAL BUDGET CEILINGS WITH ANNUAL ALLOCATIONS
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

                # Generate default annual allocations map for the new horizon
                annual_alloc_map = {}
                annual_capex = (capex / Decimal(str(cycle_span))).quantize(Decimal("0.01")) if cycle_span > 0 else Decimal("0.00")
                annual_mooe = (mooe / Decimal(str(cycle_span))).quantize(Decimal("0.01")) if cycle_span > 0 else Decimal("0.00")

                for yr in new_years_range:
                    annual_alloc_map[str(yr)] = {
                        "capex": float(annual_capex),
                        "mooe": float(annual_mooe)
                    }

                new_ceiling = BudgetCeiling(
                    department_id=dept.id,
                    issp_period=new_period,
                    allocated_capex=capex,
                    allocated_mooe=mooe,
                    annual_allocations=annual_alloc_map
                )
                db.add(new_ceiling)

        # -------------------------------------------------------------
        # 8. CLONE OPERATIONAL ASSET INVENTORY (ANNEX 1 BASELINE)
        # -------------------------------------------------------------
        existing_new_inv = db.query(ExistingInventory).filter(
            ExistingInventory.issp_period == new_period
        ).count()

        if existing_new_inv == 0:
            old_inventory = db.query(ExistingInventory).filter(
                or_(
                    ExistingInventory.issp_period == expired_period,
                    ExistingInventory.issp_period.is_(None)
                ),
                # Carry forward only functional, active assets
                ExistingInventory.is_end_of_life == False,
                ~ExistingInventory.status.ilike("%condemned%")
            ).all()

            for old_item in old_inventory:
                cloned_inv = ExistingInventory(
                    department_id=old_item.department_id,
                    issp_period=new_period,
                    replacement_proposal_id=None,  # Reset lock to prevent circular replacement dependencies
                    dict_category=getattr(old_item, "dict_category", None),
                    other_category_name=getattr(old_item, "other_category_name", None),
                    item_name=old_item.item_name,
                    specs=old_item.specs,
                    exact_model=old_item.exact_model,
                    quantity=old_item.quantity,
                    status=old_item.status,
                    date_acquired=old_item.date_acquired,
                    acquired_price=old_item.acquired_price,
                    office_location=old_item.office_location,
                    is_central_office=old_item.is_central_office,
                    is_end_of_life=False,
                    is_backup=old_item.is_backup,
                    is_software=old_item.is_software,
                    is_perpetual=old_item.is_perpetual,
                    unserviceable_report_url=None
                )
                db.add(cloned_inv)

        # -------------------------------------------------------------
        # 9. CLONE DISASTER RECOVERY TEAMS, BIA & KPIS (ANNEX 2 BASELINE)
        # -------------------------------------------------------------
        existing_new_teams = db.query(DisasterRecoveryTeam).filter(
            DisasterRecoveryTeam.issp_period == new_period
        ).count()

        if existing_new_teams == 0:
            old_teams = db.query(DisasterRecoveryTeam).filter(
                DisasterRecoveryTeam.issp_period == expired_period
            ).all()

            for ot in old_teams:
                db.add(DisasterRecoveryTeam(
                    issp_period=new_period,
                    role=ot.role,
                    responsibility=ot.responsibility,
                    contact_person=ot.contact_person,
                    contact_details=ot.contact_details
                ))

        existing_new_bias = db.query(BusinessImpactAnalysis).filter(
            BusinessImpactAnalysis.issp_period == new_period
        ).count()

        if existing_new_bias == 0:
            # Map newly cloned systems by name to associate valid system IDs
            new_sys_lookup = {
                s.name.lower().strip(): s.id 
                for s in db.query(InformationSystem).filter(InformationSystem.issp_period == new_period).all()
            }

            old_bias = db.query(BusinessImpactAnalysis).filter(
                BusinessImpactAnalysis.issp_period == expired_period
            ).all()

            for ob in old_bias:
                resolved_sys_id = new_sys_lookup.get((ob.system_name or "").lower().strip())
                db.add(BusinessImpactAnalysis(
                    issp_period=new_period,
                    system_id=resolved_sys_id,
                    system_name=ob.system_name,
                    classification=ob.classification,
                    mtpd_hours=ob.mtpd_hours,
                    rto_hours=ob.rto_hours,
                    rpo_hours=ob.rpo_hours
                ))

        existing_new_kpis = db.query(DRBCPMetric).filter(
            DRBCPMetric.issp_period == new_period
        ).count()

        if existing_new_kpis == 0:
            old_kpis = db.query(DRBCPMetric).filter(
                DRBCPMetric.issp_period == expired_period
            ).all()

            for ok in old_kpis:
                db.add(DRBCPMetric(
                    issp_period=new_period,
                    indicator=ok.indicator,
                    target_metric=ok.target_metric
                ))

        # -------------------------------------------------------------
        # 10. CLONE NETWORK INFRASTRUCTURE (PARTS II.B & III.A BASELINE)
        # -------------------------------------------------------------
        existing_new_net = db.query(NetworkInfrastructure).filter(
            NetworkInfrastructure.issp_period == new_period
        ).count()

        if existing_new_net == 0:
            old_net = db.query(NetworkInfrastructure).filter(
                NetworkInfrastructure.issp_period == expired_period
            ).all()

            for on in old_net:
                db.add(NetworkInfrastructure(
                    issp_period=new_period,
                    is_proposed=on.is_proposed,
                    topology_description=on.topology_description,
                    connectivity_type=on.connectivity_type,
                    bandwidth_mbps=on.bandwidth_mbps,
                    upload_speed_mbps=on.upload_speed_mbps,
                    download_speed_mbps=on.download_speed_mbps,
                    office_location=on.office_location,
                    is_ipv6_ready=on.is_ipv6_ready,
                    diagram_url=on.diagram_url
                ))

        # -------------------------------------------------------------
        # 11. CLONE CYBERSECURITY CONTROLS (PARTS II.B.2 & III.A.2)
        # -------------------------------------------------------------
        existing_new_cyber = db.query(CybersecurityControl).filter(
            CybersecurityControl.issp_period == new_period
        ).count()

        if existing_new_cyber == 0:
            old_cyber = db.query(CybersecurityControl).filter(
                CybersecurityControl.issp_period == expired_period
            ).all()

            for oc in old_cyber:
                db.add(CybersecurityControl(
                    issp_period=new_period,
                    is_proposed=oc.is_proposed,
                    control_domain=oc.control_domain,
                    control_name=oc.control_name,
                    is_mandatory=oc.is_mandatory,
                    is_implemented=oc.is_implemented
                ))

        # -------------------------------------------------------------
        # 12. CLONE E-GOVERNMENT CHECKLISTS (PART II.D BASELINE)
        # -------------------------------------------------------------
        existing_new_egov = db.query(EGovernmentChecklist).filter(
            EGovernmentChecklist.issp_period == new_period
        ).count()

        if existing_new_egov == 0:
            old_egov = db.query(EGovernmentChecklist).filter(
                EGovernmentChecklist.issp_period == expired_period
            ).all()

            seen_programs = set()
            for oe in old_egov:
                prog_norm = (oe.program_name or "").strip().lower()
                if prog_norm in seen_programs:
                    continue
                seen_programs.add(prog_norm)

                db.add(EGovernmentChecklist(
                    issp_period=new_period,
                    program_name=oe.program_name,
                    is_utilized=oe.is_utilized,
                    url_or_system_name=oe.url_or_system_name,
                    equivalent_system_details=oe.equivalent_system_details,
                    equivalent_system_name=getattr(oe, "equivalent_system_name", None),
                    equivalent_system_url=getattr(oe, "equivalent_system_url", None),
                    has_other_payment_platform=getattr(oe, "has_other_payment_platform", False),
                    is_manual=oe.is_manual,
                    is_proposed_development=oe.is_proposed_development,
                    proposed_development_name=getattr(oe, "proposed_development_name", None),
                    total_employees=getattr(oe, "total_employees", None),
                    active_pnpki_count=getattr(oe, "active_pnpki_count", None),
                    adoption_ratio=oe.adoption_ratio,
                    channels_json=list(oe.channels_json or []),
                    is_connected_to_portal=oe.is_connected_to_portal
                ))

        # -------------------------------------------------------------
        # 13. CLONE HUMAN CAPITAL & STAKEHOLDER PROFILES (PARTS I.B & I.C)
        # -------------------------------------------------------------
        existing_new_hc = db.query(HumanCapital).filter(
            HumanCapital.issp_period == new_period
        ).count()

        if existing_new_hc == 0:
            old_hc = db.query(HumanCapital).filter(
                HumanCapital.issp_period == expired_period,
                HumanCapital.is_proposed == False
            ).all()

            for oh in old_hc:
                db.add(HumanCapital(
                    issp_period=new_period,
                    is_proposed=False,
                    employment_status=oh.employment_status,
                    it_positions_count=oh.it_positions_count,
                    non_it_positions_count=oh.non_it_positions_count,
                    male_count=oh.male_count,
                    female_count=oh.female_count
                ))

        existing_new_sh = db.query(StakeholderAnalysis).filter(
            StakeholderAnalysis.issp_period == new_period
        ).count()

        if existing_new_sh == 0:
            old_sh = db.query(StakeholderAnalysis).filter(
                StakeholderAnalysis.issp_period == expired_period
            ).all()

            for os_item in old_sh:
                db.add(StakeholderAnalysis(
                    issp_period=new_period,
                    stakeholder_group=os_item.stakeholder_group,
                    transaction_processed_incoming=os_item.transaction_processed_incoming,
                    transaction_processed_outgoing=os_item.transaction_processed_outgoing,
                    complexity_incoming=os_item.complexity_incoming,
                    complexity_outgoing=os_item.complexity_outgoing
                ))

        # -------------------------------------------------------------
        # 14. UPDATE SYSTEM SETTINGS & INFLATION RATES
        # -------------------------------------------------------------
        active_setting = db.query(SystemSetting).filter(SystemSetting.key == "issp_active_cycle").first()
        if active_setting:
            active_setting.value = new_period
        else:
            db.add(SystemSetting(key="issp_active_cycle", value=new_period))

        # Initialize annual inflation compounding rates for each year of the new horizon
        new_inflation_rates = {}
        for idx, yr in enumerate(new_years_range):
            if idx == 0:
                new_inflation_rates[str(yr)] = 0.0  # Base Year
            elif idx == 1:
                new_inflation_rates[str(yr)] = 3.0  # DICT Standard Year 2
            elif idx == 2:
                new_inflation_rates[str(yr)] = 5.0  # DICT Standard Year 3
            else:
                new_inflation_rates[str(yr)] = 5.0 + (idx - 2) * 2.0  # Compounding N-Year horizon

        inflation_setting = db.query(SystemSetting).filter(SystemSetting.key == "inflation_rates_by_year").first()
        if inflation_setting:
            inflation_setting.value = json.dumps(new_inflation_rates)
        else:
            db.add(SystemSetting(key="inflation_rates_by_year", value=json.dumps(new_inflation_rates)))

        # -------------------------------------------------------------
        # 15. TRANSACTIONAL COA AUDIT LOGGING
        # -------------------------------------------------------------
        audit = AuditTrail(
            action="ISSP_CYCLE_AUTO_ROLLED_OVER",
            module="GOVERNANCE",
            user_id=None,
            department_id=None,
            proposal_id=None,
            ip_address="INTERNAL_LIFECYCLE_CRON",
            old_value={
                "expired_cycle": expired_period,
                "final_pdf_url": final_pdf_url,
                "final_docx_url": final_docx_url,
                "start_year": start_year,
                "end_year": end_year,
                "status": "Archived"
            },
            new_value={
                "active_cycle": new_period,
                "start_year": new_start_year,
                "end_year": new_end_year,
                "span_years": cycle_span,
                "years_sequence": [str(y) for y in new_years_range],
                "execution_mode": "FORCED_OVERRIDE" if force else "CALENDAR_EXPIRATION"
            }
        )
        db.add(audit)

        try:
            db.commit()
            logger.info(
                f"SUCCESS: Automatic cycle rollover complete. Concluded: '{expired_period}' -> Activated: '{new_period}' "
                f"({cycle_span} Years Span: {new_start_year} to {new_end_year})."
            )
        except Exception as commit_err:
            db.rollback()
            logger.error(f"FATAL: Database error committing cycle rollover: {commit_err}", exc_info=True)
            raise commit_err

        return {
            "status": "ROLLED_OVER_SUCCESS",
            "expired_cycle": expired_period,
            "new_active_cycle": new_period,
            "message": f"Planning cycle '{expired_period}' successfully archived to the Official Document Vault. Successor cycle '{new_period}' is now active.",
            "final_pdf_vault_url": final_pdf_url,
            "final_docx_vault_url": final_docx_url
        }