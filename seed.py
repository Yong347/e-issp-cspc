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
    ScopeChoice
)
from app.config import settings

logging.basicConfig(level=logging.INFO, format="[SYSTEM] %(asctime)s - %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def bootstrap_metadata(db):
    """
    Seeds static institutional metadata including academic/support departments,
    baseline standardized DICT catalog items, and the master planning narrative.
    """
    logger.info("Seeding CSPC academic and support departments...")
    departments_to_seed = [
        "College of Engineering",
        "College of Computer Studies",
        "College of Arts & Sciences",
        "College of Health Sciences",
        "College of Tourism",
        "Human Resources Management"
    ]

    dept_instances = {}
    for name in departments_to_seed:
        dept = db.query(Department).filter(Department.name == name).first()
        if not dept:
            dept = Department(name=name)
            db.add(dept)
            db.flush()
            logger.info(f"Department created: '{name}'")
        dept_instances[name] = dept

    # ==========================================================
    # ANNEX A-4 STRUCTURAL SEEDS
    # ==========================================================
    logger.info("Seeding Annex A-4 Graduate and Undergraduate Degree offerings...")
    academic_programs = [
        {"department_name": "College of Engineering", "degree_name": "Master of Engineering (ME)", "level": "Graduate", "accreditation_status": "Level III Re-Accredited"},
        {"department_name": "College of Engineering", "degree_name": "Bachelor of Science in Civil Engineering", "level": "Undergraduate", "accreditation_status": "Level III Re-Accredited"},
        {"department_name": "College of Engineering", "degree_name": "Bachelor of Science in Electrical Engineering", "level": "Undergraduate", "accreditation_status": "Level III Re-Accredited"},
        {"department_name": "College of Engineering", "degree_name": "Bachelor of Science in Mechanical Engineering", "level": "Undergraduate", "accreditation_status": "Level II Re-Accredited"},
        {"department_name": "College of Computer Studies", "degree_name": "Master in Information Technology (MIT)", "level": "Graduate", "accreditation_status": "Candidate Status"},
        {"department_name": "College of Computer Studies", "degree_name": "Bachelor of Science in Information Technology", "level": "Undergraduate", "accreditation_status": "Level IV Re-Accredited"},
        {"department_name": "College of Computer Studies", "degree_name": "Bachelor of Science in Computer Science", "level": "Undergraduate", "accreditation_status": "Level III Re-Accredited"},
        {"department_name": "College of Health Sciences", "degree_name": "Bachelor of Science in Nursing", "level": "Undergraduate", "accreditation_status": "Level III Re-Accredited"},
        {"department_name": "College of Tourism", "degree_name": "Bachelor of Science in Tourism Management", "level": "Undergraduate", "accreditation_status": "Level II Re-Accredited"}
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
        {"indicator_name": "Percentage of undergraduate programs with COPC or accreditation status", "target_value": "90%"}
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
    # COMPLETE COMPLIANCE CORE OFFICE FUNCTIONS (ANNEX A-3)
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
        {"id": 16, "office_name": "Physical Plant and Facilities", "description": "Manages physical construction, network cabling routes, electrical setups, and grounds maintenance.", "division": "Support"},
        {"id": 17, "office_name": "Security Office", "description": "Manages campus security, guards assignments, smart card logging, and emergency response.", "division": "Support"},
        {"id": 18, "office_name": "Guidance and Counseling", "description": "Offers mental health support, career placements, and guidance counseling for students.", "division": "Support"},
        {"id": 19, "office_name": "Student Affairs and Services", "description": "Supervises student organizations, student publications, and extracurricular events.", "division": "Support"},
        {"id": 20, "office_name": "Quality Assurance Office", "description": "Evaluates curriculum systems and certifies compliance with ISO 9001:2015 criteria.", "division": "Administration"},
        {"id": 21, "office_name": "Internal Audit Services", "description": "Evaluates operational control structures and audits procedural compliance across divisions.", "division": "Administration"},
        {"id": 22, "office_name": "Legal Affairs Office", "description": "Provides legal counsel, drafts agreements, and represents the SUC in administrative cases.", "division": "Administration"},
        {"id": 23, "office_name": "Gender and Development Office", "description": "Maintains equality initiatives and enforces gender-fair practices across academic units.", "division": "Support"},
        {"id": 24, "office_name": "Records and Archives Office", "description": "Secures institutional document registers, records files, and historical archives.", "division": "Administration"},
        {"id": 25, "office_name": "College of Engineering (Office of the Dean)", "description": "Manages BS Civil, BS Electrical, and BS Mechanical engineering program curricula.", "division": "Academic"},
        {"id": 26, "office_name": "College of Computer Studies (Office of the Dean)", "description": "Supervises BS Information Technology and BS Computer Science program curricula.", "division": "Academic"},
        {"id": 27, "office_name": "College of Arts and Sciences (Office of the Dean)", "description": "Supervises liberal arts curricula and general mathematics courses.", "division": "Academic"},
        {"id": 28, "office_name": "College of Health Sciences (Office of the Dean)", "description": "Supervises Nursing program curricula and clinical training setups.", "division": "Academic"},
        {"id": 29, "office_name": "College of Tourism (Office of the Dean)", "description": "Supervises Tourism and hospitality management program curricula.", "division": "Academic"},
        {"id": 30, "office_name": "Extension Services Office", "description": "Designs and executes community development and technical skills transfer programs.", "division": "Research"},
        {"id": 31, "office_name": "Research and Development Office", "description": "Coordinates academic research programs and administers institutional research grants.", "division": "Research"},
        {"id": 32, "office_name": "Publications and Media Office", "description": "Coordinates the publication of research journals, academic newsletters, and college books.", "division": "Research"},
        {"id": 33, "office_name": "Intellectual Property Office", "description": "Coordinates technology transfer and files patent claims with IPOPHL.", "division": "Research"},
        {"id": 34, "office_name": "Alumni Affairs Office", "description": "Coordinates alumni tracking, updates tracer registries, and runs graduate surveys.", "division": "Support"},
        {"id": 35, "office_name": "Public Relations Office", "description": "Coordinates SUC press releases and updates social media channels.", "division": "Administration"},
        {"id": 36, "office_name": "Planning and Development Office", "description": "Formulates institutional land use development plans and coordinates SUC master plans.", "division": "Administration"},
        {"id": 37, "office_name": "Scholarship and Financial Assistance", "description": "Administers scholarship funds and processes student financial aid records.", "division": "Support"},
        {"id": 38, "office_name": "Sports and Physical Education", "description": "Coordinates physical education courses and manages campus athletic equipment.", "division": "Support"},
        {"id": 39, "office_name": "Culture and Arts Department", "description": "Manages institutional musical bands, student chorales, and cultural dance groups.", "division": "Support"},
        {"id": 40, "office_name": "MIS Unit", "description": "Manages core administrative databases, processes payroll systems, and secures SUC ledgers.", "division": "Technical Operations"},
        {"id": 41, "office_name": "Network and Infrastructure Unit", "description": "Manages fiber backbones, configures campus Wi-Fi, and secures firewalls.", "division": "Technical Operations"}
    ]

    baseline_period = "2026-2028"
    logger.info(f"Seeding full DICT-compliant Master Narrative for cycle '{baseline_period}'...")
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == baseline_period).first()
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
            
            mandate_html="""<p>The College mandate is defined under Section 2 of Batas Pambansa Bilang 512, the law which created the Camarines Sur Polytechnic Colleges (CSPC). BP 512 provides: "The Camarines Sur Polytechnic Colleges shall primarily provide higher technological, professional and vocational instruction and training in fisheries, trade and technology, arts and sciences, and as well as promote research, history, extension services, and progressive leadership in these fields."</p>""",
            vision_html="Polytechnic education at its best for the Bicolanos",
            mission_html="Transforming lives to be free of poverty by creating a better future through world class polytechnic education and technological innovation.",
            
            present_situation_html="""<p><strong>Online Student Information and Accounting System (SIAS):</strong> High load bottlenecks during registration. The system handles enrollment, grades, and accounting, but requires cloud deployment and optimization to reduce grading latency. <strong>Human Resource Information System (HRIS):</strong> Requires dynamic biometric integration. The college website is functional, but lacks advanced search structures. Computer-to-employee ratio is 1:1, with a 99% computer literacy rate.</p>""",
            
            planners_json=[
                {"name": "DR. IAN P. BENITEZ", "position": "Associate Professor V / Director, MICTC", "email": "ianbenitez@cspc.edu.ph", "contact_number": "09190840018"},
                {"name": "VINCENT B. CORTEZ", "position": "Instructor / Head, MIS", "email": "vincentcortez@cspc.edu.ph", "contact_number": "09304821749"},
                {"name": "REY T. CORTEZ", "position": "Instructor / Head, NICM", "email": "reytcortez@cspc.edu.ph", "contact_number": "09124469837"},
                {"name": "JUNIESEL C. PASCUAL", "position": "Admin Aide V / Head, Repair and Maintenance", "email": "jampascual@cspc.edu.ph", "contact_number": "09070626816"},
                {"name": "KAELA MARIE N. FORTUNO", "position": "Instructor / Database Administrator", "email": "kfortuno@cspc.edu.ph", "contact_number": "09289764863"}
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
            
            # Strategic Concerns Matrix
            strategic_concerns_json=[
                {"mfo": "Enrollment Services", "systems": "Student Information and Accounting System (SIAS)", "problems": "Delayed student enrollment processing and grading sync latency during semesters.", "intended_use": "SIAS Cloud deployment and local caching layers."},
                {"mfo": "Library Management", "systems": "Online Library Information System", "problems": "Difficulty tracking missing book circulation records in real-time.", "intended_use": "OPAC and Library Information DB integration."},
                {"mfo": "Monitoring & Security", "systems": "Security Management System", "problems": "Manual check-ins causing queues at entrances and parking spaces.", "intended_use": "Smart Card reader gates and central log DB."},
                {"mfo": "Human Resources", "systems": "HRMS / Payroll System", "problems": "Biometrics mismatch requiring manual DTR corrections.", "intended_use": "Central biometrics verification system."},
                {"mfo": "Event Management", "systems": "EMS / Online Portal", "problems": "Double-booking of university facilities during events.", "intended_use": "Online facility booking and event calendar system."},
                {"mfo": "Records & Documents", "systems": "Document Management System", "problems": "Delayed routing of paper documents between departments.", "intended_use": "Digital document signing and tracking system."},
                {"mfo": "Inventory & Supply", "systems": "Supply Office Inventory System", "problems": "Discrepancies in tracking obsolete equipment counts.", "intended_use": "Dynamic inventory system with QR tracking."},
                {"mfo": "Budget Management", "systems": "Financial Management System", "problems": "Manual budget tracking causing delayed budget alignments.", "intended_use": "Central accounting system with ceiling limits."},
                {"mfo": "Extension Services", "systems": "Extension Portal", "problems": "Manual aggregation of community extension service hours.", "intended_use": "Extension portal tracking and reporting."},
                {"mfo": "Research Services", "systems": "E-Research Portal", "problems": "Difficult to access and verify published research journals.", "intended_use": "E-Research indexing database and access control."}
            ],
            
            # Proposed Systems Profile
            systems_json=[
                {"name": "Student Information and Accounting System (SIAS)", "description": "Handles online student registration, grading, and accounting ledger management.", "status": "For Enhancement", "dev_strategy": "Outsourced / Service Provider", "computing_scheme": "Cloud Computing", "users_internal": "Students, Faculty, Registrars", "users_external": "DICT, CHED", "owners": "MICT Office"},
                {"name": "Online Library System", "description": "Manages book catalogs, book circulations, and OPAC digital reference assets.", "status": "For Development", "dev_strategy": "In-house Developed", "computing_scheme": "Hybrid Scheme", "users_internal": "Librarians, Students, Faculty", "users_external": "Community researchers", "owners": "Library Services"},
                {"name": "Security Management System", "description": "Handles campus smart card check-ins, vehicle logs, and security tracking.", "status": "For Development", "dev_strategy": "In-house Developed", "computing_scheme": "Local Network Scheme", "users_internal": "Security Guards, Administrative staff", "users_external": "Visitors, Vehicles", "owners": "Security Office"},
                {"name": "Human Resource Management System (HRMS)", "description": "Handles HR records, manages payroll structures, and automates DTR processing.", "status": "For Enhancement", "dev_strategy": "In-house Developed", "computing_scheme": "Hybrid Scheme", "users_internal": "HR staff, SUC employees", "users_external": "None", "owners": "HRM Office"},
                {"name": "Document Management System (DMS)", "description": "Coordinates document scanning, digital signatures, and dynamic document routing.", "status": "For Development", "dev_strategy": "In-house Developed", "computing_scheme": "Cloud Computing", "users_internal": "All SUC departments", "users_external": "None", "owners": "Records Office"},
                {"name": "Supply Office Inventory System (SOIS)", "description": "Coordinates QR code inventory tagging and monitors unserviceable reports.", "status": "For Development", "dev_strategy": "In-house Developed", "computing_scheme": "Local Network Scheme", "users_internal": "Supply staff, SUC property officers", "users_external": "None", "owners": "Supply and Property Unit"},
                {"name": "Extension Services Portal", "description": "Tracks extension training programs, and aggregates community hours.", "status": "For Development", "dev_strategy": "In-house Developed", "computing_scheme": "Cloud Computing", "users_internal": "Extension officers, SUC faculty", "users_external": "Community partners", "owners": "Extension Services Office"},
                {"name": "E-Research Indexing Portal", "description": "Tracks research journal submissions, publication approvals, and intellectual property records.", "status": "For Development", "dev_strategy": "In-house Developed", "computing_scheme": "Cloud Computing", "users_internal": "Research directors, SUC faculty", "users_external": "External researchers", "owners": "Research Office"},
                {"name": "Unified Financial Management System", "description": "Coordinates SUC accounting ledgers, tracks budget limits, and runs budget validation checks.", "status": "For Enhancement", "dev_strategy": "Outsourced / Service Provider", "computing_scheme": "Hybrid Scheme", "users_internal": "Accounting staff, Budget officers", "users_external": "COA auditors, DBM", "owners": "Accounting Office"}
            ],
            
            # Databases Required
            databases_json=[
                {"name": "SIAS Database", "description": "Stores student demographics, grades, accounting receipts, and curriculum mapping.", "status": "Existing", "is_served": "Student Information and Accounting System (SIAS)", "storage_media": "High-End Data Storage Server", "owners": "Registrar's Office"},
                {"name": "Library Database", "description": "Stores digital book catalogs, borrower records, and reference logs.", "status": "Proposed", "is_served": "Online Library System", "storage_media": "Local Server and Cloud Backup", "owners": "Library Services"},
                {"name": "School Monitoring Database", "description": "Stores smart card scans, security guard logs, and visitor access records.", "status": "Proposed", "is_served": "Security Management System", "storage_media": "On-premise NAS server", "owners": "Security Office"},
                {"name": "HRMS Database", "description": "Stores employee profiles, biometric logs, salary grades, and DTR records.", "status": "Existing", "is_served": "Human Resource Management System (HRMS)", "storage_media": "Local Server and Cloud Backup", "owners": "HRM Office"},
                {"name": "Supply Database", "description": "Stores SUC asset inventories, equipment status, and unserviceable reports.", "status": "Proposed", "is_served": "Supply Office Inventory System (SOIS)", "storage_media": "Local Server", "owners": "Supply and Property Unit"},
                {"name": "Document Database", "description": "Stores digital document registers, routing history, and digital signatures.", "status": "Proposed", "is_served": "Document Management System (DMS)", "storage_media": "Secure Cloud Storage", "owners": "Records Office"},
                {"name": "Extension Database", "description": "Stores extension project milestones, community demographics, and training logs.", "status": "Proposed", "is_served": "Extension Services Portal", "storage_media": "Cloud Database", "owners": "Extension Services Office"},
                {"name": "E-Research Database", "description": "Stores published journal articles, researcher profiles, and IPO claims.", "status": "Proposed", "is_served": "E-Research Indexing Portal", "storage_media": "Cloud Database", "owners": "Research Office"}
            ],
            
            # SUC ICT Projects
            internal_projects_json=[
                {"name": "Deployment of Moodle LMS", "objectives": "To allow distance teaching and learning\\nTo automate grade computations", "duration": "2026 - 2028", "deliverables": "Online Learning Space (LeOnS)"},
                {"name": "Upgrade Leased Line Internet Bandwidth", "objectives": "To provide efficient online transaction speed", "duration": "2026 - 2028", "deliverables": "Leased Line Internet"},
                {"name": "CSPC Campus WiFi Installation", "objectives": "To provide high-speed WiFi connections across campus", "duration": "2026 - 2028", "deliverables": "Enterprise WiFi network"},
                {"name": "Technology for Education Classrooms", "objectives": "To setup modern interactive classrooms for teaching", "duration": "2026 - 2028", "deliverables": "Smart TV configurations"},
                {"name": "Buhi Campus Network Infrastructure Setup", "objectives": "To connect satellite campus facilities with Nabua LAN", "duration": "2026 - 2028", "deliverables": "Buhi Campus Fiber Link"},
                {"name": "Digital VOIP System", "objectives": "To upgrade legacy analog phones with digital VOIP routing", "duration": "2026 - 2028", "deliverables": "Digital Intercom system"},
                {"name": "Smart TV CATV Campus Network", "objectives": "To deploy digital information monitors across colleges", "duration": "2026 - 2028", "deliverables": "Digital TV signage system"},
                {"name": "Main Campus LAN Upgrade", "objectives": "To route optical fiber cables to academic buildings", "duration": "2026 - 2028", "deliverables": "Upgraded fiber network links"},
                {"name": "Advanced Computing Laboratories", "objectives": "To configure modern computer lab setups for CS/IT students", "duration": "2026 - 2028", "deliverables": "Upgraded computer laboratories"},
                {"name": "CSPC Micro Data Center Build", "objectives": "To construct secure physical server rooms for local backlogs", "duration": "2026 - 2028", "deliverables": "On-premise Server Room"},
                {"name": "Campus-Wide CCTV Security Surveillance", "objectives": "To mount IP surveillance cameras in security zones", "duration": "2026 - 2028", "deliverables": "Physical security network"},
                {"name": "Multimedia Center Development", "objectives": "To setup digital editing labs for publications division", "duration": "2026 - 2028", "deliverables": "Upgraded multimedia editing suites"}
            ],
            cross_projects_json=[],
            
            # Performance Measurement Frameworks
            pmf_matrix_json=[
                {"project_title": "Deployment of Moodle LMS", "result_hierarchy": "Immediate outcome", "indicator": "Percentage of courses using the LMS", "baseline": "10% of courses", "target": "100% adoption", "collection_method": "Survey/Logs", "responsibility": "MICT Office"},
                {"project_title": "Upgrade Leased Line Internet Bandwidth", "result_hierarchy": "Immediate outcome", "indicator": "Average bandwidth speed in administrative offices", "baseline": "20 Mbps", "target": "100 Mbps", "collection_method": "Speed test logs", "responsibility": "MICT Office"},
                {"project_title": "CSPC Campus WiFi Installation", "result_hierarchy": "Immediate outcome", "indicator": "Percentage of campus covered by active Wi-Fi zones", "baseline": "30% coverage", "target": "100% coverage", "collection_method": "Signal mapping logs", "responsibility": "MICT Office"},
                {"project_title": "Technology for Education Classrooms", "result_hierarchy": "Immediate outcome", "indicator": "Number of smart interactive classrooms deployed", "baseline": "2 rooms", "target": "20 rooms", "collection_method": "Physical inventory", "responsibility": "MICT Office"},
                {"project_title": "Buhi Campus Network Infrastructure Setup", "result_hierarchy": "Immediate outcome", "indicator": "Buhi Campus network bandwidth throughput", "baseline": "5 Mbps", "target": "50 Mbps", "collection_method": "Bandwidth speed tests", "responsibility": "Buhi Campus Office"},
                {"project_title": "Digital VOIP System", "result_hierarchy": "Immediate outcome", "indicator": "Number of departments connected with active VOIP setups", "baseline": "0 units", "target": "40 departments", "collection_method": "Technical checklists", "responsibility": "MICT Office"},
                {"project_title": "Smart TV CATV Campus Network", "result_hierarchy": "Immediate outcome", "indicator": "Number of digital signage units active in colleges", "baseline": "0 units", "target": "15 units", "collection_method": "Physical inventory", "responsibility": "MICT Office"},
                {"project_title": "Main Campus LAN Upgrade", "result_hierarchy": "Immediate outcome", "indicator": "Percentage of main campus buildings connected by fiber", "baseline": "40% buildings", "target": "100% buildings", "collection_method": "Network layout maps", "responsibility": "MICT Office"},
                {"project_title": "Advanced Computing Laboratories", "result_hierarchy": "Immediate outcome", "indicator": "Ratio of modern workstations to computer laboratory students", "baseline": "1:3", "target": "1:1", "collection_method": "Laboratory census logs", "responsibility": "MICT Office"},
                {"project_title": "CSPC Micro Data Center Build", "result_hierarchy": "Immediate outcome", "indicator": "Security compliance certification of physical server rooms", "baseline": "Not certified", "target": "Certified", "collection_method": "Quality assurance audit", "responsibility": "MICT Office"},
                {"project_title": "Campus-Wide CCTV Security Surveillance", "result_hierarchy": "Immediate outcome", "indicator": "Security incidents recorded and resolved via camera logs", "baseline": "10% incidents", "target": "95% incidents", "collection_method": "Security logbooks", "responsibility": "Security Office"},
                {"project_title": "Multimedia Center Development", "result_hierarchy": "Immediate outcome", "indicator": "Number of university journals formatted in editing labs", "baseline": "2 issues", "target": "12 issues", "collection_method": "Publications index", "responsibility": "Publications Office"}
            ],
            
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
                {"solution_name": "Geographic Information System", "is_used": True, "maintenance_cost": 25000.00},
                {"solution_name": "Online Payment Gateway Integration", "is_used": True, "maintenance_cost": 50000.00},
                {"solution_name": "Dynamic Biometrics Fingerprint Synchronization", "is_used": True, "maintenance_cost": 35000.00}
            ],
            mithi_data_center={
                "has_data_center": True,
                "data_center_count": 2,
                "has_backup_site": True,
                "maintenance_strategy": "In-house with third-party escalations"
            },
            
            # Baseline Equipment Inventory
            mithi_hardware_inventory=[
                {
                    "device_type": "Desktop PC",
                    "yearly_owned": {"2026": 120, "2027": 150, "2028": 180},
                    "yearly_leased": {"2026": 0, "2027": 0, "2028": 0},
                    "older_than_3_years": 45
                },
                {
                    "device_type": "Workstation Laptop",
                    "yearly_owned": {"2026": 80, "2027": 100, "2028": 110},
                    "yearly_leased": {"2026": 0, "2027": 0, "2028": 0},
                    "older_than_3_years": 12
                },
                {
                    "device_type": "High-End Server",
                    "yearly_owned": {"2026": 4, "2027": 6, "2028": 8},
                    "yearly_leased": {"2026": 0, "2027": 0, "2028": 0},
                    "older_than_3_years": 2
                }
            ],
            
            # Schedules
            implementation_schedules=[
                {
                    "project_id": "00000000-0000-0000-0000-000000000001",
                    "project_name": "Deployment of Moodle LMS",
                    "milestones": {"2026_Q1": True, "2026_Q2": True, "2026_Q3": True, "2026_Q4": True, "2027_Q1": True, "2027_Q2": True, "2027_Q3": True, "2027_Q4": True, "2028_Q1": True, "2028_Q2": True, "2028_Q3": True, "2028_Q4": True}
                },
                {
                    "project_id": "00000000-0000-0000-0000-000000000002",
                    "project_name": "Upgrade Leased Line Internet Bandwidth",
                    "milestones": {"2026_Q1": True, "2026_Q2": True, "2026_Q3": True, "2026_Q4": True, "2027_Q1": True, "2027_Q2": True, "2027_Q3": True, "2027_Q4": True, "2028_Q1": True, "2028_Q2": True, "2028_Q3": True, "2028_Q4": True}
                },
                {
                    "project_id": "00000000-0000-0000-0000-000000000003",
                    "project_name": "CSPC Campus WiFi Installation",
                    "milestones": {"2026_Q1": True, "2026_Q2": True, "2026_Q3": True, "2026_Q4": True, "2027_Q1": True, "2027_Q2": True, "2027_Q3": True, "2027_Q4": True, "2028_Q1": True, "2028_Q2": True, "2028_Q3": True, "2028_Q4": True}
                },
                {
                    "project_id": "00000000-0000-0000-0000-000000000004",
                    "project_name": "Technology for Education Classrooms",
                    "milestones": {"2026_Q1": True, "2026_Q2": True, "2026_Q3": True, "2026_Q4": True, "2027_Q1": True, "2027_Q2": True, "2027_Q3": True, "2027_Q4": True, "2028_Q1": True, "2028_Q2": True, "2028_Q3": True, "2028_Q4": True}
                },
                {
                    "project_id": "00000000-0000-0000-0000-000000000005",
                    "project_name": "Buhi Campus Network Infrastructure Setup",
                    "milestones": {"2026_Q1": True, "2026_Q2": True, "2026_Q3": True, "2026_Q4": True, "2027_Q1": True, "2027_Q2": True, "2027_Q3": True, "2027_Q4": True, "2028_Q1": True, "2028_Q2": True, "2028_Q3": True, "2028_Q4": True}
                },
                {
                    "project_id": "00000000-0000-0000-0000-000000000006",
                    "project_name": "Digital VOIP System",
                    "milestones": {"2026_Q1": True, "2026_Q2": True, "2026_Q3": True, "2026_Q4": True, "2027_Q1": True, "2027_Q2": True, "2027_Q3": True, "2027_Q4": True, "2028_Q1": True, "2028_Q2": True, "2028_Q3": True, "2028_Q4": True}
                },
                {
                    "project_id": "00000000-0000-0000-0000-000000000007",
                    "project_name": "Smart TV CATV Campus Network",
                    "milestones": {"2026_Q1": True, "2026_Q2": True, "2026_Q3": True, "2026_Q4": True, "2027_Q1": True, "2027_Q2": True, "2027_Q3": True, "2027_Q4": True, "2028_Q1": True, "2028_Q2": True, "2028_Q3": True, "2028_Q4": True}
                },
                {
                    "project_id": "00000000-0000-0000-0000-000000000008",
                    "project_name": "Main Campus LAN Upgrade",
                    "milestones": {"2026_Q1": True, "2026_Q2": True, "2026_Q3": True, "2026_Q4": True, "2027_Q1": True, "2027_Q2": True, "2027_Q3": True, "2027_Q4": True, "2028_Q1": True, "2028_Q2": True, "2028_Q3": True, "2028_Q4": True}
                },
                {
                    "project_id": "00000000-0000-0000-0000-000000000009",
                    "project_name": "Advanced Computing Laboratories",
                    "milestones": {"2026_Q1": True, "2026_Q2": True, "2026_Q3": True, "2026_Q4": True, "2027_Q1": True, "2027_Q2": True, "2027_Q3": True, "2027_Q4": True, "2028_Q1": True, "2028_Q2": True, "2028_Q3": True, "2028_Q4": True}
                },
                {
                    "project_id": "00000000-0000-0000-0000-000000000010",
                    "project_name": "CSPC Micro Data Center Build",
                    "milestones": {"2026_Q1": True, "2026_Q2": True, "2026_Q3": True, "2026_Q4": True, "2027_Q1": True, "2027_Q2": True, "2027_Q3": True, "2027_Q4": True, "2028_Q1": True, "2028_Q2": True, "2028_Q3": True, "2028_Q4": True}
                },
                {
                    "project_id": "00000000-0000-0000-0000-000000000011",
                    "project_name": "Campus-Wide CCTV Security Surveillance",
                    "milestones": {"2026_Q1": True, "2026_Q2": True, "2026_Q3": True, "2026_Q4": True, "2027_Q1": True, "2027_Q2": True, "2027_Q3": True, "2027_Q4": True, "2028_Q1": True, "2028_Q2": True, "2028_Q3": True, "2028_Q4": True}
                },
                {
                    "project_id": "00000000-0000-0000-0000-000000000012",
                    "project_name": "Multimedia Center Development",
                    "milestones": {"2026_Q1": True, "2026_Q2": True, "2026_Q3": True, "2026_Q4": True, "2027_Q1": True, "2027_Q2": True, "2027_Q3": True, "2027_Q4": True, "2028_Q1": True, "2028_Q2": True, "2028_Q3": True, "2028_Q4": True}
                }
            ]
        )
        db.add(narrative)
        db.flush()
        logger.info(f"Default Master Narrative established for cycle '{baseline_period}'.")

    logger.info("Configuring departmental sub-ceiling limits against global ceiling...")
    ceilings_to_seed = {
        "College of Engineering": Decimal("10000000.00"),
        "College of Computer Studies": Decimal("8000000.00"),
        "College of Arts & Sciences": Decimal("5000000.00"),
        "College of Health Sciences": Decimal("4000000.00"),
        "College of Tourism": Decimal("3000000.00"),
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
                    allocated_capex=limit * Decimal("0.70"),
                    allocated_mooe=limit * Decimal("0.30"),
                    issp_period=baseline_period
                )
                db.add(ceiling)
                logger.info(f"Ceiling established for {dept_name}: PHP {limit:,.2f} (70/30 CapEx/MOOE split)")
            else:
                ceiling.allocated_capex = limit * Decimal("0.70")
                ceiling.allocated_mooe = limit * Decimal("0.30")
                ceiling.issp_period = baseline_period
                logger.info(f"Ceiling updated for {dept_name}: PHP {limit:,.2f} (70/30 CapEx/MOOE split)")

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