# seed.py
import os
import logging
import sys
import argparse
from decimal import Decimal
from datetime import datetime, timedelta
import bcrypt
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

# Import Base and ALL models to ensure SQLAlchemy registers the entire schema metadata
from app.database.models import (
    Base, 
    User, 
    Department, 
    BudgetCeiling, 
    RoleTag,
    MasterNarrative,
    CatalogItem,
    DegreeOffering,
    GaaPerformance,
    ScopeChoice,
    Campus,
    CoreOfficeFunction,
    StrategicConcern,
    PerformanceMetric,
    GlossaryTerm,
    GeneralInstruction,
    ClientOsCensus,
    OfficeSoftwareCensus,
    ServerCapacityTrack,
    IctStaffPosition,
    IsspNode,
    IsspVocabulary,
    IsspContent,
    IsspAsset,
    NodeType,
    PageOrientation,
    ContentType,
    AssetRole,
    Proposal,
    SubscriptionProposal,
    ProposalStatus,
    AnnualCostBreakdown
)
from app.config import settings

logging.basicConfig(level=logging.INFO, format="[SYSTEM] %(asctime)s - %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def seed_document_hierarchy(db):
    """
    Seeds a self-referencing ordered hierarchical tree containing nodes for all
    chapters of the CSPC ISSP document matching the standard DICT format.
    """
    logger.info("Initializing DICT compliance document tree seeding...")
    
    # 1. Root Node
    root_node = db.query(IsspNode).filter(IsspNode.system_key == "root_document").first()
    if not root_node:
        root_node = IsspNode(
            node_type=NodeType.ROOT,
            system_key="root_document",
            sequence_order=Decimal("1.000"),
            page_orientation=PageOrientation.PORTRAIT,
            force_page_break=False
        )
        db.add(root_node)
        db.flush()
        db.add(IsspVocabulary(
            node_id=root_node.id,
            display_title="Camarines Sur Polytechnic Colleges ISSP",
            toc_label="ISSP Document Root"
        ))
        
    # 2. Transmittal Letter
    trans_node = db.query(IsspNode).filter(IsspNode.system_key == "transmittal").first()
    if not trans_node:
        trans_node = IsspNode(
            parent_id=root_node.id,
            node_type=NodeType.LEAF,
            system_key="transmittal",
            sequence_order=Decimal("1.100"),
            page_orientation=PageOrientation.PORTRAIT,
            force_page_break=True
        )
        db.add(trans_node)
        db.flush()
        db.add(IsspVocabulary(
            node_id=trans_node.id,
            display_title="Transmittal Letter",
            toc_label="Transmittal Letter"
        ))

    # 3. Cover Page
    cover_node = db.query(IsspNode).filter(IsspNode.system_key == "cover").first()
    if not cover_node:
        cover_node = IsspNode(
            parent_id=root_node.id,
            node_type=NodeType.LEAF,
            system_key="cover",
            sequence_order=Decimal("1.200"),
            page_orientation=PageOrientation.PORTRAIT,
            force_page_break=True
        )
        db.add(cover_node)
        db.flush()
        db.add(IsspVocabulary(
            node_id=cover_node.id,
            display_title="ISSP Cover Page",
            toc_label="ISSP Cover Page"
        ))

    # 4. Signatories Page
    sig_node = db.query(IsspNode).filter(IsspNode.system_key == "signatories").first()
    if not sig_node:
        sig_node = IsspNode(
            parent_id=root_node.id,
            node_type=NodeType.LEAF,
            system_key="signatories",
            sequence_order=Decimal("1.300"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=True
        )
        db.add(sig_node)
        db.flush()
        db.add(IsspVocabulary(
            node_id=sig_node.id,
            display_title="ISSP Signatories & Scope Choices",
            toc_label="ISSP Signatories & Scope"
        ))

    # 5. TOC Page
    toc_node = db.query(IsspNode).filter(IsspNode.system_key == "toc_page").first()
    if not toc_node:
        toc_node = IsspNode(
            parent_id=root_node.id,
            node_type=NodeType.LEAF,
            system_key="toc_page",
            sequence_order=Decimal("1.400"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=True
        )
        db.add(toc_node)
        db.flush()
        db.add(IsspVocabulary(
            node_id=toc_node.id,
            display_title="TABLE OF CONTENTS",
            toc_label="Table of Contents"
        ))

    # 6. Glossary Page
    defs_node = db.query(IsspNode).filter(IsspNode.system_key == "glossary").first()
    if not defs_node:
        defs_node = IsspNode(
            parent_id=root_node.id,
            node_type=NodeType.LEAF,
            system_key="glossary",
            sequence_order=Decimal("1.500"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=True
        )
        db.add(defs_node)
        db.flush()
        db.add(IsspVocabulary(
            node_id=defs_node.id,
            display_title="Definition of Terms",
            toc_label="Definition of Terms"
        ))

    # 7. General Instructions
    inst_node = db.query(IsspNode).filter(IsspNode.system_key == "instructions").first()
    if not inst_node:
        inst_node = IsspNode(
            parent_id=root_node.id,
            node_type=NodeType.LEAF,
            system_key="instructions",
            sequence_order=Decimal("1.600"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=True
        )
        db.add(inst_node)
        db.flush()
        db.add(IsspVocabulary(
            node_id=inst_node.id,
            display_title="General Submission Guidelines",
            toc_label="General Instructions"
        ))

    # 8. Part I: Organizational Profile
    part1_node = db.query(IsspNode).filter(IsspNode.system_key == "part_i_org_profile").first()
    if not part1_node:
        part1_node = IsspNode(
            parent_id=root_node.id,
            node_type=NodeType.PART,
            system_key="part_i_org_profile",
            sequence_order=Decimal("2.000"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=True
        )
        db.add(part1_node)
        db.flush()
        db.add(IsspVocabulary(
            node_id=part1_node.id,
            display_title="PART I: ORGANIZATIONAL PROFILE",
            toc_label="PART I. ORGANIZATIONAL PROFILE"
        ))

    # Part I Section A (Mandates & Vision/Mission)
    section_a = db.query(IsspNode).filter(IsspNode.system_key == "part_i_section_a").first()
    if not section_a:
        section_a = IsspNode(
            parent_id=part1_node.id,
            node_type=NodeType.SECTION,
            system_key="part_i_section_a",
            sequence_order=Decimal("2.100"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=False
        )
        db.add(section_a)
        db.flush()
        db.add(IsspVocabulary(
            node_id=section_a.id,
            display_title="A. Department/Agency Vision/Mission Statement",
            toc_label="A. Vision, Mission and Mandate"
        ))

    # Part I Subsection A.1 (Mandate)
    sub_a1 = db.query(IsspNode).filter(IsspNode.system_key == "part_i_sub_a1_mandate").first()
    if not sub_a1:
        sub_a1 = IsspNode(
            parent_id=section_a.id,
            node_type=NodeType.SUBSECTION,
            system_key="part_i_sub_a1_mandate",
            sequence_order=Decimal("2.110"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=False
        )
        db.add(sub_a1)
        db.flush()
        db.add(IsspVocabulary(
            node_id=sub_a1.id,
            display_title="A.1. Mandate (Legal Basis)",
            toc_label="A.1. Mandate"
        ))
        db.add(IsspContent(
            node_id=sub_a1.id,
            content_type=ContentType.RICH_TEXT,
            json_data={"text_html": "<p>The College mandate is defined under Section 2 of Batas Pambansa Bilang 512, the law which created the Camarines Sur Polytechnic Colleges (CSPC). BP 512 provides: \"The Camarines Sur Polytechnic Colleges shall primarily provide higher technological, professional and vocational instruction and training in fisheries, trade and technology, arts and sciences, and as well as promote research, history, extension services, and progressive leadership in these fields.\"</p>"}
        ))

    # Part I Subsection A.2 (Vision)
    sub_a2 = db.query(IsspNode).filter(IsspNode.system_key == "part_i_sub_a2_vision").first()
    if not sub_a2:
        sub_a2 = IsspNode(
            parent_id=section_a.id,
            node_type=NodeType.SUBSECTION,
            system_key="part_i_sub_a2_vision",
            sequence_order=Decimal("2.120"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=False
        )
        db.add(sub_a2)
        db.flush()
        db.add(IsspVocabulary(
            node_id=sub_a2.id,
            display_title="A.2. Vision Statement",
            toc_label="A.2. Vision Statement"
        ))
        db.add(IsspContent(
            node_id=sub_a2.id,
            content_type=ContentType.RICH_TEXT,
            json_data={"text_html": "<p>Polytechnic education at its best for the Bicolanos</p>"}
        ))

    # Part I Subsection A.3 (Mission)
    sub_a3 = db.query(IsspNode).filter(IsspNode.system_key == "part_i_sub_a3_mission").first()
    if not sub_a3:
        sub_a3 = IsspNode(
            parent_id=section_a.id,
            node_type=NodeType.SUBSECTION,
            system_key="part_i_sub_a3_mission",
            sequence_order=Decimal("2.130"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=False
        )
        db.add(sub_a3)
        db.flush()
        db.add(IsspVocabulary(
            node_id=sub_a3.id,
            display_title="A.3. Mission Statement",
            toc_label="A.3. Mission Statement"
        ))
        db.add(IsspContent(
            node_id=sub_a3.id,
            content_type=ContentType.RICH_TEXT,
            json_data={"text_html": "<p>Transforming lives to be free of poverty by creating a better future through world class polytechnic education and technological innovation.</p>"}
        ))

    # Part I Section B (Planners)
    section_b = db.query(IsspNode).filter(IsspNode.system_key == "part_i_section_b").first()
    if not section_b:
        section_b = IsspNode(
            parent_id=part1_node.id,
            node_type=NodeType.SECTION,
            system_key="part_i_section_b",
            sequence_order=Decimal("2.200"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=False
        )
        db.add(section_b)
        db.flush()
        db.add(IsspVocabulary(
            node_id=section_b.id,
            display_title="B. SUC Designated Planners Profile Matrix (Table B-1)",
            toc_label="B. Department/Agency Profile"
        ))

    # Part I Section E (Strategic Concerns)
    section_e = db.query(IsspNode).filter(IsspNode.system_key == "part_i_section_e").first()
    if not section_e:
        section_e = IsspNode(
            parent_id=part1_node.id,
            node_type=NodeType.SECTION,
            system_key="part_i_section_e",
            sequence_order=Decimal("2.300"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=False
        )
        db.add(section_e)
        db.flush()
        db.add(IsspVocabulary(
            node_id=section_e.id,
            display_title="E. Strategic Concerns for ICT Use (Table I.E)",
            toc_label="E. Strategic Concerns for ICT Use"
        ))

    # 9. Part II: Information Systems Strategy
    part2_node = db.query(IsspNode).filter(IsspNode.system_key == "part_ii_is_strategy").first()
    if not part2_node:
        part2_node = IsspNode(
            parent_id=root_node.id,
            node_type=NodeType.PART,
            system_key="part_ii_is_strategy",
            sequence_order=Decimal("3.000"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=True
        )
        db.add(part2_node)
        db.flush()
        db.add(IsspVocabulary(
            node_id=part2_node.id,
            display_title="PART II: INFORMATION SYSTEMS STRATEGY",
            toc_label="PART II. INFORMATION SYSTEMS STRATEGY"
        ))

    # Part II Section B_C (Proposed Systems and Databases)
    section_b_c = db.query(IsspNode).filter(IsspNode.system_key == "part_ii_section_b_c").first()
    if not section_b_c:
        section_b_c = IsspNode(
            parent_id=part2_node.id,
            node_type=NodeType.SECTION,
            system_key="part_ii_section_b_c",
            sequence_order=Decimal("3.100"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=False
        )
        db.add(section_b_c)
        db.flush()
        db.add(IsspVocabulary(
            node_id=section_b_c.id,
            display_title="B. Detailed Proposed Systems and Databases profile cards",
            toc_label="B. Proposed Systems & Databases"
        ))

    # 10. Part III: Detailed Description of ICT Projects
    part3_node = db.query(IsspNode).filter(IsspNode.system_key == "part_iii_ict_projects").first()
    if not part3_node:
        part3_node = IsspNode(
            parent_id=root_node.id,
            node_type=NodeType.PART,
            system_key="part_iii_ict_projects",
            sequence_order=Decimal("4.000"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=True
        )
        db.add(part3_node)
        db.flush()
        db.add(IsspVocabulary(
            node_id=part3_node.id,
            display_title="PART III: DETAILED DESCRIPTION OF ICT PROJECTS",
            toc_label="PART III. DETAILED DESCRIPTION OF ICT PROJECTS"
        ))

    # 11. Part IV: Resource Requirements
    part4_node = db.query(IsspNode).filter(IsspNode.system_key == "part_iv_resource_req").first()
    if not part4_node:
        part4_node = IsspNode(
            parent_id=root_node.id,
            node_type=NodeType.PART,
            system_key="part_iv_resource_req",
            sequence_order=Decimal("5.000"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=True
        )
        db.add(part4_node)
        db.flush()
        db.add(IsspVocabulary(
            node_id=part4_node.id,
            display_title="PART IV: RESOURCE REQUIREMENTS (ICT Organizational Charts)",
            toc_label="PART IV. RESOURCE REQUIREMENTS"
        ))

    # 12. Part V: Schedules & Investments
    part5_node = db.query(IsspNode).filter(IsspNode.system_key == "part_v_schedules").first()
    if not part5_node:
        part5_node = IsspNode(
            parent_id=root_node.id,
            node_type=NodeType.PART,
            system_key="part_v_schedules",
            sequence_order=Decimal("6.000"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=True
        )
        db.add(part5_node)
        db.flush()
        db.add(IsspVocabulary(
            node_id=part5_node.id,
            display_title="PART V: PROJECTS IMPLEMENTATION SCHEDULES & SUMMARIES",
            toc_label="PART V. SUMMARY OF INVESTMENTS & SCHEDULES"
        ))

    # 13. Annex Master Details
    annex_master = db.query(IsspNode).filter(IsspNode.system_key == "annex_master").first()
    if not annex_master:
        annex_master = IsspNode(
            parent_id=root_node.id,
            node_type=NodeType.PART,
            system_key="annex_master",
            sequence_order=Decimal("7.000"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=True
        )
        db.add(annex_master)
        db.flush()
        db.add(IsspVocabulary(
            node_id=annex_master.id,
            display_title="ANNEX REPOSITORIES (MITHI Surveys)",
            toc_label="ANNEX REPOSITORIES"
        ))

    # Annex A-3 Core Functions
    annex_a3 = db.query(IsspNode).filter(IsspNode.system_key == "annex_a3_functions").first()
    if not annex_a3:
        annex_a3 = IsspNode(
            parent_id=annex_master.id,
            node_type=NodeType.SECTION,
            system_key="annex_a3_functions",
            sequence_order=Decimal("7.100"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=True
        )
        db.add(annex_a3)
        db.flush()
        db.add(IsspVocabulary(
            node_id=annex_a3.id,
            display_title="Annex A-3: Core SUC Offices Functions Directory",
            toc_label="Annex A-3: Core SUC Offices Functions"
        ))

    # Annex A-4 Programs
    annex_a4 = db.query(IsspNode).filter(IsspNode.system_key == "annex_a4_programs").first()
    if not annex_a4:
        annex_a4 = IsspNode(
            parent_id=annex_master.id,
            node_type=NodeType.SECTION,
            system_key="annex_a4_programs",
            sequence_order=Decimal("7.200"),
            page_orientation=PageOrientation.LANDSCAPE,
            force_page_break=True
        )
        db.add(annex_a4)
        db.flush()
        db.add(IsspVocabulary(
            node_id=annex_a4.id,
            display_title="Annex A-4: SUC Degree Programs & GAA Target Indicators",
            toc_label="Annex A-4: SUC Degree Offerings & GAA Targets"
        ))

    db.flush()
    logger.info("Structured document tree nodes seeded successfully.")


def bootstrap_metadata(db):
    """
    Seeds detailed institutional metadata including academic/support departments,
    baseline standardized DICT catalog items, and the master planning narrative.
    """
    logger.info("Seeding physical SUC campuses...")
    campuses_to_seed = [
        {"name": "Nabua Main Campus", "location": "Nabua, Camarines Sur", "code": "MAIN"},
        {"name": "Buhi Satellite Campus", "location": "Buhi, Camarines Sur", "code": "BUHI"}
    ]
    campus_instances = {}
    for camp_data in campuses_to_seed:
        campus = db.query(Campus).filter(Campus.code == camp_data["code"]).first()
        if not campus:
            campus = Campus(**camp_data)
            db.add(campus)
            db.flush()
            logger.info(f"Campus registered: '{camp_data['name']}'")
        campus_instances[camp_data["code"]] = campus

    logger.info("Seeding CSPC academic and support departments...")
    departments_to_seed = [
        "College of Engineering",
        "College of Computer Studies",
        "College of Health Sciences",
        "College of Business Administration",
        "College of Education, Arts and Sciences",
        "College of Tourism, Hospitality, and Business Management",
        "College of Technological and Developmental Education",
        "Human Resources Management",
        "Graduate School",
        "Records Office",
        "Supply Office",
        "Accounting System",
        "MICT Office",
        "Budget Office",
        "Procurement Office",
        "Library Services",
        "Physical Plant and Facilities"
    ]

    dept_instances = {}
    main_campus = campus_instances["MAIN"]
    for name in departments_to_seed:
        dept = db.query(Department).filter(Department.name == name).first()
        if not dept:
            dept = Department(name=name, campus_id=main_campus.id)
            db.add(dept)
            db.flush()
            logger.info(f"Department created: '{name}'")
        dept_instances[name] = dept

    # ==========================================================
    # ANNEX A-4 STRUCTURAL SEEDS
    # ==========================================================
    logger.info("Seeding Annex A-4 Graduate and Undergraduate Degree offerings...")
    academic_programs = [
        # Graduate
        {"department_name": "College of Health Sciences", "degree_name": "Master of Arts in Nursing (MAN)", "level": "Graduate", "accreditation_status": "Level III Re-Accredited"},
        {"department_name": "College of Engineering", "degree_name": "Master of Engineering (ME)", "level": "Graduate", "accreditation_status": "Level III Re-Accredited"},
        {"department_name": "College of Business Administration", "degree_name": "Master in Business Management (MBM)", "level": "Graduate", "accreditation_status": "Level II Re-Accredited"},
        {"department_name": "College of Tourism, Hospitality, and Business Management", "degree_name": "Master in Hospitality Management", "level": "Graduate", "accreditation_status": "Candidate Status"},
        {"department_name": "College of Computer Studies", "degree_name": "Master in Information Technology (MIT)", "level": "Graduate", "accreditation_status": "Candidate Status"},
        {"department_name": "College of Business Administration", "degree_name": "Doctor of Philosophy in Business Management", "level": "Graduate", "accreditation_status": "Candidate Status"},
        
        # Undergraduate - Engineering
        {"department_name": "College of Engineering", "degree_name": "Bachelor of Science in Civil Engineering", "level": "Undergraduate", "accreditation_status": "Level III Re-Accredited"},
        {"department_name": "College of Engineering", "degree_name": "Bachelor of Science in Electrical Engineering", "level": "Undergraduate", "accreditation_status": "Level III Re-Accredited"},
        {"department_name": "College of Engineering", "degree_name": "Bachelor of Science in Mechanical Engineering", "level": "Undergraduate", "accreditation_status": "Level III Re-Accredited"},
        {"department_name": "College of Engineering", "degree_name": "Bachelor of Science in Electronics Engineering", "level": "Undergraduate", "accreditation_status": "Level III Re-Accredited"},
        {"department_name": "College of Engineering", "degree_name": "Bachelor of Science in Architecture", "level": "Undergraduate", "accreditation_status": "Candidate Status"},
        
        # Undergraduate - Computer Studies
        {"department_name": "College of Computer Studies", "degree_name": "Bachelor of Science in Information Technology", "level": "Undergraduate", "accreditation_status": "Level IV Re-Accredited"},
        {"department_name": "College of Computer Studies", "degree_name": "Bachelor of Science in Computer Science", "level": "Undergraduate", "accreditation_status": "Level II Re-Accredited"},
        {"department_name": "College of Computer Studies", "degree_name": "Bachelor of Science in Information Systems", "level": "Undergraduate", "accreditation_status": "Candidate Status"},
        
        # Undergraduate - Other Colleges
        {"department_name": "College of Health Sciences", "degree_name": "Bachelor of Science in Nursing", "level": "Undergraduate", "accreditation_status": "Level IV Re-Accredited"},
        {"department_name": "College of Tourism, Hospitality, and Business Management", "degree_name": "Bachelor of Science in Tourism Management", "level": "Undergraduate", "accreditation_status": "Level II Re-Accredited"},
        {"department_name": "College of Business Administration", "degree_name": "Bachelor of Science in Office Administration", "level": "Undergraduate", "accreditation_status": "Level III Re-Accredited"}
    ]
    for prog in academic_programs:
        existing = db.query(DegreeOffering).filter(DegreeOffering.degree_name == prog["degree_name"]).first()
        if not existing:
            db.add(DegreeOffering(**prog))
            logger.info(f"Annex A-4: Degree Offer seeded: '{prog['degree_name']}'")

    logger.info("Seeding GAA Institutional target Performance indicators...")
    gaa_metrics = [
        {"indicator_name": "Percentage of first-time licensure exam passers that pass the licensure exams", "target_value": "50%"},
        {"indicator_name": "Percentage of graduates (2 years prior) that are employed", "target_value": "67%"},
        {"indicator_name": "Percentage of undergraduate student population enrolled in CHED-identified priority courses", "target_value": "70%"},
        {"indicator_name": "Percentage of undergraduate programs with COPC or accreditation status", "target_value": "100%"},
        {"indicator_name": "Percentage of graduate school faculty engaged in research work", "target_value": "53%"},
        {"indicator_name": "Number of research outputs completed within the year", "target_value": "32"},
        {"indicator_name": "Number of active partnerships with LGUs, industries, NGOs, NGAs, and SMEs", "target_value": "46"}
    ]
    for metric in gaa_metrics:
        existing = db.query(GaaPerformance).filter(GaaPerformance.indicator_name == metric["indicator_name"]).first()
        if not existing:
            db.add(GaaPerformance(**metric))
            logger.info(f"GAA Target metric seeded: '{metric['indicator_name']}'")

    logger.info("Seeding baseline Catalog Items with standard DICT Categories...")
    
    # Establish a default canvas expiration window (e.g. 365 days in the future)
    default_expiry = datetime.utcnow() + timedelta(days=365)
    
    catalog_items = [
        {
            "item_key": "pc_standard",
            "display_name": "Standard Office PC (Clerical)",
            "standard_unit_cost": Decimal("50000.00"),
            "category": "computing_devices",
            "allowed_offices": ["College of Engineering", "College of Computer Studies", "College of Education, Arts and Sciences", "College of Health Sciences", "College of Tourism, Hospitality, and Business Management", "Human Resources Management"],
            "canvas_evidence_url": "/static/uploads/catalog/standard_pc_canvas.pdf",
            "supplier_name": "CSPC Central IT Distributor"
        },
        {
            "item_key": "laptop_faculty",
            "display_name": "Faculty Workstation Laptop",
            "standard_unit_cost": Decimal("50000.00"),
            "category": "computing_devices",
            "allowed_offices": ["College of Engineering", "College of Computer Studies", "College of Education, Arts and Sciences"],
            "canvas_evidence_url": "/static/uploads/catalog/laptop_canvas.pdf",
            "supplier_name": "CSPC Laptop Supplier"
        },
        {
            "item_key": "switch_24",
            "display_name": "24-Port Managed Switch",
            "standard_unit_cost": Decimal("15000.00"),
            "category": "networking",
            "allowed_offices": ["College of Engineering", "College of Computer Studies"],
            "canvas_evidence_url": "/static/uploads/catalog/switch_24_canvas.pdf",
            "supplier_name": "CSPC Cisco Network Partner"
        },
        {
            "item_key": "ap_wifi6",
            "display_name": "Enterprise Wi-Fi 6 Access Point",
            "standard_unit_cost": Decimal("10000.00"),
            "category": "networking",
            "allowed_offices": ["College of Engineering", "College of Computer Studies", "College of Education, Arts and Sciences"],
            "canvas_evidence_url": "/static/uploads/catalog/ap_wifi6_canvas.pdf",
            "supplier_name": "CSPC Cisco Network Partner"
        },
        {
            "item_key": "heavy_duty_printer",
            "display_name": "Heavy Duty Network Workgroup Printer",
            "standard_unit_cost": Decimal("25000.00"),
            "category": "printers_imaging",
            "allowed_offices": ["College of Engineering", "College of Computer Studies", "College of Education, Arts and Sciences", "College of Tourism, Hospitality, and Business Management", "Human Resources Management"],
            "canvas_evidence_url": "/static/uploads/catalog/printer_heavy_canvas.pdf",
            "supplier_name": "CSPC Copier-Printer Hub"
        },
        {
            "item_key": "projector_standard",
            "display_name": "Standard Classroom Projector",
            "standard_unit_cost": Decimal("30000.00"),
            "category": "computing_devices",
            "allowed_offices": ["College of Engineering", "College of Computer Studies", "College of Education, Arts and Sciences"],
            "canvas_evidence_url": "/static/uploads/catalog/projector_canvas.pdf",
            "supplier_name": "CSPC Multimedia Partner"
        },
        {
            "item_key": "scanner_standard",
            "display_name": "Standard Office Scanner",
            "standard_unit_cost": Decimal("25000.00"),
            "category": "printers_imaging",
            "allowed_offices": ["College of Engineering", "College of Computer Studies"],
            "canvas_evidence_url": "/static/uploads/catalog/scanner_canvas.pdf",
            "supplier_name": "CSPC Copier-Printer Hub"
        },
        {
            "item_key": "bay_rack",
            "display_name": "Server Bay Rack Unit",
            "standard_unit_cost": Decimal("20000.00"),
            "category": "networking",
            "allowed_offices": ["College of Computer Studies"],
            "canvas_evidence_url": "/static/uploads/catalog/rack_canvas.pdf",
            "supplier_name": "CSPC Cisco Network Partner"
        },
        {
            "item_key": "router_cisco",
            "display_name": "CISCO Core Edge Router",
            "standard_unit_cost": Decimal("50000.00"),
            "category": "networking",
            "allowed_offices": ["College of Computer Studies"],
            "canvas_evidence_url": "/static/uploads/catalog/router_canvas.pdf",
            "supplier_name": "CSPC Cisco Network Partner"
        },
        {
            "item_key": "patch_panel",
            "display_name": "24-Port Cat6 Patch Panel",
            "standard_unit_cost": Decimal("3500.00"),
            "category": "networking",
            "allowed_offices": ["College of Computer Studies"],
            "canvas_evidence_url": "/static/uploads/catalog/panel_canvas.pdf",
            "supplier_name": "CSPC Cisco Network Partner"
        },
        {
            "item_key": "router_internet",
            "display_name": "Enterprise Internet Router",
            "standard_unit_cost": Decimal("7000.00"),
            "category": "networking",
            "allowed_offices": ["College of Computer Studies"],
            "canvas_evidence_url": "/static/uploads/catalog/internet_router_canvas.pdf",
            "supplier_name": "CSPC Cisco Network Partner"
        },
        {
            "item_key": "connectors_utp",
            "display_name": "RJ45 UTP Connectors Pack",
            "standard_unit_cost": Decimal("15.00"),
            "category": "networking",
            "allowed_offices": ["College of Computer Studies"],
            "canvas_evidence_url": "/static/uploads/catalog/rj45_canvas.pdf",
            "supplier_name": "CSPC Cisco Network Partner"
        },
        {
            "item_key": "led_tv_classroom",
            "display_name": "Classroom Smart LED TV",
            "standard_unit_cost": Decimal("40000.00"),
            "category": "computing_devices",
            "allowed_offices": ["College of Education, Arts and Sciences"],
            "canvas_evidence_url": "/static/uploads/catalog/led_tv_canvas.pdf",
            "supplier_name": "CSPC Multimedia Partner"
        },
        {
            "item_key": "cable_utp_set",
            "display_name": "UTP Cat6 Cabling Box (305m)",
            "standard_unit_cost": Decimal("6000.00"),
            "category": "networking",
            "allowed_offices": ["College of Computer Studies"],
            "canvas_evidence_url": "/static/uploads/catalog/utp_box_canvas.pdf",
            "supplier_name": "CSPC Cisco Network Partner"
        }
    ]
    
    for item in catalog_items:
        db_item = db.query(CatalogItem).filter(CatalogItem.item_key == item["item_key"]).first()
        if not db_item:
            db_item = CatalogItem(
                item_key=item["item_key"],
                display_name=item["display_name"],
                standard_unit_cost=item["standard_unit_cost"],
                category=item["category"],
                is_active=True,
                allowed_offices=item["allowed_offices"],
                canvas_evidence_url=item["canvas_evidence_url"],
                supplier_name=item["supplier_name"],
                canvas_expiration_date=default_expiry  # Add expiration date
            )
            db.add(db_item)
            logger.info(f"Catalog Item seeded: '{item['display_name']}'")

    # ==========================================================
    # ANNEX A-3 STRUCTURAL SEEDS
    # ==========================================================
    logger.info("Seeding Annex A-3 Complete Core Offices functions registry...")
    core_offices_registry = [
        {"id": 1, "office_name": "Board of Trustees", "description": "The governing body of the College vested with general powers of administration and exercise of corporate powers.", "division": "Administration"},
        {"id": 2, "office_name": "Office of the President", "description": "Responsible for executive supervision, executing SUC policies, and overseeing institutional academic operations.", "division": "Administration"},
        {"id": 3, "office_name": "Office of the Vice President for Academic Affairs", "description": "Directs academic portfolios, curricula reviews, faculty development, and program accreditation standards.", "division": "Academic"},
        {"id": 4, "office_name": "Office of the Vice President for Administration and Finance", "description": "Manages finance, budgeting, human resources, facilities maintenance, and physical plant operations.", "division": "Administration"},
        {"id": 5, "office_name": "Office of the Vice President for Research, Extension and Linkages", "description": "Oversees university research publications, community extension projects, and dynamic inter-agency partnerships.", "division": "Research"},
        {"id": 6, "office_name": "MICT Office", "description": "Manages networks, baseline price catalogs, student databases, and university systems compliance.", "division": "Technical Operations"},
        {"id": 7, "office_name": "Budget Office", "description": "Manages annual SUC funding allocations, monitors ceiling limits, and executes financial reporting.", "division": "Finance"},
        {"id": 8, "office_name": "Procurement Office", "description": "Coordinates purchasing pipelines, standard bidding processes, and supplier canvas verification.", "division": "Administration"},
        {"id": 9, "office_name": "Supply and Property Unit", "description": "Maintains physical inventories, receives equipment, and executes IIRUP reports.", "division": "Administration"},
        {"id": 10, "office_name": "Accounting Unit", "description": "Orchestrates balance ledgers, processes payment vouchers, and executes COA financial reconciliations.", "division": "Finance"},
        {"id": 11, "office_name": "Cashier Unit", "description": "Manages cash disbursements, processes collections, and secures SUC cash deposits.", "division": "Finance"},
        {"id": 12, "office_name": "Human Resource Management Office", "description": "Manages employment records, handles biometrics data integration, and coordinates payroll.", "division": "Administration"},
        {"id": 13, "office_name": "Registrar's Office", "description": "Manages student enrollment files, grades logging, transcripts, and official registrations.", "division": "Academic"},
        {"id": 14, "office_name": "Medical and Dental Clinic", "description": "Provides clinical services and dental checkups to students, faculty, and administrative staff.", "division": "Support"},
        {"id": 15, "office_name": "Library Services", "description": "Manages book catalogs, book circulations, and OPAC digital reference assets.", "division": "Academic Support"},
        {"id": 16, "office_name": "Physical Plant and Facilities", "description": "Manages physical construction, network cabling routes, electrical setups, and grounds maintenance.", "division": "Support"}
    ]

    baseline_period = "2026-2028"
    logger.info(f"Seeding full DICT-compliant Master Narrative for cycle '{baseline_period}'...")
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == baseline_period).first()
    
    # Complete, authentic strategic concerns from 2024-2026 Guide (Adapted to 2026-2028)
    strategic_concerns_data = [
        {
            "mfo": "Enrollment Services", 
            "critical_system": "Student Information and Accounting System (SIAS)", 
            "problems": "Delayed student enrollment processing and grading sync latency during semesters. Customization reports are limited, causing bottlenecks.", 
            "intended_use": "SIAS Cloud deployment, online enrollment module, online payment gateway, grading system, class attendance, text blasting, faculty evaluation, and LMS integration."
        },
        {
            "mfo": "Library Management", 
            "critical_system": "Online Library Information System", 
            "problems": "Difficulty in providing online real-time information about books available in the library to the users; system does not support online transactions; librarian faces difficulties searching for unreturned books and fine calculations.", 
            "intended_use": "Online Library Management Information System, OPAC, classic catalog, e-books/e-journals databases, user log-in/log-out system, library inventory system, and billing system."
        },
        {
            "mfo": "Monitoring & Security", 
            "critical_system": "Security Management System", 
            "problems": "Difficulty in providing evidence of security breaches; difficulty in monitoring school premises; manual logging of personnel and visitors causing queues at entrances and parking spaces.", 
            "intended_use": "School Monitoring and Security System using CCTV cameras, RFIDs, smart card reader gates, automated vehicle logging, and central security database."
        },
        {
            "mfo": "Human Resources", 
            "critical_system": "HRMS / Payroll System", 
            "problems": "Biometrics mismatch requiring manual DTR corrections; unable to generate attendance reports on time; slow records archival/retrieval.", 
            "intended_use": "Integrated Human Resource and Payroll System, central biometrics verification, online employee records access, and digital payslip distribution."
        },
        {
            "mfo": "Supply Management", 
            "critical_system": "Supplies Management System", 
            "problems": "Archival and retrieval of records are slow, stock room is small, and lost items are not reported. Dilapidated property stickers cause tracking errors.", 
            "intended_use": "Supplies Management System, database tracking of inventory requisitions, supplies monitoring, and barcode scanning systems."
        },
        {
            "mfo": "Budget Management", 
            "critical_system": "Budget Management Information System", 
            "problems": "Difficulty segregating expenditures by responsibility centers (departments/colleges); difficulty monitoring actual disbursements versus obligations; difficulty tracking excess cash advances.", 
            "intended_use": "Budget Management Information System, online facility for monitoring expenditures and budget utilization, and obligation requests tracker."
        },
        {
            "mfo": "Extension Services", 
            "critical_system": "CSPC Extension Automated Services", 
            "problems": "Difficulty in tracking and monitoring previous trainees; storing and retrieving participant registries; slow process of generating reports on accomplishments.", 
            "intended_use": "CSPC Extension Automated Services, online enrolment for external clients, extension program advisory, and database trackers."
        },
        {
            "mfo": "Research Services", 
            "critical_system": "E-Research", 
            "problems": "Difficulty tracking research abstract details and monitoring project milestone defenses.", 
            "intended_use": "E-Research, online database of researchers, abstracts, schedules, and digital archiving."
        }
    ]

    pmf_matrix_data = [
        {"project_title": "Deployment of Moodle LMS", "result_hierarchy": "Intermediate outcome", "indicator": "Percentage of students who accesses LMS learning resources", "baseline": "10% of students", "target": "100% of students", "collection_method": "Mandatory reporting/feedbacking", "responsibility": "MICT Office"},
        {"project_title": "Deployment of Moodle LMS", "result_hierarchy": "Immediate outcome", "indicator": "Percentage of students that utilizes learning technologies", "baseline": "5% of students", "target": "100% of the students", "collection_method": "Mandatory reporting/feedbacking", "responsibility": "MICT Office"},
        {"project_title": "Deployment of Moodle LMS", "result_hierarchy": "Outputs", "indicator": "Percentage of courses adopting the LMS", "baseline": "10%", "target": "100% adoption", "collection_method": "Mandatory reporting/feedbacking", "responsibility": "MICT Office, Deans Offices"},
        
        {"project_title": "Upgrade Leased Line Bandwidth", "result_hierarchy": "Intermediate outcome", "indicator": "Percentage of clients transacting online with the College", "baseline": "70% of clients", "target": "30% increase", "collection_method": "Mandatory reporting", "responsibility": "MICT Office, President Office, IPO Office"},
        {"project_title": "Upgrade Leased Line Bandwidth", "result_hierarchy": "Immediate outcome", "indicator": "Percentage of offices that needs online submission and receipt of reports", "baseline": "60% of offices", "target": "100% of offices", "collection_method": "Mandatory reporting", "responsibility": "VPA Office, IPO office"},
        {"project_title": "Upgrade Leased Line Bandwidth", "result_hierarchy": "Outputs", "indicator": "Percentage of online transactions completed successfully", "baseline": "60%", "target": "100% successful transactions", "collection_method": "Mandatory reporting", "responsibility": "MICT Office, IPO Office"},

        {"project_title": "WiFi Campus Network Installation", "result_hierarchy": "Intermediate outcome", "indicator": "Percentage of learners that avail WiFi Connection for learning purposes", "baseline": "30%", "target": "100% of learners", "collection_method": "Mandatory reporting", "responsibility": "Deans Office, MICT Office"},
        {"project_title": "WiFi Campus Network Installation", "result_hierarchy": "Immediate outcome", "indicator": "No. of hour allotted for WIFI access", "baseline": "1 hour", "target": "8 hours", "collection_method": "Mandatory reporting", "responsibility": "MICT Office"},
        {"project_title": "WiFi Campus Network Installation", "result_hierarchy": "Outputs", "indicator": "Percentage of using WIFI for in-campus teaching-learning process", "baseline": "30%", "target": "100% of learners", "collection_method": "Mandatory reporting", "responsibility": "MICT Office"}
    ]

    systems_data = [
        {"name": "Student Information and Accounting System (SIAS)", "description": "Handles online student registration, grading, online admission, online payment, class attendance, and accounting ledger management.", "status": "For Enhancement", "dev_strategy": "Outsourced / Service Provider", "computing_scheme": "Cloud Computing", "users_internal": "Students, Faculty, Registrar, Registrars' Staff, Accountant, Accounting Staff, Clerks", "users_external": "CHED, DBM, Parents, Stakeholders", "owners": "MICT Office"},
        {"name": "Online Library Information Systems", "description": "System to manage books library collections, records tracking, online OPAC search access, classic catalog, e-books/e-journals databases, and user log-in/log-out system.", "status": "For Enhancement", "dev_strategy": "In-house Development", "computing_scheme": "Web Server", "users_internal": "Librarian, Library Staff", "users_external": "Students, Faculty, Outside Researches", "owners": "CSPC Library"},
        {"name": "School Monitoring and Security System", "description": "System using CCTV cameras, RFIDs, and smart cards to secure facilities, monitor vehicles, and manage automated barricades.", "status": "For Development", "dev_strategy": "Outsourced / Service Provider", "computing_scheme": "Cloud Computing", "users_internal": "Guards, MIS Staff, College President, VPs and other Administrators", "users_external": "None", "owners": "Office of the Vice President for Administration"},
        {"name": "Human Resource Management System", "description": "Directly links biometric attendance data, automatically calculates time cards, and interfaces with the payroll system.", "status": "For Enhancement", "dev_strategy": "Outsourced / Service Provider", "computing_scheme": "Cloud Computing", "users_internal": "PERSONNEL, FACULTY, HRMO, HRMO STAFF, ACCOUNTANT, ACCOUNTING STAFF", "users_external": "CHED", "owners": "Human Resource Management System"},
        {"name": "Document Management System", "description": "Manages working and archived documents, features advanced record retention and disposition policies, and provides security roles.", "status": "For Enhancement", "dev_strategy": "In-house", "computing_scheme": "Cloud Computing", "users_internal": "DOCUMENT CONTROLLER, CLERK, OFFICE HEADS, ADMINISTRATOR", "users_external": "STAKEHOLDERS, CHED", "owners": "Records Office"},
        {"name": "Supply Management System", "description": "Tracks supplies requisition, facilitates inventory monitoring, procurement tracking, and supplies release.", "status": "On-Going Development", "dev_strategy": "In-house", "computing_scheme": "Cloud Computing", "users_internal": "SUPPLY OFFICER, PROCUREMENT OFFICER, SUPPLIES PERSONNEL, FACULTY", "users_external": "STAKEHOLDERS", "owners": "Supply Office"},
        {"name": "CSPC Extension Automated Services", "description": "Provides online enrolment for external clients and data bank for accomplishments of extension coordinators/faculty.", "status": "For Development", "dev_strategy": "In-house", "computing_scheme": "Cloud Computing", "users_internal": "EXTENSION COORDINATOR, EXTENSION OFFICE STAFF, FACULTY, STUDENTS, ADMINISTRATOR", "users_external": "CHED, DBM, STAKEHOLDERS, RESEARCHERS", "owners": "VPREP Office"},
        {"name": "E-Research", "description": "Provides online databank of researchers undertaken, abstracts, and monitors phases of particular research study.", "status": "For Development", "dev_strategy": "In-house", "computing_scheme": "Cloud Computing", "users_internal": "RESEARCH DIRECTOR, RESEARCH OFFICE STAFF, STUDENTS, FACULTY", "users_external": "CHED, RESEARCHERS, STAKEHOLDERS", "owners": "VPREP Office"},
        {"name": "Financial Management System", "description": "Automates general ledgers, voucher creation, and standard financial reporting.", "status": "On-Going Development", "dev_strategy": "Outsourced", "computing_scheme": "Web Server/Host", "users_internal": "RESEARCH DIRECTOR, RESEARCH OFFICE STAFF, STUDENTS, FACULTY", "users_external": "CHED, RESEARCHERS, STAKEHOLDERS", "owners": "Accounting System"}
    ]

    databases_data = [
        {"name": "Student Information and Accounting System (SIAS) Database", "description": "Stores student profile, subjects, accounts, and other pertinent data needed in processing and generating reports.", "status": "For Migration", "is_served": "Online Student Enrollment and Accounting System", "storage_media": "High-End Data Storage Server", "owners": "Office of the Vice President for Academic Affairs"},
        {"name": "Online Library Information Systems Database", "description": "Stores books available, journals, e-books, users, researchers, and other data needed in processing library reports.", "status": "For Migration", "is_served": "Online Library Management Information Systems", "storage_media": "High-End Data Storage Server", "owners": "College Library"},
        {"name": "School Monitoring and Security Database", "description": "Stores employees' profile, schedule, visitors' profile, and other data, including data for vehicles entering the college.", "status": "For Development", "is_served": "School Monitoring and Security Management System", "storage_media": "High-End Data Storage Server", "owners": "Vice President for Administration"},
        {"name": "Human Resource Management Database", "description": "Stores employees' profile, salary, loans, tax, and other pertinent data needed in processing of data and generating reports.", "status": "For Development", "is_served": "Human Resource and Payroll System", "storage_media": "High-End Data Storage Server", "owners": "Human Resource Management Office"},
        {"name": "Supply Management Database", "description": "Directory of supplies, end-user, suppliers, and contains data for the procurement, expenditure, and transaction processing.", "status": "For Development", "is_served": "Supplies Management System", "storage_media": "High-End Data Storage Server", "owners": "Supply Office"},
        {"name": "Document Management System Database", "description": "Directory of documents that enters into the Records office. It includes documents fields, indexes, and relationship. It contains control number, present status.", "status": "For Development", "is_served": "Documents Management and Payroll Systems", "storage_media": "High-End Data Storage Server", "owners": "Records Office"},
        {"name": "CSPC Extension Automated Services Database", "description": "Includes directory of faculty, client activities, updates, and implemented programs. It also includes data needed in the system's process.", "status": "For Development", "is_served": "CSPC Extension Automated Services", "storage_media": "High-End Data Storage Server", "owners": "Office of the VP in Research and Extension Program"},
        {"name": "E-Research Database", "description": "Includes data of faculty-researchers, researches conducted, abstract, schedules, time frame, and status.", "status": "For Development", "is_served": "E-Research", "storage_media": "High-End Data Storage Server", "owners": "Office of the VP in Research and Extension Program"}
    ]

    internal_projects_data = [
        {"name": "Deployment of Moodle-Based Learning Management System", "objectives": "To allow online distance teaching and learning\\nTo lessen the time spent in classroom instruction\\nTo automate grading system/class record computation", "duration": "2026 - 2028", "deliverables": "Learning Online Space (LeOnS)"},
        {"name": "Upgrade Leased Line Bandwidth", "objectives": "To provide a more efficient online transaction of the College\\nTo support the operation of the College\\nTo support online distance learning\\nTo provide an alternative line in case of infrastructure damage due to natural calamities such as typhoons, earthquake, etc.", "duration": "2026 - 2028", "deliverables": "LEASED LINE INTERNET"},
        {"name": "WiFi Campus Network Installation", "objectives": "To ensure the availability of wireless connection in the campus\\nTo help in easy transmission of information\\nTo help students and teachers in a fast access of learning resources", "duration": "2026 - 2028", "deliverables": "WIFI CAMPUS NETWORK"},
        {"name": "Technology for Education Installation", "objectives": "To support the learning of students through an easily accessible learning resource\\nTo aid teachers in teaching their respective subjects", "duration": "2026 - 2028", "deliverables": "TECHNOLOGY FOR EDUCATION"},
        {"name": "Enhancement of Buhi Campus Network", "objectives": "To provide a more effective online transaction in the Campus\\nTo provide a more effective online learning for the campus instruction", "duration": "2026 - 2028", "deliverables": "BUHI CAMPUS NETWORK"},
        {"name": "PBAX Enhancement to Digital VOIP", "objectives": "To provide a more effective internal and external communication system in the College", "duration": "2026 - 2028", "deliverables": "PBAX"},
        {"name": "CATV Upgrade to Smart TV", "objectives": "To provide a SMART TV connected to the network in the College", "duration": "2026 - 2028", "deliverables": "SMART TV SYSTEMS"},
        {"name": "Main Campus LAN Enhancement", "objectives": "To provide a fiber optic backbone connection in the campus\\nTo provide a layer 3 networking in the existing layer 2 campus network\\nTo provide a structured network cabling in the campus", "duration": "2026 - 2028", "deliverables": "CAMPUS NETWORK"},
        {"name": "Computer Laboratories Enhancement", "objectives": "To provide a well-equipped laboratory for instructions and practical works", "duration": "2026 - 2028", "deliverables": "COMPUTER LABORATORIES"},
        {"name": "Data Center Enhancement", "objectives": "To provide a well-equipped and efficient Data that houses servers, security devices, and Internet connection", "duration": "2026 - 2028", "deliverables": "DATA CENTER"},
        {"name": "CCTV Systems Integrate to Command Center", "objectives": "To provide a command center of CCTV systems in the College", "duration": "2026 - 2028", "deliverables": "CCTV COMMAND CENTER"},
        {"name": "Multimedia Center Enhancement", "objectives": "To provide a well-equipped and efficient use of multimedia devices during meetings, occasions, conferences, accreditations, and other events which needs multimedia equipment", "duration": "2026 - 2028", "deliverables": "Multimedia Center"}
    ]

    if not narrative:
        narrative = MasterNarrative(
            issp_period=baseline_period,
            agency_name="Camarines Sur Polytechnic Colleges",
            issp_period_from=2026,
            issp_period_to=2028,
            is_active=True,
            signatory_prepared_by="DR. IAN P. BENITEZ",
            preparer_position="Director, MICT",
            preparer_tel="09190840018",
            preparer_fax="(054) 288-4425",
            preparer_email="ianbenitez@cspc.edu.ph",
            signatory_approved_by="CHARLITO P. CADAG, PhD",
            transmittal_recipient="ATTY. IVAN JOHN E. UY",
            transmittal_recipient_title="Secretary",
            transmittal_recipient_agency="Department of Information and Communications Technology",
            transmittal_recipient_address="DICT Bldg., C.P. Garcia Avenue, Diliman, Quezon City",
            transmittal_date="22 February 2023",
            scope_choice=ScopeChoice.DEPARTMENT_WIDE,
            scope_json={"department_wide": True},
            
            mandate_html="""<p>The College mandate is defined under Section 2 of Batas Pambansa Bilang 512, the law which created the Camarines Sur Polytechnic Colleges (CSPC). BP 512 provides: \"The Camarines Sur Polytechnic Colleges shall primarily provide higher technological, professional and vocational instruction and training in fisheries, trade and technology, arts and sciences, and as well as promote research, history, extension services, and progressive leadership in these fields.\"</p>""",
            vision_html="Polytechnic education at its best for the Bicolanos",
            mission_html="Transforming lives to be free of poverty by creating a better future through world class polytechnic education and technological innovation.",
            
            present_situation_html="""<p><strong>Online Student Information and Accounting System (SIAS):</strong> High load bottlenecks during registration. The system handles enrollment, grades, and accounting, but requires cloud deployment and optimization to reduce grading latency. <strong>Human Resource Information System (HRIS):</strong> Requires dynamic biometric integration. The college website is functional, but lacks advanced search structures. Computer-to-employee ratio is 1:1, with a 99% computer literacy rate.</p>""",
            
            planners_json=[
                {"name": "DR. IAN P. BENITEZ", "position": "Associate Professor V / Director, MICTC", "email": "ianbenitez@cspc.edu.ph", "contact_number": "09190840018"},
                {"name": "VINCENT B. CORTEZ", "position": "Instructor / Head, MIS", "email": "vincentcortez@cspc.edu.ph", "contact_number": "09304821749"}
            ],
            manpower_json={
                "admin_regular": 53,
                "admin_casual": 54,
                "academic_regular": 217,
                "academic_casual": 0,
                "total_employees": 324
            },
            annual_ict_budget=Decimal("31907000.00"),
            core_offices_json=core_offices_registry,
            strategic_concerns_json=strategic_concerns_data,
            pmf_matrix_json=pmf_matrix_data,
            systems_json=systems_data,
            databases_json=databases_data,
            internal_projects_json=internal_projects_data,
            cross_projects_json=[],
            
            # Connectivity Details
            mithi_network_profile={
                "has_lan": True,
                "has_intranet": True,
                "has_vpn": True,
                "is_connected_to_internet": True,
                "internet_access_modes": ["Leased Line", "WiFi", "DSL"],
                "isps": ["PLDT", "Globe"],
                "combined_bandwidth_mbps": 100,
                "employees_with_internet_access": 324,
                "employees_with_official_email": 324
            },
            mithi_special_solutions=[
                {"solution_name": "Geographic Information System", "is_used": True, "maintenance_cost": 25000.00}
            ],
            mithi_data_center={
                "has_data_center": True,
                "data_center_count": 2,
                "has_backup_site": True,
                "maintenance_strategy": "In-house with third-party escalations"
            },
            mithi_hardware_inventory=[
                {
                    "device_type": "Desktop PC",
                    "yearly_owned": {"2026": 120, "2027": 150, "2028": 180},
                    "yearly_leased": {"2026": 0, "2027": 0, "2028": 0},
                    "older_than_3_years": 45
                }
            ],
            implementation_schedules=[
                {
                    "project_id": "00000000-0000-0000-0000-000000000001",
                    "project_name": "Deployment of Moodle LMS",
                    "milestones": {"2026_Q1": True, "2026_Q2": True, "2026_Q3": True, "2026_Q4": True}
                }
            ]
        )
        db.add(narrative)
        db.flush()
        logger.info(f"Default Master Narrative established for cycle '{baseline_period}'.")

    # ==========================================================
    # POPULATING COMPLEMENTARY NORMALIZED RELATIONAL DIRECTORIES
    # ==========================================================
    logger.info("Synchronizing normalized core office functions relational table...")
    for office in core_offices_registry:
        existing_office = db.query(CoreOfficeFunction).filter(
            CoreOfficeFunction.office_name == office["office_name"],
            CoreOfficeFunction.issp_period == baseline_period
        ).first()
        if not existing_office:
            db_office = CoreOfficeFunction(
                issp_period=baseline_period,
                office_name=office["office_name"],
                division=office["division"],
                description=office["description"]
            )
            db.add(db_office)

    logger.info("Synchronizing normalized strategic concerns relational table...")
    for idx, concern in enumerate(strategic_concerns_data):
        existing_concern = db.query(StrategicConcern).filter(
            StrategicConcern.critical_system == concern["critical_system"],
            StrategicConcern.issp_period == baseline_period
        ).first()
        if not existing_concern:
            db_concern = StrategicConcern(
                issp_period=baseline_period,
                mfo=concern["mfo"],
                critical_system=concern["critical_system"],
                problems=concern["problems"],
                intended_use=concern["intended_use"],
                order_index=idx
            )
            db.add(db_concern)

    logger.info("Synchronizing normalized performance metrics relational table...")
    for pmf in pmf_matrix_data:
        existing_pmf = db.query(PerformanceMetric).filter(
            PerformanceMetric.project_title == pmf["project_title"],
            PerformanceMetric.indicator == pmf["indicator"],
            PerformanceMetric.issp_period == baseline_period
        ).first()
        if not existing_pmf:
            db_pmf = PerformanceMetric(
                issp_period=baseline_period,
                project_title=pmf["project_title"],
                result_hierarchy=pmf["result_hierarchy"],
                indicator=pmf["indicator"],
                baseline=pmf["baseline"],
                target=pmf["target"],
                collection_method=pmf["collection_method"],
                responsibility=pmf["responsibility"]
            )
            db.add(db_pmf)

    logger.info("Seeding default Glossary Terms (Pages 6-10)...")
    glossary_terms = [
        {"term": "Agency", "definition": "Refers to any bureau, office, commission, authority, or instrumentality of the national government, including government-owned or-controlled corporations (GOCC), authorized by law or by their respective charters to contract for or undertake information and communications technology networks, databases, infrastructure or development projects.", "order_index": 1},
        {"term": "Application System", "definition": "Refers to a group of related activities or processes designed to support a very specific function (e.g., Payroll System, Accounting System, etc.). It is referred to as a 'computer-based information system' prepared for the organization to process tasks that are unique to the particular needs or 'tailor fit' for the particular operation.", "order_index": 2},
        {"term": "Biometrics", "definition": "The science and technology of measuring and statistically analyzing biological data. In ICT, it refers to technologies for measuring and analyzing human body characteristics such as fingerprints, eye retinas and irises, voice patterns, facial patterns and hand measurements, especially for the authentication of someone.", "order_index": 3},
        {"term": "Business Process", "definition": "A collection of business transactions between business partners and/or internal activities within one business. These transactions and/or activities together support the objective of the business process.", "order_index": 4},
        {"term": "Computing Scheme", "definition": "May be classified into two, namely stand-alone or independent systems, and networked systems.", "order_index": 5},
        {"term": "Client-Server", "definition": "The most recent approach in networking wherein the logic of the application is divided between a front-end computer (called the client) and a back-end computer (called a server). The client generally provides and uses information while the server retrieves, selects, sorts, calculates, sends only needed data and manages the database.", "order_index": 6},
        {"term": "Database (DB)", "definition": "An organized group or set of inter-related information about a subject that can be processed, retrieved, analyzed and used in drawing conclusions and making decisions.", "order_index": 7},
        {"term": "ISSP", "definition": "Information Systems Strategic Plan - refers to a three (3) to five (5) year computerization framework of an agency which describes how the organization intends to strategically use ICT in pursuit of its mission and functions.", "order_index": 8},
        {"term": "MITHI", "definition": "Medium-Term Information and Communications Technology Harmonization Initiative - a government-wide program to harmonize all ICT resources and programs.", "order_index": 9}
    ]
    for term in glossary_terms:
        existing = db.query(GlossaryTerm).filter(GlossaryTerm.term == term["term"]).first()
        if not existing:
            db.add(GlossaryTerm(**term))
        else:
            existing.definition = term["definition"]
            existing.order_index = term["order_index"]

    logger.info("Seeding General Submission Guidelines (Page 11)...")
    guidelines = [
        {"step_number": 1, "instruction_text": "This Template is prescribed primarily to guide government agencies to formulate and present its ISSP in brief. Government agencies may provide information that could add better clarity to the ISSP. The ISSP Template Revised contains the basic information that is required by the government and therefore does not inhibit the agency from making their ISSPs more complex for other purposes."},
        {"step_number": 2, "instruction_text": "The agency must submit one hard copy of the initial ISSP to DICT for review and evaluation, together with a transmittal letter signed by the agency head and addressed to the Secretary, Department of Information and Communications Technology, DICT Bldg., C.P. Garcia Ave., U.P. Campus, Diliman, Quezon City."},
        {"step_number": 3, "instruction_text": "Once the ISSP is complete and complied with requirements as per review and evaluation of DICT, then the agency must submit two (2) hard copies of the final ISSP to the DICT for endorsement and a soft copy in CD (pdf or doc file)."},
        {"step_number": 4, "instruction_text": "Agencies are advised to use font size 12 and government sized (A4) bond paper, however, page margin may vary."}
    ]
    for step in guidelines:
        existing = db.query(GeneralInstruction).filter(GeneralInstruction.step_number == step["step_number"]).first()
        if not existing:
            db.add(GeneralInstruction(**step))
        else:
            existing.instruction_text = step["instruction_text"]

    logger.info("Seeding physical Server capacity tracks (Gap 15)...")
    existing_capacity = db.query(ServerCapacityTrack).filter(ServerCapacityTrack.capacity_tier == "Above 4TB").first()
    if not existing_capacity:
        db.add(ServerCapacityTrack(campus_id=main_campus.id, capacity_tier="Above 4TB", location="IN-HOUSE", quantity=2))

    logger.info("Seeding baseline OS census tracking metrics (Gap 16)...")
    standard_os = [
        {"os_name": "Windows 11 Professional", "workstations_count": 120, "servers_count": 0},
        {"os_name": "Ubuntu Server 22.04 LTS", "workstations_count": 0, "servers_count": 5},
        {"os_name": "Windows Server 2022", "workstations_count": 0, "servers_count": 3}
    ]
    for os_data in standard_os:
        existing = db.query(ClientOsCensus).filter(ClientOsCensus.os_name == os_data["os_name"]).first()
        if not existing:
            db.add(ClientOsCensus(**os_data))

    logger.info("Seeding office software productivity census metrics (Gap 17)...")
    standard_soft = [
        {"software_name": "Microsoft Office 2021 LTSC", "license_count": 150},
        {"software_name": "Adobe Creative Cloud", "license_count": 25},
        {"software_name": "AutoCAD 2024", "license_count": 50}
    ]
    for soft_data in standard_soft:
        existing = db.query(OfficeSoftwareCensus).filter(OfficeSoftwareCensus.software_name == soft_data["software_name"]).first()
        if not existing:
            db.add(OfficeSoftwareCensus(**soft_data))

    logger.info("Seeding baseline SUC IT Staff Positions profiles (Gap 18)...")
    positions = [
        {"position_title": "Database Administrator", "status": "Permanent", "count": 1},
        {"position_title": "Information Technology Officer I", "status": "Permanent", "count": 2},
        {"position_title": "Systems Analyst", "status": "Contractual", "count": 1},
        {"position_title": "Network Engineer", "status": "Permanent", "count": 1}
    ]
    for pos in positions:
        existing = db.query(IctStaffPosition).filter(
            IctStaffPosition.position_title == pos["position_title"],
            IctStaffPosition.issp_period == baseline_period
        ).first()
        if not existing:
            db.add(IctStaffPosition(
                issp_period=baseline_period,
                position_title=pos["position_title"],
                status=pos["status"],
                count=pos["count"]
            ))

    logger.info("Configuring departmental sub-ceiling limits against global ceiling...")
    ceilings_to_seed = {
        "College of Engineering": Decimal("10000000.00"),
        "College of Computer Studies": Decimal("8000000.00"),
        "College of Education, Arts and Sciences": Decimal("5000000.00"),
        "College of Health Sciences": Decimal("4000000.00"),
        "College of Tourism, Hospitality, and Business Management": Decimal("3000000.00"),
        "College of Technological and Developmental Education": Decimal("5000000.00"),
        "Human Resources Management": Decimal("2000000.00")
    }

    for dept_name, limit in ceilings_to_seed.items():
        dept = dept_instances.get(dept_name)
        if dept:
            ceiling = db.query(BudgetCeiling).filter(
                BudgetCeiling.department_id == dept.id
            ).first()
            if not ceiling:
                ceiling = BudgetCeiling(
                    department_id=dept.id,
                    issp_period=baseline_period
                )
                ceiling.sub_ceiling = limit # Auto-derives the 70/30 split cleanly via model setter
                db.add(ceiling)
                logger.info(f"Ceiling established for {dept_name}: PHP {limit:,.2f} (70/30 CapEx/MOOE split)")
            else:
                ceiling.sub_ceiling = limit
                ceiling.issp_period = baseline_period
                logger.info(f"Ceiling updated for {dept_name}: PHP {limit:,.2f}")

    # ==========================================================
    # PROGRAMMATIC PROPOSALS & SUBSCRIPTIONS SEEDING (Part V.C/D)
    # ==========================================================
    logger.info("Seeding approved proposals and subscriptions matching guide cost breakdown...")
    
    # Resolving target engineering department as an example parent
    engineering_dept = dept_instances.get("College of Engineering")
    engineering_dept_id = engineering_dept.id if engineering_dept else 1

    # Multi-Year CapEx hardware acquisitions mapped from the guide
    proposals_matrix = [
        # Office Productivity
        {"item_key": "pc_standard", "item_name": "Standard Office PC (Clerical)", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 80, "2027": 100, "2028": 100}, "project_key": "Office_Productivity"},
        {"item_key": "heavy_duty_printer", "item_name": "Heavy Duty Network Workgroup Printer", "unit_cost": Decimal("25000.00"), "yearly_quantities": {"2026": 5, "2027": 30, "2028": 20}, "project_key": "Office_Productivity"},
        {"item_key": "laptop_faculty", "item_name": "Faculty Workstation Laptop", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 2, "2027": 50, "2028": 40}, "project_key": "Office_Productivity"},
        {"item_key": "projector_standard", "item_name": "Standard Classroom Projector", "unit_cost": Decimal("30000.00"), "yearly_quantities": {"2026": 5, "2027": 5, "2028": 5}, "project_key": "Office_Productivity"},
        {"item_key": "pc_standard", "item_name": "Standard Desktop Workstation Printer (Laser)", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 2, "2027": 1, "2028": 0}, "project_key": "Office_Productivity"},
        {"item_key": "pc_standard", "item_name": "Standard Desktop Workstation Printer (Ink Jet)", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 5, "2027": 5, "2028": 10}, "project_key": "Office_Productivity"},
        {"item_key": "scanner_standard", "item_name": "Standard Office Scanner", "unit_cost": Decimal("25000.00"), "yearly_quantities": {"2026": 10, "2027": 20, "2028": 5}, "project_key": "Office_Productivity"},
        {"item_key": "pc_standard", "item_name": "HDMI Cable set", "unit_cost": Decimal("1000.00"), "yearly_quantities": {"2026": 5, "2027": 10, "2028": 0}, "project_key": "Office_Productivity"},
        {"item_key": "pc_standard", "item_name": "External Hard Drive 2TB", "unit_cost": Decimal("3000.00"), "yearly_quantities": {"2026": 5, "2027": 5, "2028": 5}, "project_key": "Office_Productivity"},
        {"item_key": "pc_standard", "item_name": "Flash Drive 64GB", "unit_cost": Decimal("1000.00"), "yearly_quantities": {"2026": 8, "2027": 8, "2028": 8}, "project_key": "Office_Productivity"},
        {"item_key": "pc_standard", "item_name": "UPS Backup Power Unit", "unit_cost": Decimal("5000.00"), "yearly_quantities": {"2026": 15, "2027": 36, "2028": 36}, "project_key": "Office_Productivity"},
        
        # Moodle LMS (2.1)
        {"item_key": "pc_standard", "item_name": "Desktop Computer", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 2, "2027": 0, "2028": 0}, "project_key": "LMS"},
        {"item_key": "laptop_faculty", "item_name": "Laptop", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 1, "2027": 0, "2028": 0}, "project_key": "LMS"},
        {"item_key": "bay_rack", "item_name": "Bay Rack Unit", "unit_cost": Decimal("20000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}, "project_key": "LMS"},
        {"item_key": "pc_standard", "item_name": "HDMI Cable set", "unit_cost": Decimal("1000.00"), "yearly_quantities": {"2026": 5, "2027": 0, "2028": 0}, "project_key": "LMS"},
        {"item_key": "pc_standard", "item_name": "External Hard Drive 2TB", "unit_cost": Decimal("3000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}, "project_key": "LMS"},
        {"item_key": "pc_standard", "item_name": "UPS Backup Power Unit", "unit_cost": Decimal("5000.00"), "yearly_quantities": {"2026": 2, "2027": 2, "2028": 2}, "project_key": "LMS"},

        # Leased Line Bandwidth (2.2)
        {"item_key": "bay_rack", "item_name": "Bay Rack Unit", "unit_cost": Decimal("20000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}, "project_key": "Bandwidth"},
        {"item_key": "router_cisco", "item_name": "CISCO Core Edge Router", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 0, "2027": 0, "2028": 1}, "project_key": "Bandwidth"},
        {"item_key": "patch_panel", "item_name": "24-Port Cat6 Patch Panel", "unit_cost": Decimal("3500.00"), "yearly_quantities": {"2026": 3, "2027": 3, "2028": 3}, "project_key": "Bandwidth"},
        {"item_key": "router_internet", "item_name": "Enterprise Internet Router", "unit_cost": Decimal("7000.00"), "yearly_quantities": {"2026": 4, "2027": 4, "2028": 4}, "project_key": "Bandwidth"},

        # WiFi Campus Network (2.3)
        {"item_key": "bay_rack", "item_name": "Bay Rack Unit", "unit_cost": Decimal("20000.00"), "yearly_quantities": {"2026": 2, "2027": 2, "2028": 2}, "project_key": "WiFi"},
        {"item_key": "connectors_utp", "item_name": "RJ45 UTP Connectors Pack", "unit_cost": Decimal("15.00"), "yearly_quantities": {"2026": 200, "2027": 200, "2028": 15}, "project_key": "WiFi"},
        {"item_key": "patch_panel", "item_name": "24-Port Cat6 Patch Panel", "unit_cost": Decimal("3500.00"), "yearly_quantities": {"2026": 10, "2027": 10, "2028": 10}, "project_key": "WiFi"},
        {"item_key": "ap_wifi6", "item_name": "Enterprise Wi-Fi 6 Access Point", "unit_cost": Decimal("10000.00"), "yearly_quantities": {"2026": 20, "2027": 20, "2028": 20}, "project_key": "WiFi"},

        # Technology for Education (2.4)
        {"item_key": "pc_standard", "item_name": "Desktop Computer", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 20, "2027": 0, "2028": 0}, "project_key": "Tech_for_Ed"},
        {"item_key": "laptop_faculty", "item_name": "Laptop", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 1, "2027": 0, "2028": 0}, "project_key": "Tech_for_Ed"},
        {"item_key": "led_tv_classroom", "item_name": "Classroom Smart LED TV", "unit_cost": Decimal("40000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}, "project_key": "Tech_for_Ed"},
        {"item_key": "switch_24", "item_name": "24-Port Managed Switch", "unit_cost": Decimal("15000.00"), "yearly_quantities": {"2026": 0, "2027": 2, "2028": 0}, "project_key": "Tech_for_Ed"},
        {"item_key": "pc_standard", "item_name": "HDMI Cable set", "unit_cost": Decimal("1000.00"), "yearly_quantities": {"2026": 5, "2027": 5, "2028": 0}, "project_key": "Tech_for_Ed"},
        {"item_key": "pc_standard", "item_name": "External Hard Drive 2TB", "unit_cost": Decimal("3000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}, "project_key": "Tech_for_Ed"},
        {"item_key": "pc_standard", "item_name": "UPS Backup Power Unit", "unit_cost": Decimal("5000.00"), "yearly_quantities": {"2026": 10, "2027": 10, "2028": 10}, "project_key": "Tech_for_Ed"},
        {"item_key": "patch_panel", "item_name": "24-Port Cat6 Patch Panel", "unit_cost": Decimal("3500.00"), "yearly_quantities": {"2026": 2, "2027": 2, "2028": 2}, "project_key": "Tech_for_Ed"},

        # Enhancement of Buhi Campus (2.5)
        {"item_key": "pc_standard", "item_name": "Desktop Computer", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 3, "2027": 0, "2028": 0}, "project_key": "Buhi_Campus"},
        {"item_key": "router_cisco", "item_name": "CISCO Core Edge Router", "unit_cost": Decimal("70000.00"), "yearly_quantities": {"2026": 0, "2027": 2, "2028": 2}, "project_key": "Buhi_Campus"},
        {"item_key": "switch_24", "item_name": "24-Port Managed Switch", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 0, "2027": 0, "2028": 1}, "project_key": "Buhi_Campus"},
        {"item_key": "patch_panel", "item_name": "24-Port Cat6 Patch Panel", "unit_cost": Decimal("3500.00"), "yearly_quantities": {"2026": 5, "2027": 2, "2028": 2}, "project_key": "Buhi_Campus"},
        {"item_key": "pc_standard", "item_name": "UPS Backup Power Unit", "unit_cost": Decimal("5000.00"), "yearly_quantities": {"2026": 4, "2027": 4, "2028": 4}, "project_key": "Buhi_Campus"},
        {"item_key": "ap_wifi6", "item_name": "Enterprise Wi-Fi 6 Access Point", "unit_cost": Decimal("10000.00"), "yearly_quantities": {"2026": 5, "2027": 5, "2028": 5}, "project_key": "Buhi_Campus"},
        {"item_key": "cable_utp_set", "item_name": "UTP Cat6 Cabling Box (305m)", "unit_cost": Decimal("6000.00"), "yearly_quantities": {"2026": 0, "2027": 1, "2028": 1}, "project_key": "Buhi_Campus"},
        {"item_key": "router_internet", "item_name": "Enterprise Internet Router", "unit_cost": Decimal("7000.00"), "yearly_quantities": {"2026": 2, "2027": 2, "2028": 2}, "project_key": "Buhi_Campus"},

        # PBAX Enhancement to Digital VOIP (2.6)
        {"item_key": "bay_rack", "item_name": "Bay Rack Unit", "unit_cost": Decimal("20000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}, "project_key": "VOIP"},

        # CATV Upgrade to SMART TV (2.7)
        {"item_key": "led_tv_classroom", "item_name": "Classroom Smart LED TV", "unit_cost": Decimal("40000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}, "project_key": "SMART_TV"},

        # Main Campus LAN Enhancement (2.8)
        {"item_key": "bay_rack", "item_name": "Bay Rack Unit", "unit_cost": Decimal("20000.00"), "yearly_quantities": {"2026": 6, "2027": 6, "2028": 6}, "project_key": "LAN_Enhancement"},
        {"item_key": "router_cisco", "item_name": "CISCO Core Edge Router", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 3, "2027": 10, "2028": 5}, "project_key": "LAN_Enhancement"},
        {"item_key": "switch_24", "item_name": "24-Port Managed Switch", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 3, "2027": 10, "2028": 5}, "project_key": "LAN_Enhancement"},

        # Computer Laboratories Enhancement (2.9)
        {"item_key": "pc_standard", "item_name": "Desktop Computer", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 302, "2027": 450, "2028": 450}, "project_key": "Computer_Labs"},
        {"item_key": "laptop_faculty", "item_name": "Laptop", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 5, "2027": 5, "2028": 10}, "project_key": "Computer_Labs"},
        {"item_key": "projector_standard", "item_name": "Standard Classroom Projector", "unit_cost": Decimal("30000.00"), "yearly_quantities": {"2026": 10, "2027": 10, "2028": 5}, "project_key": "Computer_Labs"},
        {"item_key": "heavy_duty_printer", "item_name": "Heavy Duty Network Workgroup Printer", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 5, "2027": 6, "2028": 20}, "project_key": "Computer_Labs"},
        {"item_key": "scanner_standard", "item_name": "Standard Office Scanner", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}, "project_key": "Computer_Labs"},
        {"item_key": "led_tv_classroom", "item_name": "Classroom Smart LED TV", "unit_cost": Decimal("40000.00"), "yearly_quantities": {"2026": 4, "2027": 15, "2028": 10}, "project_key": "Computer_Labs"},
        {"item_key": "bay_rack", "item_name": "Bay Rack Unit", "unit_cost": Decimal("20000.00"), "yearly_quantities": {"2026": 6, "2027": 6, "2028": 6}, "project_key": "Computer_Labs"},
        {"item_key": "router_cisco", "item_name": "CISCO Core Edge Router", "unit_cost": Decimal("70000.00"), "yearly_quantities": {"2026": 2, "2027": 6, "2028": 5}, "project_key": "Computer_Labs"},
        {"item_key": "switch_24", "item_name": "24-Port Managed Switch", "unit_cost": Decimal("30000.00"), "yearly_quantities": {"2026": 1, "2027": 5, "2028": 5}, "project_key": "Computer_Labs"},
        {"item_key": "pc_standard", "item_name": "Smart Card Reader", "unit_cost": Decimal("8000.00"), "yearly_quantities": {"2026": 5, "2027": 5, "2028": 5}, "project_key": "Computer_Labs"},

        # Data Center Enhancement (2.10)
        {"item_key": "pc_standard", "item_name": "Desktop Computer", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 2, "2027": 0, "2028": 0}, "project_key": "Data_Center"},
        {"item_key": "laptop_faculty", "item_name": "Laptop", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 1, "2027": 5, "2028": 5}, "project_key": "Data_Center"},
        {"item_key": "led_tv_classroom", "item_name": "Classroom Smart LED TV", "unit_cost": Decimal("40000.00"), "yearly_quantities": {"2026": 3, "2027": 3, "2028": 0}, "project_key": "Data_Center"},
        {"item_key": "bay_rack", "item_name": "Bay Rack Unit", "unit_cost": Decimal("20000.00"), "yearly_quantities": {"2026": 6, "2027": 6, "2028": 6}, "project_key": "Data_Center"},
        {"item_key": "switch_24", "item_name": "24-Port Managed Switch", "unit_cost": Decimal("100000.00"), "yearly_quantities": {"2026": 1, "2027": 2, "2028": 1}, "project_key": "Data_Center"},

        # CCTV Systems Integrate to Command Center (2.11)
        {"item_key": "pc_standard", "item_name": "Desktop Computer", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 2, "2027": 0, "2028": 0}, "project_key": "CCTV_Command_Center"},
        {"item_key": "led_tv_classroom", "item_name": "Classroom Smart LED TV", "unit_cost": Decimal("40000.00"), "yearly_quantities": {"2026": 1, "2027": 0, "2028": 0}, "project_key": "CCTV_Command_Center"},
        {"item_key": "bay_rack", "item_name": "Bay Rack Unit", "unit_cost": Decimal("20000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}, "project_key": "CCTV_Command_Center"},
        {"item_key": "heavy_duty_printer", "item_name": "Heavy Duty Network Workgroup Printer", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 0, "2027": 12, "2028": 10}, "project_key": "CCTV_Command_Center"},

        # Various CSPC Information System (2.13)
        {"item_key": "pc_standard", "item_name": "Desktop Computer", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 20, "2027": 0, "2028": 0}, "project_key": "Various_Systems"},
        {"item_key": "pc_standard", "item_name": "Barcode Reader", "unit_cost": Decimal("30000.00"), "yearly_quantities": {"2026": 10, "2027": 10, "2028": 10}, "project_key": "Various_Systems"},
        {"item_key": "pc_standard", "item_name": "Kiosk unit", "unit_cost": Decimal("50000.00"), "yearly_quantities": {"2026": 5, "2027": 10, "2028": 1}, "project_key": "Various_Systems"}
    ]

    for p in proposals_matrix:
        existing_p = db.query(Proposal).filter(
            Proposal.item_name == p["item_name"],
            Proposal.project_key == p["project_key"],
            Proposal.issp_period == baseline_period
        ).first()
        if not existing_p:
            db_p = Proposal(
                department_id=engineering_dept_id,
                issp_period=baseline_period,
                status=ProposalStatus.APPROVED,
                item_name=p["item_name"],
                item_key=p["item_key"],
                unit_cost=p["unit_cost"],
                yearly_quantities=p["yearly_quantities"],
                total_qty=sum(p["yearly_quantities"].values()),
                project_key=p["project_key"],
                payload={"comments": []},
                is_archived=False,
                s3_storage_class="STANDARD",
                is_restoring=False
            )
            db.add(db_p)

    # Multi-Year MOOE software subscriptions mapped from the guide
    subscriptions_matrix = [
        # Office Productivity
        {"software_name": "Office Productivity Subscription", "subscription_type": "Annual License", "justification": "Required license seat allocations to support college academic classrooms operations.", "annual_cost_per_user": Decimal("15000.00"), "yearly_users": {"2026": 40, "2027": 70, "2028": 60}, "project_key": "Office_Productivity"},
        {"software_name": "Office Productivity Training Program", "subscription_type": "Training", "justification": "Comprehensive skills enablement training for office automation applications.", "annual_cost_per_user": Decimal("10000.00"), "yearly_users": {"2026": 50, "2027": 50, "2028": 50}, "project_key": "Office_Productivity"},
        
        # Moodle LMS (2.1)
        {"software_name": "Moodle LMS Training Program", "subscription_type": "Training", "justification": "Enabling faculty coordinators and course managers to operate learning management platforms.", "annual_cost_per_user": Decimal("10000.00"), "yearly_users": {"2026": 5, "2027": 5, "2028": 5}, "project_key": "LMS"},

        # Technology for Education (2.4)
        {"software_name": "Tech for Ed Training Program", "subscription_type": "Training", "justification": "Training program to advance dynamic technical skills among educators.", "annual_cost_per_user": Decimal("10000.00"), "yearly_users": {"2026": 10, "2027": 10, "2028": 10}, "project_key": "Tech_for_Ed"},

        # Enhancement of Buhi Campus (2.5)
        {"software_name": "Buhi Campus Training Program", "subscription_type": "Training", "justification": "Skills training and enablement workshops for Buhi satellite operations staff.", "annual_cost_per_user": Decimal("10000.00"), "yearly_users": {"2026": 5, "2027": 5, "2028": 5}, "project_key": "Buhi_Campus"},

        # PBAX Enhancement (2.6)
        {"software_name": "PBAX Voip Training Program", "subscription_type": "Training", "justification": "Administrator training for central VOIP and digital telecommunications hardware.", "annual_cost_per_user": Decimal("10000.00"), "yearly_users": {"2026": 10, "2027": 10, "2028": 10}, "project_key": "VOIP"},

        # Computer Laboratories Enhancement (2.9)
        {"software_name": "Computer Labs Training Program", "subscription_type": "Training", "justification": "Hands-on training for system administrators and laboratory technicians.", "annual_cost_per_user": Decimal("10000.00"), "yearly_users": {"2026": 10, "2027": 10, "2028": 10}, "project_key": "Computer_Labs"}
    ]

    for s in subscriptions_matrix:
        db_s = SubscriptionProposal(
            department_id=engineering_dept_id,
            issp_period=baseline_period,
            status=ProposalStatus.APPROVED,
            subscription_type=s["subscription_type"],
            software_name=s["software_name"],
            justification=s["justification"],
            yearly_users=s["yearly_users"],
            annual_cost_per_user=s["annual_cost_per_user"],
            total_multiyear_mooe=sum(s["yearly_users"].values()) * s["annual_cost_per_user"],
            project_key=s["project_key"],
            payload={"comments": []},
            is_archived=False,
            s3_storage_class="STANDARD",
            is_restoring=False
        )
        db.add(db_s)

    # Multi-Year Continuing Costs mapped from the guide
    continuing_matrix = [
        {"item_description": "Internet Subscription (Main Campus)", "project_key": "Internet_Main", "unit_cost": Decimal("1500000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}},
        {"item_description": "Internet Subscription (Buhi Campus)", "project_key": "Internet_Buhi", "unit_cost": Decimal("15000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}},
        {"item_description": "Hosting Services", "project_key": "Hosting", "unit_cost": Decimal("40000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}},
        {"item_description": "Office Subscription", "project_key": "Office_License", "unit_cost": Decimal("800000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}},
        {"item_description": "Firewall Subscription", "project_key": "Firewall", "unit_cost": Decimal("500000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}},
        {"item_description": "Plagscan Subscription", "project_key": "Plagscan", "unit_cost": Decimal("500000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}},
        {"item_description": "Adobe Creative Cloud", "project_key": "Adobe", "unit_cost": Decimal("1000000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}},
        {"item_description": "SAP/SRP Software", "project_key": "SAP", "unit_cost": Decimal("1000000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}},
        {"item_description": "Library (e-Journal)", "project_key": "Library_Journal", "unit_cost": Decimal("700000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}},
        {"item_description": "Antivirus subscription", "project_key": "Antivirus", "unit_cost": Decimal("500000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}},
        {"item_description": "Network Monitoring Software", "project_key": "Monitoring", "unit_cost": Decimal("500000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}},
        {"item_description": "Windows Server OS licenses", "project_key": "Windows_Server", "unit_cost": Decimal("1000000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}},
        {"item_description": "Video Conferencing Account", "project_key": "Zoom", "unit_cost": Decimal("30000.00"), "yearly_quantities": {"2026": 1, "2027": 3, "2028": 3}},
        {"item_description": "MATLAB", "project_key": "Matlab", "unit_cost": Decimal("500000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}},
        {"item_description": "ETAP Software Simulator", "project_key": "ETAP", "unit_cost": Decimal("500000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}}
    ]

    for cc in continuing_matrix:
        db_cc = AnnualCostBreakdown(
            issp_period=baseline_period,
            project_key=cc["project_key"],
            cost_type="Continuing",
            item_description=cc["item_description"],
            unit_cost=cc["unit_cost"],
            yearly_quantities=cc["yearly_quantities"]
        )
        db.add(db_cc)

    seed_document_hierarchy(db)
    return dept_instances


def onboard_user(db, email, password, role_tag, dept_name, dept_instances):
    """
    Onboards or updates a specific user account under institutional domain restrictions.
    """
    parts = email.split('@')
    if len(parts) != 2 or parts[1] != "cspc.edu.ph":
        logger.error(f"Onboarding Blocked: '{email}' does not belong to the institutional domain 'cspc.edu.ph'.")
        return

    role_map = {
        "mis_admin": RoleTag.ROLE_MIS_ADMIN,
        "dept_user": RoleTag.ROLE_DEPT_USER,
        "ROLE_MIS_ADMIN": RoleTag.ROLE_MIS_ADMIN,
        "ROLE_DEPT_USER": RoleTag.ROLE_DEPT_USER
    }
    
    resolved_role = role_map.get(role_tag)
    if not resolved_role:
         raise ValueError(f"'{role_tag}' is not a valid seed role mapping.")

    dept_id = None
    if dept_name:
        dept = db.query(Department).filter(Department.name == dept_name).first()
        if not dept and dept_instances and dept_name in dept_instances:
            dept = dept_instances[dept_name]
        
        if dept:
            dept_id = dept.id
        else:
            logger.warning(f"Department '{dept_name}' not found; proceeding with unassociated user.")

    user = db.query(User).filter(User.email == email).first()
    salt = bcrypt.gensalt()
    hashed_pwd = bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    if not user:
        user = User(
            email=email,
            role_tag=resolved_role,
            department_id=dept_id,
            is_whitelisted=True,
            password_hash=hashed_pwd
        )
        db.add(user)
        logger.info(f"User account created successfully: '{email}' ({resolved_role.value})")
    else:
        user.password_hash = hashed_pwd
        user.role_tag = resolved_role
        user.department_id = dept_id
        logger.info(f"User account credentials and parameters updated: '{email}'")


def main():
    parser = argparse.ArgumentParser(description="Secure e-ISSP Database Seeder and Onboarding Utility")
    parser.add_argument("--seed-metadata", action="store_true", help="Seed baseline departments, catalog products, and planning cycles.")
    parser.add_argument("--create-user", action="store_true", help="Onboard a new institutional user or update an existing user profile.")
    parser.add_argument("--email", type=str, help="Institutional email address (@cspc.edu.ph).")
    parser.add_argument("--password", type=str, help="Password for user (defaults to settings.DEFAULT_SEED_PASSWORD if not specified).")
    parser.add_argument("--role", type=str, choices=["mis_admin", "dept_user"], help="Assigned user authorization role.")
    parser.add_argument("--department", type=str, help="Name of academic or administrative department to associate with user.")
    
    args = parser.parse_args()

    logger.info("Connecting to target database cluster...")
    engine = create_engine(settings.DATABASE_URL)
    
    if "sqlite" in settings.DATABASE_URL.lower():
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA foreign_keys=ON")
            except Exception:
                pass
            cursor.close()

    logger.info("Compiling and verifying database schema metadata...")
    Base.metadata.create_all(bind=engine)

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    try:
        dept_instances = {}
        
        # Unattended default run (e.g. initial infrastructure bootstrap deployment)
        if not args.seed_metadata and not args.create_user:
            logger.info("No explicit CLI flags specified. Bootstrapping baseline metadata & default accounts...")
            dept_instances = bootstrap_metadata(db)
            
            admin_email = os.getenv("SEED_ADMIN_EMAIL", "mis@cspc.edu.ph")
            onboard_user(
                db, 
                email=admin_email, 
                password=settings.DEFAULT_SEED_PASSWORD, 
                role_tag="mis_admin", 
                dept_name=None, 
                dept_instances=dept_instances
            )
            
            dept_user_email = os.getenv("SEED_DEPT_EMAIL") or "faculty.eng@cspc.edu.ph"
            onboard_user(
                db,
                email=dept_user_email,
                password=settings.DEFAULT_SEED_PASSWORD,
                role_tag="dept_user",
                dept_name="College of Engineering",
                dept_instances=dept_instances
            )
            
            db.commit()
            logger.info("Unattended database bootstrapping completed.")
            return

        # Explicit targeted CLI execution
        if args.seed_metadata:
            dept_instances = bootstrap_metadata(db)
            db.commit()

        if args.create_user:
            if not args.email:
                logger.error("CLI Execution Error: --email is required when --create-user is set.")
                sys.exit(1)
            
            password = args.password or settings.DEFAULT_SEED_PASSWORD
            role = args.role or "dept_user"
            
            onboard_user(db, args.email, password, role, args.department, dept_instances)
            db.commit()

    except Exception as e:
        db.rollback()
        logger.error(f"Critical seeding transaction failure: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
