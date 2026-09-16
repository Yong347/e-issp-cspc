// frontend/src/views/admin/Narrative/NarrativeManager.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { evaluateLifecycleRollover } from "../../../api/admin";
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
  ChevronDown, 
  ChevronRight, 
  Layers, 
  Users, 
  Briefcase, 
  Activity, 
  ShieldCheck, 
  Database, 
  Award,
  Building,
  Clock,
  Compass,
  Network,
  Lock,
  Plus,
  Edit,
  SlidersHorizontal,
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
  Code,
  CheckCircle2,
  Shield
} from "lucide-react";

// Official DICT ISSP v.2026 Canonical 29 Cybersecurity Controls Map
const OFFICIAL_DICT_CONTROLS_MAP = {
  "Physical Security": {
    mandatory: ["Perimeter Protection", "Access Control", "Surveillance System"],
    optional: ["Detection System"]
  },
  "Perimeter Security": {
    mandatory: ["Next Generation Firewalls", "Intrusion Detection/Prevention Systems (IDS/IPS)", "Web Application Firewalls (WAFs)"],
    optional: ["Demilitarized Zone (DMZ)"]
  },
  "Network Security": {
    mandatory: ["Data Encryption"],
    optional: ["Network Segmentation"]
  },
  "Endpoint Security": {
    mandatory: ["Anti-virus and Anti-malware Software", "Application Control", "BYOD Security"],
    optional: ["Extended Detection and Response (XDR)"]
  },
  "Data Security": {
    mandatory: ["Data Classification", "Data Loss Prevention (DLP)", "Data Backups and Recovery"],
    optional: []
  },
  "Application Security": {
    mandatory: ["Regular Security Scanning and Testing"],
    optional: []
  },
  "Other Measures": {
    mandatory: [
      "Vulnerability Assessment", 
      "Patch Management", 
      "Strong Password Policies", 
      "Multi-Factor Authentication (MFA)", 
      "Access Reviews", 
      "Security Logs"
    ],
    optional: [
      "Log Analysis", 
      "Incident Response Plan", 
      "Security Information and Event Management (SIEM)", 
      "Penetration Testing", 
      "Secure Software Development Life Cycle (SDLC)"
    ]
  }
};

const STANDARD_DOMAINS = [
  "Physical Security",
  "Perimeter Security",
  "Network Security",
  "Endpoint Security",
  "Data Security",
  "Application Security",
  "Other Measures"
];

export default function NarrativeManager() {
  const { user } = useAuth();
  const { activeCycle, fetchActiveCycle } = useCycle();

  // Dynamic Institutional Fallbacks
  const defaultAgencyName = import.meta.env?.VITE_AGENCY_NAME || user?.agency_name || "National Government Agency";
  const defaultWebsiteUrl = import.meta.env?.VITE_AGENCY_WEBSITE || "https://agency.gov.ph";
  const defaultAgencyHeadTitle = import.meta.env?.VITE_AGENCY_HEAD_TITLE || "Head of Agency";

  // Active Navigation Tab (10 Distinct DICT v.2026 Structural Sections)
  const [activeTab, setActiveTab] = useState("cycle"); 
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [seedingControls, setSeedingControls] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  // Lifecycle Rollover Modal State
  const [rolloverModal, setRolloverModal] = useState({ isOpen: false, data: null });

  // Tab 1: Dynamic Cycle & Scope State (Template Page 1)
  const [startYear, setStartYear] = useState("2026");
  const [endYear, setEndYear] = useState("2028");
  const [isAmendment, setIsAmendment] = useState(false);
  const [amendmentNumber, setAmendmentNumber] = useState("1st");

  const [agencyName, setAgencyName] = useState(defaultAgencyName);
  const [websiteUrl, setWebsiteUrl] = useState(defaultWebsiteUrl);
  const [primaryScope, setPrimaryScope] = useState("Department-Wide");
  const [deptSubScope, setDeptSubScope] = useState("with_suboffices");
  const [agencySubScope, setAgencySubScope] = useState("central_only");
  const [hasRegionalOffices, setHasRegionalOffices] = useState(true);
  const [hasBureaus, setHasBureaus] = useState(false);

  // Tab 2: Part I.A: Mandate, Functions, Vision, Mission
  const [legalBasis, setLegalBasis] = useState("");
  const [functions, setFunctions] = useState("");
  const [vision, setVision] = useState("");
  const [mission, setMission] = useState("");
  const [presentSituation, setPresentSituation] = useState("");

  // Tab 3: Part III.B: Dynamic Enterprise Architecture Narrative
  const [eaNarrative, setEaNarrative] = useState("");

  // Tab 4: Part I.B.1: Signatories & Leadership Structure
  const [cioName, setCioName] = useState("");
  const [cioPosition, setCioPosition] = useState("");
  const [cioUnit, setCioUnit] = useState("");
  const [cioEmail, setCioEmail] = useState("");
  const [cioContact, setCioContact] = useState("");

  const [focalName, setFocalName] = useState("");
  const [focalPosition, setFocalPosition] = useState("");
  const [focalUnit, setFocalUnit] = useState("");
  const [focalEmail, setFocalEmail] = useState("");
  const [focalContact, setFocalContact] = useState("");

  const [headOfAgencyName, setHeadOfAgencyName] = useState("");
  const [agencyHeadPosition, setAgencyHeadPosition] = useState(defaultAgencyHeadTitle);

  // Tab 5: Part I.B.2: Human Capital Staffing Matrix
  const [humanCapitals, setHumanCapitals] = useState([]);
  const [hcForm, setHcForm] = useState({
    employment_status: "Plantilla (Filled)",
    is_proposed: false,
    it_positions_count: 0,
    non_it_positions_count: 0,
    male_count: 0,
    female_count: 0
  });

  // Tab 6: Part I.C: Stakeholder Analysis
  const [stakeholders, setStakeholders] = useState([]);
  const [shForm, setShForm] = useState({
    stakeholder_group: "",
    transaction_processed_incoming: "",
    transaction_processed_outgoing: "",
    complexity_incoming: "Simple",
    complexity_outgoing: "Simple"
  });

  // Tab 7: Part II.B & III.A: Network Infrastructure & Cybersecurity Controls
  const [networkInfraList, setNetworkInfraList] = useState([]);
  const [cyberControlsList, setCyberControlsList] = useState([]);
  const [cyberViewProposed, setCyberViewProposed] = useState(false); // false = Existing (II.B.2), true = Proposed (III.A.2)
  
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

  // Cybersecurity Form with Mandatory vs. Optional Section Selector
  const [cyberForm, setCyberForm] = useState({
    is_proposed: false,
    control_domain: "Physical Security",
    control_tier: "mandatory", // "mandatory" vs "optional"
    selected_standard: "Perimeter Protection",
    control_name: "Perimeter Protection",
    is_implemented: true
  });

  // Tab 8: Part II.D: E-Government Program Adoption Checklist
  const [egovChecklists, setEgovChecklists] = useState([]);
  const [egForm, setEgForm] = useState({
    program_name: "eGovPay",
    is_utilized: false,
    url_or_system_name: "",
    equivalent_system_details: "",
    adoption_ratio: "",
    channels_json: ["Website", "Email", "Mobile", "Social Media"],
    is_connected_to_portal: false
  });

  // Tab 9: Annex 2: Disaster Recovery & Continuity (Sections 1–6)
  const [drbcpApprovalDate, setDrbcpApprovalDate] = useState("");
  const [drTeam, setDrTeam] = useState([]);
  const [drTeamForm, setDrTeamForm] = useState({
    role: "Incident Commander",
    responsibility: "",
    contact_person: "",
    contact_details: ""
  });

  const [drBia, setDrBia] = useState([]);
  const [drBiaForm, setDrBiaForm] = useState({
    system_name: "",
    classification: "Frontline / Mission-Critical",
    mtpd_hours: 24,
    rto_hours: 4,
    rpo_hours: 1
  });

  const [drAffectedAssets, setDrAffectedAssets] = useState([]);
  const [newAssetGroup, setNewAssetGroup] = useState("");
  const [newAssetDetails, setNewAssetDetails] = useState("");
  const [drRecoveryStrategy, setDrRecoveryStrategy] = useState("");
  const [drSopPhases, setDrSopPhases] = useState("");

  // Tab 9: Annex 2: Section 6 Compliance Policy (4 Pillars + Raw HTML Mode)
  const [customHtmlMode, setCustomHtmlMode] = useState(false);
  const [rawSec6Html, setRawSec6Html] = useState("");
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
    "Continuing costs for GovCloud standby compute, off-site storage, and leased circuits are allocated in Part IV.A of the ISSP."
  );

  const [drMetrics, setDrMetrics] = useState([]);
  const [drMetricsForm, setDrMetricsForm] = useState({
    indicator: "System Availability",
    target_metric: "99.9% Up-time (excluding planned maintenance)"
  });

  // Tab 10: Document Structure Tree State
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [expandedNodes, setExpandedNodes] = useState({});
  const [loadingTree, setLoadingTree] = useState(false);
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeType, setNewNodeType] = useState("section");
  const [nodeTitle, setNodeTitle] = useState("");
  const [nodeTocLabel, setNodeTocLabel] = useState("");
  const [nodeOrientation, setNodeOrientation] = useState("landscape");
  const [nodePageBreak, setNodePageBreak] = useState(false);
  const [nodeSequence, setNodeSequence] = useState("1.0");

  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  useEffect(() => {
    if (activeCycle) {
      const parts = activeCycle.split("-");
      if (parts.length === 2) {
        setStartYear(parts[0]);
        setEndYear(parts[1]);
      }
    }
  }, [activeCycle]);

  // Synchronize Cybersecurity standard dropdown options when domain or tier changes
  const availableStandardControls = useMemo(() => {
    const domainDef = OFFICIAL_DICT_CONTROLS_MAP[cyberForm.control_domain];
    if (!domainDef) return [];
    return cyberForm.control_tier === "mandatory" ? domainDef.mandatory : domainDef.optional;
  }, [cyberForm.control_domain, cyberForm.control_tier]);

  const handleDomainOrTierChange = (newDomain, newTier) => {
    const domainDef = OFFICIAL_DICT_CONTROLS_MAP[newDomain];
    const available = domainDef ? (newTier === "mandatory" ? domainDef.mandatory : domainDef.optional) : [];
    const firstStandard = available.length > 0 ? available[0] : "";
    
    setCyberForm(prev => ({
      ...prev,
      control_domain: newDomain,
      control_tier: newTier,
      selected_standard: firstStandard || "__custom__",
      control_name: firstStandard || ""
    }));
  };

  const parseSection6Html = (htmlString) => {
    if (!htmlString || typeof htmlString !== "string") return;
    setRawSec6Html(htmlString);

    const extractPillarText = (keyword) => {
      try {
        const regex = new RegExp(`<strong>${keyword}:?<\\/strong>\\s*([\\s\\S]*?)(?=<\\/li>|<li>|$)`, "i");
        const match = htmlString.match(regex);
        if (match && match[1]) {
          return match[1].replace(/<\/?[^>]+(>|$)/g, "").trim();
        }
      } catch (e) {
        console.warn(`Could not parse pillar ${keyword}:`, e);
      }
      return null;
    };

    const cyber = extractPillarText("Cybersecurity Integration");
    const drills = extractPillarText("Testing and Maintenance");
    const audit = extractPillarText("Audit and Review");
    const budget = extractPillarText("UACS and Budgeting");

    if (cyber) setSec6CyberIntegration(cyber);
    if (drills) setSec6DrillsTesting(drills);
    if (audit) setSec6AuditReview(audit);
    if (budget) setSec6BudgetSupport(budget);
  };

  const buildSection6Html = () => {
    if (customHtmlMode && rawSec6Html.trim()) {
      return rawSec6Html.trim();
    }
    return `
      <ul style="font-size: 8.5pt; line-height: 1.6; margin-bottom: 10px;">
        <li><strong>Cybersecurity Integration:</strong> ${sec6CyberIntegration.trim()}</li>
        <li><strong>Testing and Maintenance:</strong> ${sec6DrillsTesting.trim()}</li>
        <li><strong>Audit and Review:</strong> ${sec6AuditReview.trim()}</li>
        <li><strong>UACS and Budgeting:</strong> ${sec6BudgetSupport.trim()}</li>
      </ul>
    `.trim();
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
    const c = choiceStr || "Department-Wide";

    if (c.includes("Agency-Wide")) {
      setPrimaryScope("Agency-Wide");
      setAgencySubScope(json.with_regional_offices ? "with_fields" : "central_only");
    } else if (c.includes("Other Government Entity")) {
      setPrimaryScope("Other Government Entity");
    } else if (c.includes("LGU")) {
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
    if (!activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAgencyName(data.agency_name || defaultAgencyName);
        setWebsiteUrl(data.agency_website_url || defaultWebsiteUrl);
        setIsAmendment(Boolean(data.is_amendment));
        setAmendmentNumber(data.amendment_number || "1st");
        
        hydrateScopeFromData(data.scope_choice, data.scope_json);

        setLegalBasis(data.mandate_html || "");
        setFunctions(data.functions || "");
        setVision(data.vision_html || "");
        setMission(data.mission_html || "");
        setPresentSituation(data.present_situation_html || "");

        setEaNarrative(data.enterprise_architecture_narrative || "");

        setDrbcpApprovalDate(data.drbcp_approval_date || "");
        setDrAffectedAssets(Array.isArray(data.drbcp_affected_assets_json) ? data.drbcp_affected_assets_json : []);
        setDrRecoveryStrategy(data.drbcp_recovery_strategy_html || "");
        setDrSopPhases(data.drbcp_sop_phases_html || "");

        if (data.drbcp_compliance_narrative_html) {
          parseSection6Html(data.drbcp_compliance_narrative_html);
        }

        setCioName(data.cio_name || data.signatory_prepared_by || "");
        setCioPosition(data.cio_plantilla_position || data.preparer_position || "");
        setCioUnit(data.cio_organizational_unit || "ICT Management Service");
        setCioEmail(data.cio_email || data.preparer_email || "");
        setCioContact(data.cio_contact_no || data.preparer_tel || "");

        setFocalName(data.focal_name || "");
        setFocalPosition(data.focal_position || "");
        setFocalUnit(data.focal_organizational_unit || "");
        setFocalEmail(data.focal_email || "");
        setFocalContact(data.focal_contact_no || "");

        setHeadOfAgencyName(data.head_of_agency_name || data.signatory_approved_by || "");
        setAgencyHeadPosition(data.agency_head_position || defaultAgencyHeadTitle);
      }
    } catch (e) {
      console.warn("Initializing cycle metadata:", e);
    } finally {
      setLoading(false);
    }
  }, [activeCycle, apiUrl, token, defaultAgencyName, defaultWebsiteUrl, defaultAgencyHeadTitle]);

  const fetchHumanCapitals = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}/human-capitals`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setHumanCapitals(await res.json());
    } catch (e) { console.error(e); }
  }, [activeCycle, apiUrl, token]);

  const fetchStakeholders = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}/stakeholders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setStakeholders(await res.json());
    } catch (e) { console.error(e); }
  }, [activeCycle, apiUrl, token]);

  const fetchNetworkAndCyber = useCallback(async () => {
    try {
      const [netRes, cyberRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/network-infrastructures?issp_period=${encodeURIComponent(activeCycle)}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/cybersecurity-controls?issp_period=${encodeURIComponent(activeCycle)}`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (netRes.ok) setNetworkInfraList(await netRes.json());
      if (cyberRes.ok) setCyberControlsList(await cyberRes.json());
    } catch (e) { console.error(e); }
  }, [activeCycle, apiUrl, token]);

  const fetchEgovChecklists = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}/egov-checklists`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setEgovChecklists(await res.json());
    } catch (e) { console.error(e); }
  }, [activeCycle, apiUrl, token]);

  const fetchDrTeams = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}/dr-teams`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setDrTeam(await res.json());
    } catch (e) { console.error(e); }
  }, [activeCycle, apiUrl, token]);

  const fetchDrBias = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}/dr-bias`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setDrBia(await res.json());
    } catch (e) { console.error(e); }
  }, [activeCycle, apiUrl, token]);

  const fetchDrMetrics = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}/dr-metrics`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setDrMetrics(await res.json());
    } catch (e) { console.error(e); }
  }, [activeCycle, apiUrl, token]);

  const fetchDocumentTree = useCallback(async () => {
    setLoadingTree(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/issp/document-tree`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setNodes(await res.json());
    } catch (e) {
      console.error("Failed to load document skeleton:", e);
    } finally {
      setLoadingTree(false);
    }
  }, [apiUrl, token]);

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
    fetchDocumentTree();
  }, [token, activeCycle, fetchCycleData, fetchHumanCapitals, fetchStakeholders, fetchNetworkAndCyber, fetchEgovChecklists, fetchDrTeams, fetchDrBias, fetchDrMetrics, fetchDocumentTree]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleSaveNarratives = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    const safeStart = parseInt(startYear, 10) || 2026;
    const safeEnd = parseInt(endYear, 10) || (safeStart + 2);
    const { scope_choice, scope_json } = resolveScopePayload();
    const compiledSec6 = buildSection6Html();

    const payload = {
      agency_name: agencyName.trim() || defaultAgencyName,
      agency_website_url: websiteUrl.trim() || null,
      is_amendment: Boolean(isAmendment),
      amendment_number: isAmendment ? (amendmentNumber.trim() || "1st") : null,
      scope_choice,
      scope_json,
      issp_period_from: safeStart,
      issp_period_to: safeEnd,

      mandate_html: legalBasis.trim(),
      functions: functions.trim(),
      vision_html: vision.trim(),
      mission_html: mission.trim(),
      present_situation_html: presentSituation.trim(),

      enterprise_architecture_narrative: eaNarrative.trim(),

      drbcp_approval_date: drbcpApprovalDate.trim() || null,
      drbcp_affected_assets_json: drAffectedAssets || [],
      drbcp_recovery_strategy_html: drRecoveryStrategy.trim(),
      drbcp_sop_phases_html: drSopPhases.trim(),
      drbcp_compliance_narrative_html: compiledSec6,

      cio_name: cioName.trim() || null,
      cio_plantilla_position: cioPosition.trim() || null,
      cio_organizational_unit: cioUnit.trim() || null,
      cio_email: cioEmail.trim() || null,
      cio_contact_no: cioContact.trim() || null,

      focal_name: focalName.trim() || null,
      focal_position: focalPosition.trim() || null,
      focal_organizational_unit: focalUnit.trim() || null,
      focal_email: focalEmail.trim() || null,
      focal_contact_no: focalContact.trim() || null,

      head_of_agency_name: headOfAgencyName.trim() || null,
      agency_head_position: agencyHeadPosition.trim() || defaultAgencyHeadTitle,
      signatory_prepared_by: cioName.trim() || "Chief Information Officer",
      signatory_approved_by: headOfAgencyName.trim() || defaultAgencyHeadTitle
    };

    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        let detail = errData.detail;
        if (Array.isArray(detail)) {
          detail = detail.map(d => `${d.loc ? d.loc.filter(p => p !== "body").join(" -> ") + ": " : ""}${d.msg}`).join(" | ");
        } else if (typeof detail === "object" && detail !== null) {
          detail = JSON.stringify(detail);
        }
        throw new Error(detail || "Failed to persist primary coversheet parameters.");
      }

      setSuccess("Primary narrative, statutory mandates, Agency Head title, and DRBCP compliance sections saved successfully.");
      fetchCycleData();
    } catch (err) {
      setError(err.message || "Failed to save parameters.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivateCycle = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const start = parseInt(startYear, 10);
    const end = parseInt(endYear, 10);

    if (isNaN(start) || isNaN(end) || start > end) {
      setError("Please specify valid planning years (Start Year <= End Year).");
      return;
    }

    const span = end - start + 1;
    if (span < 1 || span > 20) {
      setError(`ISSP planning horizons must span between 1 and 20 years (Current span: ${span} years).`);
      return;
    }

    setSubmitting(true);
    const targetCycle = `${start}-${end}`;

    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(targetCycle)}/activate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        let detail = err.detail;
        if (Array.isArray(detail)) {
          detail = detail.map(d => `${d.loc ? d.loc.filter(p => p !== "body").join(" -> ") + ": " : ""}${d.msg}`).join(" | ");
        } else if (typeof detail === "object" && detail !== null) {
          detail = JSON.stringify(detail);
        }
        throw new Error(detail || "Failed to activate cycle.");
      }

      setSuccess(`Planning cycle updated and activated to: FY ${targetCycle} (${span}-Year Horizon)`);
      await fetchActiveCycle();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
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
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}/reset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        let detail = err.detail;
        if (typeof detail === "object" && detail !== null) detail = JSON.stringify(detail);
        throw new Error(detail || "Cycle reset aborted.");
      }

      setSuccess("Active cycle successfully reset. Clean state established.");
      await fetchActiveCycle();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEvaluateRollover = async (force = false) => {
    if (force && !window.confirm("FORCE ROLLOVER TEST: Freeze active cycle, compile final snapshot, archive to S3 Glacier, and automatically provision successor cycle?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await evaluateLifecycleRollover(token, force);
      setRolloverModal({
        isOpen: true,
        data: res,
        currentYear: new Date().getFullYear(),
        activeCycle
      });
      if (fetchActiveCycle) fetchActiveCycle();
      loadAllData();
    } catch (err) {
      setError(err.message || "Failed to execute lifecycle rollover evaluation.");
    } finally {
      setSubmitting(false);
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

  const handleAddHumanCapital = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}/human-capitals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(hcForm)
      });
      if (!res.ok) throw new Error("Failed to record human capital matrix entry.");
      setSuccess("Staffing matrix updated.");
      setHcForm({ employment_status: "Plantilla (Filled)", is_proposed: false, it_positions_count: 0, non_it_positions_count: 0, male_count: 0, female_count: 0 });
      fetchHumanCapitals();
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };

  const handleDeleteHumanCapital = async (id) => {
    try {
      await fetch(`${apiUrl}/api/admin/human-capitals/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchHumanCapitals();
    } catch (err) { setError(err.message); }
  };

  const handleAddStakeholder = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}/stakeholders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(shForm)
      });
      if (!res.ok) throw new Error("Failed to record stakeholder analysis.");
      setSuccess("Stakeholder matrix updated.");
      setShForm({ stakeholder_group: "", transaction_processed_incoming: "", transaction_processed_outgoing: "", complexity_incoming: "Simple", complexity_outgoing: "Simple" });
      fetchStakeholders();
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };

  const handleDeleteStakeholder = async (id) => {
    try {
      await fetch(`${apiUrl}/api/admin/stakeholders/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchStakeholders();
    } catch (err) { setError(err.message); }
  };

  const handleAddNetworkInfra = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/network-infrastructures?issp_period=${encodeURIComponent(activeCycle)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(netForm)
      });
      if (!res.ok) throw new Error("Failed to register network infrastructure.");
      setSuccess("Network infrastructure profile saved.");
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
      fetchNetworkAndCyber();
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };

  const handleDeleteNetworkInfra = async (id) => {
    try {
      await fetch(`${apiUrl}/api/admin/network-infrastructures/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchNetworkAndCyber();
    } catch (err) { setError(err.message); }
  };

  // Add Cybersecurity Control with Tier Validation
  const handleAddCyberControl = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const nameToSave = cyberForm.selected_standard === "__custom__" 
      ? cyberForm.control_name.trim() 
      : (cyberForm.selected_standard || cyberForm.control_name).trim();

    if (!nameToSave) {
      setError("Control Name cannot be empty.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        is_proposed: cyberForm.is_proposed,
        control_domain: cyberForm.control_domain,
        control_name: nameToSave,
        is_mandatory: cyberForm.control_tier === "mandatory",
        is_implemented: cyberForm.is_implemented
      };

      const res = await fetch(`${apiUrl}/api/admin/cybersecurity-controls?issp_period=${encodeURIComponent(activeCycle)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Failed to record cybersecurity control.");
      setSuccess(`Control '${nameToSave}' saved under ${payload.is_mandatory ? "MANDATORY" : "OPTIONAL"} column.`);
      
      handleDomainOrTierChange(cyberForm.control_domain, cyberForm.control_tier);
      fetchNetworkAndCyber();
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };

  const handleToggleCyberImplemented = async (item) => {
    try {
      await fetch(`${apiUrl}/api/admin/cybersecurity-controls/${encodeURIComponent(item.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...item, is_implemented: !item.is_implemented })
      });
      fetchNetworkAndCyber();
    } catch (err) { console.error(err); }
  };

  const handleDeleteCyberControl = async (id) => {
    try {
      await fetch(`${apiUrl}/api/admin/cybersecurity-controls/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchNetworkAndCyber();
    } catch (err) { setError(err.message); }
  };

  // Seed / Restore All 29 Official DICT Cybersecurity Controls Endpoint Trigger
  const handleSeedDefaultControls = async () => {
    setError(null);
    setSuccess(null);
    setSeedingControls(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/cybersecurity-controls/seed-defaults?issp_period=${encodeURIComponent(activeCycle)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to initialize standard DICT controls.");
      }
      const data = await res.json();
      setSuccess(data.message || "All 29 Official DICT Cybersecurity Controls initialized successfully.");
      fetchNetworkAndCyber();
    } catch (err) {
      setError(err.message || "Seeding failed.");
    } finally {
      setSeedingControls(false);
    }
  };

  const handleAddEgov = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}/egov-checklists`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(egForm)
      });
      if (!res.ok) throw new Error("Failed to record EGP adoption item.");
      setSuccess("E-Government Program checklist updated.");
      setEgForm({ program_name: "eGovPay", is_utilized: false, url_or_system_name: "", equivalent_system_details: "", adoption_ratio: "", channels_json: ["Website", "Email", "Mobile", "Social Media"], is_connected_to_portal: false });
      fetchEgovChecklists();
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };

  const handleDeleteEgov = async (id) => {
    try {
      await fetch(`${apiUrl}/api/admin/egov-checklists/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchEgovChecklists();
    } catch (err) { setError(err.message); }
  };

  const handleAddDrTeam = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}/dr-teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(drTeamForm)
      });
      if (!res.ok) throw new Error("Failed to record DRT member.");
      setSuccess("DRT Member added.");
      setDrTeamForm({ role: "Incident Commander", responsibility: "", contact_person: "", contact_details: "" });
      fetchDrTeams();
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };

  const handleDeleteDrTeam = async (id) => {
    try {
      await fetch(`${apiUrl}/api/admin/dr-teams/${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      fetchDrTeams();
    } catch (e) { console.error(e); }
  };

  const handleAddDrBia = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}/dr-bias`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...drBiaForm,
          mtpd_hours: parseInt(drBiaForm.mtpd_hours, 10),
          rto_hours: parseInt(drBiaForm.rto_hours, 10),
          rpo_hours: parseInt(drBiaForm.rpo_hours, 10)
        })
      });
      if (!res.ok) throw new Error("Failed to record BIA targets.");
      setSuccess("BIA targets preserved.");
      setDrBiaForm({ system_name: "", classification: "Frontline / Mission-Critical", mtpd_hours: 24, rto_hours: 4, rpo_hours: 1 });
      fetchDrBias();
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };

  const handleDeleteDrBia = async (id) => {
    try {
      await fetch(`${apiUrl}/api/admin/dr-bias/${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      fetchDrBias();
    } catch (e) { console.error(e); }
  };

  const handleAddDrMetric = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}/dr-metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(drMetricsForm)
      });
      if (!res.ok) throw new Error("Failed to register DR KPI metric.");
      setSuccess("DR KPI metric added.");
      setDrMetricsForm({ indicator: "System Availability", target_metric: "99.9% Up-time (excluding planned maintenance)" });
      fetchDrMetrics();
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };

  const handleDeleteDrMetric = async (id) => {
    try {
      await fetch(`${apiUrl}/api/admin/dr-metrics/${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      fetchDrMetrics();
    } catch (e) { console.error(e); }
  };

  const handleSelectNode = (node) => {
    setSelectedNode(node);
    setNodeTitle(node.vocabulary?.display_title || "");
    setNodeTocLabel(node.vocabulary?.toc_label || "");
    setNodeOrientation(node.page_orientation || "landscape");
    setNodePageBreak(Boolean(node.force_page_break));
    setNodeSequence(String(node.sequence_order || "1.0"));
  };

  const handleSaveNode = async (e) => {
    e.preventDefault();
    if (!selectedNode) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/issp/nodes/${encodeURIComponent(selectedNode.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          page_orientation: nodeOrientation,
          force_page_break: nodePageBreak,
          sequence_order: parseFloat(nodeSequence) || 1.0
        })
      });
      if (!res.ok) throw new Error("Failed to update document node.");
      setSuccess(`Document node '${nodeTitle}' updated.`);
      fetchDocumentTree();
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };

  const handleCreateChildNode = async (e) => {
    e.preventDefault();
    if (!newNodeName.trim() || !selectedNode) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/issp/nodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          parent_id: selectedNode.id,
          node_type: newNodeType,
          system_key: `NODE_${newNodeName.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`,
          sequence_order: 1.0,
          display_title: newNodeName.trim(),
          toc_label: newNodeName.trim()
        })
      });
      if (!res.ok) throw new Error("Failed to create child node.");
      setNewNodeName("");
      fetchDocumentTree();
    } catch (e) { console.error(e); }
  };

  const handleDeleteNode = async (id) => {
    if (!window.confirm("Purge document section node and its descendants?")) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/issp/nodes/${encodeURIComponent(id)}`, { 
        method: "DELETE", 
        headers: { Authorization: `Bearer ${token}` } 
      });
      if (!res.ok) throw new Error("Failed to delete node.");
      setSelectedNode(null);
      fetchDocumentTree();
    } catch (e) { console.error(e); }
  };

  const renderTree = (nodesList, depth = 0) => {
    return (
      <ul className={`space-y-1 ${depth > 0 ? "pl-4 border-l border-slate-200 dark:border-slate-800" : ""}`}>
        {nodesList.map(node => {
          const hasChildren = node.children && node.children.length > 0;
          const isExpanded = Boolean(expandedNodes[node.id]);
          const isSelected = selectedNode?.id === node.id;

          return (
            <li key={node.id} className="space-y-1">
              <div 
                className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer group transition-colors ${
                  isSelected ? "bg-blue-600 text-white font-bold" : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
                onClick={() => handleSelectNode(node)}
              >
                <div className="flex items-center gap-2 truncate">
                  {hasChildren ? (
                    <button 
                      type="button" 
                      onClick={(e) => { e.stopPropagation(); setExpandedNodes(prev => ({ ...prev, [node.id]: !prev[node.id] })); }}
                      className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                    >
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  ) : <span className="w-4 h-4" />}
                  <span className="truncate">{node.vocabulary?.display_title || node.system_key}</span>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDeleteNode(node.id); }}
                  className="p-1 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {hasChildren && isExpanded && renderTree(node.children, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  const calculatedSpan = (parseInt(endYear, 10) || 2028) - (parseInt(startYear, 10) || 2026) + 1;
  const totalIT = humanCapitals.reduce((acc, h) => acc + (h.it_positions_count || 0), 0);
  const totalNonIT = humanCapitals.reduce((acc, h) => acc + (h.non_it_positions_count || 0), 0);
  const totalMale = humanCapitals.reduce((acc, h) => acc + (h.male_count || 0), 0);
  const totalFemale = humanCapitals.reduce((acc, h) => acc + (h.female_count || 0), 0);

  // Group cybersecurity controls into 7 official security domains
  const activeCyberControls = useMemo(() => {
    return cyberControlsList.filter(c => Boolean(c.is_proposed) === Boolean(cyberViewProposed));
  }, [cyberControlsList, cyberViewProposed]);

  const uniqueDomains = useMemo(() => {
    const list = [...STANDARD_DOMAINS];
    activeCyberControls.forEach(c => {
      const d = c.control_domain || "Other Measures";
      if (!list.some(item => item.toLowerCase() === d.toLowerCase())) {
        list.push(d);
      }
    });
    return list;
  }, [activeCyberControls]);

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
            Maintain legal mandates, signatory profiles, human capital matrices, network/cybersecurity controls, and DRBCP continuity frameworks.
          </p>
        </div>
        <button
          onClick={loadAllData}
          disabled={loading}
          className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-bold shadow-xs text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync All</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-center gap-2.5 shadow-xs animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center gap-2.5 shadow-xs animate-fadeIn">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Navigation Tabs (10 Sections) */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 self-start shadow-xs">
        {[
          { id: "cycle", label: "1. Planning Scope", icon: <CalendarRange className="w-3.5 h-3.5" /> },
          { id: "mandate", label: "2. Mandate & Functions", icon: <Landmark className="w-3.5 h-3.5" /> },
          { id: "ea", label: "3. Enterprise Arch (III.B)", icon: <HardDrive className="w-3.5 h-3.5" /> },
          { id: "cio_focal", label: "4. CIO & Focal (I.B.1)", icon: <Users className="w-3.5 h-3.5" /> },
          { id: "humancapital", label: "5. Human Capital (I.B.2)", icon: <Briefcase className="w-3.5 h-3.5" /> },
          { id: "stakeholders", label: "6. Stakeholders (I.C)", icon: <Compass className="w-3.5 h-3.5" /> },
          { id: "network_cyber", label: "7. Network & Cyber (II.B / III.A)", icon: <Network className="w-3.5 h-3.5" /> },
          { id: "egov", label: "8. EGP Checklist (II.D)", icon: <Activity className="w-3.5 h-3.5" /> },
          { id: "drbcp", label: "9. DRBCP (Annex 2)", icon: <ShieldAlert className="w-3.5 h-3.5" /> },
          { id: "tree", label: "10. Document Tree", icon: <Layers className="w-3.5 h-3.5" /> }
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
              <form onSubmit={handleSaveNarratives} className="space-y-4">
                <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center gap-1.5">
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
                    <label className="text-[10px] uppercase font-bold text-slate-500">Agency / Department Legal Name</label>
                    <input
                      type="text" required value={agencyName} onChange={e => setAgencyName(e.target.value)}
                      placeholder="e.g. Department of Information and Communications Technology"
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
                        <span>Department-Wide &rarr; Department - Central Office / Head Office</span>
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
                            <span>With Sub-Offices / Regional Offices / Bureaus</span>
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
                                <span className="font-semibold text-blue-700 dark:text-blue-300">With Regional / Field Offices</span>
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
                      type="number" required value={startYear} onChange={e => setStartYear(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-center font-bold text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">End Fiscal Year</label>
                    <input
                      type="number" required value={endYear} onChange={e => setEndYear(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-center font-bold text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl flex justify-between items-center text-[10px]">
                  <span className="text-slate-600 dark:text-slate-400">Planning Horizon: <strong className="text-blue-600 dark:text-blue-400 font-mono">{calculatedSpan}-Year Strategic Cycle</strong></span>
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

              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
                    <Workflow className="w-4 h-4 text-blue-500" />
                    <span>Automated Cycle Rollover &amp; Cold Archival Engine</span>
                  </div>
                  <span className="text-[9px] px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 rounded font-mono font-bold uppercase">
                    Continuous Audit
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
                  When calendar year exceeds the plan's end year (e.g. &gt; {endYear}), the system freezes the concluding cycle, compiles and archives its final certified PDF to <strong>AWS S3 Glacier</strong>, and automatically provisions the successor cycle with cloned baselines.
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

              <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl space-y-2 shadow-xs">
                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold">
                  <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>Cycle Redefinition &amp; Safe-Reset</span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
                  Resetting the active cycle purges unapproved proposals and reinitializes clean planning bounds for '{activeCycle}'.
                </p>
                <button
                  type="button" onClick={handleResetCycle} disabled={submitting}
                  className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
                >
                  <Trash2 className="w-3.5 h-3.5" /> <span>Execute Safe Reset</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: PART I.A MANDATES, FUNCTIONS, VISION & MISSION */}
          {activeTab === "mandate" && (
            <form onSubmit={handleSaveNarratives} className="space-y-4 animate-fadeIn">
              <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center gap-1.5">
                <Landmark className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Part I.A: Statutory Charter &amp; Institutional Framework</span>
              </h3>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500">A.1 Legal Basis (Enabling Law / Executive Order / Charter)</label>
                <textarea
                  rows={3} required value={legalBasis} onChange={e => setLegalBasis(e.target.value)}
                  placeholder="Cite statutory legal basis (e.g., Republic Act No. 10844, Executive Order No. 292, or statutory charter)..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs outline-none resize-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500">A.1 Functions (Directly Derived from Statutory Mandate)</label>
                <textarea
                  rows={3} required value={functions} onChange={e => setFunctions(e.target.value)}
                  placeholder="Official public functions, regulatory monitoring, policy formulation, and citizen service delivery..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs outline-none resize-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500">A.2 Vision Statement</label>
                  <textarea
                    rows={3} required value={vision} onChange={e => setVision(e.target.value)}
                    placeholder="Desired long-term future direction and digital public service excellence..."
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs outline-none resize-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500">A.3 Mission Statement</label>
                  <textarea
                    rows={3} required value={mission} onChange={e => setMission(e.target.value)}
                    placeholder="Core institutional purpose, digital transformation goals, and citizen-centric governance..."
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
                    Statutory outcome categories (OO for NGAs, SO for GOCCs, MFO for SUCs/LGUs) are managed in the dedicated Outcomes console.
                  </p>
                </div>
                <a
                  href="/admin/outcomes"
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <span>Manage Outcomes</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500">Present ICT Situation &amp; Operational Bottlenecks</label>
                <textarea
                  rows={4} required value={presentSituation} onChange={e => setPresentSituation(e.target.value)}
                  placeholder="Summary of existing infrastructure, network bottlenecks, and server vulnerabilities..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs outline-none resize-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit" disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm text-xs"
              >
                <Save className="w-4 h-4" /> <span>Save Statutory Mandates</span>
              </button>
            </form>
          )}

          {/* TAB 3: PART III.B ENTERPRISE ARCHITECTURE DYNAMIC STUDIO */}
          {activeTab === "ea" && (
            <form onSubmit={handleSaveNarratives} className="space-y-4 animate-fadeIn">
              <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Part III.B: Proposed Enterprise Architecture Narrative</span>
              </h3>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[10.5px] text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                <span>
                  <strong>Dynamic PDF Compilation:</strong> This narrative renders under Section III.B alongside the Enterprise Architecture schematic diagram. Detail microservices containerization on GovCloud, PeGIF API gateways, and multi-agency registries.
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500">Enterprise Architecture Narrative Text</label>
                <textarea
                  rows={8}
                  required
                  value={eaNarrative}
                  onChange={e => setEaNarrative(e.target.value)}
                  placeholder="The proposed Enterprise Architecture rationalizes agency legacy registries into microservices containerized on GovCloud, utilizing PeGIF-compliant API gateways to support interoperability..."
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

          {/* TAB 4: PART I.B.1 CIO & ISSP FOCAL PERSON PROFILES */}
          {activeTab === "cio_focal" && (
            <form onSubmit={handleSaveNarratives} className="space-y-6 animate-fadeIn">
              <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Part I.B.1: Signatories &amp; Leadership Structure</span>
              </h3>

              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 tracking-wider block">
                  Chief Information Officer (CIO) Profile
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Full Name (First, MI, Last)</label>
                    <input
                      type="text" required value={cioName} onChange={e => setCioName(e.target.value)}
                      placeholder="e.g. Juan D. Dela Cruz"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Plantilla Position</label>
                    <input
                      type="text" required value={cioPosition} onChange={e => setCioPosition(e.target.value)}
                      placeholder="e.g. Director IV / Chief Information Officer"
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

              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 tracking-wider block">
                  Alternate ISSP Focal Person
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

              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider block">
                  Head of Agency Signatory (Cover Page &amp; Statutory Approval)
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Head of Agency Full Name</label>
                    <input
                      type="text" required value={headOfAgencyName} onChange={e => setHeadOfAgencyName(e.target.value)}
                      placeholder="e.g. Hon. Secretary / Chairperson / Director General"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Official Position Title</label>
                    <input
                      type="text" required value={agencyHeadPosition} onChange={e => setAgencyHeadPosition(e.target.value)}
                      placeholder="e.g. Secretary, Undersecretary, Director General, President"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <span className="text-[9.5px] text-slate-400 italic block">
                  *Renders dynamically beneath the Agency Head's signature on Page 1 of the compiled ISSP PDF.
                </span>
              </div>

              <button
                type="submit" disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm text-xs"
              >
                <Save className="w-4 h-4" /> <span>Save Signatories &amp; Leadership Profiles</span>
              </button>
            </form>
          )}

          {/* TAB 5: PART I.B.2 HUMAN CAPITAL MATRIX */}
          {activeTab === "humancapital" && (
            <div className="space-y-6 animate-fadeIn">
              <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide border-b border-slate-200 dark:border-slate-800 pb-2">
                Part I.B.2: Human Capital Staffing Matrix (Current vs. Proposed)
              </h3>

              <form onSubmit={handleAddHumanCapital} className="bg-slate-50 dark:bg-slate-955 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Planning Scope</label>
                    <select
                      value={hcForm.is_proposed ? "true" : "false"}
                      onChange={e => setHcForm({ ...hcForm, is_proposed: e.target.value === "true" })}
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xs cursor-pointer"
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
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xs cursor-pointer"
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
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Non-IT Positions</label>
                    <input
                      type="number" min="0" required value={hcForm.non_it_positions_count}
                      onChange={e => setHcForm({ ...hcForm, non_it_positions_count: parseInt(e.target.value, 10) || 0 })}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Male (GAD)</label>
                    <input
                      type="number" min="0" required value={hcForm.male_count}
                      onChange={e => setHcForm({ ...hcForm, male_count: parseInt(e.target.value, 10) || 0 })}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Female (GAD)</label>
                    <input
                      type="number" min="0" required value={hcForm.female_count}
                      onChange={e => setHcForm({ ...hcForm, female_count: parseInt(e.target.value, 10) || 0 })}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs"
                    />
                  </div>
                </div>

                <button
                  type="submit" disabled={submitting}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-colors cursor-pointer text-xs shadow-sm"
                >
                  Record Staffing Matrix Row
                </button>
              </form>

              <div className="overflow-x-auto bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9.5px] font-mono font-bold">
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
                          <button onClick={() => handleDeleteHumanCapital(hc.id)} className="p-1 hover:text-rose-600 text-slate-400 cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

          {/* TAB 6: PART I.C STAKEHOLDER ANALYSIS */}
          {activeTab === "stakeholders" && (
            <div className="space-y-6 animate-fadeIn">
              <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide border-b border-slate-200 dark:border-slate-800 pb-2">
                Part I.C: Stakeholder Analysis Matrix (Processing Complexities)
              </h3>

              <form onSubmit={handleAddStakeholder} className="bg-slate-50 dark:bg-slate-955 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Stakeholder Group</label>
                    <input
                      type="text" required value={shForm.stakeholder_group}
                      onChange={e => setShForm({ ...shForm, stakeholder_group: e.target.value })}
                      placeholder="e.g. General Citizens, Overseas Filipinos"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Incoming Complexity</label>
                    <select
                      value={shForm.complexity_incoming}
                      onChange={e => setShForm({ ...shForm, complexity_incoming: e.target.value })}
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xs cursor-pointer"
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
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xs cursor-pointer"
                    >
                      <option value="Simple">Simple (&le; 3 Working Days)</option>
                      <option value="Complex">Complex (&le; 7 Working Days)</option>
                      <option value="Highly Technical">Highly Technical (&le; 20 Working Days)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Incoming Transaction Processed</label>
                    <textarea
                      rows={2} required value={shForm.transaction_processed_incoming}
                      onChange={e => setShForm({ ...shForm, transaction_processed_incoming: e.target.value })}
                      placeholder="Online service applications, statutory filings, regulatory inquiries..."
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Outgoing Transaction Processed</label>
                    <textarea
                      rows={2} required value={shForm.transaction_processed_outgoing}
                      onChange={e => setShForm({ ...shForm, transaction_processed_outgoing: e.target.value })}
                      placeholder="Verified digital certificates, regulatory clearances, service statements..."
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none text-xs"
                    />
                  </div>
                </div>

                <button
                  type="submit" disabled={submitting}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-colors cursor-pointer text-xs shadow-sm"
                >
                  Save Stakeholder Record
                </button>
              </form>

              <div className="overflow-x-auto bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9.5px] font-mono font-bold">
                      <th className="p-3.5">Stakeholder Group</th>
                      <th className="p-3.5">Incoming Transaction</th>
                      <th className="p-3.5">Outgoing Transaction</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {stakeholders.map(s => (
                      <tr key={s.id} className="hover:bg-slate-100/60 dark:hover:bg-slate-900/40 transition-colors">
                        <td className="p-3.5 font-bold text-slate-800 dark:text-slate-200">{s.stakeholder_group}</td>
                        <td className="p-3.5">
                          <span className="text-slate-700 dark:text-slate-300">{s.transaction_processed_incoming}</span>
                          <span className="block text-[9.5px] text-blue-600 dark:text-blue-400 font-mono mt-0.5 font-bold">Complexity: {s.complexity_incoming}</span>
                        </td>
                        <td className="p-3.5">
                          <span className="text-slate-700 dark:text-slate-300">{s.transaction_processed_outgoing}</span>
                          <span className="block text-[9.5px] text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 font-bold">Complexity: {s.complexity_outgoing}</span>
                        </td>
                        <td className="p-3.5 text-right">
                          <button onClick={() => handleDeleteStakeholder(s.id)} className="p-1 hover:text-rose-600 text-slate-400 cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: PART II.B & III.A NETWORK INFRASTRUCTURE & CYBERSECURITY CHECKLIST */}
          {activeTab === "network_cyber" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide flex items-center gap-1.5">
                  <Network className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Parts II.B &amp; III.A: Network Infrastructure &amp; Cybersecurity Controls</span>
                </h3>

                {/* 1-Click Seed/Restore All 29 Official DICT Controls */}
                <button
                  type="button"
                  onClick={handleSeedDefaultControls}
                  disabled={seedingControls}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs font-mono text-[10px]"
                  title="Initialize all 20 Mandatory and 9 Optional DICT standard controls across all 7 security domains"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${seedingControls ? "animate-spin" : ""}`} />
                  <span>{seedingControls ? "Restoring Controls..." : "Restore All 29 Official DICT Controls"}</span>
                </button>
              </div>

              {/* 1. LAN/WAN Infrastructure Setup (II.B.1 & III.A.1) */}
              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block font-mono">
                  1. LAN/WAN Infrastructure Specifications (II.B.1 &amp; III.A.1)
                </span>
                <form onSubmit={handleAddNetworkInfra} className="space-y-3">
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
                        placeholder="e.g. Central Office / Main Datacenter"
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
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500">Upload (Mbps)</label>
                      <input
                        type="number" min="1" required value={netForm.upload_speed_mbps}
                        onChange={e => setNetForm({ ...netForm, upload_speed_mbps: parseInt(e.target.value, 10) || 0 })}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500">Download (Mbps)</label>
                      <input
                        type="number" min="1" required value={netForm.download_speed_mbps}
                        onChange={e => setNetForm({ ...netForm, download_speed_mbps: parseInt(e.target.value, 10) || 0 })}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
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
                      placeholder="Core switch distribution, fiber optic distribution backbone, SD-WAN router links..."
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none text-xs"
                    />
                  </div>

                  <button type="submit" className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white cursor-pointer shadow-sm text-xs">
                    Save Network Setup Profile
                  </button>
                </form>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pt-2">
                  {networkInfraList.map(n => (
                    <div key={n.id} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex justify-between items-center text-xs shadow-2xs">
                      <div>
                        <span className={`px-2 py-0.5 text-[8.5px] font-bold rounded-full uppercase mr-2 ${n.is_proposed ? "bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20" : "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"}`}>
                          {n.is_proposed ? "Proposed" : "Existing"}
                        </span>
                        <strong>{n.office_location || "Central Office"}:</strong> {n.connectivity_type} ({n.bandwidth_mbps} Mbps) - IPv6: {n.is_ipv6_ready ? "Yes" : "No"}
                      </div>
                      <button onClick={() => handleDeleteNetworkInfra(n.id)} className="text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Official Cybersecurity Controls Checklist Section (MANDATORY vs OPTIONAL Split) */}
              <div className="p-5 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block font-mono">
                      2. Cybersecurity Control Checklist (Template Pages 10 &amp; 17)
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Classifies controls into the official 3-column table across all 7 Security Domains.
                    </p>
                  </div>

                  {/* Existing vs Proposed Controls View Switcher */}
                  <div className="flex bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setCyberViewProposed(false)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                        !cyberViewProposed 
                          ? "bg-blue-600 text-white shadow-xs" 
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      Part II.B.2 Existing Checklist
                    </button>
                    <button
                      type="button"
                      onClick={() => setCyberViewProposed(true)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                        cyberViewProposed 
                          ? "bg-purple-600 text-white shadow-xs" 
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      Part III.A.2 Proposed Checklist
                    </button>
                  </div>
                </div>

                {/* Control Insertion Form with Mandatory vs. Optional Section Selector */}
                <form onSubmit={handleAddCyberControl} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-2xs">
                  <span className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wider block">
                    Add / Configure Security Control
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {/* Planning State */}
                    <div className="space-y-1">
                      <label className="text-[9.5px] uppercase font-bold text-slate-500">Planning State</label>
                      <select
                        value={cyberForm.is_proposed ? "true" : "false"}
                        onChange={e => setCyberForm({ ...cyberForm, is_proposed: e.target.value === "true" })}
                        className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 text-xs cursor-pointer font-medium"
                      >
                        <option value="false">Part II.B.2 Existing Control</option>
                        <option value="true">Part III.A.2 Proposed Control</option>
                      </select>
                    </div>

                    {/* Security Domain */}
                    <div className="space-y-1">
                      <label className="text-[9.5px] uppercase font-bold text-slate-500">Security Domain</label>
                      <select
                        value={cyberForm.control_domain}
                        onChange={e => handleDomainOrTierChange(e.target.value, cyberForm.control_tier)}
                        className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 text-xs cursor-pointer font-medium"
                      >
                        {STANDARD_DOMAINS.map(dom => (
                          <option key={dom} value={dom}>{dom}</option>
                        ))}
                      </select>
                    </div>

                    {/* Control Tier / Section Selector (MANDATORY vs OPTIONAL) */}
                    <div className="space-y-1">
                      <label className="text-[9.5px] uppercase font-bold text-slate-500">Control Tier / Column</label>
                      <select
                        value={cyberForm.control_tier}
                        onChange={e => handleDomainOrTierChange(cyberForm.control_domain, e.target.value)}
                        className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 text-xs cursor-pointer font-bold"
                      >
                        <option value="mandatory">MANDATORY Column (DICT Baseline)</option>
                        <option value="optional">OPTIONAL Column (Advanced / Elective)</option>
                      </select>
                    </div>

                    {/* Standard DICT Control Picker Dropdown */}
                    <div className="space-y-1">
                      <label className="text-[9.5px] uppercase font-bold text-slate-500">Standard DICT Control</label>
                      <select
                        value={cyberForm.selected_standard}
                        onChange={e => {
                          const val = e.target.value;
                          setCyberForm(prev => ({
                            ...prev,
                            selected_standard: val,
                            control_name: val === "__custom__" ? "" : val
                          }));
                        }}
                        className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 text-xs cursor-pointer font-medium"
                      >
                        {availableStandardControls.map(cName => (
                          <option key={cName} value={cName}>{cName}</option>
                        ))}
                        <option value="__custom__">-- Custom Control Name... --</option>
                      </select>
                    </div>
                  </div>

                  {/* Name Input & Active Status */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center pt-1">
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[9.5px] uppercase font-bold text-slate-500">
                        {cyberForm.selected_standard === "__custom__" ? "Custom Control Name" : "Effective Control Label"}
                      </label>
                      <input
                        type="text"
                        required
                        value={cyberForm.control_name}
                        onChange={e => setCyberForm({ ...cyberForm, control_name: e.target.value })}
                        placeholder="e.g. Next-Gen Firewalls or Biometrics"
                        className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs font-semibold"
                      />
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-955 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-800 dark:text-slate-200 block">Implementation State</span>
                        <span className="text-[9px] text-slate-400 block">[X] Active vs [ ] Planned</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={cyberForm.is_implemented}
                        onChange={e => setCyberForm({ ...cyberForm, is_implemented: e.target.checked })}
                        className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                      />
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold cursor-pointer transition-colors shadow-sm text-xs flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Save Control to {cyberForm.control_tier === "mandatory" ? "MANDATORY" : "OPTIONAL"} Section</span>
                  </button>
                </form>

                {/* Official DICT 3-Column Interactive Table (Security Domain | MANDATORY | OPTIONAL) */}
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-955 text-slate-600 dark:text-slate-300 font-bold uppercase text-[9.5px] font-mono">
                        <th className="p-3.5 w-1/4 border-r border-slate-200 dark:border-slate-800">Security Domain</th>
                        <th className="p-3.5 w-2/5 border-r border-slate-200 dark:border-slate-800 text-blue-700 dark:text-blue-400">
                          MANDATORY Controls
                        </th>
                        <th className="p-3.5 w-[35%] text-purple-700 dark:text-purple-400">
                          OPTIONAL Controls
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-[11px]">
                      {uniqueDomains.map(domain => {
                        const domainControls = activeCyberControls.filter(
                          c => (c.control_domain || "").toLowerCase().trim() === domain.toLowerCase().trim()
                        );
                        const mandatoryControls = domainControls.filter(c => c.is_mandatory);
                        const optionalControls = domainControls.filter(c => !c.is_mandatory);

                        return (
                          <tr key={domain} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-colors">
                            {/* Security Domain Column */}
                            <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide border-r border-slate-200 dark:border-slate-800 align-top bg-slate-50/50 dark:bg-slate-955/50 font-mono text-[10px]">
                              {domain}
                            </td>

                            {/* MANDATORY Controls Column */}
                            <td className="p-3.5 border-r border-slate-200 dark:border-slate-800 align-top space-y-1.5">
                              {mandatoryControls.length > 0 ? (
                                mandatoryControls.map(c => (
                                  <div key={c.id} className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 group transition-colors">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleCyberImplemented(c)}
                                      className="flex items-center gap-2 cursor-pointer text-left flex-1 select-none"
                                      title="Click to toggle [X] Active / [ ] Inactive state"
                                    >
                                      <span className={`font-mono font-bold text-[10px] px-1.5 py-0.2 rounded border ${
                                        c.is_implemented 
                                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20" 
                                          : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400"
                                      }`}>
                                        {c.is_implemented ? "[X]" : "[ ]"}
                                      </span>
                                      <span className={`font-medium ${c.is_implemented ? "text-slate-900 dark:text-white" : "text-slate-500"}`}>
                                        {c.control_name}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteCyberControl(c.id)}
                                      className="p-1 text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                      title="Delete control"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <span className="text-slate-400 italic text-[10px]">No mandatory controls configured</span>
                              )}
                            </td>

                            {/* OPTIONAL Controls Column */}
                            <td className="p-3.5 align-top space-y-1.5">
                              {optionalControls.length > 0 ? (
                                optionalControls.map(c => (
                                  <div key={c.id} className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 group transition-colors">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleCyberImplemented(c)}
                                      className="flex items-center gap-2 cursor-pointer text-left flex-1 select-none"
                                      title="Click to toggle [X] Active / [ ] Inactive state"
                                    >
                                      <span className={`font-mono font-bold text-[10px] px-1.5 py-0.2 rounded border ${
                                        c.is_implemented 
                                          ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20" 
                                          : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400"
                                      }`}>
                                        {c.is_implemented ? "[X]" : "[ ]"}
                                      </span>
                                      <span className={`font-medium ${c.is_implemented ? "text-slate-900 dark:text-white" : "text-slate-500"}`}>
                                        {c.control_name}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteCyberControl(c.id)}
                                      className="p-1 text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                      title="Delete control"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <span className="text-slate-400 italic text-[10px]">None specified</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: PART II.D E-GOVERNMENT PROGRAMS CHECKLIST */}
          {activeTab === "egov" && (
            <div className="space-y-6 animate-fadeIn">
              <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide border-b border-slate-200 dark:border-slate-800 pb-2">
                Part II.D: National E-Government Programs (EGP) Checklist
              </h3>

              <form onSubmit={handleAddEgov} className="bg-slate-50 dark:bg-slate-955 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">National Initiative</label>
                    <select
                      value={egForm.program_name}
                      onChange={e => setEgForm({ ...egForm, program_name: e.target.value })}
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xs cursor-pointer"
                    >
                      <option value="eGovPay">eGovPay (Payment Gateway)</option>
                      <option value="PNPKI">PNPKI (Digital Signatures)</option>
                      <option value="eLGU">eLGU (Local Govt Unit Platform)</option>
                      <option value="HCMIS">HCMIS (Human Capital IS)</option>
                      <option value="IFMIS">IFMIS (Financial Management IS)</option>
                      <option value="Online Public Service Portal">Online Public Service Portal</option>
                      <option value="PhilGEPS">PhilGEPS (Procurement System)</option>
                      <option value="Records">Records &amp; Knowledge Repository</option>
                      <option value="Public Service Continuity Plan">Public Service Continuity Plan</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Adoption State</label>
                    <select
                      value={egForm.is_utilized ? "true" : "false"}
                      onChange={e => setEgForm({ ...egForm, is_utilized: e.target.value === "true" })}
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xs cursor-pointer"
                    >
                      <option value="true">Actively Utilized (National Portal)</option>
                      <option value="false">Using Equivalent / Manual Process</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Portal URL / Identifier</label>
                    <input
                      type="text" value={egForm.url_or_system_name}
                      onChange={e => setEgForm({ ...egForm, url_or_system_name: e.target.value })}
                      placeholder="e.g. egovpay.gov.ph"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500">Adoption Ratio (PNPKI)</label>
                    <input
                      type="text" value={egForm.adoption_ratio}
                      onChange={e => setEgForm({ ...egForm, adoption_ratio: e.target.value })}
                      placeholder="e.g. 75% of eligible officials with active certs"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <input
                      type="checkbox" id="portal_cb" checked={egForm.is_connected_to_portal}
                      onChange={e => setEgForm({ ...egForm, is_connected_to_portal: e.target.checked })}
                      className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    />
                    <label htmlFor="portal_cb" className="font-bold text-slate-700 dark:text-slate-300 cursor-pointer">Connected to Online Public Portals?</label>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500">Equivalent System or Non-Adoption Details</label>
                  <input
                    type="text" value={egForm.equivalent_system_details}
                    onChange={e => setEgForm({ ...egForm, equivalent_system_details: e.target.value })}
                    placeholder="Provide details if utilizing an equivalent system or manual processes..."
                    className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs"
                  />
                </div>

                <button
                  type="submit" disabled={submitting}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-colors cursor-pointer shadow-sm text-xs"
                >
                  Save EGP Checklist Status
                </button>
              </form>

              <div className="overflow-x-auto bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9.5px] font-mono font-bold">
                      <th className="p-3.5">Program</th>
                      <th className="p-3.5 text-center">Status</th>
                      <th className="p-3.5">System URL / Name</th>
                      <th className="p-3.5">Equivalent Justification</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {egovChecklists.map(eg => (
                      <tr key={eg.id} className="hover:bg-slate-100/60 dark:hover:bg-slate-900/40 transition-colors">
                        <td className="p-3.5 font-bold text-slate-800 dark:text-slate-200">{eg.program_name}</td>
                        <td className="p-3.5 text-center font-bold text-blue-600 dark:text-blue-400 font-mono">{eg.is_utilized ? "[✓] Utilized" : "[X] Non-Adoption"}</td>
                        <td className="p-3.5 font-mono text-slate-700 dark:text-slate-300">{eg.url_or_system_name || "N/A"}</td>
                        <td className="p-3.5 text-slate-500 dark:text-slate-400">{eg.equivalent_system_details || "N/A"}</td>
                        <td className="p-3.5 text-right">
                          <button onClick={() => handleDeleteEgov(eg.id)} className="p-1 hover:text-rose-600 text-slate-400 cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 9: ANNEX 2 DISASTER RECOVERY & BUSINESS CONTINUITY (SECTIONS 1 TO 6 DYNAMIC) */}
          {activeTab === "drbcp" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2">
                <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-500" />
                  <span>Annex 2: Disaster Recovery &amp; Business Continuity Plan (DRBCP)</span>
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">Governed under DICT / ISO 22301 Standards</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                  Plan Overview &amp; Official Governance Approval Date (Template Annex 2 Page 1)
                </span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Official DRBCP Approval Date</label>
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        value={drbcpApprovalDate}
                        onChange={e => setDrbcpApprovalDate(e.target.value)}
                        placeholder="e.g. March 15, 2026"
                        className="w-full pl-9 p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
                      />
                    </div>
                    <span className="text-[9.5px] text-slate-400 block">
                      *Renders as 'Approval Date: {drbcpApprovalDate || "Approved upon Plan Effectivity"}' on Annex 2 Page 1.
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Agency Identification &amp; Version</label>
                    <div className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-700 dark:text-slate-300">
                      <strong>Agency:</strong> {agencyName} &nbsp;|&nbsp; <strong>Version:</strong> {activeCycle}.1
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveNarratives}
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm"
                >
                  Save Approval Date
                </button>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">1. Disaster Recovery Team (DRT)</span>
                <form onSubmit={handleAddDrTeam} className="grid grid-cols-2 gap-3">
                  <input
                    type="text" required placeholder="Role (e.g. Incident Commander)"
                    value={drTeamForm.role} onChange={e => setDrTeamForm({ ...drTeamForm, role: e.target.value })}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs"
                  />
                  <input
                    type="text" required placeholder="Contact Person"
                    value={drTeamForm.contact_person} onChange={e => setDrTeamForm({ ...drTeamForm, contact_person: e.target.value })}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs"
                  />
                  <input
                    type="text" required placeholder="Responsibility details"
                    value={drTeamForm.responsibility} onChange={e => setDrTeamForm({ ...drTeamForm, responsibility: e.target.value })}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white col-span-2 text-xs"
                  />
                  <input
                    type="text" required placeholder="24/7 Contact Details"
                    value={drTeamForm.contact_details} onChange={e => setDrTeamForm({ ...drTeamForm, contact_details: e.target.value })}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
                  />
                  <button type="submit" className="py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white cursor-pointer shadow-sm text-xs">
                    Add DRT Member
                  </button>
                </form>

                <div className="space-y-1.5 max-h-32 overflow-y-auto pt-1">
                  {drTeam.map(m => (
                    <div key={m.id} className="flex justify-between items-center p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs shadow-2xs">
                      <span><strong>{m.role}:</strong> {m.contact_person} ({m.contact_details})</span>
                      <button onClick={() => handleDeleteDrTeam(m.id)} className="text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">2. Business Impact Analysis (BIA Summary)</span>
                <form onSubmit={handleAddDrBia} className="grid grid-cols-3 gap-3">
                  <input
                    type="text" required placeholder="Mission-Critical System Name"
                    value={drBiaForm.system_name} onChange={e => setDrBiaForm({ ...drBiaForm, system_name: e.target.value })}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white col-span-2 text-xs"
                  />
                  <input
                    type="text" required placeholder="Classification"
                    value={drBiaForm.classification} onChange={e => setDrBiaForm({ ...drBiaForm, classification: e.target.value })}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs"
                  />
                  <input
                    type="number" min="0" required placeholder="MTPD (Hours)"
                    value={drBiaForm.mtpd_hours} onChange={e => setDrBiaForm({ ...drBiaForm, mtpd_hours: e.target.value })}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
                  />
                  <input
                    type="number" min="0" required placeholder="RTO (Hours)"
                    value={drBiaForm.rto_hours} onChange={e => setDrBiaForm({ ...drBiaForm, rto_hours: e.target.value })}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
                  />
                  <input
                    type="number" min="0" required placeholder="RPO (Hours)"
                    value={drBiaForm.rpo_hours} onChange={e => setDrBiaForm({ ...drBiaForm, rpo_hours: e.target.value })}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
                  />
                  <button type="submit" className="col-span-3 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white cursor-pointer shadow-sm text-xs">
                    Save BIA Target (RTO &le; 4h mandates GovCloud Continuing Outlays)
                  </button>
                </form>

                <div className="space-y-1.5 max-h-32 overflow-y-auto pt-1">
                  {drBia.map(b => (
                    <div key={b.id} className="flex justify-between items-center p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs shadow-2xs">
                      <span><strong>{b.system_name}</strong> - RTO: {b.rto_hours}h | RPO: {b.rpo_hours}h | MTPD: {b.mtpd_hours}h</span>
                      <button onClick={() => handleDeleteDrBia(b.id)} className="text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                  3. ICT Component Inventory &amp; Affected Assets (Dynamic Section)
                </span>
                
                <div className="grid grid-cols-3 gap-3">
                  <input
                    type="text"
                    placeholder="Asset Group (e.g. Primary Data Center)"
                    value={newAssetGroup}
                    onChange={e => setNewAssetGroup(e.target.value)}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Physical servers, SAN storage, optical fiber backbone..."
                    value={newAssetDetails}
                    onChange={e => setNewAssetDetails(e.target.value)}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white col-span-2 text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddAffectedAsset}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-bold cursor-pointer flex items-center gap-1.5 text-xs shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" /> Append Affected Asset Category
                </button>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pt-1">
                  {drAffectedAssets.map((asset, aIdx) => (
                    <div key={aIdx} className="flex justify-between items-center p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs shadow-2xs">
                      <div>
                        <strong className="text-slate-900 dark:text-white">{asset.asset_group}:</strong>
                        <span className="text-slate-600 dark:text-slate-300 ml-1.5">{asset.details}</span>
                      </div>
                      <button onClick={() => handleDeleteAffectedAsset(aIdx)} className="text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  {drAffectedAssets.length === 0 && (
                    <div className="text-slate-400 italic text-[11px]">No custom affected assets defined. Default baseline will be compiled.</div>
                  )}
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
                <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">
                  4 &amp; 5. Technical Recovery Strategy &amp; SOP Operational Phases
                </span>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500">4. Technical Recovery Strategy (HTML or Text)</label>
                  <textarea
                    rows={3}
                    value={drRecoveryStrategy}
                    onChange={e => setDrRecoveryStrategy(e.target.value)}
                    placeholder="1. Off-site Backups: Maintained in a secondary facility (>30km). 2. Cloud Failover: Critical portals replicated to GovCloud..."
                    className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs outline-none resize-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500">5. Standard Operating Procedures (SOP Phases)</label>
                  <textarea
                    rows={3}
                    value={drSopPhases}
                    onChange={e => setDrSopPhases(e.target.value)}
                    placeholder="Phase I: Detection & Declaration. Phase II: Activation & Execution. Phase III: Failback (Normal Operations)..."
                    className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs outline-none resize-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
                <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2">
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                    6. Compliance, Scalability &amp; Sustainability Policies (MITHI Res. 2025-01 / SPAR)
                  </span>
                  
                  <button
                    type="button"
                    onClick={() => {
                      if (!customHtmlMode) {
                        setRawSec6Html(buildSection6Html());
                      }
                      setCustomHtmlMode(!customHtmlMode);
                    }}
                    className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    <Code className="w-3 h-3" />
                    <span>{customHtmlMode ? "Switch to 4-Pillar Mode" : "Switch to Raw HTML Mode"}</span>
                  </button>
                </div>

                {!customHtmlMode ? (
                  <div className="space-y-3 animate-fadeIn">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">
                        6.1 Cybersecurity Integration Policy
                      </label>
                      <textarea
                        rows={2}
                        value={sec6CyberIntegration}
                        onChange={e => setSec6CyberIntegration(e.target.value)}
                        placeholder="Describe procedures to isolate compromised networks, sanitize environments, and restore verified clean snapshots following ransomware or cyber-attack events..."
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white leading-normal text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">
                        6.2 Testing &amp; Maintenance Drills Mandate
                      </label>
                      <textarea
                        rows={2}
                        value={sec6DrillsTesting}
                        onChange={e => setSec6DrillsTesting(e.target.value)}
                        placeholder="Mandate the frequency of full-scale DR simulation drills (min 1 per year) and tabletop walkthroughs..."
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white leading-normal text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">
                        6.3 Audit &amp; Review Governance Schedule
                      </label>
                      <textarea
                        rows={2}
                        value={sec6AuditReview}
                        onChange={e => setSec6AuditReview(e.target.value)}
                        placeholder="Define periodic review cycles (annual / post-migration audit trigger)..."
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white leading-normal text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">
                        6.4 UACS &amp; Budgeting Support Alignment
                      </label>
                      <textarea
                        rows={2}
                        value={sec6BudgetSupport}
                        onChange={e => setSec6BudgetSupport(e.target.value)}
                        placeholder="Detail how GovCloud standby compute, off-site storage, and leased circuits are funded under Continuing Costs in Part IV.A..."
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white leading-normal text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 animate-fadeIn">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Custom Section 6 HTML Source</label>
                    <textarea
                      rows={8}
                      value={rawSec6Html}
                      onChange={e => setRawSec6Html(e.target.value)}
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl font-mono text-xs text-slate-900 dark:text-white outline-none"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSaveNarratives}
                  disabled={submitting}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 text-xs shadow-sm"
                >
                  <Save className="w-4 h-4" /> <span>Save Recovery Strategies &amp; Compliance Policies</span>
                </button>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                  DRBCP Key Performance Indicators (SPAR Reporting)
                </span>
                
                <form onSubmit={handleAddDrMetric} className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Indicator (e.g. System Availability)"
                    value={drMetricsForm.indicator}
                    onChange={e => setDrMetricsForm({ ...drMetricsForm, indicator: e.target.value })}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Target Metric (e.g. 99.9% Up-time)"
                    value={drMetricsForm.target_metric}
                    onChange={e => setDrMetricsForm({ ...drMetricsForm, target_metric: e.target.value })}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs"
                  />
                  <button
                    type="submit"
                    className="col-span-2 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white cursor-pointer shadow-sm text-xs"
                  >
                    Add DR KPI Target
                  </button>
                </form>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pt-1">
                  {drMetrics.map(kpi => (
                    <div key={kpi.id} className="flex justify-between items-center p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs shadow-2xs">
                      <div>
                        <strong className="text-slate-900 dark:text-white">{kpi.indicator}:</strong>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-1.5">{kpi.target_metric}</span>
                      </div>
                      <button onClick={() => handleDeleteDrMetric(kpi.id)} className="text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* TAB 10: DYNAMIC DOCUMENT TREE SKELETON */}
          {activeTab === "tree" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Skeletal Document Tree</span>
                {loadingTree ? <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-500" /> : renderTree(nodes)}

                {selectedNode && (
                  <form onSubmit={handleCreateChildNode} className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
                    <input
                      type="text" placeholder="Child section name..."
                      value={newNodeName} onChange={e => setNewNodeName(e.target.value)}
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs"
                    />
                    <button type="submit" className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-bold cursor-pointer text-xs shadow-sm">
                      Append Subsection
                    </button>
                  </form>
                )}
              </div>

              <div className="md:col-span-2 space-y-4">
                {selectedNode ? (
                  <form onSubmit={handleSaveNode} className="space-y-4">
                    <div className="p-3 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center font-mono text-xs">
                      <span>Node Key: <strong className="text-blue-600 dark:text-blue-400">{selectedNode.system_key}</strong></span>
                      <span className="text-[9px] px-2.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded-full uppercase font-bold">{selectedNode.node_type}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500">Display Title Header</label>
                        <input
                          type="text" required value={nodeTitle} onChange={e => setNodeTitle(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold outline-none text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500">TOC Short Label</label>
                        <input
                          type="text" required value={nodeTocLabel} onChange={e => setNodeTocLabel(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500">Orientation</label>
                        <select
                          value={nodeOrientation} onChange={e => setNodeOrientation(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xs cursor-pointer"
                        >
                          <option value="landscape">Landscape (Standard)</option>
                          <option value="portrait">Portrait (Cover / Specials)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500">Sorting Sequence</label>
                        <input
                          type="number" step="0.01" required value={nodeSequence} onChange={e => setNodeSequence(e.target.value)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                      <input
                        type="checkbox" checked={nodePageBreak} onChange={e => setNodePageBreak(e.target.checked)}
                        className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                      />
                      <span className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300">Force Page Break Before Section</span>
                    </div>

                    <button type="submit" disabled={submitting} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white cursor-pointer shadow-sm text-xs">
                      Save Node Configuration
                    </button>
                  </form>
                ) : (
                  <div className="text-center py-20 text-slate-400 italic border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl">
                    Select a section node from the tree outline to edit its layout properties.
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Global Reference Sidebar Panel */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 h-fit space-y-4 text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed shadow-xs">
          <h3 className="text-slate-900 dark:text-white font-bold text-xs tracking-wider uppercase border-b border-slate-200 dark:border-slate-800 pb-2.5 flex items-center gap-1.5">
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
              Updating statutory parameters immediately updates the dynamic PDF compiler and MITHI governance matrices. S3 Glacier backups are made automatically when cycles conclude.
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
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20"
                    : rolloverModal.data?.status === "ACTIVE_CYCLE_VALID"
                    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"
                    : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20"
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
                        <strong>Horizon Status:</strong> Planning cycle <strong>FY {activePeriod}</strong> is currently within active effectivity.
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
                        <strong>Cold Storage Snapshot:</strong> Concluded cycle snapshot compiled and archived to <strong>AWS S3 Glacier</strong>.
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
