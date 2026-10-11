// frontend/src/views/admin/Governance/FrameworkChecklists.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import {
  getNetworkInfrastructures,
  createNetworkInfrastructure,
  updateNetworkInfrastructure,
  deleteNetworkInfrastructure,
  getCybersecurityControls,
  createCybersecurityControl,
  updateCybersecurityControl,
  deleteCybersecurityControl,
  seedDefaultCybersecurityControls,
  getEgovChecklists,
  createEgovChecklist,
  updateEgovChecklist,
  deleteEgovChecklist,
  getHarmonizationCriteria,
  createHarmonizationCriterion,
  updateHarmonizationCriterion,
  deleteHarmonizationCriterion,
  getDrTeams,
  createDrTeam,
  updateDrTeam,
  deleteDrTeam,
  getDrBias,
  createDrBia,
  updateDrBia,
  deleteDrBia,
  getDrMetrics,
  createDrMetric,
  updateDrMetric,
  deleteDrMetric,
  getInformationSystems,
  getStakeholders,
  createStakeholder,
  updateStakeholder,
  deleteStakeholder,
  getDevelopmentStrategies,
  createDevelopmentStrategy,
  deleteDevelopmentStrategy
} from "../../../api/admin";
import CompilerSyncButton from "../../../components/common/CompilerSyncButton";
import {
  Network,
  ShieldAlert,
  Save,
  RefreshCw,
  Plus,
  Trash2,
  Edit3,
  Globe,
  AlertCircle,
  CheckCircle,
  X,
  Server,
  Lock,
  Sparkles,
  Search,
  ExternalLink,
  Info,
  Database,
  Link2,
  Users,
  Compass,
  Workflow,
  Code
} from "lucide-react";

// Official DICT ISSP Cybersecurity Domains (NIST / DICT Circular 2026 Aligned)
const CYBER_DOMAINS = [
  "Physical Security",
  "Perimeter Security",
  "Network Security",
  "Endpoint Security",
  "Data Security",
  "Application Security",
  "Other Measures"
];

// Standard Frontline Interaction Channels
const FRONT_CHANNELS = ["Website", "Email", "Mobile", "Landline", "Social Media"];

// Canonical Complexity Presets for Stakeholder Transactions (DICT Part I.C)
const COMPLEXITY_PRESETS = [
  "Simple",
  "Complex",
  "Highly Technical",
  "Simple to Complex",
  "Simple to Highly Technical",
  "Complex to Highly Technical"
];

// Canonical National E-Gov Initiative Presets
const EGOV_PRESETS = [
  { name: "eLGU", label: "Electronic Local Government Unit (eLGU)" },
  { name: "eGovPay", label: "Government Digital Payment System (eGovPay)" },
  { name: "PNPKI", label: "Philippine National Public Key Infrastructure (PNPKI)" },
  { name: "HCMIS", label: "Human Capital Management Information System (HCMIS)" },
  { name: "IFMIS", label: "Integrated Financial Management IS (IFMIS)" },
  { name: "Online Public Service Portal", label: "Online Public Service Portal" },
  { name: "PhilGEPS", label: "Philippine Government Electronic Procurement System (PhilGEPS)" },
  { name: "Records and Knowledge Management IS", label: "Records and Knowledge Management IS" },
  { name: "Public Service Continuity Plan (PSCP)", label: "Public Service Continuity Plan (PSCP)" },
  { name: "eGov PH Super App", label: "eGov PH Super App & Citizen Portal" },
  { name: "National Single Window (NSW)", label: "National Single Window & Trade Portal" },
  { name: "eTravel", label: "eTravel Border Control & Customs Clearance" },
  { name: "GovCloud", label: "DICT GovCloud Shared Platform Services" }
];

export default function FrameworkChecklists() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();

  // Top-level category tabs
  const [activeTab, setActiveTab] = useState("network"); // "network" | "cyber" | "egov" | "harmonization" | "drbcp" | "stakeholders" | "strategies"

  // -------------------------------------------------------------
  // DATA STATES
  // -------------------------------------------------------------
  const [networkInfra, setNetworkInfra] = useState([]);
  const [cyberControls, setCyberControls] = useState([]);
  const [egovChecklist, setEgovChecklist] = useState([]);
  const [harmonizationCriteria, setHarmonizationCriteria] = useState([]);
  const [drTeams, setDrTeams] = useState([]);
  const [drBias, setDrBias] = useState([]);
  const [drMetrics, setDrMetrics] = useState([]);
  const [stakeholders, setStakeholders] = useState([]);
  const [informationSystems, setInformationSystems] = useState([]);
  const [devStrategies, setDevStrategies] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // -------------------------------------------------------------
  // TAB-SPECIFIC FILTER STATES
  // -------------------------------------------------------------
  const [netFilterScope, setNetFilterScope] = useState("all"); // "all" | "existing" | "proposed"
  const [cyberFilterScope, setCyberFilterScope] = useState("existing"); // "existing" | "proposed"
  const [cyberDomainFilter, setCyberDomainFilter] = useState("All");
  const [cyberRequirementFilter, setCyberRequirementFilter] = useState("All"); // "All" | "Mandatory" | "Optional"
  const [egovSearch, setEgovSearch] = useState("");
  const [egovStatusFilter, setEgovStatusFilter] = useState("all"); // "all" | "utilized" | "not_utilized" | "proposed"
  const [drSubTab, setDrSubTab] = useState("teams"); // "teams" | "bia" | "metrics"
  const [stakeholderSearch, setStakeholderSearch] = useState("");

  // -------------------------------------------------------------
  // MODAL STATES
  // -------------------------------------------------------------
  // 1. Network Modal
  const [isNetModalOpen, setIsNetModalOpen] = useState(false);
  const [editingNetId, setEditingNetId] = useState(null);
  const [netForm, setNetForm] = useState({
    office_location: "Central Office",
    connectivity_type: "Dedicated Leased Line Fiber Optic",
    bandwidth_mbps: 100,
    upload_speed_mbps: 100,
    download_speed_mbps: 100,
    is_ipv6_ready: true,
    is_proposed: false,
    topology_description: "",
    diagram_url: ""
  });

  // 2. Cyber Control Modal
  const [isCyberModalOpen, setIsCyberModalOpen] = useState(false);
  const [editingCyberId, setEditingCyberId] = useState(null);
  const [cyberForm, setCyberForm] = useState({
    control_domain: "Perimeter Security",
    control_name: "",
    is_mandatory: true,
    is_implemented: false,
    is_proposed: false
  });

  // 3. E-Gov Program Modal
  const [isEgovModalOpen, setIsEgovModalOpen] = useState(false);
  const [editingEgovId, setEditingEgovId] = useState(null);
  const initialEgovForm = {
    program_name: "",
    is_utilized: false,
    url_or_system_name: "",
    equivalent_system_details: "",
    equivalent_system_name: "",
    equivalent_system_url: "",
    has_other_payment_platform: false,
    is_manual: false,
    is_proposed_development: false,
    proposed_development_name: "",
    total_employees: "",
    active_pnpki_count: "",
    adoption_ratio: "",
    channels_json: ["Website", "Email"],
    is_connected_to_portal: false
  };
  const [egovForm, setEgovForm] = useState(initialEgovForm);

  // 4. Harmonization Criterion Modal
  const [isHarmonizationModalOpen, setIsHarmonizationModalOpen] = useState(false);
  const [editingHarmonizationId, setEditingHarmonizationId] = useState(null);
  const [harmonizationForm, setHarmonizationForm] = useState({
    name: "",
    is_mandatory: false,
    description: ""
  });

  // 5. DRBCP Modals (Team, BIA, KPI)
  const [isDrTeamModalOpen, setIsDrTeamModalOpen] = useState(false);
  const [editingDrTeamId, setEditingDrTeamId] = useState(null);
  const [drTeamForm, setDrTeamForm] = useState({
    role: "",
    responsibility: "",
    contact_person: "",
    contact_details: ""
  });

  const [isBiaModalOpen, setIsBiaModalOpen] = useState(false);
  const [editingBiaId, setEditingBiaId] = useState(null);
  const [biaForm, setBiaForm] = useState({
    system_id: "",
    system_name: "",
    classification: "Frontline / Mission-Critical",
    mtpd_hours: 24,
    rto_hours: 4,
    rpo_hours: 1
  });

  const [isDrMetricModalOpen, setIsDrMetricModalOpen] = useState(false);
  const [editingDrMetricId, setEditingDrMetricId] = useState(null);
  const [drMetricForm, setDrMetricForm] = useState({
    indicator: "",
    target_metric: ""
  });

  // 6. Stakeholder Analysis Modal
  const [isStakeholderModalOpen, setIsStakeholderModalOpen] = useState(false);
  const [editingStakeholderId, setEditingStakeholderId] = useState(null);
  const [stakeholderForm, setStakeholderForm] = useState({
    stakeholder_group: "",
    transaction_processed_incoming: "",
    complexity_incoming: "Simple",
    transaction_processed_outgoing: "",
    complexity_outgoing: "Simple"
  });

  // 7. Development Strategy Modal
  const [isDevStrategyModalOpen, setIsDevStrategyModalOpen] = useState(false);
  const [devStrategyForm, setDevStrategyForm] = useState({
    code: "",
    display_name: "",
    description: ""
  });

  const token = user?.token || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  // Close modals on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsNetModalOpen(false);
        setIsCyberModalOpen(false);
        setIsEgovModalOpen(false);
        setIsHarmonizationModalOpen(false);
        setIsDrTeamModalOpen(false);
        setIsBiaModalOpen(false);
        setIsDrMetricModalOpen(false);
        setIsStakeholderModalOpen(false);
        setIsDevStrategyModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // -------------------------------------------------------------
  // DATA FETCHING PIPELINE
  // -------------------------------------------------------------
  const loadAllGovernanceData = useCallback(async () => {
    if (!token || !activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      const [
        netData, 
        cyberData, 
        egovData, 
        teamData, 
        biaData, 
        metricData, 
        systemsData,
        shData,
        harmData,
        stratData
      ] = await Promise.all([
        getNetworkInfrastructures(token, activeCycle).catch(() => []),
        getCybersecurityControls(token, activeCycle).catch(() => []),
        getEgovChecklists(token, activeCycle).catch(() => []),
        getDrTeams(token, activeCycle).catch(() => []),
        getDrBias(token, activeCycle).catch(() => []),
        getDrMetrics(token, activeCycle).catch(() => []),
        getInformationSystems(token, activeCycle).catch(() => []),
        getStakeholders(token, activeCycle).catch(() => []),
        getHarmonizationCriteria(token).catch(() => []),
        getDevelopmentStrategies(token).catch(() => [])
      ]);

      setNetworkInfra(Array.isArray(netData) ? netData : []);
      setCyberControls(Array.isArray(cyberData) ? cyberData : []);
      setEgovChecklist(Array.isArray(egovData) ? egovData : []);
      setDrTeams(Array.isArray(teamData) ? teamData : []);
      setDrBias(Array.isArray(biaData) ? biaData : []);
      setDrMetrics(Array.isArray(metricData) ? metricData : []);
      setInformationSystems(Array.isArray(systemsData) ? systemsData : []);
      setStakeholders(Array.isArray(shData) ? shData : []);
      setHarmonizationCriteria(Array.isArray(harmData) ? harmData : []);
      setDevStrategies(Array.isArray(stratData) ? stratData : []);
    } catch (err) {
      setError(err.message || "Failed to load governance frameworks data.");
    } finally {
      setLoading(false);
    }
  }, [token, activeCycle]);

  useEffect(() => {
    loadAllGovernanceData();
  }, [loadAllGovernanceData]);

  // =============================================================
  // TAB 1: NETWORK INFRASTRUCTURE HANDLERS
  // =============================================================
  const handleOpenNetModal = (item = null, defaultProposed = false) => {
    if (item) {
      setEditingNetId(item.id);
      setNetForm({
        office_location: item.office_location || "Central Office",
        connectivity_type: item.connectivity_type || "Dedicated Leased Line Fiber Optic",
        bandwidth_mbps: item.bandwidth_mbps || 100,
        upload_speed_mbps: item.upload_speed_mbps || item.bandwidth_mbps || 100,
        download_speed_mbps: item.download_speed_mbps || item.bandwidth_mbps || 100,
        is_ipv6_ready: Boolean(item.is_ipv6_ready),
        is_proposed: Boolean(item.is_proposed),
        topology_description: item.topology_description || "",
        diagram_url: item.diagram_url || ""
      });
    } else {
      setEditingNetId(null);
      setNetForm({
        office_location: "Central Office",
        connectivity_type: "Dedicated Leased Line Fiber Optic",
        bandwidth_mbps: 100,
        upload_speed_mbps: 100,
        download_speed_mbps: 100,
        is_ipv6_ready: true,
        is_proposed: defaultProposed,
        topology_description: "",
        diagram_url: ""
      });
    }
    setIsNetModalOpen(true);
  };

  const handleSaveNetwork = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        ...netForm,
        bandwidth_mbps: parseInt(netForm.bandwidth_mbps, 10) || 0,
        upload_speed_mbps: parseInt(netForm.upload_speed_mbps, 10) || 0,
        download_speed_mbps: parseInt(netForm.download_speed_mbps, 10) || 0
      };

      if (editingNetId) {
        await updateNetworkInfrastructure(token, editingNetId, payload);
        setSuccess("Network infrastructure configuration updated successfully.");
      } else {
        await createNetworkInfrastructure(token, payload, activeCycle);
        setSuccess("New network infrastructure profile recorded.");
      }
      setIsNetModalOpen(false);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Failed to persist network infrastructure configuration.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNetwork = async (id, location) => {
    if (!window.confirm(`Permanently remove network profile for '${location}'?`)) return;
    try {
      await deleteNetworkInfrastructure(token, id);
      setSuccess(`Network profile for '${location}' removed.`);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Deletion failed.");
    }
  };

  // =============================================================
  // TAB 2: CYBERSECURITY CONTROLS HANDLERS
  // =============================================================
  const handleOpenCyberModal = (item = null) => {
    if (item) {
      setEditingCyberId(item.id);
      setCyberForm({
        control_domain: item.control_domain || "Perimeter Security",
        control_name: item.control_name || "",
        is_mandatory: Boolean(item.is_mandatory),
        is_implemented: Boolean(item.is_implemented),
        is_proposed: Boolean(item.is_proposed)
      });
    } else {
      setEditingCyberId(null);
      setCyberForm({
        control_domain: "Perimeter Security",
        control_name: "",
        is_mandatory: true,
        is_implemented: false,
        is_proposed: cyberFilterScope === "proposed"
      });
    }
    setIsCyberModalOpen(true);
  };

  const handleToggleCyberImplemented = async (ctrl) => {
    try {
      const updated = {
        control_domain: ctrl.control_domain,
        control_name: ctrl.control_name,
        is_mandatory: ctrl.is_mandatory,
        is_implemented: !ctrl.is_implemented,
        is_proposed: ctrl.is_proposed
      };
      await updateCybersecurityControl(token, ctrl.id, updated);
      setCyberControls(prev => prev.map(c => c.id === ctrl.id ? { ...c, is_implemented: !c.is_implemented } : c));
    } catch (err) {
      setError(err.message || "Failed to toggle implementation status.");
    }
  };

  const handleToggleCyberMandatory = async (ctrl) => {
    try {
      const updated = {
        control_domain: ctrl.control_domain,
        control_name: ctrl.control_name,
        is_mandatory: !ctrl.is_mandatory,
        is_implemented: ctrl.is_implemented,
        is_proposed: ctrl.is_proposed
      };
      await updateCybersecurityControl(token, ctrl.id, updated);
      setCyberControls(prev => prev.map(c => c.id === ctrl.id ? { ...c, is_mandatory: !c.is_mandatory } : c));
    } catch (err) {
      setError(err.message || "Failed to toggle requirement status.");
    }
  };

  const handleSaveCyberControl = async (e) => {
    e.preventDefault();
    if (!cyberForm.control_name.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingCyberId) {
        await updateCybersecurityControl(token, editingCyberId, cyberForm);
        setSuccess("Cybersecurity control updated.");
      } else {
        await createCybersecurityControl(token, cyberForm, activeCycle);
        setSuccess("New cybersecurity control registered.");
      }
      setIsCyberModalOpen(false);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Failed to save cybersecurity control.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCyber = async (id, name) => {
    if (!window.confirm(`Delete control '${name}'?`)) return;
    try {
      await deleteCybersecurityControl(token, id);
      setSuccess(`Control '${name}' removed.`);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Deletion failed.");
    }
  };

  const handleSeedOfficialControls = async () => {
    if (!window.confirm("Seed/restore all 29 official DICT Cybersecurity Controls across all 7 Security Domains?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await seedDefaultCybersecurityControls(token, activeCycle);
      setSuccess(res.message || "Successfully seeded official DICT controls.");
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Failed to seed default controls.");
    } finally {
      setSaving(false);
    }
  };

  // =============================================================
  // TAB 3: E-GOVERNMENT PROGRAMS CHECKLIST HANDLERS
  // =============================================================
  const handleOpenEgovModal = (item = null, presetName = "") => {
    if (item) {
      setEditingEgovId(item.id);
      setEgovForm({
        program_name: item.program_name || "",
        is_utilized: Boolean(item.is_utilized),
        url_or_system_name: item.url_or_system_name || "",
        equivalent_system_details: item.equivalent_system_details || "",
        equivalent_system_name: item.equivalent_system_name || "",
        equivalent_system_url: item.equivalent_system_url || "",
        has_other_payment_platform: Boolean(item.has_other_payment_platform),
        is_manual: Boolean(item.is_manual),
        is_proposed_development: Boolean(item.is_proposed_development),
        proposed_development_name: item.proposed_development_name || "",
        total_employees: item.total_employees || "",
        active_pnpki_count: item.active_pnpki_count || "",
        adoption_ratio: item.adoption_ratio || "",
        channels_json: Array.isArray(item.channels_json) ? item.channels_json : [],
        is_connected_to_portal: Boolean(item.is_connected_to_portal)
      });
    } else {
      setEditingEgovId(null);
      setEgovForm({
        ...initialEgovForm,
        program_name: presetName || "",
        channels_json: ["Website", "Email"]
      });
    }
    setIsEgovModalOpen(true);
  };

  const handleSaveEgovProgram = async (e) => {
    e.preventDefault();
    if (!egovForm.program_name.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        program_name: egovForm.program_name.trim(),
        is_utilized: Boolean(egovForm.is_utilized),
        url_or_system_name: egovForm.url_or_system_name.trim() || null,
        equivalent_system_name: egovForm.equivalent_system_name.trim() || null,
        equivalent_system_url: egovForm.equivalent_system_url.trim() || null,
        equivalent_system_details: egovForm.equivalent_system_details.trim() || egovForm.equivalent_system_name.trim() || null,
        has_other_payment_platform: Boolean(egovForm.has_other_payment_platform),
        is_manual: Boolean(egovForm.is_manual),
        is_proposed_development: Boolean(egovForm.is_proposed_development),
        proposed_development_name: egovForm.proposed_development_name.trim() || null,
        total_employees: egovForm.total_employees.trim() || null,
        active_pnpki_count: egovForm.active_pnpki_count.trim() || null,
        adoption_ratio: egovForm.adoption_ratio.trim() || null,
        channels_json: Array.isArray(egovForm.channels_json) ? egovForm.channels_json : [],
        is_connected_to_portal: Boolean(egovForm.is_connected_to_portal)
      };

      if (editingEgovId) {
        await updateEgovChecklist(token, editingEgovId, payload);
        setSuccess(`E-Government Program '${egovForm.program_name}' updated.`);
      } else {
        await createEgovChecklist(token, activeCycle, payload);
        setSuccess(`E-Government Program '${egovForm.program_name}' registered.`);
      }
      setIsEgovModalOpen(false);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Failed to save E-Gov Program entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleChannel = (channelName) => {
    setEgovForm(prev => {
      const current = prev.channels_json || [];
      const updated = current.includes(channelName)
        ? current.filter(c => c !== channelName)
        : [...current, channelName];
      return { ...prev, channels_json: updated };
    });
  };

  const handleDeleteEgov = async (id, name) => {
    if (!window.confirm(`Delete E-Government entry for '${name}'?`)) return;
    try {
      await deleteEgovChecklist(token, id);
      setSuccess(`Program entry '${name}' deleted.`);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Failed to delete program entry.");
    }
  };

  const handleDirectEgovUpdate = async (item, field, newValue) => {
    try {
      const updated = {
        program_name: item.program_name,
        is_utilized: item.is_utilized,
        url_or_system_name: item.url_or_system_name,
        equivalent_system_name: item.equivalent_system_name,
        equivalent_system_url: item.equivalent_system_url,
        equivalent_system_details: item.equivalent_system_details,
        has_other_payment_platform: item.has_other_payment_platform,
        is_manual: item.is_manual,
        is_proposed_development: item.is_proposed_development,
        proposed_development_name: item.proposed_development_name,
        total_employees: item.total_employees,
        active_pnpki_count: item.active_pnpki_count,
        adoption_ratio: item.adoption_ratio,
        channels_json: item.channels_json,
        is_connected_to_portal: item.is_connected_to_portal,
        [field]: newValue
      };
      
      if (field === "is_utilized" && newValue === true) {
        updated.is_manual = false;
        updated.is_proposed_development = false;
      }

      await updateEgovChecklist(token, item.id, updated);
      setEgovChecklist(prev => prev.map(e => e.id === item.id ? { ...e, ...updated } : e));
    } catch (err) {
      setError(err.message || "Failed to update checklist entry.");
    }
  };

  // =============================================================
  // TAB 4: HARMONIZATION FRAMEWORK CRITERIA (DYNAMIC CRUD)
  // =============================================================
  const handleOpenHarmonizationModal = (item = null) => {
    if (item) {
      setEditingHarmonizationId(item.id);
      setHarmonizationForm({
        name: item.name || "",
        is_mandatory: Boolean(item.is_mandatory),
        description: item.description || ""
      });
    } else {
      setEditingHarmonizationId(null);
      setHarmonizationForm({
        name: "",
        is_mandatory: false,
        description: ""
      });
    }
    setIsHarmonizationModalOpen(true);
  };

  const handleSaveHarmonizationCriterion = async (e) => {
    e.preventDefault();
    if (!harmonizationForm.name.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        name: harmonizationForm.name.trim(),
        is_mandatory: harmonizationForm.is_mandatory,
        description: harmonizationForm.description.trim() || null
      };

      if (editingHarmonizationId) {
        await updateHarmonizationCriterion(token, editingHarmonizationId, payload);
      } else {
        await createHarmonizationCriterion(token, payload);
      }

      setSuccess(`Harmonization criterion '${harmonizationForm.name}' saved successfully.`);
      setIsHarmonizationModalOpen(false);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Failed to persist harmonization criterion.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHarmonizationCriterion = async (id, name) => {
    if (!window.confirm(`Permanently delete harmonization criterion '${name}'?`)) return;
    try {
      await deleteHarmonizationCriterion(token, id);
      setSuccess(`Criterion '${name}' removed.`);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Failed to delete criterion.");
    }
  };

  // =============================================================
  // TAB 5: DISASTER RECOVERY & BUSINESS CONTINUITY (DRBCP) HANDLERS
  // =============================================================
  const handleSaveDrTeam = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingDrTeamId) {
        await updateDrTeam(token, editingDrTeamId, drTeamForm);
        setSuccess("DR Team member updated.");
      } else {
        await createDrTeam(token, activeCycle, drTeamForm);
        setSuccess("DR Team member added.");
      }
      setIsDrTeamModalOpen(false);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Failed to save DR Team role.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDrTeam = async (id, role) => {
    if (!window.confirm(`Permanently remove DR Team assignment for '${role}'?`)) return;
    try {
      await deleteDrTeam(token, id);
      setSuccess(`DR Team role '${role}' removed.`);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Failed to remove DR Team role.");
    }
  };

  const handleSystemSelectForBia = (selectedId) => {
    if (!selectedId) {
      setBiaForm(prev => ({
        ...prev,
        system_id: "",
        system_name: "",
        classification: "Frontline / Mission-Critical"
      }));
      return;
    }

    const sys = informationSystems.find(s => String(s.id) === String(selectedId));
    if (sys) {
      setBiaForm(prev => ({
        ...prev,
        system_id: sys.id,
        system_name: sys.name,
        classification: sys.classification?.value || sys.classification || "Frontline / Mission-Critical"
      }));
    }
  };

  const handleSaveBia = async (e) => {
    e.preventDefault();
    if (!biaForm.system_name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        system_id: biaForm.system_id || null,
        system_name: biaForm.system_name.trim(),
        classification: biaForm.classification,
        mtpd_hours: parseInt(biaForm.mtpd_hours, 10) || 24,
        rto_hours: parseInt(biaForm.rto_hours, 10) || 4,
        rpo_hours: parseInt(biaForm.rpo_hours, 10) || 1
      };

      if (editingBiaId) {
        await updateDrBia(token, editingBiaId, payload);
        setSuccess("BIA target parameters updated.");
      } else {
        await createDrBia(token, activeCycle, payload);
        setSuccess("BIA record cataloged.");
      }
      setIsBiaModalOpen(false);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Failed to save BIA record.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDrBia = async (id, systemName) => {
    if (!window.confirm(`Permanently remove BIA recovery target for '${systemName}'?`)) return;
    try {
      await deleteDrBia(token, id);
      setSuccess(`BIA recovery target for '${systemName}' removed.`);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Failed to delete BIA record.");
    }
  };

  const handleSaveDrMetric = async (e) => {
    e.preventDefault();
    if (!drMetricForm.indicator.trim()) return;
    setSaving(true);
    try {
      if (editingDrMetricId) {
        await updateDrMetric(token, editingDrMetricId, drMetricForm);
        setSuccess("DRBCP KPI metric updated.");
      } else {
        await createDrMetric(token, activeCycle, drMetricForm);
        setSuccess("DRBCP KPI metric registered.");
      }
      setIsDrMetricModalOpen(false);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Failed to save continuity metric.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDrMetric = async (id, indicator) => {
    if (!window.confirm(`Permanently remove continuity KPI '${indicator}'?`)) return;
    try {
      await deleteDrMetric(token, id);
      setSuccess(`Continuity KPI '${indicator}' removed.`);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Failed to delete KPI metric.");
    }
  };

  // =============================================================
  // TAB 6: STAKEHOLDER ANALYSIS MATRIX (PART I.C) HANDLERS
  // =============================================================
  const handleOpenStakeholderModal = (item = null) => {
    if (item) {
      setEditingStakeholderId(item.id);
      setStakeholderForm({
        stakeholder_group: item.stakeholder_group || "",
        transaction_processed_incoming: item.transaction_processed_incoming || "",
        complexity_incoming: item.complexity_incoming || "Simple",
        transaction_processed_outgoing: item.transaction_processed_outgoing || "",
        complexity_outgoing: item.complexity_outgoing || "Simple"
      });
    } else {
      setEditingStakeholderId(null);
      setStakeholderForm({
        stakeholder_group: "",
        transaction_processed_incoming: "",
        complexity_incoming: "Simple",
        transaction_processed_outgoing: "",
        complexity_outgoing: "Simple"
      });
    }
    setIsStakeholderModalOpen(true);
  };

  const handleSaveStakeholder = async (e) => {
    e.preventDefault();
    if (!stakeholderForm.stakeholder_group.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        stakeholder_group: stakeholderForm.stakeholder_group.trim(),
        transaction_processed_incoming: stakeholderForm.transaction_processed_incoming.trim() || null,
        complexity_incoming: stakeholderForm.complexity_incoming.trim(),
        transaction_processed_outgoing: stakeholderForm.transaction_processed_outgoing.trim() || null,
        complexity_outgoing: stakeholderForm.complexity_outgoing.trim()
      };

      if (editingStakeholderId) {
        await updateStakeholder(token, editingStakeholderId, payload);
        setSuccess(`Stakeholder group '${stakeholderForm.stakeholder_group}' updated.`);
      } else {
        await createStakeholder(token, activeCycle, payload);
        setSuccess(`Stakeholder group '${stakeholderForm.stakeholder_group}' registered.`);
      }
      setIsStakeholderModalOpen(false);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Failed to save stakeholder analysis.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStakeholder = async (id, groupName) => {
    if (!window.confirm(`Permanently remove stakeholder analysis for '${groupName}'?`)) return;
    try {
      await deleteStakeholder(token, id);
      setSuccess(`Stakeholder group '${groupName}' removed.`);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Failed to remove stakeholder group.");
    }
  };

  // =============================================================
  // TAB 7: DEVELOPMENT STRATEGIES (DYNAMIC CRUD) HANDLERS
  // =============================================================
  const handleOpenDevStrategyModal = () => {
    setDevStrategyForm({
      code: "",
      display_name: "",
      description: ""
    });
    setIsDevStrategyModalOpen(true);
  };

  const handleSaveDevStrategy = async (e) => {
    e.preventDefault();
    if (!devStrategyForm.code.trim() || !devStrategyForm.display_name.trim()) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await createDevelopmentStrategy(token, {
        code: devStrategyForm.code.trim().toUpperCase().replace(/\s+/g, "_"),
        display_name: devStrategyForm.display_name.trim(),
        description: devStrategyForm.description.trim() || null
      });

      setSuccess(`Development Strategy '${devStrategyForm.display_name}' registered successfully.`);
      setIsDevStrategyModalOpen(false);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Failed to create development strategy.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDevStrategy = async (code, name) => {
    if (!window.confirm(`Delete Development Strategy '${name}' (${code})?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteDevelopmentStrategy(token, code);
      setSuccess(`Development Strategy '${name}' removed.`);
      loadAllGovernanceData();
    } catch (err) {
      setError(err.message || "Failed to delete development strategy.");
    }
  };

  // -------------------------------------------------------------
  // MEMOIZED DERIVED LISTS
  // -------------------------------------------------------------
  const filteredNet = useMemo(() => {
    return networkInfra.filter(n => {
      if (netFilterScope === "existing") return !n.is_proposed;
      if (netFilterScope === "proposed") return Boolean(n.is_proposed);
      return true;
    });
  }, [networkInfra, netFilterScope]);

  const filteredCyber = useMemo(() => {
    const isProposedTarget = cyberFilterScope === "proposed";
    return cyberControls.filter(c => {
      if (Boolean(c.is_proposed) !== isProposedTarget) return false;
      if (cyberDomainFilter !== "All" && c.control_domain !== cyberDomainFilter) return false;
      if (cyberRequirementFilter === "Mandatory" && !c.is_mandatory) return false;
      if (cyberRequirementFilter === "Optional" && c.is_mandatory) return false;
      return true;
    });
  }, [cyberControls, cyberFilterScope, cyberDomainFilter, cyberRequirementFilter]);

  const cyberDomains = useMemo(() => {
    const set = new Set(cyberControls.map(c => c.control_domain).filter(Boolean));
    CYBER_DOMAINS.forEach(d => set.add(d));
    return ["All", ...Array.from(set)];
  }, [cyberControls]);

  const filteredEgov = useMemo(() => {
    return egovChecklist.filter(item => {
      if (egovStatusFilter === "utilized" && !item.is_utilized) return false;
      if (egovStatusFilter === "not_utilized" && item.is_utilized) return false;
      if (egovStatusFilter === "proposed" && !item.is_proposed_development) return false;

      if (!egovSearch.trim()) return true;
      const q = egovSearch.toLowerCase();
      return (
        (item.program_name || "").toLowerCase().includes(q) ||
        (item.equivalent_system_name || "").toLowerCase().includes(q) ||
        (item.equivalent_system_details || "").toLowerCase().includes(q) ||
        (item.url_or_system_name || "").toLowerCase().includes(q) ||
        (item.proposed_development_name || "").toLowerCase().includes(q)
      );
    });
  }, [egovChecklist, egovSearch, egovStatusFilter]);

  const filteredStakeholders = useMemo(() => {
    return stakeholders.filter(sh => {
      if (!stakeholderSearch.trim()) return true;
      const q = stakeholderSearch.toLowerCase();
      return (
        (sh.stakeholder_group || "").toLowerCase().includes(q) ||
        (sh.transaction_processed_incoming || "").toLowerCase().includes(q) ||
        (sh.transaction_processed_outgoing || "").toLowerCase().includes(q)
      );
    });
  }, [stakeholders, stakeholderSearch]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-xs text-slate-800 dark:text-slate-100 select-none font-sans transition-colors duration-200">
      
      {/* Top Header Panel */}
      <div className="flex flex-col md:flex-row justify-between md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
              <span>Compliance Framework Checklists &amp; Infrastructure Governance</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              Cycle: FY {activeCycle || "2026-2028"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Complete administrative console for Network Infrastructure &amp; Topologies (Parts II.B.1 &amp; III.A.1), Mandatory Cybersecurity Controls (Parts II.B.2 &amp; III.A.2), E-Government Programs (Part II.D), Dynamic Harmonization Criteria (Part III.E), Disaster Recovery Continuity (Annex 2), Stakeholder Matrices (Part I.C), and Dynamic Development Strategies.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Integrated Compiler Verification Audit Button */}
          <CompilerSyncButton
            moduleName="framework"
            activeCycle={activeCycle}
            token={token}
            onSaveAndSync={loadAllGovernanceData}
            label="Save &amp; Verify Compiler Pipeline"
          />

          <button
            type="button"
            onClick={loadAllGovernanceData}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer shadow-xs"
            title="Refresh All Governance Frameworks"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-start justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-start justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Primary Category Navigation Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs self-start">
        {[
          { id: "network", label: `1. Network Architecture (${networkInfra.length})`, icon: <Server className="w-3.5 h-3.5" /> },
          { id: "cyber", label: `2. Cybersecurity Controls (${cyberControls.length})`, icon: <Lock className="w-3.5 h-3.5" /> },
          { id: "egov", label: `3. E-Government Programs (${egovChecklist.length})`, icon: <Globe className="w-3.5 h-3.5" /> },
          { id: "harmonization", label: `4. Harmonization Criteria (${harmonizationCriteria.length})`, icon: <Compass className="w-3.5 h-3.5" /> },
          { id: "drbcp", label: `5. Disaster Recovery & DRBCP (${drTeams.length + drBias.length + drMetrics.length})`, icon: <ShieldAlert className="w-3.5 h-3.5" /> },
          { id: "stakeholders", label: `6. Stakeholder Matrix (${stakeholders.length})`, icon: <Users className="w-3.5 h-3.5" /> },
          { id: "strategies", label: `7. Development Strategies (${devStrategies.length})`, icon: <Workflow className="w-3.5 h-3.5" /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2 rounded-lg font-bold transition-all text-xs flex items-center gap-1.5 cursor-pointer ${
              activeTab === tab.id
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ============================================================= */}
      {/* SECTION 1: NETWORK INFRASTRUCTURE                             */}
      {/* ============================================================= */}
      {activeTab === "network" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
            <div className="flex bg-slate-100 dark:bg-slate-955 p-1 rounded-xl border border-slate-200 dark:border-slate-800 gap-1">
              {[
                { id: "all", label: "All Profiles" },
                { id: "existing", label: "Existing Infrastructure (II.B.1)" },
                { id: "proposed", label: "Proposed Setup (III.A.1)" }
              ].map(sub => (
                <button
                  key={sub.id}
                  onClick={() => setNetFilterScope(sub.id)}
                  className={`px-3 py-1.5 rounded-lg text-[10.5px] font-bold cursor-pointer transition-all ${
                    netFilterScope === sub.id ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenNetModal(null, false)}
                className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-xs text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Existing Profile</span>
              </button>
              <button
                onClick={() => handleOpenNetModal(null, true)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-sm text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Proposed Setup</span>
              </button>
            </div>
          </div>

          {filteredNet.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredNet.map(net => (
                <div 
                  key={net.id}
                  className="p-5 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-3 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase font-mono tracking-wider border ${
                        net.is_proposed 
                          ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20"
                          : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"
                      }`}>
                        {net.is_proposed ? "Part III.A.1 Proposed Architecture" : "Part II.B.1 Existing Infrastructure"}
                      </span>
                      <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                        {net.bandwidth_mbps} Mbps
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Server className="w-4 h-4 text-slate-400" />
                      <span>{net.office_location}</span>
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400 text-xs">
                      <strong>Connectivity:</strong> {net.connectivity_type}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed whitespace-pre-wrap">
                      {net.topology_description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="grid grid-cols-3 gap-2 font-mono text-[10px] text-slate-500">
                      <div>Upload: <strong>{net.upload_speed_mbps || net.bandwidth_mbps} Mbps</strong></div>
                      <div>Download: <strong>{net.download_speed_mbps || net.bandwidth_mbps} Mbps</strong></div>
                      <div>IPv6: <strong className={net.is_ipv6_ready ? "text-emerald-600 font-bold" : "text-slate-400"}>{net.is_ipv6_ready ? "READY" : "NO"}</strong></div>
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      {net.diagram_url ? (
                        <a href={net.diagram_url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 text-[10px] font-semibold">
                          <span>View Attached Schematic</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ) : (
                        <span className="text-slate-400 text-[10px] italic">No schematic URL attached</span>
                      )}

                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleOpenNetModal(net)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 cursor-pointer"
                          title="Edit profile"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteNetwork(net.id, net.office_location)}
                          className="p-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 rounded-lg text-slate-500 cursor-pointer"
                          title="Delete profile"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 italic bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
              No network infrastructure profiles match the selected scope. Click the buttons above to register existing or proposed setups.
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* SECTION 2: CYBERSECURITY CONTROLS                             */}
      {/* ============================================================= */}
      {activeTab === "cyber" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-slate-100 dark:bg-slate-955 p-1 rounded-xl border border-slate-200 dark:border-slate-800 gap-1">
                <button
                  onClick={() => setCyberFilterScope("existing")}
                  className={`px-3 py-1.5 rounded-lg text-[10.5px] font-bold cursor-pointer transition-all ${
                    cyberFilterScope === "existing" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Existing Controls (II.B.2)
                </button>
                <button
                  onClick={() => setCyberFilterScope("proposed")}
                  className={`px-3 py-1.5 rounded-lg text-[10.5px] font-bold cursor-pointer transition-all ${
                    cyberFilterScope === "proposed" ? "bg-purple-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Proposed Controls (III.A.2)
                </button>
              </div>

              <select
                value={cyberDomainFilter}
                onChange={e => setCyberDomainFilter(e.target.value)}
                className="p-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-300 font-semibold outline-none cursor-pointer"
              >
                {cyberDomains.map(d => (
                  <option key={d} value={d}>{d === "All" ? "All Security Domains" : d}</option>
                ))}
              </select>

              <select
                value={cyberRequirementFilter}
                onChange={e => setCyberRequirementFilter(e.target.value)}
                className="p-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-300 font-semibold outline-none cursor-pointer"
              >
                <option value="All">All Requirements</option>
                <option value="Mandatory">Mandatory Only</option>
                <option value="Optional">Optional Only</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSeedOfficialControls}
                disabled={saving}
                className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-xs text-xs"
                title="Seed standard 29 DICT cybersecurity controls"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Seed 29 DICT Controls</span>
              </button>
              <button
                onClick={() => handleOpenCyberModal(null)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-sm text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Control</span>
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 uppercase font-bold text-[9.5px] font-mono">
                  <th className="p-3.5 w-1/4">Security Domain</th>
                  <th className="p-3.5 w-2/5">Control Name</th>
                  <th className="p-3.5 text-center">Requirement</th>
                  <th className="p-3.5 text-center">Implementation State</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {filteredCyber.length > 0 ? (
                  filteredCyber.map(ctrl => (
                    <tr key={ctrl.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-colors">
                      <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                        {ctrl.control_domain}
                      </td>
                      <td className="p-3.5 text-slate-700 dark:text-slate-300 font-semibold">
                        {ctrl.control_name}
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleCyberMandatory(ctrl)}
                          className={`px-2 py-0.5 rounded text-[8.5px] font-bold uppercase font-mono border cursor-pointer ${
                            ctrl.is_mandatory 
                              ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"
                              : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                          title="Click to toggle mandatory/optional"
                        >
                          {ctrl.is_mandatory ? "MANDATORY" : "OPTIONAL"}
                        </button>
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleCyberImplemented(ctrl)}
                          className={`px-3 py-1 rounded-full text-[9px] font-bold font-mono uppercase border cursor-pointer transition-all ${
                            ctrl.is_implemented
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                              : "bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {ctrl.is_implemented ? "[X] IMPLEMENTED" : "[ ] NOT IMPLEMENTED"}
                        </button>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenCyberModal(ctrl)}
                            className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCyber(ctrl.id, ctrl.control_name)}
                            className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-slate-500 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400 italic">
                      No cybersecurity controls match your filter. Click &ldquo;Seed 29 DICT Controls&rdquo; or &ldquo;Add Control&rdquo; to configure controls.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* SECTION 3: E-GOVERNMENT PROGRAMS (PART II.D INTERACTIVE TABLE) */}
      {/* ============================================================= */}
      {activeTab === "egov" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-slate-100 dark:bg-slate-955 p-1 rounded-xl border border-slate-200 dark:border-slate-800 gap-1 text-[10.5px]">
                {[
                  { id: "all", label: `All (${egovChecklist.length})` },
                  { id: "utilized", label: "Utilized [Yes]" },
                  { id: "not_utilized", label: "Not Utilized [No]" },
                  { id: "proposed", label: "Proposed Development" }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setEgovStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      egovStatusFilter === tab.id
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-56">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter initiative, platform..."
                  value={egovSearch}
                  onChange={e => setEgovSearch(e.target.value)}
                  className="w-full pl-9 pr-7 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500"
                />
                {egovSearch && (
                  <button
                    type="button"
                    onClick={() => setEgovSearch("")}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
              <select
                onChange={(e) => {
                  const preset = e.target.value;
                  if (preset) {
                    handleOpenEgovModal(null, preset);
                    e.target.value = "";
                  }
                }}
                defaultValue=""
                className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 text-xs font-semibold outline-none cursor-pointer"
              >
                <option value="" disabled>+ Add Canonical Initiative...</option>
                {EGOV_PRESETS.map(p => (
                  <option key={p.name} value={p.name}>{p.label}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => handleOpenEgovModal(null)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-sm text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Custom Program</span>
              </button>
            </div>
          </div>

          <div className="p-3.5 bg-blue-50 dark:bg-blue-955/30 border border-blue-200 dark:border-blue-900/60 rounded-xl text-[10.5px] text-blue-900 dark:text-blue-300 flex items-start gap-2.5 leading-relaxed">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              <strong>DICT Template Part II.D Standards [3]:</strong> Full statutory checklist compliance. Toggle items to <code>Utilized</code> [Yes / No], designate in-house equivalent systems, mark manual processing or proposed developments, specify active PNPKI certification ratios, and identify assistance channels.
            </span>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-600 dark:text-slate-400 uppercase font-bold text-[9.5px] font-mono">
                    <th className="p-3.5 w-[28%]">Initiative / Program Name</th>
                    <th className="p-3.5 w-[34%]">Utilized? (Status &amp; System Name / URL)</th>
                    <th className="p-3.5 w-[30%]">If No (Equivalent System / Manual / Proposed)</th>
                    <th className="p-3.5 text-right w-[8%]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {filteredEgov.length > 0 ? (
                    filteredEgov.map((item, idx) => {
                      const nameLower = (item.program_name || "").toLowerCase();
                      const isPnpki = nameLower.includes("pnpki") || nameLower.includes("public key");
                      const isPortal = nameLower.includes("portal") && !nameLower.includes("philgeps");
                      const isContinuity = nameLower.includes("continuity") || nameLower.includes("pscp");
                      const channels = Array.isArray(item.channels_json) ? item.channels_json : [];
                      const equivTitle = item.equivalent_system_name || item.equivalent_system_details;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-colors">
                          <td className="p-3.5 align-top space-y-1">
                            <div className="font-bold text-slate-900 dark:text-white text-xs">
                              {idx + 1}. {item.program_name}
                            </div>
                            {item.is_connected_to_portal && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 text-[8.5px] font-mono font-bold">
                                <Link2 className="w-2.5 h-2.5" /> Portal Connected
                              </span>
                            )}
                          </td>

                          {/* Middle Column: Utilization / Specific Formats */}
                          <td className="p-3.5 align-top space-y-2">
                            {isPnpki ? (
                              <div className="space-y-1 text-[11px] leading-relaxed">
                                <div>Total number of employees: <strong className="font-mono text-slate-900 dark:text-white">{item.total_employees || "Not Reported"}</strong></div>
                                <div>Total employees with active PNPKI: <strong className="font-mono text-emerald-600 dark:text-emerald-400">{item.active_pnpki_count || "Not Reported"}</strong></div>
                                <div>Percentage of adoption of PNPKI: <strong className="font-mono text-blue-600 dark:text-blue-400">{item.adoption_ratio || "Not Reported"}</strong></div>
                              </div>
                            ) : isPortal ? (
                              <div className="space-y-1.5 text-[11px]">
                                <span className="text-slate-500 dark:text-slate-400 text-[10px] block">Existing feedback and grievance channels in your agency:</span>
                                <div className="flex flex-wrap gap-1 font-mono text-[9px]">
                                  {FRONT_CHANNELS.map(ch => {
                                    const active = channels.includes(ch);
                                    return (
                                      <button
                                        key={ch}
                                        type="button"
                                        onClick={() => {
                                          const nextChannels = active ? channels.filter(c => c !== ch) : [...channels, ch];
                                          handleDirectEgovUpdate(item, "channels_json", nextChannels);
                                        }}
                                        className={`px-2 py-0.5 rounded border transition-all cursor-pointer ${
                                          active 
                                            ? "bg-blue-600 text-white border-blue-600 font-bold shadow-2xs" 
                                            : "bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-400"
                                        }`}
                                      >
                                        {active ? `✓ ${ch}` : `+ ${ch}`}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : isContinuity ? (
                              <div className="space-y-1.5">
                                <span className="text-slate-500 dark:text-slate-400 text-[10px] block">Is there an existing Public Service Continuity Plan?</span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleDirectEgovUpdate(item, "is_utilized", true)}
                                    className={`px-2.5 py-1 rounded-lg font-mono text-[9.5px] font-bold uppercase border cursor-pointer ${
                                      item.is_utilized ? "bg-emerald-600 text-white border-emerald-600" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                                    }`}
                                  >
                                    {item.is_utilized ? "[X] YES" : "[ ] YES"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDirectEgovUpdate(item, "is_utilized", false)}
                                    className={`px-2.5 py-1 rounded-lg font-mono text-[9.5px] font-bold uppercase border cursor-pointer ${
                                      !item.is_utilized ? "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                                    }`}
                                  >
                                    {!item.is_utilized ? "[X] NO" : "[ ] NO"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleDirectEgovUpdate(item, "is_utilized", true)}
                                    className={`px-2.5 py-1 rounded-lg font-mono text-[9.5px] font-bold uppercase border cursor-pointer transition-all flex items-center gap-1 ${
                                      item.is_utilized 
                                        ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs" 
                                        : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 hover:border-emerald-400"
                                    }`}
                                  >
                                    <span>{item.is_utilized ? "[X]" : "[ ]"}</span>
                                    <span>YES (Utilized)</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDirectEgovUpdate(item, "is_utilized", false)}
                                    className={`px-2.5 py-1 rounded-lg font-mono text-[9.5px] font-bold uppercase border cursor-pointer transition-all flex items-center gap-1 ${
                                      !item.is_utilized 
                                        ? "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900 shadow-2xs" 
                                        : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 hover:border-rose-400"
                                    }`}
                                  >
                                    <span>{!item.is_utilized ? "[X]" : "[ ]"}</span>
                                    <span>NO</span>
                                  </button>
                                </div>

                                {item.is_utilized && (
                                  <div className="text-[10.5px] font-mono text-blue-600 dark:text-blue-400 flex items-center gap-1 pt-0.5">
                                    <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span className="truncate" title={item.url_or_system_name || "URL not specified"}>
                                      {item.url_or_system_name || <span className="text-slate-400 italic">No URL recorded</span>}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Right Column: If No / Specific Alternate Details */}
                          <td className="p-3.5 align-top space-y-1.5 text-slate-700 dark:text-slate-300">
                            {isPortal ? (
                              <div className="space-y-1">
                                <span className="text-slate-500 dark:text-slate-400 text-[10px] block">Connected with online public service portals?</span>
                                <button
                                  type="button"
                                  onClick={() => handleDirectEgovUpdate(item, "is_connected_to_portal", !item.is_connected_to_portal)}
                                  className={`px-2.5 py-1 rounded-lg font-mono text-[9.5px] font-bold uppercase border cursor-pointer ${
                                    item.is_connected_to_portal ? "bg-blue-600 text-white border-blue-600" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                                  }`}
                                >
                                  {item.is_connected_to_portal ? "[X] YES (Connected)" : "[ ] NO (Not Connected)"}
                                </button>
                              </div>
                            ) : isPnpki || isContinuity ? (
                              <span className="text-slate-400 font-mono text-[10px] italic">Fully specified in status column</span>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="space-y-0.5">
                                  <span className="text-slate-400 uppercase text-[9px] font-bold font-mono block">
                                    Equivalent System In-House:
                                  </span>
                                  <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                                    {equivTitle ? (
                                      <span>
                                        {equivTitle} {item.equivalent_system_url && <a href={item.equivalent_system_url} target="_blank" rel="noreferrer" className="text-blue-500 underline ml-1 font-mono text-[10px]">({item.equivalent_system_url})</a>}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 italic font-normal">None reported</span>
                                    )}
                                  </div>
                                </div>

                                <div className="pt-1 space-y-1 font-mono text-[10px]">
                                  {(nameLower.includes("payment") || nameLower.includes("egovpay") || item.has_other_payment_platform) && (
                                    <button
                                      type="button"
                                      onClick={() => handleDirectEgovUpdate(item, "has_other_payment_platform", !item.has_other_payment_platform)}
                                      className={`w-full flex items-center gap-1.5 px-2 py-0.5 rounded text-left transition-colors cursor-pointer border ${
                                        item.has_other_payment_platform
                                          ? "bg-purple-50 text-purple-800 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900 font-bold"
                                          : "bg-slate-50 dark:bg-slate-955 text-slate-500 border-slate-200 dark:border-slate-800"
                                      }`}
                                    >
                                      <span>{item.has_other_payment_platform ? "[X]" : "[ ]"}</span>
                                      <span>Other digital / electronic payment platform</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleDirectEgovUpdate(item, "is_manual", !item.is_manual)}
                                    className={`w-full flex items-center gap-1.5 px-2 py-0.5 rounded text-left transition-colors cursor-pointer border ${
                                      item.is_manual 
                                        ? "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900 font-bold" 
                                        : "bg-slate-50 dark:bg-slate-955 text-slate-500 border-slate-200 dark:border-slate-800 hover:border-slate-400"
                                    }`}
                                  >
                                    <span>{item.is_manual ? "[X]" : "[ ]"}</span>
                                    <span>Manual Transaction</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDirectEgovUpdate(item, "is_proposed_development", !item.is_proposed_development)}
                                    className={`w-full flex items-center gap-1.5 px-2 py-0.5 rounded text-left transition-colors cursor-pointer border ${
                                      item.is_proposed_development 
                                        ? "bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900 font-bold" 
                                        : "bg-slate-50 dark:bg-slate-955 text-slate-500 border-slate-200 dark:border-slate-800 hover:border-slate-400"
                                    }`}
                                  >
                                    <span>{item.is_proposed_development ? "[X]" : "[ ]"}</span>
                                    <span className="truncate">
                                      Proposed development {item.proposed_development_name ? `(${item.proposed_development_name})` : ""}
                                    </span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>

                          <td className="p-3.5 align-top text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEgovModal(item)}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 cursor-pointer"
                                title="Edit Initiative Details"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEgov(item.id, item.program_name)}
                                className="p-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/40 rounded-lg text-slate-500 cursor-pointer"
                                title="Delete Program Entry"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-12 text-center text-slate-400 italic">
                        No E-Government checklist items match your query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* SECTION 4: HARMONIZATION FRAMEWORK CRITERIA (DYNAMIC CRUD)     */}
      {/* ============================================================= */}
      {activeTab === "harmonization" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2 font-serif">
                <Compass className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Dynamic Harmonization Framework Criteria (Part III.E)</span>
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                Define the criteria used across strategic projects to enforce inter-agency cooperation, PeGIF APIs, and resource optimization.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenHarmonizationModal(null)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-sm text-xs self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Harmonization Criterion</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 uppercase font-bold text-[9.5px] font-mono">
                  <th className="p-3.5 w-1/3">Criterion Title</th>
                  <th className="p-3.5 w-1/6 text-center">Mandatory</th>
                  <th className="p-3.5">Guidance / Description</th>
                  <th className="p-3.5 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {harmonizationCriteria.length > 0 ? (
                  harmonizationCriteria.map((crit) => (
                    <tr key={crit.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-colors">
                      <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                        {crit.name}
                      </td>
                      <td className="p-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[8.5px] font-bold uppercase font-mono border ${
                          crit.is_mandatory
                            ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"
                            : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                        }`}>
                          {crit.is_mandatory ? "MANDATORY" : "OPTIONAL"}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-600 dark:text-slate-300">
                        {crit.description || <span className="text-slate-400 italic">No description provided</span>}
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenHarmonizationModal(crit)}
                            className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteHarmonizationCriterion(crit.id, crit.name)}
                            className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-slate-500 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-slate-400 italic">
                      No custom criteria configured yet. Default canonical criteria are active.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* SECTION 5: DISASTER RECOVERY & BUSINESS CONTINUITY (DRBCP)    */}
      {/* ============================================================= */}
      {activeTab === "drbcp" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
            <div className="flex bg-slate-100 dark:bg-slate-955 p-1 rounded-xl border border-slate-200 dark:border-slate-800 gap-1">
              {[
                { id: "teams", label: `Disaster Recovery Team (${drTeams.length})` },
                { id: "bia", label: `Business Impact Analysis (${drBias.length})` },
                { id: "metrics", label: `Continuity Performance KPIs (${drMetrics.length})` }
              ].map(sub => (
                <button
                  key={sub.id}
                  onClick={() => setDrSubTab(sub.id)}
                  className={`px-3 py-1.5 rounded-lg text-[10.5px] font-bold cursor-pointer transition-all ${
                    drSubTab === sub.id ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            <div>
              {drSubTab === "teams" && (
                <button
                  onClick={() => {
                    setEditingDrTeamId(null);
                    setDrTeamForm({ role: "", responsibility: "", contact_person: "", contact_details: "" });
                    setIsDrTeamModalOpen(true);
                  }}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-sm text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add DR Team Role</span>
                </button>
              )}
              {drSubTab === "bia" && (
                <button
                  onClick={() => {
                    setEditingBiaId(null);
                    setBiaForm({ system_id: "", system_name: "", classification: "Frontline / Mission-Critical", mtpd_hours: 24, rto_hours: 4, rpo_hours: 1 });
                    setIsBiaModalOpen(true);
                  }}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-sm text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add BIA System Target</span>
                </button>
              )}
              {drSubTab === "metrics" && (
                <button
                  onClick={() => {
                    setEditingDrMetricId(null);
                    setDrMetricForm({ indicator: "", target_metric: "" });
                    setIsDrMetricModalOpen(true);
                  }}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-sm text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Continuity Metric</span>
                </button>
              )}
            </div>
          </div>

          {/* Sub-View 1: DR Team Members */}
          {drSubTab === "teams" && (
            drTeams.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {drTeams.map(t => (
                  <div key={t.id} className="p-5 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-2.5 shadow-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-blue-600 dark:text-blue-400 text-xs">{t.role}</span>
                      <span className="font-mono text-slate-500 text-[10px]">{t.contact_details}</span>
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t.contact_person}</h3>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">{t.responsibility}</p>
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-1.5">
                      <button
                        onClick={() => {
                          setEditingDrTeamId(t.id);
                          setDrTeamForm({ role: t.role, responsibility: t.responsibility, contact_person: t.contact_person, contact_details: t.contact_details });
                          setIsDrTeamModalOpen(true);
                        }}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteDrTeam(t.id, t.role)}
                        className="p-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 rounded-lg text-slate-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 italic bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
                No Disaster Recovery Team roles configured. Click &ldquo;Add DR Team Role&rdquo; to register personnel assignments.
              </div>
            )
          )}

          {/* Sub-View 2: Business Impact Analysis */}
          {drSubTab === "bia" && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 uppercase font-bold text-[9.5px] font-mono">
                    <th className="p-3.5 w-1/3">Mission-Critical System</th>
                    <th className="p-3.5">Classification</th>
                    <th className="p-3.5 text-center">MTPD</th>
                    <th className="p-3.5 text-center">RTO Target</th>
                    <th className="p-3.5 text-center">RPO Limit</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {drBias.length > 0 ? (
                    drBias.map(b => (
                      <tr key={b.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-colors">
                        <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-1.5">
                            <Database className="w-3.5 h-3.5 text-blue-500" />
                            <span>{b.system_name}</span>
                          </div>
                        </td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-400">{b.classification}</td>
                        <td className="p-3.5 text-center font-mono font-bold">{b.mtpd_hours || 24} Hours</td>
                        <td className="p-3.5 text-center font-mono font-bold text-blue-600 dark:text-blue-400">{b.rto_hours} Hours</td>
                        <td className="p-3.5 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">{b.rpo_hours} Hours</td>
                        <td className="p-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setEditingBiaId(b.id);
                                setBiaForm({ 
                                  system_id: b.system_id || "", 
                                  system_name: b.system_name, 
                                  classification: b.classification, 
                                  mtpd_hours: b.mtpd_hours || 24, 
                                  rto_hours: b.rto_hours, 
                                  rpo_hours: b.rpo_hours 
                                });
                                setIsBiaModalOpen(true);
                              }}
                              className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteDrBia(b.id, b.system_name)}
                              className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-slate-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-400 italic">
                        No Business Impact Analysis (BIA) system targets defined. Click &ldquo;Add BIA System Target&rdquo; to begin.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Sub-View 3: DRBCP Metrics */}
          {drSubTab === "metrics" && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 uppercase font-bold text-[9.5px] font-mono">
                    <th className="p-3.5 w-1/2">Performance Indicator</th>
                    <th className="p-3.5 w-1/3">Target Benchmark Metric</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {drMetrics.length > 0 ? (
                    drMetrics.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-colors">
                        <td className="p-3.5 font-bold text-slate-900 dark:text-white">{m.indicator}</td>
                        <td className="p-3.5 font-semibold text-emerald-600 dark:text-emerald-400 font-mono">{m.target_metric}</td>
                        <td className="p-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setEditingDrMetricId(m.id);
                                setDrMetricForm({ indicator: m.indicator, target_metric: m.target_metric });
                                setIsDrMetricModalOpen(true);
                              }}
                              className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteDrMetric(m.id, m.indicator)}
                              className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-slate-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="p-12 text-center text-slate-400 italic">
                        No continuity performance indicators defined. Click &ldquo;Add Continuity Metric&rdquo; to configure benchmark targets.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* SECTION 6: STAKEHOLDER ANALYSIS MATRIX (PART I.C)             */}
      {/* ============================================================= */}
      {activeTab === "stakeholders" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-2">
              <div className="relative w-72">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter stakeholders, transactions..."
                  value={stakeholderSearch}
                  onChange={e => setStakeholderSearch(e.target.value)}
                  className="w-full pl-9 pr-7 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleOpenStakeholderModal(null)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-sm text-xs self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Stakeholder Group</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 uppercase font-bold text-[9.5px] font-mono">
                  <th className="p-3.5 w-1/4">Stakeholder Group</th>
                  <th className="p-3.5 w-1/3">Incoming Transactions (Requests / Applications)</th>
                  <th className="p-3.5 w-1/3">Outgoing Transactions (Clearances / Permits / Certs)</th>
                  <th className="p-3.5 text-right w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {filteredStakeholders.length > 0 ? (
                  filteredStakeholders.map(sh => (
                    <tr key={sh.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-colors">
                      <td className="p-3.5 align-top font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span>{sh.stakeholder_group}</span>
                        </div>
                      </td>
                      <td className="p-3.5 align-top space-y-1">
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                          {sh.transaction_processed_incoming || "None specified"}
                        </p>
                        <span className="inline-block px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[9px] font-mono font-bold">
                          Complexity: {sh.complexity_incoming || "Simple"}
                        </span>
                      </td>
                      <td className="p-3.5 align-top space-y-1">
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                          {sh.transaction_processed_outgoing || "None specified"}
                        </p>
                        <span className="inline-block px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[9px] font-mono font-bold">
                          Complexity: {sh.complexity_outgoing || "Simple"}
                        </span>
                      </td>
                      <td className="p-3.5 align-top text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenStakeholderModal(sh)}
                            className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStakeholder(sh.id, sh.stakeholder_group)}
                            className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-slate-500 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-slate-400 italic">
                      No stakeholder matrices configured for this cycle.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* SECTION 7: DEVELOPMENT STRATEGIES (DYNAMIC CRUD)               */}
      {/* ============================================================= */}
      {activeTab === "strategies" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2 font-serif">
                <Workflow className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Information Systems Development Strategies (Parts II.C &amp; III.D)</span>
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                Manage customizable technical development strategies available when classifying and auditing information systems.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenDevStrategyModal}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-sm text-xs self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Development Strategy</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 uppercase font-bold text-[9.5px] font-mono">
                  <th className="p-3.5 w-1/4">Strategy Code</th>
                  <th className="p-3.5 w-1/3">Display Name / Methodology</th>
                  <th className="p-3.5">Description &amp; Operational Scope</th>
                  <th className="p-3.5 text-right w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {devStrategies.length > 0 ? (
                  devStrategies.map((strat) => {
                    const isCoreStrategy = ["IN_HOUSE", "OUTSOURCED", "COTS", "COMBINATION"].includes((strat.code || "").toUpperCase());

                    return (
                      <tr key={strat.code} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-colors">
                        <td className="p-3.5 font-bold font-mono text-blue-600 dark:text-blue-400">
                          {strat.code}
                        </td>
                        <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-1.5">
                            <Code className="w-3.5 h-3.5 text-slate-400" />
                            <span>{strat.display_name}</span>
                          </div>
                        </td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-300">
                          {strat.description || <span className="text-slate-400 italic font-mono text-[10px]">Standard institutional development methodology</span>}
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            {!isCoreStrategy ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteDevStrategy(strat.code, strat.display_name)}
                                className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-slate-500 cursor-pointer"
                                title="Delete Custom Strategy"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span className="text-[9px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 font-mono">
                                Core
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-slate-400 italic">
                      No development strategies found. Use the button above to register custom strategies.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 1: NETWORK PROFILE MODAL                                */}
      {/* ============================================================= */}
      {isNetModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                {editingNetId ? "Update Network Infrastructure Profile" : "Add Network Infrastructure Profile"}
              </h3>
              <button onClick={() => setIsNetModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNetwork} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <span className="font-bold text-slate-700 dark:text-slate-300">Architecture Scope:</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNetForm({ ...netForm, is_proposed: false })}
                    className={`px-3 py-1 rounded-lg font-bold font-mono text-[9px] uppercase ${!netForm.is_proposed ? "bg-blue-600 text-white shadow-xs" : "bg-slate-200 dark:bg-slate-800 text-slate-600"}`}
                  >
                    Existing Setup
                  </button>
                  <button
                    type="button"
                    onClick={() => setNetForm({ ...netForm, is_proposed: true })}
                    className={`px-3 py-1 rounded-lg font-bold font-mono text-[9px] uppercase ${netForm.is_proposed ? "bg-purple-600 text-white shadow-xs" : "bg-slate-200 dark:bg-slate-800 text-slate-600"}`}
                  >
                    Proposed Architecture
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Deployment Site / Office Location</label>
                  <input
                    type="text" required value={netForm.office_location} onChange={e => setNetForm({ ...netForm, office_location: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Connectivity Type</label>
                  <input
                    type="text" required value={netForm.connectivity_type} onChange={e => setNetForm({ ...netForm, connectivity_type: e.target.value })}
                    placeholder="Dedicated Leased Line Fiber Optic, SD-WAN, etc."
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 font-mono">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Bandwidth (Mbps)</label>
                  <input
                    type="number" required min="1" value={netForm.bandwidth_mbps} onChange={e => setNetForm({ ...netForm, bandwidth_mbps: e.target.value })}
                    className="w-full p-2 text-center bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Upload (Mbps)</label>
                  <input
                    type="number" required min="1" value={netForm.upload_speed_mbps} onChange={e => setNetForm({ ...netForm, upload_speed_mbps: e.target.value })}
                    className="w-full p-2 text-center bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Download (Mbps)</label>
                  <input
                    type="number" required min="1" value={netForm.download_speed_mbps} onChange={e => setNetForm({ ...netForm, download_speed_mbps: e.target.value })}
                    className="w-full p-2 text-center bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Topology &amp; Routing Description</label>
                <textarea
                  rows={3} required value={netForm.topology_description} onChange={e => setNetForm({ ...netForm, topology_description: e.target.value })}
                  placeholder="Detail distribution backbone, optical interfaces, core routing, and external ISP links..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl resize-none text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox" checked={netForm.is_ipv6_ready} onChange={e => setNetForm({ ...netForm, is_ipv6_ready: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                  <span className="font-bold text-[11px]">IPv6 Compliant Architecture</span>
                </label>
                <input
                  type="url" value={netForm.diagram_url} onChange={e => setNetForm({ ...netForm, diagram_url: e.target.value })}
                  placeholder="Diagram URL (Optional)"
                  className="p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-mono"
                />
              </div>

              <button
                type="submit" disabled={saving}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm text-xs cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? "Saving Configuration..." : "Save Network Profile"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 2: CYBERSECURITY CONTROL MODAL                           */}
      {/* ============================================================= */}
      {isCyberModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                {editingCyberId ? "Edit Cybersecurity Control" : "Register Cybersecurity Control"}
              </h3>
              <button onClick={() => setIsCyberModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCyberControl} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Security Domain</label>
                <select
                  value={cyberForm.control_domain} onChange={e => setCyberForm({ ...cyberForm, control_domain: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl cursor-pointer"
                >
                  {CYBER_DOMAINS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Control / Mechanism Name</label>
                <input
                  type="text" required value={cyberForm.control_name} onChange={e => setCyberForm({ ...cyberForm, control_name: e.target.value })}
                  placeholder="e.g. Web Application Firewalls (WAFs)"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox" checked={cyberForm.is_mandatory} onChange={e => setCyberForm({ ...cyberForm, is_mandatory: e.target.checked })}
                    className="w-4 h-4 accent-rose-600 rounded"
                  />
                  <span className="font-bold text-[11px]">Mandatory Control</span>
                </label>

                <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox" checked={cyberForm.is_implemented} onChange={e => setCyberForm({ ...cyberForm, is_implemented: e.target.checked })}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                  <span className="font-bold text-[11px]">Implemented</span>
                </label>
              </div>

              <button
                type="submit" disabled={saving}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm text-xs cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? "Saving..." : "Save Control"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 3: E-GOV PROGRAM MODAL                                  */}
      {/* ============================================================= */}
      {isEgovModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  {editingEgovId ? "Edit E-Government Initiative" : "Configure E-Government Initiative (Part II.D)"}
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">
                  DICT Template v.2026 Checklist Standards [3]
                </span>
              </div>
              <button onClick={() => setIsEgovModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEgovProgram} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Program / Initiative Title</label>
                <input
                  type="text" 
                  required 
                  value={egovForm.program_name} 
                  onChange={e => setEgovForm({ ...egovForm, program_name: e.target.value })}
                  placeholder="e.g. eGovPay, PNPKI, HCMIS, PhilGEPS, eTravel..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-semibold text-slate-900 dark:text-white"
                />
              </div>

              {/* Special Form for PNPKI */}
              {(egovForm.program_name.toLowerCase().includes("pnpki") || egovForm.program_name.toLowerCase().includes("public key")) ? (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 font-mono block">
                    PNPKI Adoption Metrics
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9.5px] uppercase font-bold text-slate-500">Total Number of Employees</label>
                      <input
                        type="text"
                        value={egovForm.total_employees}
                        onChange={e => {
                          const emp = e.target.value;
                          setEgovForm(prev => {
                            const act = parseFloat(prev.active_pnpki_count) || 0;
                            const tot = parseFloat(emp) || 0;
                            const ratio = tot > 0 ? `${Math.round((act / tot) * 100)}%` : prev.adoption_ratio;
                            return { ...prev, total_employees: emp, adoption_ratio: ratio };
                          });
                        }}
                        placeholder="e.g. 912"
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9.5px] uppercase font-bold text-slate-500">Employees with Active PNPKI</label>
                      <input
                        type="text"
                        value={egovForm.active_pnpki_count}
                        onChange={e => {
                          const act = e.target.value;
                          setEgovForm(prev => {
                            const tot = parseFloat(prev.total_employees) || 0;
                            const a = parseFloat(act) || 0;
                            const ratio = tot > 0 ? `${Math.round((a / tot) * 100)}%` : prev.adoption_ratio;
                            return { ...prev, active_pnpki_count: act, adoption_ratio: ratio };
                          });
                        }}
                        placeholder="e.g. 23"
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9.5px] uppercase font-bold text-slate-500">Percentage Adoption Ratio</label>
                    <input
                      type="text"
                      value={egovForm.adoption_ratio}
                      onChange={e => setEgovForm({ ...egovForm, adoption_ratio: e.target.value })}
                      placeholder="e.g. 50% or 23/912 (2.5%)"
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg font-mono font-bold text-blue-600 dark:text-blue-400"
                    />
                  </div>
                </div>
              ) : (egovForm.program_name.toLowerCase().includes("portal") && !egovForm.program_name.toLowerCase().includes("philgeps")) ? (
                /* Special Form for Citizen Assistance Portal */
                <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 font-mono block">
                    Citizen Assistance, Feedback &amp; Grievance Channels
                  </span>

                  <div className="space-y-1.5">
                    <span className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wider block">
                      Active consumer protection &amp; feedback mechanisms:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {FRONT_CHANNELS.map(ch => {
                        const active = (egovForm.channels_json || []).includes(ch);
                        return (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => handleToggleChannel(ch)}
                            className={`px-3 py-1.5 rounded-xl text-[10.5px] font-bold font-mono transition-all cursor-pointer border ${
                              active 
                                ? "bg-blue-600 text-white border-blue-600 shadow-2xs" 
                                : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400"
                            }`}
                          >
                            {active ? `✓ ${ch}` : `+ ${ch}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer mt-2">
                    <input
                      type="checkbox"
                      checked={egovForm.is_connected_to_portal}
                      onChange={e => setEgovForm({ ...egovForm, is_connected_to_portal: e.target.checked })}
                      className="w-4 h-4 accent-blue-600 rounded"
                    />
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                      Mechanisms are connected with online public service portals
                    </span>
                  </label>
                </div>
              ) : (
                /* Standard DICT Questions Form [3] */
                <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                      Question 1: Is your agency utilizing {egovForm.program_name || "the system"}?
                    </span>
                    <div className="flex gap-1.5 font-mono text-[10px]">
                      <button
                        type="button"
                        onClick={() => setEgovForm({ ...egovForm, is_utilized: true })}
                        className={`px-3 py-1 rounded-lg font-bold uppercase transition-all cursor-pointer ${
                          egovForm.is_utilized 
                            ? "bg-emerald-600 text-white shadow-2xs" 
                            : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        [X] Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setEgovForm({ ...egovForm, is_utilized: false })}
                        className={`px-3 py-1 rounded-lg font-bold uppercase transition-all cursor-pointer ${
                          !egovForm.is_utilized 
                            ? "bg-rose-600 text-white shadow-2xs" 
                            : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        [X] No
                      </button>
                    </div>
                  </div>

                  {egovForm.is_utilized ? (
                    <div className="space-y-1 pt-1 animate-fadeIn">
                      <label className="text-[10px] uppercase font-bold text-slate-500">
                        Indicate System URL / Portal Link
                      </label>
                      <input
                        type="url"
                        value={egovForm.url_or_system_name}
                        onChange={e => setEgovForm({ ...egovForm, url_or_system_name: e.target.value })}
                        placeholder="https://elgu.dict.gov.ph or Agency Dedicated Instance URL"
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-blue-600 dark:text-blue-400 font-mono"
                      />
                    </div>
                  ) : (
                    /* Question 2: If No Options */
                    <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800 pl-3 border-l-2 border-rose-500 animate-fadeIn">
                      <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 font-mono block">
                        Question 2: If No, specify active agency alternative:
                      </span>

                      {/* Option 2.1: Using Equivalent System */}
                      <div className="space-y-2 p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 block text-[11px]">
                          Using equivalent system (In-house or outsourced):
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={egovForm.equivalent_system_name}
                            onChange={e => setEgovForm({ ...egovForm, equivalent_system_name: e.target.value, equivalent_system_details: e.target.value })}
                            placeholder="Information System Name (e.g. HRIS)"
                            className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-xs"
                          />
                          <input
                            type="url"
                            value={egovForm.equivalent_system_url}
                            onChange={e => setEgovForm({ ...egovForm, equivalent_system_url: e.target.value })}
                            placeholder="System URL (e.g. https://hris.agency.gov.ph)"
                            className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg font-mono text-xs text-blue-500"
                          />
                        </div>
                      </div>

                      {/* Option 2.2: Other payment platform */}
                      <label className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={egovForm.has_other_payment_platform}
                          onChange={e => setEgovForm({ ...egovForm, has_other_payment_platform: e.target.checked })}
                          className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                        />
                        <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                          Using other digital or electronic payment platform (e.g. Landbank Link.Biz, PayMaya, GCash)
                        </span>
                      </label>

                      {/* Option 2.3: Manual processing */}
                      <label className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={egovForm.is_manual}
                          onChange={e => setEgovForm({ ...egovForm, is_manual: e.target.checked })}
                          className="w-4 h-4 accent-amber-600 rounded cursor-pointer"
                        />
                        <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                          Manual transaction / manual processing in place
                        </span>
                      </label>

                      {/* Option 2.4: Proposed development */}
                      <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={egovForm.is_proposed_development}
                            onChange={e => setEgovForm({ ...egovForm, is_proposed_development: e.target.checked })}
                            className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                          />
                          <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                            Proposed development of equivalent system (Part III.D)
                          </span>
                        </label>

                        {egovForm.is_proposed_development && (
                          <input
                            type="text"
                            value={egovForm.proposed_development_name}
                            onChange={e => setEgovForm({ ...egovForm, proposed_development_name: e.target.value })}
                            placeholder="Name / specification of proposed system (e.g. PRIME-HRM III enabled HRIS)"
                            className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-xs"
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm text-xs cursor-pointer transition-all"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? "Saving Initiative..." : "Save E-Gov Checklist Program"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 4: HARMONIZATION CRITERION MODAL                         */}
      {/* ============================================================= */}
      {isHarmonizationModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                {editingHarmonizationId ? "Edit Harmonization Criterion" : "Add Harmonization Criterion"}
              </h3>
              <button onClick={() => setIsHarmonizationModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveHarmonizationCriterion} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Criterion Name / Requirement</label>
                <input
                  type="text" required value={harmonizationForm.name} onChange={e => setHarmonizationForm({ ...harmonizationForm, name: e.target.value })}
                  placeholder="e.g. Zero-Trust Architecture Compliance"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-semibold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Operational Description</label>
                <textarea
                  rows={2} value={harmonizationForm.description} onChange={e => setHarmonizationForm({ ...harmonizationForm, description: e.target.value })}
                  placeholder="Explain why this harmonization criterion is required and how projects fulfill it..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl resize-none text-xs"
                />
              </div>

              <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
                <input
                  type="checkbox" checked={harmonizationForm.is_mandatory} onChange={e => setHarmonizationForm({ ...harmonizationForm, is_mandatory: e.target.checked })}
                  className="w-4 h-4 accent-rose-600 rounded"
                />
                <span className="font-bold text-[11px]">Mandatory for All Strategic Projects</span>
              </label>

              <button
                type="submit" disabled={saving}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm text-xs cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? "Saving..." : "Save Criterion"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 5.1: DR TEAM MEMBER MODAL                               */}
      {/* ============================================================= */}
      {isDrTeamModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                {editingDrTeamId ? "Edit DR Team Member" : "Add DR Team Member"}
              </h3>
              <button onClick={() => setIsDrTeamModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDrTeam} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Role Identifier</label>
                <input
                  type="text" required value={drTeamForm.role} onChange={e => setDrTeamForm({ ...drTeamForm, role: e.target.value })}
                  placeholder="e.g. Incident Commander, Infrastructure Lead, Data Custodian"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-semibold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Contact Person Name</label>
                <input
                  type="text" required value={drTeamForm.contact_person} onChange={e => setDrTeamForm({ ...drTeamForm, contact_person: e.target.value })}
                  placeholder="e.g. DIRECTOR / INCIDENT COMMANDER"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-semibold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Direct Contact Details (Phone / Email)</label>
                <input
                  type="text" required value={drTeamForm.contact_details} onChange={e => setDrTeamForm({ ...drTeamForm, contact_details: e.target.value })}
                  placeholder="e.g. 09190000000 / (02) 8920-0101"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Operational Responsibility</label>
                <textarea
                  rows={3} required value={drTeamForm.responsibility} onChange={e => setDrTeamForm({ ...drTeamForm, responsibility: e.target.value })}
                  placeholder="Declares disaster state, authorizes GovCloud failover, coordinates data restoration..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl resize-none text-xs"
                />
              </div>

              <button
                type="submit" disabled={saving}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm text-xs cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? "Saving..." : "Save DR Team Member"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 5.2: BIA TARGET PARAMETERS MODAL                         */}
      {/* ============================================================= */}
      {isBiaModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  {editingBiaId ? "Edit BIA Recovery Parameters" : "Add BIA System Target"}
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">BIA Continuity Targets</span>
              </div>
              <button onClick={() => setIsBiaModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBia} className="space-y-4 text-xs">
              {informationSystems.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                    <Database className="w-3.5 h-3.5 text-blue-500" />
                    <span>Select from Registered Systems</span>
                  </label>
                  <select
                    value={biaForm.system_id}
                    onChange={e => handleSystemSelectForBia(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl cursor-pointer"
                  >
                    <option value="">-- Custom / Manual Entry --</option>
                    {informationSystems.map(s => (
                      <option key={s.id} value={s.id}>
                        [{s.status?.value || s.status}] {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">System Name</label>
                <input
                  type="text" required value={biaForm.system_name} onChange={e => setBiaForm({ ...biaForm, system_name: e.target.value })}
                  placeholder="e.g. Citizen Frontline Registry & Payment Gateway"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl font-semibold text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Criticality Classification</label>
                <select
                  value={biaForm.classification} onChange={e => setBiaForm({ ...biaForm, classification: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl cursor-pointer text-slate-900 dark:text-white"
                >
                  <option value="Frontline / Mission-Critical">Frontline / Mission-Critical (RTO &le; 4h)</option>
                  <option value="Administrative / Support to Operations">Administrative / Support to Operations (RTO &le; 8h)</option>
                  <option value="General Administrative / Back-Office">General Administrative / Back-Office (RTO &le; 24h)</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono">
                <div className="space-y-1">
                  <label className="text-[9.5px] uppercase font-bold text-slate-500">MTPD (Hours)</label>
                  <input
                    type="number" min="1" required value={biaForm.mtpd_hours} onChange={e => setBiaForm({ ...biaForm, mtpd_hours: e.target.value })}
                    className="w-full p-2 text-center bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9.5px] uppercase font-bold text-blue-600">RTO (Hours)</label>
                  <input
                    type="number" min="0" required value={biaForm.rto_hours} onChange={e => setBiaForm({ ...biaForm, rto_hours: e.target.value })}
                    className="w-full p-2 text-center bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg font-bold text-blue-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9.5px] uppercase font-bold text-emerald-600">RPO (Hours)</label>
                  <input
                    type="number" min="0" required value={biaForm.rpo_hours} onChange={e => setBiaForm({ ...biaForm, rpo_hours: e.target.value })}
                    className="w-full p-2 text-center bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg font-bold text-emerald-600"
                  />
                </div>
              </div>

              {/* RTO Rule Notification */}
              {biaForm.rto_hours <= 4 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-955/40 border border-amber-300 dark:border-amber-800 rounded-xl space-y-1">
                  <div className="flex items-center gap-1 font-bold text-amber-800 dark:text-amber-300 text-xs">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Mission-Critical Target (RTO &le; 4 Hours)</span>
                  </div>
                  <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    Under statutory guidelines, systems with an RTO &le; 4 hours require corresponding cloud/DR backup subscription funding under <strong>Continuing Costs</strong> in Part IV.A.
                  </p>
                </div>
              )}

              <button
                type="submit" disabled={saving}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm text-xs cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? "Saving..." : "Save BIA Targets"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 5.3: DRBCP KPI METRIC MODAL                             */}
      {/* ============================================================= */}
      {isDrMetricModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                {editingDrMetricId ? "Edit Continuity KPI" : "Add Continuity KPI"}
              </h3>
              <button onClick={() => setIsDrMetricModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDrMetric} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Indicator Title</label>
                <input
                  type="text" required value={drMetricForm.indicator} onChange={e => setDrMetricForm({ ...drMetricForm, indicator: e.target.value })}
                  placeholder="e.g. System Availability, RTO Compliance Rate, Backup Success"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl font-semibold text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Target Benchmark Metric</label>
                <input
                  type="text" required value={drMetricForm.target_metric} onChange={e => setDrMetricForm({ ...drMetricForm, target_metric: e.target.value })}
                  placeholder="e.g. 99.9% Uptime, Recovery within 4 hours, 100% daily snapshots"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl font-mono text-emerald-600 font-bold"
                />
              </div>

              <button
                type="submit" disabled={saving}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm text-xs cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? "Saving..." : "Save Metric"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 6: STAKEHOLDER MATRIX MODAL (FLEXIBLE COMPLEXITY)       */}
      {/* ============================================================= */}
      {isStakeholderModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                {editingStakeholderId ? "Edit Stakeholder Group" : "Add Stakeholder Group (Part I.C)"}
              </h3>
              <button onClick={() => setIsStakeholderModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStakeholder} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Stakeholder Group</label>
                <input
                  type="text" required value={stakeholderForm.stakeholder_group} onChange={e => setStakeholderForm({ ...stakeholderForm, stakeholder_group: e.target.value })}
                  placeholder="e.g. General Citizens and Service Applicants"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl font-semibold text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Incoming Transactions (Requests / Inquiries)</label>
                <textarea
                  rows={2} value={stakeholderForm.transaction_processed_incoming} onChange={e => setStakeholderForm({ ...stakeholderForm, transaction_processed_incoming: e.target.value })}
                  placeholder="e.g. Online service inquiries, application submissions, and electronic fee settlement"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl resize-none text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                  <span>Incoming Complexity Rating</span>
                  <span className="text-[9px] text-blue-500 font-mono">Custom Input or Preset</span>
                </label>
                <div className="space-y-1.5">
                  <select
                    value={COMPLEXITY_PRESETS.includes(stakeholderForm.complexity_incoming) ? stakeholderForm.complexity_incoming : "Custom"}
                    onChange={e => {
                      if (e.target.value !== "Custom") {
                        setStakeholderForm({ ...stakeholderForm, complexity_incoming: e.target.value });
                      }
                    }}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg cursor-pointer text-slate-900 dark:text-white"
                  >
                    {COMPLEXITY_PRESETS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                    <option value="Custom">Custom / Range Input...</option>
                  </select>
                  <input
                    type="text"
                    value={stakeholderForm.complexity_incoming}
                    onChange={e => setStakeholderForm({ ...stakeholderForm, complexity_incoming: e.target.value })}
                    placeholder="e.g. Simple to Complex, Highly Technical..."
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Outgoing Transactions (Clearances / Permits / Certs)</label>
                <textarea
                  rows={2} value={stakeholderForm.transaction_processed_outgoing} onChange={e => setStakeholderForm({ ...stakeholderForm, transaction_processed_outgoing: e.target.value })}
                  placeholder="e.g. Official E-Certificates, clearances, regulatory statements, and receipts"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl resize-none text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                  <span>Outgoing Complexity Rating</span>
                  <span className="text-[9px] text-blue-500 font-mono">Custom Input or Preset</span>
                </label>
                <div className="space-y-1.5">
                  <select
                    value={COMPLEXITY_PRESETS.includes(stakeholderForm.complexity_outgoing) ? stakeholderForm.complexity_outgoing : "Custom"}
                    onChange={e => {
                      if (e.target.value !== "Custom") {
                        setStakeholderForm({ ...stakeholderForm, complexity_outgoing: e.target.value });
                      }
                    }}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg cursor-pointer text-slate-900 dark:text-white"
                  >
                    {COMPLEXITY_PRESETS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                    <option value="Custom">Custom / Range Input...</option>
                  </select>
                  <input
                    type="text"
                    value={stakeholderForm.complexity_outgoing}
                    onChange={e => setStakeholderForm({ ...stakeholderForm, complexity_outgoing: e.target.value })}
                    placeholder="e.g. Simple, Simple to Highly Technical..."
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <button
                type="submit" disabled={saving}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm text-xs cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? "Saving..." : "Save Stakeholder Group"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 7: DEVELOPMENT STRATEGY MODAL (DYNAMIC CRUD)             */}
      {/* ============================================================= */}
      {isDevStrategyModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Register Development Strategy</h3>
                <span className="text-[10px] text-slate-500 font-mono">Custom System Development Taxonomy</span>
              </div>
              <button 
                type="button" 
                onClick={() => setIsDevStrategyModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDevStrategy} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Strategy Code (Identifier)</label>
                <input
                  type="text"
                  required
                  value={devStrategyForm.code}
                  onChange={e => setDevStrategyForm({ ...devStrategyForm, code: e.target.value })}
                  placeholder="e.g. SAAS_HYBRID or CLOUD_NATIVE"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl font-mono uppercase text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Display Name / Methodology</label>
                <input
                  type="text"
                  required
                  value={devStrategyForm.display_name}
                  onChange={e => setDevStrategyForm({ ...devStrategyForm, display_name: e.target.value })}
                  placeholder="e.g. Software-as-a-Service (SaaS) Hybrid Integration"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl font-semibold text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Operational Description &amp; Guidelines</label>
                <textarea
                  rows={2}
                  value={devStrategyForm.description}
                  onChange={e => setDevStrategyForm({ ...devStrategyForm, description: e.target.value })}
                  placeholder="Provide scope guidelines on when this technical development strategy is utilized..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none resize-none text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm text-xs cursor-pointer transition-all"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? "Registering..." : "Save Development Strategy"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
