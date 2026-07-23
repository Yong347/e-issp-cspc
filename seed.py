# seed.py
import os
import logging
import sys
import argparse
from decimal import Decimal
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
    IctStaffPosition
)
from app.config import settings

logging.basicConfig(level=logging.INFO, format="[SYSTEM] %(asctime)s - %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


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
        "College of Arts & Sciences",
        "College of Health Sciences",
        "College of Tourism",
        "College of Business Administration",
        "College of Education",
        "Human Resources Management"
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
        {"department_name": "College of Tourism", "degree_name": "Master in Hospitality Management", "level": "Graduate", "accreditation_status": "Candidate Status"},
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
        {"department_name": "College of Tourism", "degree_name": "Bachelor of Science in Tourism Management", "level": "Undergraduate", "accreditation_status": "Level II Re-Accredited"},
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
    catalog_items = [
        {
            "item_key": "pc_standard",
            "display_name": "Standard Office PC (Clerical)",
            "standard_unit_cost": Decimal("45000.00"),
            "category": "computing_devices",
            "allowed_offices": ["College of Engineering", "College of Computer Studies", "College of Arts & Sciences", "College of Health Sciences", "College of Tourism", "Human Resources Management"],
            "canvas_evidence_url": "/static/uploads/catalog/standard_pc_canvas.pdf",
            "supplier_name": "CSPC Central IT Distributor"
        },
        {
            "item_key": "laptop_faculty",
            "display_name": "Faculty Workstation Laptop",
            "standard_unit_cost": Decimal("50000.00"),
            "category": "computing_devices",
            "allowed_offices": ["College of Engineering", "College of Computer Studies", "College of Arts & Sciences"],
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
            "standard_unit_cost": Decimal("12000.00"),
            "category": "networking",
            "allowed_offices": ["College of Engineering", "College of Computer Studies", "College of Arts & Sciences"],
            "canvas_evidence_url": "/static/uploads/catalog/ap_wifi6_canvas.pdf",
            "supplier_name": "CSPC Cisco Network Partner"
        },
        {
            "item_key": "heavy_duty_printer",
            "display_name": "Heavy Duty Network Workgroup Printer",
            "standard_unit_cost": Decimal("25000.00"),
            "category": "printers_imaging",
            "allowed_offices": ["College of Engineering", "College of Computer Studies", "College of Arts & Sciences", "College_of_Tourism", "Human Resources Management"],
            "canvas_evidence_url": "/static/uploads/catalog/printer_heavy_canvas.pdf",
            "supplier_name": "CSPC Copier-Printer Hub"
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
                supplier_name=item["supplier_name"]
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
    
    strategic_concerns_data = [
        {"mfo": "Enrollment Services", "systems": "Student Information and Accounting System (SIAS)", "problems": "Delayed student enrollment processing and grading sync latency during semesters.", "intended_use": "SIAS Cloud deployment and local caching layers."},
        {"mfo": "Library Management", "systems": "Online Library Information System", "problems": "Difficulty tracking missing book circulation records in real-time.", "intended_use": "OPAC and Library Information DB integration."},
        {"mfo": "Monitoring & Security", "systems": "Security Management System", "problems": "Manual check-ins causing queues at entrances and parking spaces.", "intended_use": "Smart Card reader gates and central log DB."},
        {"mfo": "Human Resources", "systems": "HRMS / Payroll System", "problems": "Biometrics mismatch requiring manual DTR corrections.", "intended_use": "Central biometrics verification system."},
        {"mfo": "Supply Management", "systems": "Supplies Management System", "problems": "Archival and retrieval of records are slow, stock room is small.", "intended_use": "Database tracking of inventory requisitions."}
    ]

    pmf_matrix_data = [
        {"project_title": "Deployment of Moodle LMS", "result_hierarchy": "Immediate outcome", "indicator": "Percentage of courses using the LMS", "baseline": "10% of courses", "target": "100% adoption", "collection_method": "Survey/Logs", "responsibility": "MICT Office"},
        {"project_title": "Upgrade Leased Line Internet Bandwidth", "result_hierarchy": "Immediate outcome", "indicator": "Average bandwidth speed in administrative offices", "baseline": "20 Mbps", "target": "100 Mbps", "collection_method": "Speed test logs", "responsibility": "MICT Office"},
        {"project_title": "WiFi Campus Network Installation", "result_hierarchy": "Outputs", "indicator": "Percentage of using WiFi for teaching-learning process", "baseline": "30%", "target": "100%", "collection_method": "Network logs", "responsibility": "MICT Office"}
    ]

    systems_data = [
        {"name": "Student Information and Accounting System (SIAS)", "description": "Handles online student registration, grading, and accounting ledger management.", "status": "For Enhancement", "dev_strategy": "Outsourced / Service Provider", "computing_scheme": "Cloud Computing", "users_internal": "Students, Faculty, Registrars", "users_external": "DICT, CHED", "owners": "MICT Office"},
        {"name": "Online Library Information Systems", "description": "System to manage the books library collections, records tracking, and online OPAC search access.", "status": "For Enhancement", "dev_strategy": "In-house Development", "computing_scheme": "Web Server", "users_internal": "Librarian, Library Staff", "users_external": "Students, Faculty, Outside Researches", "owners": "CSPC Library"},
        {"name": "School Monitoring and Security System", "description": "System using CCTV cameras, RFIDs, and smart cards to secure facilities and monitor vehicles.", "status": "For Development", "dev_strategy": "Outsourced / Service Provider", "computing_scheme": "Cloud Computing", "users_internal": "Guards, MIS Staff, Administrators", "users_external": "None", "owners": "VP for Administration"},
        {"name": "Human Resource Management System", "description": "Directly links biometric attendance data, automatically calculates time cards, and interfaces with the payroll system.", "status": "For Enhancement", "dev_strategy": "Outsourced / Service Provider", "computing_scheme": "Cloud Computing", "users_internal": "HRMO, HRMO Staff, Accountant, Accounting Staff", "users_external": "CHED, CSC", "owners": "Human Resource Management Office"}
    ]

    databases_data = [
        {"name": "SIAS Database", "description": "Stores student demographics, grades, accounting receipts, and curriculum mapping.", "status": "Existing", "is_served": "Student Information and Accounting System (SIAS)", "storage_media": "High-End Data Storage Server", "owners": "Registrar's Office"},
        {"name": "Online Library Information Systems Database", "description": "Stores book metadata, borrow transactions, registries, and fine calculations.", "status": "Existing", "is_served": "Online Library Information Systems", "storage_media": "High-End Data Storage Server", "owners": "Library Services Unit"},
        {"name": "School Monitoring and Security Database", "description": "Stores security footage logs, gate visitor logs, RFID associations, and access permissions.", "status": "Proposed", "is_served": "School Monitoring and Security System", "storage_media": "High-End Data Storage Server", "owners": "Office of the VP for Administration"},
        {"name": "Human Resource Management Database", "description": "Stores employee profiles, biometric signatures, tax records, and payroll sheets.", "status": "Proposed", "is_served": "Human Resource Management System", "storage_media": "High-End Data Storage Server", "owners": "Human Resource Management Office"}
    ]

    internal_projects_data = [
        {"name": "Deployment of Moodle LMS", "objectives": "To allow distance teaching and learning\\nTo automate grade computations", "duration": "2026 - 2028", "deliverables": "Online Learning Space (LeOnS)"},
        {"name": "Upgrade Leased Line Bandwidth", "objectives": "To provide more efficient online transactions\\nTo support online distance learning", "duration": "2026 - 2028", "deliverables": "Leased Line Internet"},
        {"name": "WiFi Campus Network Installation", "objectives": "To ensure the availability of wireless connection\\nTo help students and teachers in fast access", "duration": "2026 - 2028", "deliverables": "WiFi Campus Network"},
        {"name": "Technology for Education Installation", "objectives": "To support the learning of students through easily accessible resources", "duration": "2026 - 2028", "deliverables": "Technology for Education"}
    ]

    if not narrative:
        narrative = MasterNarrative(
            issp_period=baseline_period,
            agency_name="Camarines Sur Polytechnic Colleges",
            issp_period_from=2026,
            issp_period_to=2028,
            is_active=True,
            signatory_prepared_by="IAN P. BENITEZ, DIT",
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
            
            mandate_html="""<p>The College mandate is defined under Section 2 of Batas Pambansa Bilang 512, the law which created the Camarines Sur Polytechnic Colleges (CSPC). BP 512 provides: "The Camarines Sur Polytechnic Colleges shall primarily provide higher technological, professional and vocational instruction and training in fisheries, trade and technology, arts and sciences, and as well as promote research, history, extension services, and progressive leadership in these fields."</p>""",
            vision_html="Polytechnic education at its best for the Bicolanos",
            mission_html="Transforming lives to be free of poverty by creating a better future through world class polytechnic education and technological innovation.",
            
            present_situation_html="""<p><strong>Online Student Information and Accounting System (SIAS):</strong> High load bottlenecks during registration. The system handles enrollment, grades, and accounting, but requires cloud deployment and optimization to reduce grading latency. <strong>Human Resource Information System (HRIS):</strong> Requires dynamic biometric integration. The college website is functional, but lacks advanced search structures. Computer-to-employee ratio is 1:1, with a 99% computer literacy rate.</p>""",
            
            planners_json=[
                {"name": "DR. IAN P. BENITEZ", "position": "Associate Professor V / Director, MICTC", "email": "ianbenitez@cspc.edu.ph", "contact_number": "09190840018"},
                {"name": "VINCENT B. CORTEZ", "position": "Instructor / Head, MIS", "email": "vincentcortez@cspc.edu.ph", "contact_number": "09304821749"}
            ],
            manpower_json={
                "admin_regular": 53,
                "admin_casual": 24,
                "academic_regular": 217,
                "academic_casual": 30,
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
            StrategicConcern.critical_system == concern["systems"],
            StrategicConcern.issp_period == baseline_period
        ).first()
        if not existing_concern:
            db_concern = StrategicConcern(
                issp_period=baseline_period,
                mfo=concern["mfo"],
                critical_system=concern["systems"],
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
        "College of Arts & Sciences": Decimal("5000000.00"),
        "College of Health Sciences": Decimal("4000000.00"),
        "College of Tourism": Decimal("3000000.00"),
        "College of Business Administration": Decimal("5000000.00"),
        "College of Education": Decimal("4000000.00"),
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