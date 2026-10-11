// frontend/src/views/admin/Narrative/NarrativeManager.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getNarrative,
  updateNarrative,
  activateCycle,
  resetCycle,
  evaluateLifecycleRollover,
  configureThreeYearCycle,
  archiveAndDeleteCycle,
  getHumanCapitals,
  createHumanCapital,
  updateHumanCapital,
  deleteHumanCapital,
  getStakeholders,
  createStakeholder,
  updateStakeholder,
  deleteStakeholder,
  getNetworkInfrastructures,
  createNetworkInfrastructure,
  updateNetworkInfrastructure,
  deleteNetworkInfrastructure,
  getCybersecurityControls,
  getEgovChecklists,
  getDrTeams,
  getDrBias,
  getDrMetrics
} from "../../../api/admin";
import CompilerSyncButton from "../../../components/common/CompilerSyncButton";
import { 
  FileText, 
  Save, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  CalendarRange, 
  Landmark, 
  ShieldAlert, 
  Trash2,
  Layers, 
  Users, 
  Briefcase, 
  Activity, 
  ShieldCheck, 
  Clock, 
  Compass, 
  Network, 
  Plus, 
  ExternalLink, 
  GraduationCap, 
  HardDrive, 
  Sparkles, 
  Workflow, 
  Cpu, 
  Check, 
  Info, 
  Calendar, 
  X, 
  CheckCircle2, 
  Lock,
  Edit3, 
  Server,
  Globe,
  Building,
  SlidersHorizontal,
  RotateCcw,
  ArrowRight,
  CheckSquare,
  Zap,
  Cloud,
  Coins,
  Target,
  Database 
} from "lucide-react";

// Presets for Standard Public-Sector Stakeholder Groups
const STAKEHOLDER_PRESETS = [
  {
    group: "General Citizens and Service Applicants",
    incoming: "Online service inquiries, application submissions, and electronic fee settlement",
    incomingComp: "Simple",
    outgoing: "Official E-Certificates, clearances, regulatory statements, and validated receipts",
    outgoingComp: "Simple"
  },
  {
    group: "Institutional Staff, Planners and Division Heads",
    incoming: "Budget allotment requests, work programs, procurement requisitions, and leave clearances",
    incomingComp: "Complex",
    outgoing: "Disbursement vouchers, approved PRs, compliance endorsements, and performance scorecards",
    outgoingComp: "Simple"
  },
  {
    group: "National Oversight & Regulatory Agencies (DICT, DBM, COA)",
    incoming: "Statutory circulars, national compliance benchmarks, audit inquiries, and MITHI surveys",
    incomingComp: "Highly Technical",
    outgoing: "Certified ISSP documentation, UACS financial matrices, and PREXC accomplishment reports",
    outgoingComp: "Highly Technical"
  },
  {
    group: "Vendors, Contractors and Solution Providers",
    incoming: "Technical bidding documents, supplier canvas quotations, service level warranties, and billing claims",
    incomingComp: "Complex",
    outgoing: "Notice of Award, purchase orders, inspection acceptance reports, and check disbursements",
    outgoingComp: "Complex"
  },
  {
    group: "Partner National Government Agencies & LGUs",
    incoming: "Joint memorandum requests, inter-agency data synchronization queries, and cross-border API calls",
    incomingComp: "Highly Technical",
    outgoing: "Standardized PeGIF API endpoints, validated cross-agency data payloads, and reciprocal status updates",
    outgoingComp: "Highly Technical"
  }
];

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export default function NarrativeManager() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCycle, fetchActiveCycle } = useCycle();
  const isMountedRef = useRef(true);

  // Dynamic calendar year initialization
  const currentCalendarYear = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Dynamic Institutional Fallbacks
  const defaultAgencyName = import.meta.env?.VITE_DEFAULT_AGENCY_NAME || import.meta.env?.VITE_AGENCY_NAME || user?.agency_name || "National Government Agency";
  const defaultWebsiteUrl = import.meta.env?.VITE_AGENCY_WEBSITE || "https://agency.gov.ph";
  const defaultAgencyHeadTitle = import.meta.env?.VITE_DEFAULT_AGENCY_HEAD_TITLE || "Head of Agency";

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState("cycle"); 
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  // Lifecycle Rollover Modal State
  const [rolloverModal, setRolloverModal] = useState({ isOpen: false, data: null });

  // Tab 1: Dynamic Cycle & Scope State (Strict 3-Year Horizon: Start -> Start + 2)
  const [startYear, setStartYear] = useState(String(currentCalendarYear));
  const [endYear, setEndYear] = useState(String(currentCalendarYear + 2));
  const [newStartYearInput, setNewStartYearInput] = useState(currentCalendarYear);
  const [isAmendment, setIsAmendment] = useState(false);
  const [amendmentNumber, setAmendmentNumber] = useState("1st");

  const [agencyName, setAgencyName] = useState(defaultAgencyName);
  const [websiteUrl, setWebsiteUrl] = useState(defaultWebsiteUrl);
  const [primaryScope, setPrimaryScope] = useState("Department-Wide");
  const [deptSubScope, setDeptSubScope] = useState("with_suboffices");
  const [agencySubScope, setAgencySubScope] = useState("central_only");
  const [hasRegionalOffices, setHasRegionalOffices] = useState(true);
  const [hasBureaus, setHasBureaus] = useState(false);

  // Tab 2: Part I.A Mandate, Functions, Vision, Mission
  const [legalBasis, setLegalBasis] = useState("");
  const [functions, setFunctions] = useState("");
  const [vision, setVision] = useState("");
  const [mission, setMission] = useState("");
  const [presentSituation, setPresentSituation] = useState("");

  // Tab 3: Part III.B Dynamic Enterprise Architecture Narrative
  const [eaNarrative, setEaNarrative] = useState("");

  // Tab 4: Part I.B.1 Signatories & Leadership Structure (Clean User State - Zero Hardcoded Names)
  const [cioName, setCioName] = useState("");
  const [cioPosition, setCioPosition] = useState("Chief Information Officer");
  const [cioUnit, setCioUnit] = useState("ICT Management Service");
  const [cioEmail, setCioEmail] = useState("");
  const [cioContact, setCioContact] = useState("");

  const [focalName, setFocalName] = useState("");
  const [focalPosition, setFocalPosition] = useState("");
  const [focalUnit, setFocalUnit] = useState("");
  const [focalEmail, setFocalEmail] = useState("");
  const [focalContact, setFocalContact] = useState("");

  const [headOfAgencyName, setHeadOfAgencyName] = useState("");
  const [agencyHeadPosition, setAgencyHeadPosition] = useState(defaultAgencyHeadTitle);

  // Tab 5: Part I.B.2 Human Capital Staffing Matrix
  const [humanCapitals, setHumanCapitals] = useState([]);
  const [editingHcId, setEditingHcId] = useState(null);
  const [hcForm, setHcForm] = useState({
    employment_status: "Plantilla (Filled)",
    is_proposed: false,
    it_positions_count: 0,
    non_it_positions_count: 0,
    male_count: 0,
    female_count: 0
  });

  // Tab 6: Part I.C Stakeholder Analysis (Full Dynamic CRUD)
  const [stakeholders, setStakeholders] = useState([]);
  const [editingShId, setEditingShId] = useState(null);
  const [shForm, setShForm] = useState({
    stakeholder_group: "",
    transaction_processed_incoming: "",
    transaction_processed_outgoing: "",
    complexity_incoming: "Simple",
    complexity_outgoing: "Simple"
  });

  // Tab 7: Part II.B.1 & III.A.1 Network Infrastructure Profiles
  const [networkInfraList, setNetworkInfraList] = useState([]);
  const [editingNetId, setEditingNetId] = useState(null);
  const [netForm, setNetForm] = useState({
    is_proposed: false,
    office_location: "Central Office",
    connectivity_type: "Dedicated Leased Line Fiber Optic",
    bandwidth_mbps: 100,
    upload_speed_mbps: 100,
    download_speed_mbps: 100,
    is_ipv6_ready: true,
    topology_description: ""
  });

  // Tab 8: Annex 2 Disaster Recovery & Continuity (Dynamic Interactive Architecture)
  const [drbcpApprovalDate, setDrbcpApprovalDate] = useState("");
  const [drAffectedAssets, setDrAffectedAssets] = useState([]);
  const [newAssetGroup, setNewAssetGroup] = useState("");
  const [newAssetDetails, setNewAssetDetails] = useState("");

  // Section 4: 4 Interactive Pillars of Technical Recovery
  const [sec4OffsiteBackup, setSec4OffsiteBackup] = useState(
    "Daily encrypted database snapshots are transferred to a secure secondary facility located >30km away."
  );
  const [sec4CloudFailover, setSec4CloudFailover] = useState(
    "Mission-critical public service, registry, and e-payment microservices are replicated in real time to DICT GovCloud."
  );
  const [sec4Redundancy, setSec4Redundancy] = useState(
    "Dual-ISP providers configured in active-passive load distribution preventing single points of failure."
  );
  const [sec4DataSync, setSec4DataSync] = useState(
    "Asynchronous database replication ensures an RPO limit of 1 hour during operational disruptions."
  );

  // Section 5: 3 Interactive Operational SOP Phases
  const [sec5Phase1, setSec5Phase1] = useState(
    "Automated monitoring alerts evaluate disaster scale; Incident Commander activates DRBCP within 1 hour if localized RTO cannot be maintained."
  );
  const [sec5Phase2, setSec5Phase2] = useState(
    "DRT redirected to GovCloud DR standby instance; DNS records updated; clean database backups verified and mounted."
  );
  const [sec5Phase3, setSec5Phase3] = useState(
    "Primary data center infrastructure restored; synchronize transactional state delta from DR site during off-peak maintenance window."
  );

  // Section 6: MITHI Res. 2025-01 / SPAR Compliance Policies (4 Pillars)
  const [sec6CyberIntegration, setSec6CyberIntegration] = useState(
    "Formal cyber-incident response and ransomware recovery procedures are established to sanitize compromised clusters before restoration."
  );
  const [sec6DrillsTesting, setSec6DrillsTesting] = useState(
    "Mandates at least one (1) comprehensive full-scale disaster recovery simulation drill per calendar year and semi-annual tabletop walkthroughs."
  );
  const [sec6AuditReview, setSec6AuditReview] = useState(
    "Annual review schedule or immediate audit trigger upon significant infrastructure migration or architecture modification."
  );
  const [sec6BudgetSupport, setSec6BudgetSupport] = useState(
    "Continuing costs for GovCloud standby compute, off-site storage, and leased circuits are allocated under Continuing Costs in Part IV.A of the ISSP."
  );

  // Tab 9: Read-Only Checklists Overview Data (EGP, Cyber, DRT, BIA, KPIs)
  const [cyberControlsList, setCyberControlsList] = useState([]);
  const [egovChecklists, setEgovChecklists] = useState([]);
  const [drTeam, setDrTeam] = useState([]);
  const [drBia, setDrBia] = useState([]);
  const [drMetrics, setDrMetrics] = useState([]);

  const token = 
    user?.token || 
    user?.accessToken || 
    (typeof window !== "undefined" 
      ? (localStorage.getItem("access_token") || localStorage.getItem("token") || "") 
      : "") || 
    "";

  // Auto-dismiss transient notifications
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        if (isMountedRef.current) setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        if (isMountedRef.current) setError(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (activeCycle) {
      const parts = activeCycle.split("-");
      if (parts.length === 2) {
        setStartYear(parts[0]);
        setEndYear(parts[1]);
        const s = parseInt(parts[0], 10);
        if (!isNaN(s)) {
          setNewStartYearInput(s);
        }
      }
    }
  }, [activeCycle]);

  // Section 4 Parsing & Serialization
  const parseSection4Text = (rawStr) => {
    if (!rawStr || typeof rawStr !== "string") return;
    const clean = stripHtml(rawStr);
    const lines = clean.split("\n").map(l => l.trim()).filter(Boolean);

    lines.forEach(line => {
      if (/backup/i.test(line)) {
        const val = line.replace(/^(?:\d+\.|\*|-)?\s*(?:Off-site Backup(?:\s*Management)?):?\s*/i, "").trim();
        if (val) setSec4OffsiteBackup(val);
      } else if (/cloud failover|govcloud/i.test(line)) {
        const val = line.replace(/^(?:\d+\.|\*|-)?\s*(?:Cloud Failover(?:\s*\(GovCloud\))?):?\s*/i, "").trim();
        if (val) setSec4CloudFailover(val);
      } else if (/redundancy|dual-isp|isp/i.test(line)) {
        const val = line.replace(/^(?:\d+\.|\*|-)?\s*(?:Redundancy):?\s*/i, "").trim();
        if (val) setSec4Redundancy(val);
      } else if (/synchronization|rpo|replication/i.test(line)) {
        const val = line.replace(/^(?:\d+\.|\*|-)?\s*(?:Data Synchronization):?\s*/i, "").trim();
        if (val) setSec4DataSync(val);
      }
    });
  };

  const buildSection4Text = () => {
    return [
      `1. Off-site Backup Management: ${sec4OffsiteBackup.trim()}`,
      `2. Cloud Failover (GovCloud): ${sec4CloudFailover.trim()}`,
      `3. Redundancy: ${sec4Redundancy.trim()}`,
      `4. Data Synchronization: ${sec4DataSync.trim()}`
    ].join("\n");
  };

  // Section 5 Parsing & Serialization
  const parseSection5Text = (rawStr) => {
    if (!rawStr || typeof rawStr !== "string") return;
    const clean = stripHtml(rawStr);
    const lines = clean.split("\n").map(l => l.trim()).filter(Boolean);

    lines.forEach(line => {
      if (/Phase\s*(?:I\b|1\b)|Detection/i.test(line)) {
        const val = line.replace(/^Phase\s*(?:I|1):?\s*(?:Detection and Declaration|Detection & Declaration)?:?\s*/i, "").trim();
        if (val) setSec5Phase1(val);
      } else if (/Phase\s*(?:II\b|2\b)|Activation/i.test(line)) {
        const val = line.replace(/^Phase\s*(?:II|2):?\s*(?:Activation and Execution|Activation & Execution)?:?\s*/i, "").trim();
        if (val) setSec5Phase2(val);
      } else if (/Phase\s*(?:III\b|3\b)|Failback/i.test(line)) {
        const val = line.replace(/^Phase\s*(?:III|3):?\s*(?:Failback(?:\s*\(Normal Operations\))?)?:?\s*/i, "").trim();
        if (val) setSec5Phase3(val);
      }
    });
  };

  const buildSection5Text = () => {
    return [
      `Phase I: Detection and Declaration: ${sec5Phase1.trim()}`,
      `Phase II: Activation and Execution: ${sec5Phase2.trim()}`,
      `Phase III: Failback (Normal Operations): ${sec5Phase3.trim()}`
    ].join("\n");
  };

  // Section 6 Parsing & Serialization
  const parseSection6Text = (rawStr) => {
    if (!rawStr || typeof rawStr !== "string") return;
    const clean = stripHtml(rawStr);

    const extractPillar = (keyword) => {
      try {
        const regex = new RegExp(`${keyword}:?\\s*([\\s\\S]*?)(?=\\n\\n|$)`, "i");
        const match = clean.match(regex);
        if (match && match[1]) {
          return match[1].trim();
        }
      } catch (e) {
        console.warn(`Could not parse pillar ${keyword}:`, e);
      }
      return null;
    };

    const cyber = extractPillar("Cybersecurity Integration");
    const drills = extractPillar("Testing and Maintenance");
    const audit = extractPillar("Audit and Review");
    const budget = extractPillar("UACS and Budgeting");

    if (cyber) setSec6CyberIntegration(cyber);
    if (drills) setSec6DrillsTesting(drills);
    if (audit) setSec6AuditReview(audit);
    if (budget) setSec6BudgetSupport(budget);
  };

  const buildSection6Text = () => {
    return [
      `Cybersecurity Integration: ${sec6CyberIntegration.trim()}`,
      `Testing and Maintenance: ${sec6DrillsTesting.trim()}`,
      `Audit and Review: ${sec6AuditReview.trim()}`,
      `UACS and Budgeting: ${sec6BudgetSupport.trim()}`
    ].join("\n\n");
  };

  const resolveScopePayload = () => {
    let scopeChoiceEnum = "Department-Wide";
    let scopeJson = {
      with_regional_offices: false,
      with_bureaus: false,
      central_office_only: false
    };

    if (primaryScope === "Department-Wide") {
      scopeChoiceEnum = "Department-Wide";
      if (deptSubScope === "central_only") {
        scopeJson.central_office_only = true;
      } else {
        scopeJson.with_regional_offices = Boolean(hasRegionalOffices);
        scopeJson.with_bureaus = Boolean(hasBureaus);
      }
    } else if (primaryScope === "Agency-Wide") {
      scopeChoiceEnum = "Agency-Wide";
      if (agencySubScope === "central_only") {
        scopeJson.central_office_only = true;
      } else {
        scopeJson.with_regional_offices = true;
      }
    } else if (primaryScope === "Other Government Entity") {
      scopeChoiceEnum = "Other Government Entity";
    } else if (primaryScope === "LGU") {
      scopeChoiceEnum = "LGU";
    }

    return { scope_choice: scopeChoiceEnum, scope_json: scopeJson };
  };

  const hydrateScopeFromData = (choiceStr, jsonBlob) => {
    const json = jsonBlob || {};
    const c = (choiceStr || "Department-Wide").trim().toLowerCase().replace(/_/g, "-");

    if (c.includes("agency")) {
      setPrimaryScope("Agency-Wide");
      setAgencySubScope(json.with_regional_offices ? "with_fields" : "central_only");
    } else if (c.includes("other")) {
      setPrimaryScope("Other Government Entity");
    } else if (c.includes("lgu")) {
      setPrimaryScope("LGU");
    } else {
      setPrimaryScope("Department-Wide");
      if (json.central_office_only || (!json.with_regional_offices && !json.with_bureaus)) {
        setDeptSubScope("central_only");
      } else {
        setDeptSubScope("with_suboffices");
        setHasRegionalOffices(Boolean(json.with_regional_offices));
        setHasBureaus(Boolean(json.with_bureaus));
      }
    }
  };

  const fetchCycleData = useCallback(async () => {
    if (!activeCycle || !token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getNarrative(token, activeCycle);
      if (!isMountedRef.current) return;

      setAgencyName(data.agency_name || defaultAgencyName);
      setWebsiteUrl(data.agency_website_url || defaultWebsiteUrl);
      setIsAmendment(Boolean(data.is_amendment));
      setAmendmentNumber(data.amendment_number || "1st");
      
      hydrateScopeFromData(data.scope_choice, data.scope_json);

      setLegalBasis(data.mandate_text || stripHtml(data.mandate_html) || "");
      setFunctions(data.functions || "");
      setVision(data.vision_text || stripHtml(data.vision_html) || "");
      setMission(data.mission_text || stripHtml(data.mission_html) || "");
      setPresentSituation(data.present_situation_text || stripHtml(data.present_situation_html) || "");

      setEaNarrative(data.enterprise_architecture_narrative || "");

      setDrbcpApprovalDate(data.drbcp_approval_date || "");
      setDrAffectedAssets(Array.isArray(data.drbcp_affected_assets_json) ? data.drbcp_affected_assets_json : []);
      
      const sec4Val = data.drbcp_recovery_strategy_text || data.drbcp_recovery_strategy_html;
      if (sec4Val) {
        parseSection4Text(sec4Val);
      }

      const sec5Val = data.drbcp_sop_phases_text || data.drbcp_sop_phases_html;
      if (sec5Val) {
        parseSection5Text(sec5Val);
      }

      const sec6Val = data.drbcp_compliance_narrative_text || data.drbcp_compliance_narrative_html;
      if (sec6Val) {
        parseSection6Text(sec6Val);
      }

      // Dynamic Signatory Names: Use user-provided names, clean empty values, zero hardcoded names
      const rawCio = (data.cio_name || data.signatory_prepared_by || "").trim();
      if (!rawCio || ["chief information officer", "cio", "none", "null", "undefined"].includes(rawCio.toLowerCase())) {
        setCioName(rawCio && !["none", "null", "undefined"].includes(rawCio.toLowerCase()) ? rawCio : "");
      } else {
        setCioName(rawCio);
      }

      setCioPosition(data.cio_plantilla_position || data.preparer_position || "Chief Information Officer");
      setCioUnit(data.cio_organizational_unit || "ICT Management Service");
      setCioEmail(data.cio_email || data.preparer_email || "");
      setCioContact(data.cio_contact_no || data.preparer_tel || "");

      setFocalName(data.focal_name || "");
      setFocalPosition(data.focal_position || "");
      setFocalUnit(data.focal_organizational_unit || "");
      setFocalEmail(data.focal_email || "");
      setFocalContact(data.focal_contact_no || "");

      const rawHead = (data.head_of_agency_name || data.signatory_approved_by || "").trim();
      if (!rawHead || ["head of agency", "agency head", "college president", "president", "none", "null", "undefined"].includes(rawHead.toLowerCase())) {
        setHeadOfAgencyName(rawHead && !["none", "null", "undefined"].includes(rawHead.toLowerCase()) ? rawHead : "");
      } else {
        setHeadOfAgencyName(rawHead);
      }

      setAgencyHeadPosition(data.agency_head_position || defaultAgencyHeadTitle);
    } catch (e) {
      console.warn("Initializing cycle metadata:", e);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [activeCycle, token, defaultAgencyName, defaultWebsiteUrl, defaultAgencyHeadTitle]);

  const fetchHumanCapitals = useCallback(async () => {
    if (!activeCycle || !token) return;
    try {
      const data = await getHumanCapitals(token, activeCycle);
      if (isMountedRef.current) setHumanCapitals(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  }, [activeCycle, token]);

  const fetchStakeholders = useCallback(async () => {
    if (!activeCycle || !token) return;
    try {
      const data = await getStakeholders(token, activeCycle);
      if (isMountedRef.current) setStakeholders(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  }, [activeCycle, token]);

  const fetchNetworkAndCyber = useCallback(async () => {
    if (!activeCycle || !token) return;
    try {
      const [netData, cyberData] = await Promise.all([
        getNetworkInfrastructures(token, activeCycle),
        getCybersecurityControls(token, activeCycle)
      ]);
      if (isMountedRef.current) {
        setNetworkInfraList(Array.isArray(netData) ? netData : []);
        setCyberControlsList(Array.isArray(cyberData) ? cyberData : []);
      }
    } catch (e) { console.error(e); }
  }, [activeCycle, token]);

  const fetchEgovChecklists = useCallback(async () => {
    if (!activeCycle || !token) return;
    try {
      const data = await getEgovChecklists(token, activeCycle);
      if (isMountedRef.current) setEgovChecklists(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  }, [activeCycle, token]);

  const fetchDrTeams = useCallback(async () => {
    if (!activeCycle || !token) return;
    try {
      const data = await getDrTeams(token, activeCycle);
      if (isMountedRef.current) setDrTeam(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  }, [activeCycle, token]);

  const fetchDrBias = useCallback(async () => {
    if (!activeCycle || !token) return;
    try {
      const data = await getDrBias(token, activeCycle);
      if (isMountedRef.current) setDrBia(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  }, [activeCycle, token]);

  const fetchDrMetrics = useCallback(async () => {
    if (!activeCycle || !token) return;
    try {
      const data = await getDrMetrics(token, activeCycle);
      if (isMountedRef.current) setDrMetrics(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  }, [activeCycle, token]);

  const loadAllData = useCallback(() => {
    if (!token || !activeCycle) return;
    fetchCycleData();
    fetchHumanCapitals();
    fetchStakeholders();
    fetchNetworkAndCyber();
    fetchEgovChecklists();
    fetchDrTeams();
    fetchDrBias();
    fetchDrMetrics();
  }, [token, activeCycle, fetchCycleData, fetchHumanCapitals, fetchStakeholders, fetchNetworkAndCyber, fetchEgovChecklists, fetchDrTeams, fetchDrBias, fetchDrMetrics]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleSaveNarratives = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    const safeStart = parseInt(startYear, 10) || currentCalendarYear;
    const safeEnd = safeStart + 2; // Strict 3-Year Horizon Enforcement
    const { scope_choice, scope_json } = resolveScopePayload();

    const cleanCio = (cioName.trim() || "Chief Information Officer");
    const cleanHead = (headOfAgencyName.trim() || agencyHeadPosition.trim() || defaultAgencyHeadTitle);

    const payload = {
      agency_name: agencyName.trim() || defaultAgencyName,
      agency_website_url: websiteUrl.trim() || null,
      is_amendment: Boolean(isAmendment),
      amendment_number: isAmendment ? (amendmentNumber.trim() || "1st") : null,
      scope_choice,
      scope_json,
      issp_period_from: safeStart,
      issp_period_to: safeEnd,

      mandate_text: legalBasis.trim(),
      functions: functions.trim(),
      vision_text: vision.trim(),
      mission_text: mission.trim(),
      present_situation_text: presentSituation.trim(),

      enterprise_architecture_narrative: eaNarrative.trim(),

      drbcp_approval_date: drbcpApprovalDate.trim() || null,
      drbcp_affected_assets_json: drAffectedAssets || [],
      drbcp_recovery_strategy_text: buildSection4Text(),
      drbcp_sop_phases_text: buildSection5Text(),
      drbcp_compliance_narrative_text: buildSection6Text(),

      cio_name: cleanCio,
      cio_plantilla_position: cioPosition.trim() || "Chief Information Officer",
      cio_organizational_unit: cioUnit.trim() || "ICT Management Service",
      cio_email: cioEmail.trim() || null,
      cio_contact_no: cioContact.trim() || null,

      focal_name: focalName.trim() || null,
      focal_position: focalPosition.trim() || null,
      focal_organizational_unit: focalUnit.trim() || null,
      focal_email: focalEmail.trim() || null,
      focal_contact_no: focalContact.trim() || null,

      head_of_agency_name: cleanHead,
      agency_head_position: agencyHeadPosition.trim() || defaultAgencyHeadTitle,
      signatory_prepared_by: cleanCio,
      signatory_approved_by: cleanHead
    };

    try {
      await updateNarrative(token, activeCycle, payload);
      if (isMountedRef.current) {
        setSuccess("Primary narrative, statutory mandates, Signatories, and DRBCP compliance sections saved successfully as structured plain text.");
      }
      fetchCycleData();
      return true;
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message || "Failed to save parameters.");
      }
      throw err;
    } finally {
      if (isMountedRef.current) setSubmitting(false);
    }
  };

  const handleActivateCycle = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const start = parseInt(startYear, 10);
    if (isNaN(start) || start < 2020 || start > 2050) {
      setError("Please specify a valid start year between 2020 and 2050.");
      return;
    }

    const end = start + 2; // Strict 3-Year Horizon Enforcement
    setSubmitting(true);
    const targetCycle = `${start}-${end}`;

    try {
      await activateCycle(token, targetCycle);
      if (isMountedRef.current) {
        setSuccess(`Planning cycle updated and activated to: FY ${targetCycle} (Statutory 3-Year Horizon)`);
      }
      await fetchActiveCycle();
    } catch (err) {
      if (isMountedRef.current) setError(err.message || "Failed to activate planning cycle.");
    } finally {
      if (isMountedRef.current) setSubmitting(false);
    }
  };

  // 1. ADD / CONFIGURE 3-YEAR PLAN HANDLER
  const handleConfigure3YearCycle = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await configureThreeYearCycle(token, newStartYearInput, agencyName);
      if (isMountedRef.current) {
        setSuccess(res.message || `Activated statutory 3-year cycle starting ${newStartYearInput}.`);
      }
      if (fetchActiveCycle) await fetchActiveCycle();
      loadAllData();
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message || "Failed to configure statutory 3-year cycle.");
      }
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  // 2. ARCHIVE & DELETE ACTIVE PLAN HANDLER
  const handleArchiveAndDeleteCurrentPlan = async () => {
    const confirmMsg = 
      `CRITICAL ACTION:\n` +
      `Are you sure you want to archive and delete cycle '${activeCycle}'?\n\n` +
      `1. A final certified PDF and Word (.docx) file will be compiled and permanently saved to the Document Archive.\n` +
      `2. All draft line items, systems, and metrics for this cycle will be removed.\n` +
      `3. The system will activate the next available plan.`;

    if (!window.confirm(confirmMsg)) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await archiveAndDeleteCycle(token, activeCycle, "Archived by Admin request");
      if (isMountedRef.current) {
        setSuccess(res.message || `Cycle '${activeCycle}' successfully archived and removed.`);
      }
      if (fetchActiveCycle) await fetchActiveCycle();
      loadAllData();
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message || "Failed to archive and delete plan.");
      }
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const handleResetCycle = async () => {
    if (!window.confirm(`CRITICAL WARNING: Safe-reset cycle '${activeCycle}'? All drafts, child matrices, and ceilings for this period will be transactionally flushed.`)) {
      return;
    }

    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      await resetCycle(token, activeCycle);
      if (isMountedRef.current) {
        setSuccess("Active cycle successfully reset. Clean state established.");
      }
      await fetchActiveCycle();
    } catch (err) {
      if (isMountedRef.current) setError(err.message || "Failed to reset planning cycle.");
    } finally {
      if (isMountedRef.current) setSubmitting(false);
    }
  };

  const handleEvaluateRollover = async (force = false) => {
    if (force && !window.confirm("FORCE ROLLOVER: Freeze active cycle, compile final certified snapshot, archive to Certified Document Vault, and automatically provision successor cycle?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await evaluateLifecycleRollover(token, force);
      if (isMountedRef.current) {
        setRolloverModal({
          isOpen: true,
          data: res,
          currentYear: new Date().getFullYear(),
          activeCycle
        });
      }
      if (fetchActiveCycle) fetchActiveCycle();
      loadAllData();
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message || "Failed to execute lifecycle rollover evaluation.");
      }
    } finally {
      if (isMountedRef.current) setSubmitting(false);
    }
  };

  const handleAddAffectedAsset = () => {
    if (!newAssetGroup.trim() || !newAssetDetails.trim()) return;
    setDrAffectedAssets(prev => [
      ...prev,
      { asset_group: newAssetGroup.trim(), details: newAssetDetails.trim() }
    ]);
    setNewAssetGroup("");
    setNewAssetDetails("");
  };

  const handleDeleteAffectedAsset = (index) => {
    setDrAffectedAssets(prev => prev.filter((_, idx) => idx !== index));
  };

  // --- TAB 5: HUMAN CAPITAL HANDLERS ---
  const handleStartEditHc = (item) => {
    setEditingHcId(item.id);
    setHcForm({
      employment_status: item.employment_status,
      is_proposed: Boolean(item.is_proposed),
      it_positions_count: item.it_positions_count || 0,
      non_it_positions_count: item.non_it_positions_count || 0,
      male_count: item.male_count || 0,
      female_count: item.female_count || 0
    });
  };

  const handleCancelEditHc = () => {
    setEditingHcId(null);
    setHcForm({
      employment_status: "Plantilla (Filled)",
      is_proposed: false,
      it_positions_count: 0,
      non_it_positions_count: 0,
      male_count: 0,
      female_count: 0
    });
  };

  const handleSaveHumanCapital = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      if (editingHcId) {
        await updateHumanCapital(token, editingHcId, hcForm);
        if (isMountedRef.current) {
          setSuccess("Staffing matrix row updated.");
          handleCancelEditHc();
        }
      } else {
        await createHumanCapital(token, activeCycle, hcForm);
        if (isMountedRef.current) {
          setSuccess("Staffing matrix row added.");
          setHcForm({ employment_status: "Plantilla (Filled)", is_proposed: false, it_positions_count: 0, non_it_positions_count: 0, male_count: 0, female_count: 0 });
        }
      }
      fetchHumanCapitals();
    } catch (err) { 
      if (isMountedRef.current) setError(err.message || "Failed to save staffing entry."); 
    } finally { 
      if (isMountedRef.current) setSubmitting(false); 
    }
  };

  const handleDeleteHumanCapital = async (id) => {
    if (!window.confirm("Permanently delete this staffing matrix entry?")) return;
    try {
      await deleteHumanCapital(token, id);
      fetchHumanCapitals();
    } catch (err) { 
      if (isMountedRef.current) setError(err.message || "Failed to delete staffing entry."); 
    }
  };

  // --- TAB 6: STAKEHOLDER ANALYSIS HANDLERS ---
  const handleStartEditStakeholder = (item) => {
    setEditingShId(item.id);
    setShForm({
      stakeholder_group: item.stakeholder_group || "",
      transaction_processed_incoming: item.transaction_processed_incoming || "",
      transaction_processed_outgoing: item.transaction_processed_outgoing || "",
      complexity_incoming: item.complexity_incoming || item.incoming_complexity || "Simple",
      complexity_outgoing: item.complexity_outgoing || item.outgoing_complexity || "Simple"
    });
  };

  const handleCancelEditStakeholder = () => {
    setEditingShId(null);
    setShForm({
      stakeholder_group: "",
      transaction_processed_incoming: "",
      transaction_processed_outgoing: "",
      complexity_incoming: "Simple",
      complexity_outgoing: "Simple"
    });
  };

  const handleApplyStakeholderPreset = (preset) => {
    setShForm({
      stakeholder_group: preset.group,
      transaction_processed_incoming: preset.incoming,
      transaction_processed_outgoing: preset.outgoing,
      complexity_incoming: preset.incomingComp,
      complexity_outgoing: preset.outgoingComp
    });
  };

  const handleSaveStakeholder = async (e) => {
    e.preventDefault();
    if (!shForm.stakeholder_group.trim()) {
      setError("Stakeholder Group is required.");
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      if (editingShId) {
        await updateStakeholder(token, editingShId, shForm);
        if (isMountedRef.current) {
          setSuccess("Stakeholder analysis updated successfully.");
          handleCancelEditStakeholder();
        }
      } else {
        await createStakeholder(token, activeCycle, shForm);
        if (isMountedRef.current) {
          setSuccess("Stakeholder analysis recorded successfully.");
          setShForm({ stakeholder_group: "", transaction_processed_incoming: "", transaction_processed_outgoing: "", complexity_incoming: "Simple", complexity_outgoing: "Simple" });
        }
      }
      fetchStakeholders();
    } catch (err) { 
      if (isMountedRef.current) setError(err.message || "Failed to save stakeholder analysis."); 
    } finally { 
      if (isMountedRef.current) setSubmitting(false); 
    }
  };

  const handleDeleteStakeholder = async (id, groupName) => {
    if (!window.confirm(`Permanently delete stakeholder group '${groupName}'?`)) return;
    try {
      await deleteStakeholder(token, id);
      fetchStakeholders();
    } catch (err) { 
      if (isMountedRef.current) setError(err.message || "Failed to remove stakeholder group."); 
    }
  };

  // --- TAB 7: NETWORK INFRASTRUCTURE HANDLERS ---
  const handleStartEditNet = (item) => {
    setEditingNetId(item.id);
    setNetForm({
      is_proposed: Boolean(item.is_proposed),
      office_location: item.office_location || "Central Office",
      connectivity_type: item.connectivity_type || "Dedicated Leased Line Fiber Optic",
      bandwidth_mbps: item.bandwidth_mbps || 100,
      upload_speed_mbps: item.upload_speed_mbps || item.bandwidth_mbps || 100,
      download_speed_mbps: item.download_speed_mbps || item.bandwidth_mbps || 100,
      is_ipv6_ready: Boolean(item.is_ipv6_ready),
      topology_description: item.topology_description || ""
    });
  };

  const handleCancelEditNet = () => {
    setEditingNetId(null);
    setNetForm({
      is_proposed: false,
      office_location: "Central Office",
      connectivity_type: "Dedicated Leased Line Fiber Optic",
      bandwidth_mbps: 100,
      upload_speed_mbps: 100,
      download_speed_mbps: 100,
      is_ipv6_ready: true,
      topology_description: ""
    });
  };

  const handleSaveNetworkInfra = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      if (editingNetId) {
        await updateNetworkInfrastructure(token, editingNetId, netForm);
        if (isMountedRef.current) {
          setSuccess("Network profile updated.");
          handleCancelEditNet();
        }
      } else {
        await createNetworkInfrastructure(token, netForm, activeCycle);
        if (isMountedRef.current) {
          setSuccess("Network infrastructure profile saved.");
          handleCancelEditNet();
        }
      }
      fetchNetworkAndCyber();
    } catch (err) { 
      if (isMountedRef.current) setError(err.message || "Failed to save network profile."); 
    } finally { 
      if (isMountedRef.current) setSubmitting(false); 
    }
  };

  const handleDeleteNetworkInfra = async (id) => {
    if (!window.confirm("Delete this network infrastructure profile?")) return;
    try {
      await deleteNetworkInfrastructure(token, id);
      fetchNetworkAndCyber();
    } catch (err) { 
      if (isMountedRef.current) setError(err.message || "Failed to delete network profile."); 
    }
  };

  const calculatedSpan = 3; // Statutory 3-year horizon enforced
  const totalIT = humanCapitals.reduce((acc, h) => acc + (h.it_positions_count || 0), 0);
  const totalNonIT = humanCapitals.reduce((acc, h) => acc + (h.non_it_positions_count || 0), 0);
  const totalMale = humanCapitals.reduce((acc, h) => acc + (h.male_count || 0), 0);
  const totalFemale = humanCapitals.reduce((acc, h) => acc + (h.female_count || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-xs text-slate-800 dark:text-slate-100 select-none font-sans transition-colors duration-200">
      
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Master ISSP Narrative Studio &amp; Statutory Governance</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Maintain legal mandates, signatory profiles, human capital matrices, full stakeholder matrices, network infrastructure, and DRBCP continuity frameworks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CompilerSyncButton
            moduleName="narratives"
            activeCycle={activeCycle}
            token={token}
            onSaveAndSync={handleSaveNarratives}
            label="Save &amp; Verify Compiler Pipeline"
          />
          <button
            onClick={loadAllData}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-bold shadow-xs text-xs"
            title="Sync all narrative data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-center gap-2.5 shadow-xs animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="whitespace-pre-wrap leading-relaxed">{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-955/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center gap-2.5 shadow-xs animate-fadeIn">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Navigation Tabs (9 Normalized Sections) */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 self-start shadow-xs">
        {[
          { id: "cycle", label: "1. Planning Scope", icon: <CalendarRange className="w-3.5 h-3.5" /> },
          { id: "mandate", label: "2. Mandate & Functions", icon: <Landmark className="w-3.5 h-3.5" /> },
          { id: "ea", label: "3. Enterprise Arch (III.B)", icon: <HardDrive className="w-3.5 h-3.5" /> },
          { id: "cio_focal", label: "4. CIO & Signatories (I.B.1)", icon: <Users className="w-3.5 h-3.5" /> },
          { id: "humancapital", label: "5. Human Capital (I.B.2)", icon: <Briefcase className="w-3.5 h-3.5" /> },
          { id: "stakeholders", label: "6. Stakeholders (I.C)", icon: <Compass className="w-3.5 h-3.5" /> },
          { id: "network", label: "7. Network Infra (II.B / III.A)", icon: <Network className="w-3.5 h-3.5" /> },
          { id: "drbcp", label: "8. DRBCP Narrative (Annex 2)", icon: <ShieldAlert className="w-3.5 h-3.5" /> },
          { id: "checklists", label: "9. Framework Checklists (Overview)", icon: <SlidersHorizontal className="w-3.5 h-3.5" /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setError(null); setSuccess(null); setActiveTab(tab.id); }}
            className={`flex items-center gap-1.5 px-3 py-2 font-bold rounded-lg transition-all cursor-pointer text-[11px] ${
              activeTab === tab.id 
                ? "bg-blue-600 text-white shadow-xs" 
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Core Workspace Panels */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs">
          
          {/* TAB 1: PLANNING SCOPE & DICT COVER PAGE */}
          {activeTab === "cycle" && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* 1. Add / Configure Statutory 3-Year Plan */}
              <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                      Activate New Statutory 3-Year Planning Cycle
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Enter the start year. The system automatically enforces a 3-year horizon ({newStartYearInput} &rarr; {parseInt(newStartYearInput, 10) + 2}).
                    </p>
                  </div>
                  <span className="font-mono font-bold text-blue-600 text-xs">
                    FY {newStartYearInput}-{parseInt(newStartYearInput, 10) + 2}
                  </span>
                </div>

                <form onSubmit={handleConfigure3YearCycle} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Start Year:</label>
                    <input
                      type="number"
                      min="2020"
                      max="2050"
                      required
                      value={newStartYearInput}
                      onChange={e => setNewStartYearInput(parseInt(e.target.value, 10) || currentCalendarYear)}
                      className="w-24 p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-center font-mono font-bold text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                    &rarr; End Year auto-set to: <strong>{parseInt(newStartYearInput, 10) + 2}</strong>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="sm:ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs cursor-pointer shadow-sm transition-all"
                  >
                    Activate 3-Year Cycle
                  </button>
                </form>
              </div>

              {/* 2. Main Narrative Parameters Form */}
              <form onSubmit={handleSaveNarratives} className="space-y-4">
                <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center gap-1.5 font-serif">
                  <CalendarRange className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>DICT Template Page 1: Plan Classification, Horizon &amp; Scope</span>
                </h3>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="plan_type"
                        checked={!isAmendment}
                        onChange={() => setIsAmendment(false)}
                        className="accent-blue-600 w-4 h-4 cursor-pointer"
                      />
                      <span className="font-bold text-slate-800 dark:text-slate-200">REGULAR ISSP</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="plan_type"
                        checked={isAmendment}
                        onChange={() => setIsAmendment(true)}
                        className="accent-blue-600 w-4 h-4 cursor-pointer"
                      />
                      <span className="font-bold text-slate-800 dark:text-slate-200">AMENDMENT</span>
                    </label>
                  </div>

                  {isAmendment && (
                    <div className="flex items-center gap-1.5 animate-fadeIn">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Amendment:</span>
                      <select
                        value={amendmentNumber}
                        onChange={e => setAmendmentNumber(e.target.value)}
                        className="p-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 font-bold text-xs"
                      >
                        <option value="1st">1st Amendment</option>
                        <option value="2nd">2nd Amendment</option>
                        <option value="3rd">3rd Amendment</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Agency / Institution Legal Name</label>
                    <input
                      type="text" required value={agencyName} onChange={e => setAgencyName(e.target.value)}
                      placeholder="e.g. National Government Agency"
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Official Portal Website URL</label>
                    <input
                      type="url" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)}
                      placeholder="https://agency.gov.ph"
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:border-blue-500 text-xs"
                    />
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Hierarchical Scope of Plan (DICT Template Page 1 Tree)
                    </span>
                    <span className="text-[9px] text-blue-600 dark:text-blue-400 font-mono font-bold">Official Standard</span>
                  </div>

                  <div className="space-y-3 text-[11px]">
                    <div className="space-y-1.5 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <label className="flex items-center gap-2 font-bold text-slate-900 dark:text-white cursor-pointer">
                        <input
                          type="radio"
                          name="primaryScope"
                          value="Department-Wide"
                          checked={primaryScope === "Department-Wide"}
                          onChange={() => setPrimaryScope("Department-Wide")}
                          className="accent-blue-600 w-4 h-4 cursor-pointer"
                        />
                        <span>Department-Wide &rarr; Central / Head Office</span>
                      </label>

                      {primaryScope === "Department-Wide" && (
                        <div className="pl-6 pt-1 space-y-1.5 border-l-2 border-blue-500 ml-2 animate-fadeIn">
                          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                            <input
                              type="radio"
                              name="deptSubScope"
                              value="central_only"
                              checked={deptSubScope === "central_only"}
                              onChange={() => setDeptSubScope("central_only")}
                              className="accent-blue-600 cursor-pointer"
                            />
                            <span>Central Office only</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                            <input
                              type="radio"
                              name="deptSubScope"
                              value="with_suboffices"
                              checked={deptSubScope === "with_suboffices"}
                              onChange={() => setDeptSubScope("with_suboffices")}
                              className="accent-blue-600 cursor-pointer"
                            />
                            <span>With Sub-Offices / Regional Offices / Field Branches</span>
                          </label>

                          {deptSubScope === "with_suboffices" && (
                            <div className="pl-6 pt-1 space-y-1 flex gap-4 animate-fadeIn">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={hasRegionalOffices}
                                  onChange={e => setHasRegionalOffices(e.target.checked)}
                                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                                />
                                <span className="font-semibold text-blue-700 dark:text-blue-300">With Regional / Field / Branch Offices</span>
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={hasBureaus}
                                  onChange={e => setHasBureaus(e.target.checked)}
                                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                                />
                                <span className="font-semibold text-blue-700 dark:text-blue-300">With Attached Bureaus</span>
                              </label>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <label className="flex items-center gap-2 font-bold text-slate-900 dark:text-white cursor-pointer">
                        <input
                          type="radio"
                          name="primaryScope"
                          value="Agency-Wide"
                          checked={primaryScope === "Agency-Wide"}
                          onChange={() => setPrimaryScope("Agency-Wide")}
                          className="accent-blue-600 w-4 h-4 cursor-pointer"
                        />
                        <span>Agency-Wide</span>
                      </label>

                      {primaryScope === "Agency-Wide" && (
                        <div className="pl-6 pt-1 space-y-1.5 border-l-2 border-blue-500 ml-2 animate-fadeIn">
                          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                            <input
                              type="radio"
                              name="agencySubScope"
                              value="central_only"
                              checked={agencySubScope === "central_only"}
                              onChange={() => setAgencySubScope("central_only")}
                              className="accent-blue-600 cursor-pointer"
                            />
                            <span>Central Office only</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                            <input
                              type="radio"
                              name="agencySubScope"
                              value="with_fields"
                              checked={agencySubScope === "with_fields"}
                              onChange={() => setAgencySubScope("with_fields")}
                              className="accent-blue-600 cursor-pointer"
                            />
                            <span>With Regional Offices / Field Offices</span>
                          </label>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
                        <input
                          type="radio"
                          name="primaryScope"
                          value="Other Government Entity"
                          checked={primaryScope === "Other Government Entity"}
                          onChange={() => setPrimaryScope("Other Government Entity")}
                          className="accent-blue-600 cursor-pointer"
                        />
                        <span className="font-bold text-slate-800 dark:text-slate-200">Other Government Entity</span>
                      </label>
                      <label className="flex items-center gap-2 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
                        <input
                          type="radio"
                          name="primaryScope"
                          value="LGU"
                          checked={primaryScope === "LGU"}
                          onChange={() => setPrimaryScope("LGU")}
                          className="accent-blue-600 cursor-pointer"
                        />
                        <span className="font-bold text-slate-800 dark:text-slate-200">Local Government Unit (LGU)</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Start Fiscal Year</label>
                    <input
                      type="number" 
                      required 
                      value={startYear} 
                      onChange={e => {
                        const val = e.target.value;
                        setStartYear(val);
                        const s = parseInt(val, 10);
                        if (!isNaN(s)) {
                          setEndYear(String(s + 2));
                          setNewStartYearInput(s);
                        }
                      }}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-center font-bold text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">End Fiscal Year (Auto-Computed: Start + 2)</label>
                    <input
                      type="number" 
                      required 
                      readOnly
                      value={endYear} 
                      className="w-full p-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 font-mono text-center font-bold text-sm outline-none cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl flex justify-between items-center text-[10px]">
                  <span className="text-slate-600 dark:text-slate-400">
                    Planning Horizon: <strong className="text-blue-600 dark:text-blue-400 font-mono">Statutory 3-Year Strategic Cycle (FY {startYear}&ndash;{endYear})</strong>
                  </span>
                  <button
                    type="button" onClick={handleActivateCycle} disabled={submitting}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-bold cursor-pointer transition-colors shadow-xs"
                  >
                    Activate Year Span
                  </button>
                </div>

                <button
                  type="submit" disabled={submitting}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm text-xs"
                >
                  <Save className="w-4 h-4" /> <span>Save Scope &amp; Planning Parameters</span>
                </button>
              </form>

              {/* 3. Automated Cycle Rollover & Official Archival Engine */}
              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold font-serif">
                    <Workflow className="w-4 h-4 text-blue-500" />
                    <span>Automated Cycle Rollover &amp; Official Archival Engine</span>
                  </div>
                  <span className="text-[9px] px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 rounded font-mono font-bold uppercase">
                    Continuous Audit
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
                  When calendar year exceeds the plan's end year (e.g. &gt; {endYear}), the system freezes the concluding cycle, compiles and archives its final certified PDF to the <strong>Certified Document Vault</strong>, and automatically provisions the successor cycle with cloned baselines.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleEvaluateRollover(false)}
                    disabled={submitting}
                    className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span>Check Lifecycle Rollover</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEvaluateRollover(true)}
                    disabled={submitting}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Test-Fire Cycle Rollover Now</span>
                  </button>
                </div>
              </div>

              {/* 4. Pre-Deletion Archival and Permanent Deletion Action */}
              <div className="p-5 bg-rose-50/70 dark:bg-rose-955/20 border border-rose-300 dark:border-rose-900/60 rounded-2xl space-y-3 shadow-xs">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-bold text-xs">
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                      <span>Archive &amp; Delete Active Planning Cycle (FY {activeCycle})</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
                      This compiles the completed <strong>PDF</strong> and <strong>Word (.docx)</strong> documents for cycle <strong>FY {activeCycle}</strong> and permanently stores them in the Document Archive before cleaning the database.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleArchiveAndDeleteCurrentPlan}
                    disabled={submitting}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-all shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Archive &amp; Delete Plan</span>
                  </button>
                </div>
              </div>

              {/* 5. Safe Draft Reset Option */}
              <div className="p-4 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2 shadow-xs">
                <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-bold">
                  <RotateCcw className="w-4 h-4 text-amber-500" />
                  <span>Cycle Drafts Redefinition &amp; Safe-Reset</span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
                  Resetting the active cycle purges unapproved proposals and reinitializes clean planning bounds for '{activeCycle}' without archiving documents.
                </p>
                <button
                  type="button" onClick={handleResetCycle} disabled={submitting}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> <span>Execute Safe Reset</span>
                </button>
              </div>

            </div>
          )}

          {/* TAB 2: PART I.A MANDATES, FUNCTIONS, VISION & MISSION (CLEAN PLAIN TEXT) */}
          {activeTab === "mandate" && (
            <form onSubmit={handleSaveNarratives} className="space-y-4 animate-fadeIn">
              <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center gap-1.5 font-serif">
                <Landmark className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Part I.A: Statutory Charter &amp; Institutional Framework (Plain Text)</span>
              </h3>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500">A.1 Legal Basis (Enabling Law / Executive Order / Charter)</label>
                <textarea
                  rows={3} required value={legalBasis} onChange={e => setLegalBasis(e.target.value)}
                  placeholder="Cite statutory legal basis (e.g., enabling legislative act, executive order, or statutory charter)..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs outline-none resize-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500">A.1 Functions (Directly Derived from Statutory Mandate)</label>
                <textarea
                  rows={3} required value={functions} onChange={e => setFunctions(e.target.value)}
                  placeholder="Official institutional functions, instruction, research, extension, production, and citizen services..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs outline-none resize-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500">A.2 Vision Statement</label>
                  <textarea
                    rows={3} required value={vision} onChange={e => setVision(e.target.value)}
                    placeholder="Desired long-term institutional direction and digital transformation vision..."
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs outline-none resize-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500">A.3 Mission Statement</label>
                  <textarea
                    rows={3} required value={mission} onChange={e => setMission(e.target.value)}
                    placeholder="Core institutional mission, operational excellence, and public service delivery..."
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs outline-none resize-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between shadow-xs">
                <div className="space-y-0.5">
                  <span className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-blue-500" />
                    <span>A.4 Organizational Outcomes / MFO Programs</span>
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Statutory outcome categories (Core Public Services, Research, Extension, Support to Operations, General Administration) are managed in the dedicated Outcomes console.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/admin/outcomes")}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                >
                  <span>Manage Outcomes</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500">Present ICT Situation &amp; Operational Bottlenecks</label>
                <textarea
                  rows={4} required value={presentSituation} onChange={e => setPresentSituation(e.target.value)}
                  placeholder="Summary of existing infrastructure, network bottlenecks, campus fiber layout, and server room constraints..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs outline-none resize-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit" disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm text-xs"
              >
                <Save className="w-4 h-4" /> <span>Save Statutory Mandates (Plain Text)</span>
              </button>
            </form>
          )}

          {/* TAB 3: PART III.B ENTERPRISE ARCHITECTURE DYNAMIC STUDIO */}
          {activeTab === "ea" && (
            <form onSubmit={handleSaveNarratives} className="space-y-4 animate-fadeIn">
              <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center gap-1.5 font-serif">
                <HardDrive className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Part III.B: Proposed Enterprise Architecture Narrative (Plain Text)</span>
              </h3>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[10.5px] text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                <span>
                  <strong>Dynamic PDF Compilation:</strong> This narrative renders under Section III.B alongside the Enterprise Architecture schematic diagram. Detail microservices containerization, PeGIF API gateways, and operational data hubs.
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500">Enterprise Architecture Narrative Text</label>
                <textarea
                  rows={8}
                  required
                  value={eaNarrative}
                  onChange={e => setEaNarrative(e.target.value)}
                  placeholder="The proposed Enterprise Architecture rationalizes agency legacy registries into microservices containerized on secure infrastructure, utilizing PeGIF-compliant API gateways to support interoperability..."
                  className="w-full p-3 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs leading-relaxed outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit" disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm text-xs"
              >
                <Save className="w-4 h-4" /> <span>Commit Enterprise Architecture Narrative</span>
              </button>
            </form>
          )}

          {/* TAB 4: PART I.B.1 CIO & ISSP SIGNATORIES (ZERO HARDCODED NAMES) */}
          {activeTab === "cio_focal" && (
            <form onSubmit={handleSaveNarratives} className="space-y-6 animate-fadeIn">
              <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center gap-1.5 font-serif">
                <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Part I.B.1: Signatories &amp; Leadership Structure (Cover Page &amp; Transmittal)</span>
              </h3>

              {/* CIO Profile */}
              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-1.5">
                  <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 tracking-wider font-mono">
                    Prepared By: Chief Information Officer (CIO) / ICT Director
                  </span>
                  <span className="text-[9.5px] text-slate-400 italic">Renders above &ldquo;Name &amp; Signature of Chief Information Officer&rdquo; on Cover Page</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Full Name with Degree / Title (First, MI, Last, Post-Nominal)</label>
                    <input
                      type="text" 
                      value={cioName} 
                      onChange={e => setCioName(e.target.value)}
                      placeholder="e.g. Juan M. Dela Cruz, MIT"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold outline-none uppercase"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Official Plantilla / Administrative Position</label>
                    <input
                      type="text" required value={cioPosition} onChange={e => setCioPosition(e.target.value)}
                      placeholder="e.g. Director, ICT Management Services / CIO"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Organizational Unit</label>
                    <input
                      type="text" required value={cioUnit} onChange={e => setCioUnit(e.target.value)}
                      placeholder="e.g. ICT Management Service"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Official Email Address</label>
                    <input
                      type="email" value={cioEmail} onChange={e => setCioEmail(e.target.value)}
                      placeholder="cio@agency.gov.ph"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Contact Number</label>
                    <input
                      type="text" value={cioContact} onChange={e => setCioContact(e.target.value)}
                      placeholder="09190000000"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Head of Agency */}
              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-1.5">
                  <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider font-mono">
                    Approved By: Head of Agency
                  </span>
                  <span className="text-[9.5px] text-slate-400 italic">Renders above &ldquo;Name &amp; Signature of Agency Head&rdquo; on Cover Page</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Head of Agency Full Name with Post-Nominal</label>
                    <input
                      type="text" 
                      value={headOfAgencyName} 
                      onChange={e => setHeadOfAgencyName(e.target.value)}
                      placeholder="e.g. Maria S. Santos, PhD / Atty. Roberto D. Cruz"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold outline-none uppercase"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Official Position Title</label>
                    <input
                      type="text" required value={agencyHeadPosition} onChange={e => setAgencyHeadPosition(e.target.value)}
                      placeholder="e.g. Secretary / Director General / Executive Director"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Alternate Focal Person */}
              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 tracking-wider block font-mono">
                  Alternate ISSP Focal Person (Part I.B.1 Contact Card)
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Full Name (First, MI, Last)</label>
                    <input
                      type="text" value={focalName} onChange={e => setFocalName(e.target.value)}
                      placeholder="e.g. Maria S. Santos"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Designated Position</label>
                    <input
                      type="text" value={focalPosition} onChange={e => setFocalPosition(e.target.value)}
                      placeholder="e.g. Planning Officer V / IT Specialist"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Organizational Unit</label>
                    <input
                      type="text" value={focalUnit} onChange={e => setFocalUnit(e.target.value)}
                      placeholder="e.g. Planning and Monitoring Service"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Official Email Address</label>
                    <input
                      type="email" value={focalEmail} onChange={e => setFocalEmail(e.target.value)}
                      placeholder="focal@agency.gov.ph"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Contact Number</label>
                    <input
                      type="text" value={focalContact} onChange={e => setFocalContact(e.target.value)}
                      placeholder="09300000000"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit" disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm text-xs"
              >
                <Save className="w-4 h-4" /> <span>Save Signatories &amp; Leadership Profiles</span>
              </button>
            </form>
          )}

          {/* TAB 5: PART I.B.2 HUMAN CAPITAL MATRIX (FULL CRUD) */}
          {activeTab === "humancapital" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2">
                <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide font-serif">
                  Part I.B.2: Human Capital Staffing Matrix (Current vs. Proposed)
                </h3>
                {editingHcId && (
                  <button 
                    type="button" 
                    onClick={handleCancelEditHc}
                    className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Cancel Edit
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveHumanCapital} className="bg-slate-50 dark:bg-slate-955 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                  <span>{editingHcId ? "Edit Staffing Matrix Entry" : "Add Staffing Matrix Entry"}</span>
                  {editingHcId && <span className="text-amber-500 font-mono">Editing Mode Active</span>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Planning Scope</label>
                    <select
                      value={hcForm.is_proposed ? "true" : "false"}
                      onChange={e => setHcForm({ ...hcForm, is_proposed: e.target.value === "true" })}
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xs cursor-pointer font-semibold"
                    >
                      <option value="false">Part I.B.2 Current Staffing (Baseline)</option>
                      <option value="true">Part III.C Proposed Headcount</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Employment Status</label>
                    <select
                      value={hcForm.employment_status}
                      onChange={e => setHcForm({ ...hcForm, employment_status: e.target.value })}
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xs cursor-pointer font-semibold"
                    >
                      <option value="Plantilla (Filled)">Plantilla (Filled)</option>
                      <option value="Plantilla (Unfilled)">Plantilla (Unfilled)</option>
                      <option value="Contractual">Contractual</option>
                      <option value="Outsourced (JO, COS, and HTC)">Outsourced (JO, COS, HTC)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">IT Positions</label>
                    <input
                      type="number" min="0" required value={hcForm.it_positions_count}
                      onChange={e => setHcForm({ ...hcForm, it_positions_count: parseInt(e.target.value, 10) || 0 })}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Non-IT Positions</label>
                    <input
                      type="number" min="0" required value={hcForm.non_it_positions_count}
                      onChange={e => setHcForm({ ...hcForm, non_it_positions_count: parseInt(e.target.value, 10) || 0 })}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Male (GAD)</label>
                    <input
                      type="number" min="0" required value={hcForm.male_count}
                      onChange={e => setHcForm({ ...hcForm, male_count: parseInt(e.target.value, 10) || 0 })}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs text-center text-blue-600 dark:text-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Female (GAD)</label>
                    <input
                      type="number" min="0" required value={hcForm.female_count}
                      onChange={e => setHcForm({ ...hcForm, female_count: parseInt(e.target.value, 10) || 0 })}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs text-center text-pink-600 dark:text-pink-400"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  {editingHcId && (
                    <button
                      type="button"
                      onClick={handleCancelEditHc}
                      className="w-1/3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-colors cursor-pointer text-xs"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit" disabled={submitting}
                    className={`py-2.5 ${editingHcId ? "w-2/3 bg-amber-600 hover:bg-amber-500" : "w-full bg-blue-600 hover:bg-blue-500"} rounded-xl font-bold text-white transition-colors cursor-pointer text-xs shadow-sm`}
                  >
                    {editingHcId ? "Update Staffing Matrix Row" : "Record Staffing Matrix Row"}
                  </button>
                </div>
              </form>

              <div className="overflow-x-auto bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-955 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9.5px] font-mono font-bold">
                      <th className="p-3.5">Scope</th>
                      <th className="p-3.5">Employment Status</th>
                      <th className="p-3.5 text-center">IT</th>
                      <th className="p-3.5 text-center">Non-IT</th>
                      <th className="p-3.5 text-center">Male</th>
                      <th className="p-3.5 text-center">Female</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {humanCapitals.map(hc => (
                      <tr key={hc.id} className="hover:bg-slate-100/60 dark:hover:bg-slate-900/40 transition-colors">
                        <td className="p-3.5">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase font-mono border ${hc.is_proposed ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20" : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"}`}>
                            {hc.is_proposed ? "Proposed (III.C)" : "Current (I.B.2)"}
                          </span>
                        </td>
                        <td className="p-3.5 font-semibold text-slate-800 dark:text-slate-200">{hc.employment_status}</td>
                        <td className="p-3.5 text-center font-mono font-bold">{hc.it_positions_count}</td>
                        <td className="p-3.5 text-center font-mono">{hc.non_it_positions_count}</td>
                        <td className="p-3.5 text-center font-mono text-blue-600 dark:text-blue-400">{hc.male_count}</td>
                        <td className="p-3.5 text-center font-mono text-pink-600 dark:text-pink-400">{hc.female_count}</td>
                        <td className="p-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => handleStartEditHc(hc)} className="p-1 hover:text-blue-600 text-slate-400 cursor-pointer">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteHumanCapital(hc.id)} className="p-1 hover:text-rose-600 text-slate-400 cursor-pointer">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {humanCapitals.length > 0 && (
                      <tr className="bg-slate-100 dark:bg-slate-955 font-bold border-t-2 border-slate-300 dark:border-slate-800 font-mono">
                        <td colSpan={2} className="p-3.5 text-slate-900 dark:text-white uppercase">Grand Total Personnel</td>
                        <td className="p-3.5 text-center text-blue-600 dark:text-blue-400 font-bold text-sm">{totalIT}</td>
                        <td className="p-3.5 text-center text-slate-900 dark:text-white">{totalNonIT}</td>
                        <td className="p-3.5 text-center text-blue-600 dark:text-blue-400">{totalMale}</td>
                        <td className="p-3.5 text-center text-pink-600 dark:text-pink-400">{totalFemale}</td>
                        <td className="p-3.5"></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: PART I.C STAKEHOLDER ANALYSIS (FULL DYNAMIC CRUD) */}
          {activeTab === "stakeholders" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2">
                <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide font-serif">
                  Part I.C: Stakeholder Analysis Matrix (Processing Complexities)
                </h3>
                {editingShId && (
                  <button 
                    type="button" 
                    onClick={handleCancelEditStakeholder}
                    className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Cancel Edit
                  </button>
                )}
              </div>

              {/* 1-Click Preset Strip */}
              <div className="p-3 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-xs">
                <span className="text-[10px] uppercase font-bold text-slate-500 font-mono block">
                  Quick Presets: Select Canonical Government Stakeholder Group
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {STAKEHOLDER_PRESETS.map((preset, pIdx) => (
                    <button
                      key={pIdx}
                      type="button"
                      onClick={() => handleApplyStakeholderPreset(preset)}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-[10px] font-semibold text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors cursor-pointer"
                    >
                      + {preset.group}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSaveStakeholder} className="bg-slate-50 dark:bg-slate-955 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                  <span>{editingShId ? "Edit Stakeholder Group Analysis" : "Register Stakeholder Group"}</span>
                  {editingShId && <span className="text-amber-500 font-mono">Editing Mode Active</span>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Stakeholder Group Title</label>
                    <input
                      type="text" required value={shForm.stakeholder_group}
                      onChange={e => setShForm({ ...shForm, stakeholder_group: e.target.value })}
                      placeholder="e.g. General Citizens, Students, Service Applicants"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold text-xs outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Incoming Complexity</label>
                    <select
                      value={shForm.complexity_incoming}
                      onChange={e => setShForm({ ...shForm, complexity_incoming: e.target.value })}
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xs cursor-pointer font-medium outline-none"
                    >
                      <option value="Simple">Simple (&le; 3 Working Days)</option>
                      <option value="Complex">Complex (&le; 7 Working Days)</option>
                      <option value="Highly Technical">Highly Technical (&le; 20 Working Days)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Outgoing Complexity</label>
                    <select
                      value={shForm.complexity_outgoing}
                      onChange={e => setShForm({ ...shForm, complexity_outgoing: e.target.value })}
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xs cursor-pointer font-medium outline-none"
                    >
                      <option value="Simple">Simple (&le; 3 Working Days)</option>
                      <option value="Complex">Complex (&le; 7 Working Days)</option>
                      <option value="Highly Technical">Highly Technical (&le; 20 Working Days)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Incoming Transaction Processed</label>
                    <textarea
                      rows={2} required value={shForm.transaction_processed_incoming}
                      onChange={e => setShForm({ ...shForm, transaction_processed_incoming: e.target.value })}
                      placeholder="Online service applications, enrollment filings, regulatory inquiries, payment settlements..."
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none text-xs outline-none focus:border-blue-500 leading-relaxed"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Outgoing Transaction Processed</label>
                    <textarea
                      rows={2} required value={shForm.transaction_processed_outgoing}
                      onChange={e => setShForm({ ...shForm, transaction_processed_outgoing: e.target.value })}
                      placeholder="Verified digital certificates, grades, transcripts, regulatory clearances, official receipts..."
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none text-xs outline-none focus:border-blue-500 leading-relaxed"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  {editingShId && (
                    <button
                      type="button"
                      onClick={handleCancelEditStakeholder}
                      className="w-1/3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-colors cursor-pointer text-xs"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit" disabled={submitting}
                    className={`py-2.5 ${editingShId ? "w-2/3 bg-amber-600 hover:bg-amber-500" : "w-full bg-blue-600 hover:bg-blue-500"} rounded-xl font-bold text-white transition-colors cursor-pointer text-xs shadow-sm`}
                  >
                    {editingShId ? "Update Stakeholder Analysis Record" : "Save Stakeholder Analysis Record"}
                  </button>
                </div>
              </form>

              <div className="overflow-x-auto bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9.5px] font-mono font-bold">
                      <th className="p-3.5 w-1/4">Stakeholder Group</th>
                      <th className="p-3.5 w-1/3">Incoming Transaction</th>
                      <th className="p-3.5 w-1/3">Outgoing Transaction</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {stakeholders.map(s => (
                      <tr key={s.id} className="hover:bg-slate-100/60 dark:hover:bg-slate-900/40 transition-colors">
                        <td className="p-3.5 font-bold text-slate-800 dark:text-slate-200 align-top">
                          {s.stakeholder_group}
                        </td>
                        <td className="p-3.5 align-top space-y-1">
                          <span className="text-slate-700 dark:text-slate-300 block leading-relaxed">{s.transaction_processed_incoming}</span>
                          <span className="inline-block text-[9.5px] text-blue-600 dark:text-blue-400 font-mono font-bold px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900">
                            Incoming: {s.complexity_incoming || s.incoming_complexity || "Simple"}
                          </span>
                        </td>
                        <td className="p-3.5 align-top space-y-1">
                          <span className="text-slate-700 dark:text-slate-300 block leading-relaxed">{s.transaction_processed_outgoing}</span>
                          <span className="inline-block text-[9.5px] text-emerald-600 dark:text-emerald-400 font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-955 border border-emerald-200 dark:border-emerald-900">
                            Outgoing: {s.complexity_outgoing || s.outgoing_complexity || "Simple"}
                          </span>
                        </td>
                        <td className="p-3.5 text-right align-top">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartEditStakeholder(s)}
                              className="p-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 border border-slate-200 dark:border-slate-800 cursor-pointer"
                              title="Edit Stakeholder Record"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteStakeholder(s.id, s.stakeholder_group)}
                              className="p-1.5 bg-white dark:bg-slate-900 hover:bg-rose-50 rounded-lg text-slate-500 hover:text-rose-600 border border-slate-200 dark:border-slate-800 cursor-pointer"
                              title="Delete Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: PART II.B.1 & III.A.1 NETWORK INFRASTRUCTURE PROFILES */}
          {activeTab === "network" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide flex items-center gap-1.5 font-serif">
                  <Network className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Parts II.B.1 &amp; III.A.1: Network Infrastructure Specifications</span>
                </h3>
              </div>

              {/* Callout Link to Framework Checklists for Cybersecurity Controls */}
              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-3 shadow-xs">
                <div className="space-y-0.5">
                  <span className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Cybersecurity Control Checklists (Parts II.B.2 &amp; III.A.2)</span>
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Looking to manage the 29 Official DICT Cybersecurity Controls? Checklists are centrally managed in the dedicated compliance module.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/admin/framework")}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shrink-0"
                >
                  <span>Manage in Compliance Checklists</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* LAN/WAN Infrastructure Setup Form */}
              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block font-mono">
                    Configure LAN/WAN Infrastructure Setup Profile
                  </span>
                  {editingNetId && (
                    <button type="button" onClick={handleCancelEditNet} className="text-[10px] text-slate-400 hover:text-white font-bold cursor-pointer">
                      Cancel Edit
                    </button>
                  )}
                </div>

                <form onSubmit={handleSaveNetworkInfra} className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500">Planning State</label>
                      <select
                        value={netForm.is_proposed ? "true" : "false"}
                        onChange={e => setNetForm({ ...netForm, is_proposed: e.target.value === "true" })}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xs cursor-pointer font-semibold"
                      >
                        <option value="false">Part II.B.1 Existing Setup</option>
                        <option value="true">Part III.A.1 Proposed Setup</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500">Deployment Location / Site</label>
                      <input
                        type="text" required value={netForm.office_location}
                        onChange={e => setNetForm({ ...netForm, office_location: e.target.value })}
                        placeholder="e.g. Central Campus / Main Data Center"
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500">Connectivity Type</label>
                      <input
                        type="text" required value={netForm.connectivity_type}
                        onChange={e => setNetForm({ ...netForm, connectivity_type: e.target.value })}
                        placeholder="e.g. Dedicated Leased Line Fiber Optic"
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500">Bandwidth (Mbps)</label>
                      <input
                        type="number" min="1" required value={netForm.bandwidth_mbps}
                        onChange={e => setNetForm({ ...netForm, bandwidth_mbps: parseInt(e.target.value, 10) || 0 })}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs font-bold text-center"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500">Upload (Mbps)</label>
                      <input
                        type="number" min="1" required value={netForm.upload_speed_mbps}
                        onChange={e => setNetForm({ ...netForm, upload_speed_mbps: parseInt(e.target.value, 10) || 0 })}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs text-center"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500">Download (Mbps)</label>
                      <input
                        type="number" min="1" required value={netForm.download_speed_mbps}
                        onChange={e => setNetForm({ ...netForm, download_speed_mbps: parseInt(e.target.value, 10) || 0 })}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs text-center"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-4">
                      <input
                        type="checkbox" id="ipv6_cb" checked={netForm.is_ipv6_ready}
                        onChange={e => setNetForm({ ...netForm, is_ipv6_ready: e.target.checked })}
                        className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                      />
                      <label htmlFor="ipv6_cb" className="font-bold text-slate-700 dark:text-slate-300 cursor-pointer">IPv6 Ready</label>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Architecture Topology Description</label>
                    <textarea
                      rows={2} required value={netForm.topology_description}
                      onChange={e => setNetForm({ ...netForm, topology_description: e.target.value })}
                      placeholder="Core switch distribution, 10G optical fiber backbone, redundant border routers, SD-WAN links..."
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none text-xs"
                    />
                  </div>

                  <div className="flex gap-2">
                    {editingNetId && (
                      <button type="button" onClick={handleCancelEditNet} className="w-1/3 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold cursor-pointer text-xs">
                        Cancel
                      </button>
                    )}
                    <button type="submit" className={`py-2.5 ${editingNetId ? "w-2/3 bg-amber-600 hover:bg-amber-500" : "w-full bg-blue-600 hover:bg-blue-500"} rounded-xl font-bold text-white cursor-pointer shadow-sm text-xs`}>
                      {editingNetId ? "Update Network Setup Profile" : "Save Network Setup Profile"}
                    </button>
                  </div>
                </form>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pt-2">
                  {networkInfraList.map(n => (
                    <div key={n.id} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex justify-between items-center text-xs shadow-2xs">
                      <div>
                        <span className={`px-2 py-0.5 text-[8.5px] font-bold rounded-full uppercase mr-2 font-mono ${n.is_proposed ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20" : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"}`}>
                          {n.is_proposed ? "Proposed" : "Existing"}
                        </span>
                        <strong>{n.office_location || "Central Office"}:</strong> {n.connectivity_type} ({n.bandwidth_mbps} Mbps) - IPv6: {n.is_ipv6_ready ? "Yes" : "No"}
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => handleStartEditNet(n)} className="text-slate-400 hover:text-blue-600 cursor-pointer"><Edit3 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDeleteNetworkInfra(n.id)} className="text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: ANNEX 2 DISASTER RECOVERY & BUSINESS CONTINUITY (DYNAMIC INTERACTIVE CARDS) */}
          {activeTab === "drbcp" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2">
                <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide flex items-center gap-1.5 font-serif">
                  <ShieldAlert className="w-4 h-4 text-rose-500" />
                  <span>Annex 2: Disaster Recovery &amp; Business Continuity Plan (DRBCP Interactive Studio)</span>
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">Governed under DICT / ISO 22301 Standards</span>
              </div>

              {/* Integrated Section Navigation & Snapshot Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div 
                  onClick={() => navigate("/admin/framework")}
                  className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-400 transition-all cursor-pointer space-y-1 shadow-2xs group"
                >
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase font-mono text-slate-500">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-blue-500" />
                      <span>1. DR Team Roles</span>
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                    {drTeam.length} Assigned Members
                  </div>
                  <span className="text-[9.5px] text-slate-400 block truncate">Incident Commander &bull; Infra Lead</span>
                </div>

                <div 
                  onClick={() => navigate("/admin/framework")}
                  className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-400 transition-all cursor-pointer space-y-1 shadow-2xs group"
                >
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase font-mono text-slate-500">
                    <span className="flex items-center gap-1">
                      <Database className="w-3.5 h-3.5 text-emerald-500" />
                      <span>2. BIA System Targets</span>
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                    {drBia.length} Systems Evaluated
                  </div>
                  <span className="text-[9.5px] text-slate-400 block truncate">
                    {drBia.filter(b => b.rto_hours <= 4).length} Mission-Critical (&le;4h RTO)
                  </span>
                </div>

                <div 
                  onClick={() => navigate("/admin/framework")}
                  className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-purple-400 transition-all cursor-pointer space-y-1 shadow-2xs group"
                >
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase font-mono text-slate-500">
                    <span className="flex items-center gap-1">
                      <Target className="w-3.5 h-3.5 text-purple-500" />
                      <span>DRBCP Metrics (KPIs)</span>
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                    {drMetrics.length} Active Benchmarks
                  </div>
                  <span className="text-[9.5px] text-slate-400 block truncate">Availability &bull; RTO Compliance</span>
                </div>
              </div>

              {/* Section 1: Plan Overview & Governance Approval Date */}
              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block font-mono">
                  1. Plan Overview &amp; Official Governance Approval Date
                </span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Official DRBCP Approval Date</label>
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      <input
                        type="text"
                        value={drbcpApprovalDate}
                        onChange={e => setDrbcpApprovalDate(e.target.value)}
                        placeholder="e.g. March 15, 2026 or Approved upon Plan Effectivity"
                        className="w-full pl-9 p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs outline-none focus:border-blue-500"
                      />
                    </div>
                    <span className="text-[9.5px] text-slate-400 block">
                      *Renders as &ldquo;Official Approval Date: {drbcpApprovalDate || "Approved upon Plan Effectivity"}&rdquo; on Annex 2 Page 1.
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Agency Identification &amp; Version</label>
                    <div className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-700 dark:text-slate-300">
                      <strong>Agency:</strong> {agencyName} &nbsp;|&nbsp; <strong>Version:</strong> {activeCycle}.1
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Affected Assets */}
              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block font-mono">
                  3. ICT Component Inventory &amp; Affected Assets (Structured List)
                </span>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    placeholder="Asset Group (e.g. Primary Data Center)"
                    value={newAssetGroup}
                    onChange={e => setNewAssetGroup(e.target.value)}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="Physical enterprise servers, SAN storage, optical fiber backbone..."
                    value={newAssetDetails}
                    onChange={e => setNewAssetDetails(e.target.value)}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white sm:col-span-2 text-xs outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddAffectedAsset}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-bold cursor-pointer flex items-center gap-1.5 text-xs shadow-sm transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Append Affected Asset Category
                </button>

                <div className="space-y-1.5 max-h-44 overflow-y-auto pt-1">
                  {drAffectedAssets.map((asset, aIdx) => (
                    <div key={aIdx} className="flex justify-between items-center p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs shadow-2xs">
                      <div>
                        <strong className="text-slate-900 dark:text-white font-semibold">{asset.asset_group}:</strong>
                        <span className="text-slate-600 dark:text-slate-300 ml-1.5">{asset.details}</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => handleDeleteAffectedAsset(aIdx)} 
                        className="text-slate-400 hover:text-rose-600 cursor-pointer p-1"
                        title="Delete Asset Item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {drAffectedAssets.length === 0 && (
                    <div className="text-slate-400 italic text-[11px] p-2">
                      No custom affected assets defined. Default baseline will be compiled.
                    </div>
                  )}
                </div>
              </div>

              {/* Section 4: Technical Recovery Strategy - 4 Structured Interactive Cards */}
              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
                <div>
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block font-mono">
                    4. Technical Recovery Strategy (4 Core Technical Pillars)
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Define technical resilience procedures across backup retention, failovers, network distribution, and transactional replication.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Pillar 1: Off-site Backup Management */}
                  <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-955 text-blue-600 dark:text-blue-400">
                        <HardDrive className="w-4 h-4" />
                      </div>
                      <div>
                        <strong className="block text-xs text-slate-900 dark:text-white">Pillar 1: Off-site Backup Management</strong>
                        <span className="text-[9.5px] text-slate-400 block">Encrypted snapshots, &gt;30km offsite facility</span>
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={sec4OffsiteBackup}
                      onChange={e => setSec4OffsiteBackup(e.target.value)}
                      placeholder="Daily encrypted database snapshots are transferred to a secure secondary facility located >30km away..."
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none resize-none leading-relaxed focus:border-blue-500 font-sans"
                    />
                  </div>

                  {/* Pillar 2: Cloud Failover */}
                  <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-955 text-emerald-600 dark:text-emerald-400">
                        <Cloud className="w-4 h-4" />
                      </div>
                      <div>
                        <strong className="block text-xs text-slate-900 dark:text-white">Pillar 2: Cloud Failover (GovCloud)</strong>
                        <span className="text-[9.5px] text-slate-400 block">Real-time replication for mission-critical portals</span>
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={sec4CloudFailover}
                      onChange={e => setSec4CloudFailover(e.target.value)}
                      placeholder="Mission-critical public service, registry, and e-payment microservices are replicated in real time to DICT GovCloud..."
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none resize-none leading-relaxed focus:border-blue-500 font-sans"
                    />
                  </div>

                  {/* Pillar 3: ISP & Network Redundancy */}
                  <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-955 text-purple-600 dark:text-purple-400">
                        <Network className="w-4 h-4" />
                      </div>
                      <div>
                        <strong className="block text-xs text-slate-900 dark:text-white">Pillar 3: Network &amp; ISP Redundancy</strong>
                        <span className="text-[9.5px] text-slate-400 block">Dual-provider active-passive load distribution</span>
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={sec4Redundancy}
                      onChange={e => setSec4Redundancy(e.target.value)}
                      placeholder="Dual-ISP providers configured in active-passive load distribution preventing single points of failure..."
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none resize-none leading-relaxed focus:border-blue-500 font-sans"
                    />
                  </div>

                  {/* Pillar 4: Data Synchronization & RPO Assurance */}
                  <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-955 text-amber-600 dark:text-amber-400">
                        <RefreshCw className="w-4 h-4" />
                      </div>
                      <div>
                        <strong className="block text-xs text-slate-900 dark:text-white">Pillar 4: Data Synchronization &amp; RPO</strong>
                        <span className="text-[9.5px] text-slate-400 block">Recovery Point Objective limit &le; 1 hour</span>
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={sec4DataSync}
                      onChange={e => setSec4DataSync(e.target.value)}
                      placeholder="Asynchronous database replication ensures an RPO limit of 1 hour during operational disruptions..."
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none resize-none leading-relaxed focus:border-blue-500 font-sans"
                    />
                  </div>
                </div>
              </div>

              {/* Section 5: Standard Operating Procedures (3 Interactive Operational Phases) */}
              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
                <div>
                  <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block font-mono">
                    5. Standard Operating Procedures (3 Operational Phases)
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Step-by-step continuity playbook executed during emergency incidents and system failbacks.
                  </p>
                </div>

                <div className="space-y-3.5">
                  {/* Phase I */}
                  <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 shadow-2xs">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-955/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-[9px] font-mono font-bold uppercase">
                          Phase I
                        </span>
                        <strong className="text-xs text-slate-900 dark:text-white">Detection &amp; Declaration (Incident Triage)</strong>
                      </div>
                      <span className="text-[9.5px] text-slate-400 font-mono">Activation within 1 Hour</span>
                    </div>
                    <textarea
                      rows={2}
                      value={sec5Phase1}
                      onChange={e => setSec5Phase1(e.target.value)}
                      placeholder="Automated monitoring alerts evaluate disaster scale; Incident Commander activates DRBCP within 1 hour if localized RTO cannot be maintained..."
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none resize-none leading-relaxed focus:border-purple-500 font-sans"
                    />
                  </div>

                  {/* Phase II */}
                  <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 shadow-2xs">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-955/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 text-[9px] font-mono font-bold uppercase">
                          Phase II
                        </span>
                        <strong className="text-xs text-slate-900 dark:text-white">Activation &amp; Execution (Failover &amp; DNS Routing)</strong>
                      </div>
                      <span className="text-[9.5px] text-slate-400 font-mono">Sub-4-Hour RTO Execution</span>
                    </div>
                    <textarea
                      rows={2}
                      value={sec5Phase2}
                      onChange={e => setSec5Phase2(e.target.value)}
                      placeholder="DRT redirected to GovCloud DR standby instance; DNS records updated; clean database backups verified and mounted..."
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none resize-none leading-relaxed focus:border-purple-500 font-sans"
                    />
                  </div>

                  {/* Phase III */}
                  <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 shadow-2xs">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-955/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[9px] font-mono font-bold uppercase">
                          Phase III
                        </span>
                        <strong className="text-xs text-slate-900 dark:text-white">Failback &amp; Normal Operations (Primary Delta Sync)</strong>
                      </div>
                      <span className="text-[9.5px] text-slate-400 font-mono">Maintenance Window Reroute</span>
                    </div>
                    <textarea
                      rows={2}
                      value={sec5Phase3}
                      onChange={e => setSec5Phase3(e.target.value)}
                      placeholder="Primary data center infrastructure restored; synchronize transactional state delta from DR site during off-peak maintenance window..."
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none resize-none leading-relaxed focus:border-purple-500 font-sans"
                    />
                  </div>
                </div>
              </div>

              {/* Section 6: Clean Plain-Text 4-Pillars Compliance Policies */}
              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
                <div>
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block font-mono">
                    6. Compliance, Scalability &amp; Sustainability Policies (MITHI Res. 2025-01 / SPAR 4 Pillars)
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Statutory institutional policies governing cyber isolation, simulation drills, review frequencies, and UACS multi-year budgeting.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Pillar 6.1 */}
                  <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-white">
                      <Lock className="w-3.5 h-3.5 text-blue-500" />
                      <span>6.1 Cybersecurity Integration Policy</span>
                    </div>
                    <textarea
                      rows={3}
                      value={sec6CyberIntegration}
                      onChange={e => setSec6CyberIntegration(e.target.value)}
                      placeholder="Formal cyber-recovery procedures isolate compromised networks and restore verified clean backups..."
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white leading-normal text-xs font-sans outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Pillar 6.2 */}
                  <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-white">
                      <Target className="w-3.5 h-3.5 text-purple-500" />
                      <span>6.2 Testing &amp; Maintenance Drills Mandate</span>
                    </div>
                    <textarea
                      rows={3}
                      value={sec6DrillsTesting}
                      onChange={e => setSec6DrillsTesting(e.target.value)}
                      placeholder="Mandates at least one (1) full-scale DR simulation exercise per calendar year..."
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white leading-normal text-xs font-sans outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Pillar 6.3 */}
                  <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-white">
                      <Calendar className="w-3.5 h-3.5 text-amber-500" />
                      <span>6.3 Audit &amp; Review Governance Schedule</span>
                    </div>
                    <textarea
                      rows={3}
                      value={sec6AuditReview}
                      onChange={e => setSec6AuditReview(e.target.value)}
                      placeholder="The DRBCP is reviewed annually or whenever major infrastructure or platform migrations occur..."
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white leading-normal text-xs font-sans outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Pillar 6.4 */}
                  <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-white">
                      <Coins className="w-3.5 h-3.5 text-emerald-500" />
                      <span>6.4 UACS &amp; Budgeting Support Alignment</span>
                    </div>
                    <textarea
                      rows={3}
                      value={sec6BudgetSupport}
                      onChange={e => setSec6BudgetSupport(e.target.value)}
                      placeholder="Funding for off-site replication, GovCloud standby subscriptions, and hardware maintenance is allocated under Continuing Costs..."
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white leading-normal text-xs font-sans outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveNarratives}
                  disabled={submitting}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 text-xs shadow-sm"
                >
                  <Save className="w-4 h-4" /> <span>Save Recovery Strategies &amp; Compliance Policies</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 9: COMPLIANCE CHECKLISTS READ-ONLY OVERVIEW & DIRECT ROUTING */}
          {activeTab === "checklists" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2 font-serif">
                    <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Compliance Framework &amp; Checklists Overview</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Parts II.B.2, II.D, III.A.2, and Annex 2 checklists are centrally managed in the dedicated compliance module.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => navigate("/admin/framework")}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 text-xs shadow-sm cursor-pointer transition-all shrink-0"
                >
                  <span>Manage in Compliance Framework Checklists</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-955/30 border border-blue-200 dark:border-blue-900/60 rounded-xl text-[10.5px] text-blue-900 dark:text-blue-300 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Single Source of Truth:</strong> Checklists can no longer be edited in this studio to prevent split-brain discrepancies. Below is a live preview of what will be compiled into the formal ISSP document. Click the button above to add, edit, or toggle items.
                </span>
              </div>

              {/* Read-Only Checklist Previews */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* EGP Checklist Status */}
                <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-blue-500" />
                      <span>Part II.D: E-Gov Programs</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 font-bold">
                      {egovChecklists.length} Criteria
                    </span>
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1 text-[10.5px]">
                    {egovChecklists.length > 0 ? (
                      egovChecklists.map((e) => (
                        <div key={e.id} className="flex justify-between items-center text-slate-700 dark:text-slate-300 py-1 border-b border-slate-200/50 dark:border-slate-800/50 last:border-0">
                          <span className="truncate pr-1">{e.program_name}</span>
                          <span className={`font-mono font-bold text-[9.5px] shrink-0 ${e.is_utilized ? "text-emerald-600" : "text-slate-400"}`}>
                            {e.is_utilized ? "✓ Utilized" : "Equivalent / Manual"}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 italic text-[10px]">No EGP items initialized yet.</p>
                    )}
                  </div>
                </div>

                {/* Cybersecurity Controls Status */}
                <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Cybersecurity Controls</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                      {cyberControlsList.length} Controls
                    </span>
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1 text-[10.5px]">
                    {cyberControlsList.length > 0 ? (
                      cyberControlsList.slice(0, 8).map((c) => (
                        <div key={c.id} className="flex justify-between items-center text-slate-700 dark:text-slate-300 py-1 border-b border-slate-200/50 dark:border-slate-800/50 last:border-0">
                          <span className="truncate pr-1">{c.control_name}</span>
                          <span className={`font-mono font-bold text-[9.5px] shrink-0 ${c.is_implemented ? "text-emerald-600" : "text-slate-400"}`}>
                            {c.is_implemented ? "[X] Active" : "[ ] Planned"}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 italic text-[10px]">No controls configured.</p>
                    )}
                  </div>
                </div>

                {/* DRBCP Governance Status */}
                <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-purple-500" />
                      <span>Annex 2: DRBCP Governance</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950 dark:text-purple-300 font-bold">
                      {drTeam.length} Roles
                    </span>
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1 text-[10.5px]">
                    {drTeam.length > 0 ? (
                      drTeam.map((t) => (
                        <div key={t.id} className="flex justify-between items-center text-slate-700 dark:text-slate-300 py-1 border-b border-slate-200/50 dark:border-slate-800/50 last:border-0">
                          <span className="truncate font-semibold">{t.role}</span>
                          <span className="font-mono text-[9.5px] text-slate-500 truncate max-w-[100px]">{t.contact_person}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 italic text-[10px]">No DRT members recorded.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Global Reference Sidebar Panel */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 h-fit space-y-4 text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed shadow-xs">
          <h3 className="text-slate-900 dark:text-white font-bold text-xs tracking-wider uppercase border-b border-slate-200 dark:border-slate-800 pb-2.5 flex items-center gap-1.5 font-serif">
            <Landmark className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>DICT v.2026 Audit Specs</span>
          </h3>
          
          <div className="space-y-3 font-mono">
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span>Active Cycle:</span>
              <span className="text-slate-900 dark:text-white font-bold">FY {activeCycle || "N/A"}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span>Plan Horizon:</span>
              <span className="text-blue-600 dark:text-blue-400 font-bold">{calculatedSpan} Years (Dynamic)</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span>Plan Type:</span>
              <span className="text-blue-600 dark:text-blue-400 font-bold">{isAmendment ? `${amendmentNumber} Amendment` : "Regular ISSP"}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span>Agency Head Title:</span>
              <span className="text-slate-900 dark:text-white font-bold">{agencyHeadPosition || defaultAgencyHeadTitle}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span>DRBCP Approval:</span>
              <span className="text-slate-900 dark:text-white font-bold">{drbcpApprovalDate || "Approved upon Effectivity"}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span>Page Layout:</span>
              <span className="text-slate-800 dark:text-slate-200 font-bold">A4 Landscape</span>
            </div>
            <div className="flex justify-between">
              <span>Typography:</span>
              <span className="text-slate-800 dark:text-slate-200 font-bold">Palatino Linotype</span>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 text-[10.5px] space-y-1">
            <strong className="text-slate-800 dark:text-slate-300 block uppercase">Continuous Governance Rule</strong>
            <p>
              Updating statutory parameters immediately updates the dynamic PDF compiler and MITHI governance matrices. Official digital archives are generated and certified automatically when cycles conclude.
            </p>
          </div>
        </div>

      </div>

      {/* CHECK ROLLOVER AUDIT REPORT MODAL */}
      {rolloverModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${
                  rolloverModal.data?.status === "ROLLED_OVER_SUCCESS" 
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20" 
                    : "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"
                }`}>
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    ISSP Lifecycle &amp; Rollover Audit Report
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Audited at: {new Date().toLocaleTimeString()} &bull; Current Year: {rolloverModal.currentYear}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setRolloverModal({ isOpen: false, data: null })}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-955 border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Evaluation State</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-bold font-mono uppercase border ${
                  rolloverModal.data?.status === "ROLLED_OVER_SUCCESS" 
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20" 
                    : rolloverModal.data?.status === "ACTIVE_CYCLE_VALID" 
                    ? "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20" 
                    : "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20"
                }`}>
                  {rolloverModal.data?.status === "ROLLED_OVER_SUCCESS" ? "Rollover Executed" : "Active Cycle Current"}
                </span>
              </div>
              <p className="text-slate-700 dark:text-slate-200 text-xs font-semibold leading-relaxed">
                {rolloverModal.data?.message || "Lifecycle check completed."}
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                Actions Performed by Governance Engine
              </span>
              <div className="space-y-2 bg-slate-50/50 dark:bg-slate-955/50 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 text-[11px] leading-relaxed">
                <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Calendar Year Check:</strong> Audited active cycle horizon against calendar year <strong>{rolloverModal.currentYear}</strong>.
                  </span>
                </div>
                {rolloverModal.data?.status === "ACTIVE_CYCLE_VALID" ? (
                  <>
                    <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>Horizon Status:</strong> Planning cycle <strong>FY {activeCycle}</strong> is currently within active effectivity.
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>No Premature Archival:</strong> All proposals, budget sub-ceilings, and milestones remain active for editing and submission.
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>Certified Archive Snapshot:</strong> Concluded cycle snapshot compiled and archived to the <strong>Official Document Vault</strong>.
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>Successor Cycle Initialized:</strong> Next dynamic planning period provisioned as <strong>FY {rolloverModal.data?.new_active_cycle}</strong>.
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {rolloverModal.data?.final_pdf_vault_url && (
                <a
                  href={rolloverModal.data.final_pdf_vault_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-sm text-xs"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>View Archived Snapshot PDF</span>
                </a>
              )}
              {rolloverModal.data?.final_docx_vault_url && (
                <a
                  href={rolloverModal.data.final_docx_vault_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-sm text-xs"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Download Word (.docx)</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => setRolloverModal({ isOpen: false, data: null })}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs cursor-pointer shadow-sm"
              >
                Acknowledge &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
