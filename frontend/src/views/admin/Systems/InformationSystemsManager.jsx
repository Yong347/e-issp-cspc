// frontend/src/views/admin/Systems/InformationSystemsManager.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import {
  getInformationSystems,
  createInformationSystem,
  updateInformationSystem,
  deleteInformationSystem,
  reviewProposedSystem,
  getStrategicConcerns,
  getIctProjects,
  getDepartments,
  getAllNeedsAssessments,
  getDevelopmentStrategies,
  createDevelopmentStrategy,
  deleteDevelopmentStrategy
} from "../../../api/admin";
import CompilerSyncButton from "../../../components/common/CompilerSyncButton";
import { 
  Database, 
  Server, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  X, 
  RefreshCw, 
  Search, 
  ShieldAlert, 
  ShieldCheck,
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  Lock, 
  Share2, 
  Cpu, 
  Layers, 
  Globe, 
  Info, 
  Sparkles, 
  Inbox, 
  Check, 
  ArrowRight, 
  CornerDownRight, 
  RotateCcw, 
  Eye, 
  FolderKanban, 
  GraduationCap, 
  Building,
  CheckSquare,
  Tag,
  Coins,
  SlidersHorizontal,
  Calendar
} from "lucide-react";

export default function InformationSystemsManager() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();
  const location = useLocation();

  // Active planning horizon sequence (strictly dynamic, zero hardcoding)
  const activeYears = useMemo(() => {
    if (planningYears && planningYears.length > 0) return planningYears;
    if (activeCycle && activeCycle.includes("-")) {
      const parts = activeCycle.split("-");
      const start = parseInt(parts[0], 10);
      if (!isNaN(start)) {
        return [start, start + 1, start + 2];
      }
    }
    const currentYear = new Date().getFullYear();
    return [currentYear, currentYear + 1, currentYear + 2];
  }, [planningYears, activeCycle]);

  // Core Data States
  const [systems, setSystems] = useState([]);
  const [strategicConcerns, setStrategicConcerns] = useState([]);
  const [projects, setProjects] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [needsAssessments, setNeedsAssessments] = useState([]);
  const [developmentStrategies, setDevelopmentStrategies] = useState([
    { code: "IN_HOUSE", display_name: "In-House Development", description: "Internally developed by agency IT" },
    { code: "OUTSOURCED", display_name: "Outsourced", description: "Contracted to third-party vendor" },
    { code: "COTS", display_name: "Commercial Off-The-Shelf (COTS)", description: "Commercial off-the-shelf software" },
    { code: "COMBINATION", display_name: "Combination / Hybrid", description: "Hybrid in-house & vendor development" }
  ]);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Filter & Search States
  const [searchTerm, setSearchTerm] = useState("");
  // Tabs: "All" | "Intake" | "Operational" | "Proposed" | "For Development" | "For Enhancement" | "Returned"
  const [statusTab, setStatusTab] = useState("All");

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Detail View Modal State
  const [viewingSystem, setViewingSystem] = useState(null);

  // Development Strategies Custom CRUD Modal State
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false);
  const [newStrategyCode, setNewStrategyCode] = useState("");
  const [newStrategyName, setNewStrategyName] = useState("");
  const [newStrategyDesc, setNewStrategyDesc] = useState("");
  const [savingStrategy, setSavingStrategy] = useState(false);

  // Administrative Review Modal State (Intake & Architecture Bridge)
  const [reviewingSystem, setReviewingSystem] = useState(null);
  const [reviewAction, setReviewAction] = useState("APPROVE"); // "APPROVE" | "RETURN"
  const [reviewStatus, setReviewStatus] = useState("For Development");
  const [reviewProposedCost, setReviewProposedCost] = useState("0");
  const [reviewTargetYear, setReviewTargetYear] = useState("");
  const [reviewUacsCode, setReviewUacsCode] = useState("50604070 01 - ICT Software (Perpetual CO)");
  const [reviewExpClass, setReviewExpClass] = useState("Capital Outlay");
  const [reviewConcernId, setReviewConcernId] = useState("");
  const [reviewProjectId, setReviewProjectId] = useState("");
  const [reviewDevStrategy, setReviewDevStrategy] = useState("Outsourced");
  const [reviewPlatform, setReviewPlatform] = useState("Web-Based Architecture (FastAPI, React, PostgreSQL)");
  const [reviewDatabaseName, setReviewDatabaseName] = useState("");
  const [reviewDataStorage, setReviewDataStorage] = useState("GovCloud / On-premise Storage");
  const [reviewProcessesPII, setReviewProcessesPII] = useState(false);
  const [reviewHasPIA, setReviewHasPIA] = useState(false);
  const [reviewPiaTargetDate, setReviewPiaTargetDate] = useState("");
  const [reviewIsIntegrated, setReviewIsIntegrated] = useState(false);
  const [reviewInternalIntegrated, setReviewInternalIntegrated] = useState("");
  const [reviewExternalIntegrated, setReviewExternalIntegrated] = useState("");
  const [reviewGeneratesData, setReviewGeneratesData] = useState(false);
  const [reviewProcessesData, setReviewProcessesData] = useState(false);
  const [reviewSharedPlatform, setReviewSharedPlatform] = useState(false);
  const [reviewReason, setReviewReason] = useState("");

  // Initial Form State
  const initialFormState = {
    strategic_concern_id: "",
    needs_assessment_id: "",
    project_id: "",
    name: "",
    status: "Operational", // Operational | For Development | For Enhancement
    classification: "Operations - Frontline Service",
    proposed_cost: "",
    target_year: "",
    uacs_object_code: "50604070 01 - ICT Software (Perpetual CO)",
    expenditure_class: "Capital Outlay",
    is_client_facing: true,
    
    // Independent Multi-Classification Checkboxes
    is_support_to_operations: false,
    is_general_administrative: false,
    is_operations: true,

    // Subordinated Frontline details under Operations
    is_frontline_service: true,
    frontline_hosting_type: "Online", // Online | On-premise | Hybrid
    online_url: "",
    is_non_frontline_service: false,

    description_and_purpose: "",
    enhancement_details: "", // Required if status === "For Enhancement"
    development_strategy: "Outsourced",
    development_platform: "Web-Based Architecture (FastAPI, React, PostgreSQL)",
    database_name: "",
    data_storage_type: "GovCloud / On-premise Storage",
    internal_users: "",
    external_users: "",
    system_owner_office: "",

    // Interoperability Capabilities (PeGIF / NGDX)
    is_integrated_with_others: false,
    internal_integrated_systems: "",
    external_integrated_systems: "",
    generates_data_for_others: false,
    processes_data_from_others: false,
    is_deployed_on_shared_platform: false,

    // Data Privacy Act Compliance (PIA)
    processes_personal_information: false,
    has_undergone_pia: false,
    pia_target_date_text: ""
  };
  const [form, setForm] = useState(initialFormState);

  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Synchronize Tab with Route Parameters
  useEffect(() => {
    if (location.pathname.endsWith("/operational")) {
      setStatusTab("Operational");
    } else if (location.pathname.endsWith("/proposed")) {
      setStatusTab("Proposed");
    }
  }, [location.pathname]);

  const fetchSystems = useCallback(async () => {
    if (!token || !activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      const [sysData, cData, pData, dData, naData, stratData] = await Promise.all([
        getInformationSystems(token, activeCycle).catch(() => []),
        getStrategicConcerns(token, activeCycle).catch(() => []),
        getIctProjects(token, activeCycle).catch(() => []),
        getDepartments(token).catch(() => []),
        getAllNeedsAssessments(token).catch(() => []),
        getDevelopmentStrategies(token).catch(() => null)
      ]);

      setSystems(Array.isArray(sysData) ? sysData : (sysData?.data || []));
      setStrategicConcerns(Array.isArray(cData) ? cData : (cData?.data || []));
      setProjects(Array.isArray(pData) ? pData : (pData?.data || []));
      setDepartments(Array.isArray(dData) ? dData : []);
      setNeedsAssessments(Array.isArray(naData) ? naData : []);

      if (stratData && Array.isArray(stratData) && stratData.length > 0) {
        setDevelopmentStrategies(stratData);
      }
    } catch (err) {
      setError(err.message || "Failed to load information systems.");
    } finally {
      setLoading(false);
    }
  }, [activeCycle, token]);

  useEffect(() => {
    fetchSystems();
  }, [fetchSystems]);

  // Development Strategies Management Handlers
  const handleAddStrategy = async (e) => {
    e.preventDefault();
    if (!newStrategyName.trim()) return;

    const generatedCode = (newStrategyCode.trim() || newStrategyName.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_")).slice(0, 30);
    setSavingStrategy(true);
    setError(null);
    setSuccess(null);
    try {
      await createDevelopmentStrategy(token, {
        code: generatedCode,
        display_name: newStrategyName.trim(),
        description: newStrategyDesc.trim() || null
      });

      setSuccess(`Development strategy '${newStrategyName.trim()}' registered successfully.`);
      setNewStrategyCode("");
      setNewStrategyName("");
      setNewStrategyDesc("");
      const updated = await getDevelopmentStrategies(token).catch(() => []);
      if (Array.isArray(updated) && updated.length > 0) {
        setDevelopmentStrategies(updated);
      }
    } catch (err) {
      setError(err.message || "Failed to register development strategy.");
    } finally {
      setSavingStrategy(false);
    }
  };

  const handleDeleteStrategy = async (code, name) => {
    if (!window.confirm(`Permanently remove development strategy '${name}' (${code})?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteDevelopmentStrategy(token, code);
      setSuccess(`Development strategy '${name}' deleted.`);
      const updated = await getDevelopmentStrategies(token).catch(() => []);
      if (Array.isArray(updated)) {
        setDevelopmentStrategies(updated);
      }
    } catch (err) {
      setError(err.message || "Failed to delete development strategy.");
    }
  };

  const handleOpenCreateModal = (defaultStatus = null) => {
    setEditingId(null);
    let resolvedStatus = defaultStatus;
    if (!resolvedStatus) {
      if (statusTab === "Operational") resolvedStatus = "Operational";
      else if (statusTab === "For Development") resolvedStatus = "For Development";
      else if (statusTab === "For Enhancement") resolvedStatus = "For Enhancement";
      else if (statusTab === "Proposed") resolvedStatus = "For Development";
      else resolvedStatus = "Operational";
    }

    setForm({
      ...initialFormState,
      target_year: activeYears[0] || 2026,
      status: resolvedStatus
    });
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (sys) => {
    setEditingId(sys.id);

    const classStr = sys.classification?.value || sys.classification || "";
    const classLower = classStr.toLowerCase();

    const isSupport = sys.is_support_to_operations !== undefined 
      ? Boolean(sys.is_support_to_operations) 
      : classLower.includes("support");

    const isAdmin = sys.is_general_administrative !== undefined 
      ? Boolean(sys.is_general_administrative) 
      : (classLower.includes("administrative") || classLower.includes("admin"));

    const isOps = sys.is_operations !== undefined 
      ? Boolean(sys.is_operations) 
      : (classLower.includes("operations") || (!isSupport && !isAdmin));

    const isFrontline = sys.is_frontline_service !== undefined 
      ? Boolean(sys.is_frontline_service) 
      : (classLower.includes("frontline") && !classLower.includes("non-frontline"));

    const isNonFrontline = sys.is_non_frontline_service !== undefined 
      ? Boolean(sys.is_non_frontline_service) 
      : classLower.includes("non-frontline");

    // Check project linkage via both sys.project_id and project.system_id
    const linkedProj = projects.find(
      p => (sys.project_id && String(p.id) === String(sys.project_id)) || String(p.system_id) === String(sys.id)
    );

    setForm({
      strategic_concern_id: sys.strategic_concern_id || "",
      needs_assessment_id: sys.needs_assessment_id || "",
      project_id: sys.project_id || (linkedProj ? String(linkedProj.id) : ""),
      name: sys.name || "",
      status: sys.status?.value || sys.status || "Operational",
      classification: classStr || "Operations - Frontline Service",
      proposed_cost: sys.proposed_cost !== undefined ? String(sys.proposed_cost) : "",
      target_year: sys.target_year || activeYears[0] || 2026,
      uacs_object_code: sys.uacs_object_code || "50604070 01 - ICT Software (Perpetual CO)",
      expenditure_class: sys.expenditure_class || (sys.uacs_object_code?.includes("(CO)") ? "Capital Outlay" : "Maintenance and Other Operating Expenses"),
      is_client_facing: sys.is_client_facing !== undefined ? Boolean(sys.is_client_facing) : true,
      is_support_to_operations: isSupport,
      is_general_administrative: isAdmin,
      is_operations: isOps,
      is_frontline_service: isFrontline,
      frontline_hosting_type: sys.frontline_hosting_type?.value || sys.frontline_hosting_type || sys.hosting_type?.value || sys.hosting_type || "Online",
      online_url: sys.online_url || "",
      is_non_frontline_service: isNonFrontline,
      description_and_purpose: sys.description_and_purpose || "",
      enhancement_details: sys.enhancement_details || "",
      development_strategy: sys.development_strategy?.value || sys.development_strategy || "Outsourced",
      development_platform: sys.development_platform || "",
      database_name: sys.database_name || "",
      data_storage_type: sys.data_storage_type || "",
      internal_users: sys.internal_users || "",
      external_users: sys.external_users || "",
      system_owner_office: sys.system_owner_office || "",
      is_integrated_with_others: Boolean(sys.is_integrated_with_others),
      internal_integrated_systems: sys.internal_integrated_systems || "",
      external_integrated_systems: sys.external_integrated_systems || "",
      generates_data_for_others: Boolean(sys.generates_data_for_others),
      processes_data_from_others: Boolean(sys.processes_data_from_others),
      is_deployed_on_shared_platform: Boolean(sys.is_deployed_on_shared_platform),
      processes_personal_information: Boolean(sys.processes_personal_information),
      has_undergone_pia: Boolean(sys.has_undergone_pia),
      pia_target_date_text: sys.pia_target_date_text || ""
    });
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  // Open Administrative Review Modal (Populates both Department Inputs & Technical Stack + Target Year & UACS)
  const handleOpenReviewModal = (sys) => {
    setReviewingSystem(sys);
    setReviewAction("APPROVE");
    setReviewStatus(sys.status?.value || sys.status || "For Development");
    setReviewProposedCost(sys.proposed_cost !== undefined ? String(sys.proposed_cost) : "0");
    setReviewConcernId(sys.strategic_concern_id || (strategicConcerns[0]?.id ? String(strategicConcerns[0].id) : ""));
    
    // Find if any project is already linked to this system
    const linkedProj = projects.find(
      p => (sys.project_id && String(p.id) === String(sys.project_id)) || String(p.system_id) === String(sys.id)
    );
    setReviewProjectId(sys.project_id || (linkedProj ? String(linkedProj.id) : ""));

    // Set Target Year and UACS for review modal
    setReviewTargetYear(sys.target_year ? parseInt(sys.target_year, 10) : (activeYears[0] || 2026));
    const initialUacs = sys.uacs_object_code || "50604070 01 - ICT Software (Perpetual CO)";
    setReviewUacsCode(initialUacs);
    setReviewExpClass(sys.expenditure_class || (initialUacs.includes("(CO)") ? "Capital Outlay" : "Maintenance and Other Operating Expenses"));

    // Pre-populate technical architecture defaults for the Administrator to confirm
    setReviewDevStrategy(sys.development_strategy?.value || sys.development_strategy || "Outsourced");
    setReviewPlatform(sys.development_platform || "Web-Based Architecture (FastAPI, React, PostgreSQL)");
    setReviewDatabaseName(
      sys.database_name || 
      `${(sys.name || "app").toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 25)}_db`
    );
    setReviewDataStorage(sys.data_storage_type || "GovCloud / On-premise Storage");
    setReviewProcessesPII(Boolean(sys.processes_personal_information));
    setReviewHasPIA(Boolean(sys.has_undergone_pia));
    setReviewPiaTargetDate(sys.pia_target_date_text || "");

    setReviewIsIntegrated(Boolean(sys.is_integrated_with_others));
    setReviewInternalIntegrated(sys.internal_integrated_systems || "");
    setReviewExternalIntegrated(sys.external_integrated_systems || "");
    setReviewGeneratesData(Boolean(sys.generates_data_for_others));
    setReviewProcessesData(Boolean(sys.processes_data_from_others));
    setReviewSharedPlatform(Boolean(sys.is_deployed_on_shared_platform));

    setReviewReason("Please provide additional technical justifications and details regarding frontline integrations.");
    setError(null);
  };

  // Commit Review Decision & Synchronize Architecture + Financial Parity
  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!reviewingSystem) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      if (reviewAction === "RETURN") {
        await reviewProposedSystem(token, reviewingSystem.id, {
          action: "RETURN",
          status: reviewingSystem.status?.value || reviewingSystem.status,
          rejection_reason: reviewReason.trim() || "Proposal requires revision or additional technical details."
        });

        setSuccess(`System proposal '${reviewingSystem.name}' returned to department with revision remarks.`);
      } else {
        // APPROVE: First update the system with all technical specifications confirmed by the Admin
        const parsedCost = parseFloat(reviewProposedCost) || 0.0;
        const targetYearNum = parseInt(reviewTargetYear, 10) || activeYears[0] || 2026;
        const updatePayload = {
          proposed_cost: parsedCost,
          target_year: targetYearNum,
          uacs_object_code: reviewUacsCode,
          expenditure_class: reviewExpClass,
          project_id: reviewProjectId || null,
          development_strategy: reviewDevStrategy,
          development_platform: reviewPlatform.trim(),
          database_name: reviewDatabaseName.trim(),
          data_storage_type: reviewDataStorage.trim(),
          processes_personal_information: reviewProcessesPII,
          has_undergone_pia: reviewHasPIA,
          pia_target_date_text: reviewProcessesPII && !reviewHasPIA ? (reviewPiaTargetDate.trim() || null) : null,
          is_integrated_with_others: reviewIsIntegrated,
          internal_integrated_systems: reviewIsIntegrated ? (reviewInternalIntegrated.trim() || null) : null,
          external_integrated_systems: reviewIsIntegrated ? (reviewExternalIntegrated.trim() || null) : null,
          generates_data_for_others: reviewGeneratesData,
          processes_data_from_others: reviewProcessesData,
          is_deployed_on_shared_platform: reviewSharedPlatform
        };

        await updateInformationSystem(token, reviewingSystem.id, updatePayload);

        // Finalize review approval with Target Year & UACS classifications
        await reviewProposedSystem(token, reviewingSystem.id, {
          action: "APPROVE",
          status: reviewStatus,
          target_year: targetYearNum,
          uacs_object_code: reviewUacsCode,
          expenditure_class: reviewExpClass,
          strategic_concern_id: reviewConcernId || null,
          project_id: reviewProjectId || null,
          rejection_reason: null
        });

        setSuccess(`System '${reviewingSystem.name}' approved! Technical specs committed and linked to Part III.E & Part IV.A under FY ${targetYearNum}.`);
      }

      setReviewingSystem(null);
      fetchSystems();
    } catch (err) {
      setError(err.message || "Failed to process review.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError("System Name is required.");
      return;
    }

    if (!form.is_support_to_operations && !form.is_general_administrative && !form.is_operations) {
      setError("Please select at least one classification category: Support to Operations, General Administrative, or Operations.");
      return;
    }

    if (form.is_operations && !form.is_frontline_service && !form.is_non_frontline_service) {
      setError("When Operations is checked, please specify either Frontline Service, Non-Frontline Service, or both.");
      return;
    }

    if (!form.description_and_purpose.trim()) {
      setError("System Description and Purpose is required.");
      return;
    }

    if (form.status === "For Enhancement" && !form.enhancement_details?.trim()) {
      setError("Please provide specific planned enhancement details when status is set to 'For Enhancement'.");
      return;
    }

    if (form.processes_personal_information && !form.has_undergone_pia && !form.pia_target_date_text?.trim()) {
      setError("Data Privacy Compliance: Please provide a Target Audit Completion Date (e.g., 'Q3 2027') for systems with uncompleted PIAs [1].");
      return;
    }

    setSubmitting(true);

    const classTokens = [];
    if (form.is_support_to_operations) classTokens.push("Support to Operations");
    if (form.is_general_administrative) classTokens.push("General Administrative Systems");
    if (form.is_operations) {
      if (form.is_frontline_service && form.is_non_frontline_service) {
        classTokens.push("Operations (Frontline & Non-Frontline)");
      } else if (form.is_frontline_service) {
        classTokens.push("Operations - Frontline Service");
      } else if (form.is_non_frontline_service) {
        classTokens.push("Operations - Non-Frontline Service");
      } else {
        classTokens.push("Operations");
      }
    }
    const classificationStr = classTokens.join(", ") || "Operations";

    const targetYearVal = form.status !== "Operational" 
      ? (form.target_year ? parseInt(form.target_year, 10) : activeYears[0])
      : null;

    const payload = {
      ...form,
      name: form.name.trim(),
      classification: classificationStr,
      proposed_cost: parseFloat(form.proposed_cost) || 0.0,
      target_year: targetYearVal,
      uacs_object_code: form.uacs_object_code || "50604070 01 - ICT Software (Perpetual CO)",
      expenditure_class: form.expenditure_class || (form.uacs_object_code?.includes("(CO)") ? "Capital Outlay" : "Maintenance and Other Operating Expenses"),
      is_client_facing: Boolean(form.is_client_facing),
      is_support_to_operations: Boolean(form.is_support_to_operations),
      is_general_administrative: Boolean(form.is_general_administrative),
      is_operations: Boolean(form.is_operations),
      is_frontline_service: Boolean(form.is_frontline_service),
      is_non_frontline_service: Boolean(form.is_non_frontline_service),
      frontline_hosting_type: form.is_frontline_service ? (form.frontline_hosting_type || "Online") : "Online",
      online_url: (form.is_frontline_service && form.online_url?.trim()) ? form.online_url.trim() : null,
      description_and_purpose: form.description_and_purpose.trim(),
      enhancement_details: form.status === "For Enhancement" ? (form.enhancement_details?.trim() || null) : null,
      strategic_concern_id: form.strategic_concern_id || null,
      needs_assessment_id: form.needs_assessment_id || null,
      project_id: form.project_id || null,
      development_strategy: form.development_strategy,
      development_platform: form.development_platform.trim(),
      database_name: form.database_name.trim(),
      data_storage_type: form.data_storage_type.trim(),
      internal_users: form.internal_users.trim(),
      external_users: form.external_users.trim(),
      system_owner_office: form.system_owner_office.trim(),
      internal_integrated_systems: form.is_integrated_with_others ? (form.internal_integrated_systems?.trim() || null) : null,
      external_integrated_systems: form.is_integrated_with_others ? (form.external_integrated_systems?.trim() || null) : null,
      pia_target_date_text: form.processes_personal_information && !form.has_undergone_pia ? (form.pia_target_date_text?.trim() || null) : null
    };

    try {
      if (editingId) {
        await updateInformationSystem(token, editingId, payload);
      } else {
        await createInformationSystem(token, payload);
      }

      setSuccess(`Information System '${form.name}' saved successfully.`);
      setIsModalOpen(false);
      fetchSystems();
    } catch (err) {
      setError(err.message || "Failed to save system.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Permanently delete Information System '${name}'? This will uncouple any linked BIA records and ICT projects.`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteInformationSystem(token, id);
      setSuccess(`System '${name}' removed from registry.`);
      fetchSystems();
    } catch (err) {
      setError(err.message || "Failed to delete system.");
    }
  };

  // Summary Metrics Breakdown (Evaluate real status so newly created/drafted systems register immediately)
  const intakeCount = systems.filter(s => (s.submission_status || "").toLowerCase() === "submitted").length;
  const operationalCount = systems.filter(s => (s.status?.value || s.status) === "Operational").length;
  const proposedCount = systems.filter(s => (s.status?.value || s.status) !== "Operational").length;
  const devCount = systems.filter(s => (s.status?.value || s.status) === "For Development").length;
  const enhanceCount = systems.filter(s => (s.status?.value || s.status) === "For Enhancement").length;
  const returnedCount = systems.filter(s => (s.submission_status || "").toLowerCase() === "returned").length;

  const totalProposedOutlay = useMemo(() => {
    return systems
      .filter(s => (s.status?.value || s.status) !== "Operational")
      .reduce((sum, s) => sum + (parseFloat(s.proposed_cost) || 0), 0);
  }, [systems]);

  const pendingPiaCount = systems.filter(s => s.processes_personal_information && !s.has_undergone_pia).length;
  const frontlineCount = systems.filter(s => {
    const c = (s.classification?.value || s.classification || "").toLowerCase();
    return s.is_frontline_service || (c.includes("frontline") && !c.includes("non-frontline"));
  }).length;

  // Filtered Systems List (Tabs & Text Search)
  const filteredSystems = useMemo(() => {
    return systems.filter(s => {
      const sStatus = s.status?.value || s.status || "Operational";
      const subStatus = (s.submission_status || "Approved").toLowerCase();
      let matchesTab = true;

      if (statusTab === "Intake") {
        matchesTab = subStatus === "submitted";
      } else if (statusTab === "Operational") {
        matchesTab = sStatus === "Operational";
      } else if (statusTab === "Proposed") {
        matchesTab = sStatus !== "Operational";
      } else if (statusTab === "For Development") {
        matchesTab = sStatus === "For Development";
      } else if (statusTab === "For Enhancement") {
        matchesTab = sStatus === "For Enhancement";
      } else if (statusTab === "Returned") {
        matchesTab = subStatus === "returned";
      }

      const q = searchTerm.toLowerCase().trim();
      const matchesSearch = q === "" || 
        (s.name || "").toLowerCase().includes(q) ||
        (s.system_owner_office || "").toLowerCase().includes(q) ||
        (s.development_platform || "").toLowerCase().includes(q) ||
        (s.database_name || "").toLowerCase().includes(q) ||
        (s.description_and_purpose || "").toLowerCase().includes(q) ||
        (s.enhancement_details || "").toLowerCase().includes(q);

      return matchesTab && matchesSearch;
    });
  }, [systems, statusTab, searchTerm]);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      
      {/* Header Banner Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
              <span>Information Systems Register &amp; Intake Queue</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              Cycle: FY {activeCycle || "2026-2028"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Review department-submitted proposed systems, assign technical architectures, and bridge governance linkages: <strong>Part I.A.4 Outcome</strong>, <strong>Part II.A Strategic Concern</strong>, and <strong>Part III.E ICT Project Portfolio</strong>. Approving a system automatically commits the estimated budget into Part IV.A outlays.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {/* Verified Compiler Pipeline Synchronization Button */}
          <CompilerSyncButton
            moduleName="systems"
            activeCycle={activeCycle}
            token={token}
            onSaveAndSync={fetchSystems}
            label="Save &amp; Verify Compiler Pipeline"
          />

          <button
            type="button"
            onClick={() => setIsStrategyModalOpen(true)}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer font-bold shadow-xs text-xs"
            title="Configure Development Strategies Taxonomy"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Manage Strategies ({developmentStrategies.length})</span>
          </button>

          <button
            type="button"
            onClick={fetchSystems}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-bold shadow-xs text-xs"
            title="Refresh systems register"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenCreateModal()}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Register System</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Intake Queue Counter */}
        <div 
          onClick={() => setStatusTab("Intake")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            statusTab === "Intake"
              ? "bg-blue-50 dark:bg-blue-955/40 border-blue-400 dark:border-blue-700"
              : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-blue-300"
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className={`p-3 rounded-xl shrink-0 ${intakeCount > 0 ? "bg-blue-600 text-white animate-pulse" : "bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400"}`}>
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Dept Intake Queue</span>
              <h3 className="text-base font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5">{intakeCount} Pending</h3>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl shrink-0">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Part II.C Operational</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{operationalCount} Systems</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-50 dark:bg-slate-800 text-purple-600 dark:text-purple-400 rounded-xl shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Part III.D Proposed</span>
            <h3 className="text-base font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5">{proposedCount} Systems</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Proposed Outlay Pool</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{formatPHP(totalProposedOutlay)}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-rose-50 dark:bg-slate-800 text-rose-600 dark:text-rose-400 rounded-xl shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Uncompleted PIAs</span>
            <h3 className={`text-base font-bold font-mono mt-0.5 ${pendingPiaCount > 0 ? "text-rose-600 dark:text-rose-400 animate-pulse" : "text-slate-900 dark:text-white"}`}>
              {pendingPiaCount} Deficits
            </h3>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-955/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar with Clean Grouped Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl self-start">
          {[
            { id: "All", label: `All Systems (${systems.length})` },
            { id: "Intake", label: `Intake Queue (${intakeCount})`, isAlert: intakeCount > 0 },
            { id: "Operational", label: `Part II.C: Operational (${operationalCount})` },
            { id: "Proposed", label: `Part III.D: Proposed (${proposedCount})` },
            { id: "For Development", label: `For Development (${devCount})` },
            { id: "For Enhancement", label: `For Enhancement (${enhanceCount})` },
            { id: "Returned", label: `Returned (${returnedCount})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusTab(tab.id)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                statusTab === tab.id
                  ? "bg-blue-600 text-white shadow-xs" 
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <span>{tab.label}</span>
              {tab.isAlert && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search systems, databases, platform..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 text-xs outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Systems Directory Cards */}
      <div className="space-y-4">
        {loading && systems.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-500 flex flex-col items-center justify-center gap-2 shadow-xs">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mb-2" />
            <span>Reading systems inventory...</span>
          </div>
        ) : filteredSystems.length > 0 ? (
          filteredSystems.map(sys => {
            const statusLabel = sys.status?.value || sys.status || "Operational";
            const subStatus = (sys.submission_status || "Approved");
            const classLabel = sys.classification?.value || sys.classification || "";
            const hostingLabel = sys.frontline_hosting_type || sys.hosting_type?.value || sys.hosting_type || "Online";
            const strategyLabel = sys.development_strategy?.value || sys.development_strategy || "Outsourced";

            const isPendingIntake = subStatus.toLowerCase() === "submitted";
            const isReturned = subStatus.toLowerCase() === "returned";
            const proposedCostVal = parseFloat(sys.proposed_cost) || 0.0;

            // Independent Multi-Classification State Resolution
            const isSupport = sys.is_support_to_operations !== undefined 
              ? Boolean(sys.is_support_to_operations) 
              : classLabel.toLowerCase().includes("support");

            const isAdmin = sys.is_general_administrative !== undefined 
              ? Boolean(sys.is_general_administrative) 
              : (classLabel.toLowerCase().includes("administrative") || classLabel.toLowerCase().includes("admin"));

            const isOps = sys.is_operations !== undefined 
              ? Boolean(sys.is_operations) 
              : (classLabel.toLowerCase().includes("operations") || (!isSupport && !isAdmin));

            const isFrontline = Boolean(sys.is_frontline_service) || (classLabel.toLowerCase().includes("frontline") && !classLabel.toLowerCase().includes("non-frontline"));

            // Linked Strategic Concern, Project, and Needs Assessment
            const linkedConcern = strategicConcerns.find(c => String(c.id) === String(sys.strategic_concern_id));
            const linkedProject = projects.find(
              p => (sys.project_id && String(p.id) === String(sys.project_id)) || String(p.system_id) === String(sys.id)
            );
            const linkedNeeds = needsAssessments.find(n => String(n.id) === String(sys.needs_assessment_id));

            return (
              <div 
                key={sys.id}
                className={`p-5 rounded-2xl border transition-all space-y-4 shadow-xs ${
                  isPendingIntake 
                    ? "bg-blue-50/40 dark:bg-blue-955/20 border-blue-400 dark:border-blue-700/80 border-l-4 border-l-blue-600"
                    : isReturned
                    ? "bg-rose-50/30 dark:bg-rose-955/20 border-rose-300 dark:border-rose-900/60"
                    : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`p-2 rounded-xl border ${
                      isPendingIntake
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400"
                    }`}>
                      <Layers className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm">{sys.name}</h3>
                        {sys.online_url && (
                          <a href={sys.online_url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:text-blue-500">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Submitting Unit: <strong className="text-slate-700 dark:text-slate-300">{sys.system_owner_office || "Department"}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Submission Lifecycle Badge */}
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono border ${
                      subStatus.toLowerCase() === "approved"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400"
                        : subStatus.toLowerCase() === "submitted"
                        ? "bg-blue-600 text-white border-blue-600 animate-pulse"
                        : subStatus.toLowerCase() === "returned"
                        ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400"
                        : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                    }`}>
                      {subStatus.toLowerCase() === "submitted" ? "Intake: Review Pending" : subStatus}
                    </span>

                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono ${
                      statusLabel === "Operational" 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                        : statusLabel === "For Enhancement"
                        ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
                        : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20"
                    }`}>
                      {statusLabel}
                    </span>

                    {/* Proposed Budget Badge */}
                    {proposedCostVal > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold font-mono uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20 flex items-center gap-1">
                        <Coins className="w-3 h-3" />
                        <span>Estimated: {formatPHP(proposedCostVal)}</span>
                      </span>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 ml-1">
                      {isPendingIntake ? (
                        <button
                          type="button"
                          onClick={() => handleOpenReviewModal(sys)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold flex items-center gap-1 shadow-sm text-[10px] cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Review &amp; Classify</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenReviewModal(sys)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 cursor-pointer"
                          title="Review / Reclassify Governance Mapping"
                        >
                          <CornerDownRight className="w-3.5 h-3.5 text-blue-500" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(sys)}
                        className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-blue-600 rounded-lg cursor-pointer"
                        title="Edit System Specifications"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => handleDelete(sys.id, sys.name)}
                        className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 rounded-lg text-slate-500 cursor-pointer"
                        title="Delete System"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Returned Feedback Notice if applicable */}
                {isReturned && sys.rejection_reason && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl space-y-1 text-rose-800 dark:text-rose-300">
                    <span className="font-bold text-[10px] uppercase flex items-center gap-1">
                      <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                      <span>Returned Feedback Issued to Department:</span>
                    </span>
                    <p className="text-[11px] leading-relaxed italic whitespace-pre-wrap">
                      "{sys.rejection_reason}"
                    </p>
                  </div>
                )}

                {/* Target Year & UACS Accounting Badge Row */}
                {statusLabel !== "Operational" && (
                  <div className="grid grid-cols-2 gap-2 text-[10.5px] font-mono">
                    <div className="p-2.5 bg-blue-50/50 dark:bg-blue-955/20 border border-blue-200 dark:border-blue-900/40 rounded-xl space-y-0.5">
                      <span className="text-[9px] uppercase font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>Target Fiscal Year</span>
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        FY {sys.target_year || activeYears[0]}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl space-y-0.5">
                      <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Tag className="w-3 h-3 text-emerald-600" />
                        <span>Accounting Class</span>
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white truncate block" title={sys.uacs_object_code || "Capital Outlay"}>
                        {sys.expenditure_class || (sys.uacs_object_code?.includes("(CO)") ? "Capital Outlay" : "MOOE")}
                      </span>
                    </div>
                  </div>
                )}

                {/* Section 8.0 Needs Assessment Linkage Badge */}
                {linkedNeeds && (
                  <div className="p-2.5 bg-teal-50 dark:bg-teal-955/30 border border-teal-200 dark:border-teal-900/50 rounded-xl flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 font-semibold text-teal-900 dark:text-teal-300">
                      <CheckSquare className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                      <span>Linked Needs Assessment: <strong>{linkedNeeds.title}</strong></span>
                      <span className="text-[9.5px] text-teal-600 font-mono">[{linkedNeeds.mfo_alignment}]</span>
                    </div>
                    <span className="text-[10px] text-teal-700 dark:text-teal-400 font-mono font-bold">Section 8.0 Provenance</span>
                  </div>
                )}

                {/* Purpose Narration */}
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-sans text-xs">
                  {sys.description_and_purpose}
                </p>

                {/* Enhancement Details if applicable */}
                {statusLabel === "For Enhancement" && sys.enhancement_details && (
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
                    <span className="text-[9.5px] uppercase font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 font-mono">
                      <Sparkles className="w-3 h-3" />
                      <span>Planned Technical Enhancements</span>
                    </span>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-[11px] font-sans">
                      {sys.enhancement_details}
                    </p>
                  </div>
                )}

                {/* Governance Relational Mappings Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-955 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-[10.5px]">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-slate-400 block font-mono">
                      Part II.A Strategic Concern:
                    </span>
                    {linkedConcern ? (
                      <span className="text-slate-800 dark:text-slate-200 font-semibold truncate block" title={linkedConcern.critical_system}>
                        [{linkedConcern.mfo}] {linkedConcern.critical_system}
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 italic">
                        Not mapped to a Strategic Concern
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-[9px] uppercase font-bold text-slate-400 block font-mono">
                      Part III.E ICT Project:
                    </span>
                    {linkedProject ? (
                      <span className="text-blue-600 dark:text-blue-400 font-semibold truncate block" title={linkedProject.project_title}>
                        [{linkedProject.project_category?.includes("Cross") ? "Cross" : "Internal"}] {linkedProject.project_title} ({formatPHP(linkedProject.computed_total_project_cost)})
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">
                        No ICT Project directly tied
                      </span>
                    )}
                  </div>
                </div>

                {/* Technical Architecture Specs Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-955 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 font-mono text-[10px]">
                  <div>
                    <span className="text-slate-400 uppercase block font-bold text-[8.5px]">Development Strategy</span>
                    <span className="text-slate-800 dark:text-slate-200 font-bold">{strategyLabel}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase block font-bold text-[8.5px]">Development Stack</span>
                    <span className="text-slate-800 dark:text-slate-200 truncate block">{sys.development_platform || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase block font-bold text-[8.5px]">Database Name</span>
                    <span className="text-blue-600 dark:text-blue-400 font-bold">{sys.database_name || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase block font-bold text-[8.5px]">Hosting Mode</span>
                    <span className="text-slate-800 dark:text-slate-200">{hostingLabel}</span>
                  </div>
                </div>

                {/* Footer Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[10px]">
                  <div className="flex flex-wrap gap-2 items-center font-mono">
                    <span className={`px-2.5 py-0.5 rounded-md border text-[9.5px] flex items-center gap-1 ${
                      sys.processes_personal_information
                        ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold"
                        : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"
                    }`}>
                      <Lock className="w-3 h-3 text-slate-400" />
                      <span>Processes Personal Data: {sys.processes_personal_information ? "YES" : "NO"}</span>
                    </span>

                    {sys.processes_personal_information && (
                      <span className={`px-2.5 py-0.5 rounded-md border text-[9.5px] font-bold flex items-center gap-1 ${
                        sys.has_undergone_pia 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 animate-pulse"
                      }`}>
                        <ShieldAlert className="w-3 h-3 text-rose-600 dark:text-rose-400 shrink-0" />
                        <span>
                          {sys.has_undergone_pia 
                            ? "PIA Completed" 
                            : `PIA Deficit (Target: ${sys.pia_target_date_text || "Unscheduled"})`}
                        </span>
                      </span>
                    )}

                    {isFrontline && (
                      <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 text-[9.5px]">
                        Frontline ({hostingLabel})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewingSystem(sys)}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect DICT Card</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-400 italic">
            No information systems found matching active filters.
          </div>
        )}
      </div>

      {/* MODAL 1: ADMINISTRATIVE REVIEW & ARCHITECTURE CLASSIFICATION */}
      {reviewingSystem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Administrative Review &amp; Architecture Classification</span>
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">System: {reviewingSystem.name}</span>
              </div>
              <button 
                type="button" 
                onClick={() => setReviewingSystem(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Department Submission Context Card */}
            <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Department Submission Context</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 text-[9px] uppercase font-bold block">Submitting Unit:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{reviewingSystem.system_owner_office}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[9px] uppercase font-bold block">Requested Budget Outlay:</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {formatPHP(reviewingSystem.proposed_cost)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[9px] uppercase font-bold block">Intended Lifecycle Status:</span>
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{reviewingSystem.status?.value || reviewingSystem.status}</span>
                </div>
              </div>

              {/* Linked Needs Assessment if applicable */}
              {needsAssessments.find(n => String(n.id) === String(reviewingSystem.needs_assessment_id)) && (
                <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-[10.5px]">
                  <strong className="text-teal-700 dark:text-teal-400 flex items-center gap-1 font-mono">
                    <CheckSquare className="w-3 h-3" />
                    <span>Justified by Section 8.0 Needs Assessment:</span>
                  </strong>
                  <p className="text-slate-600 dark:text-slate-400 italic mt-0.5">
                    "{needsAssessments.find(n => String(n.id) === String(reviewingSystem.needs_assessment_id))?.current_problem}"
                  </p>
                </div>
              )}

              <p className="text-slate-700 dark:text-slate-300 text-xs leading-relaxed pt-1 whitespace-pre-wrap">
                "{reviewingSystem.description_and_purpose}"
              </p>
            </div>

            <form onSubmit={handleReviewSubmit} className="space-y-4 text-xs">
              {/* Decision Action Toggle */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500 block">Administrative Action Decision</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewAction("APPROVE")}
                    className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      reviewAction === "APPROVE"
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    <span>Approve &amp; Map to Architecture</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewAction("RETURN")}
                    className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      reviewAction === "RETURN"
                        ? "bg-rose-600 text-white shadow-xs"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Return with Revision Remarks</span>
                  </button>
                </div>
              </div>

              {reviewAction === "APPROVE" ? (
                <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 animate-fadeIn">
                  <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 block font-mono">
                    Governance Architecture Mapping &amp; Technical Assignment
                  </span>

                  {/* Section 1: Lifecycle & Financial Classification */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Official Lifecycle Classification</label>
                      <select
                        value={reviewStatus}
                        onChange={e => setReviewStatus(e.target.value)}
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer font-semibold"
                      >
                        <option value="For Development">Part III.D: For Development (New System)</option>
                        <option value="For Enhancement">Part III.D: For Enhancement (Platform Upgrade)</option>
                        <option value="Operational">Part II.C: Operational (Current Baseline System)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">
                        Approved Development Outlay (PHP ₱)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={reviewProposedCost}
                        onChange={e => setReviewProposedCost(e.target.value)}
                        placeholder="0.00"
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono font-bold"
                      />
                    </div>
                  </div>

                  {/* Target Implementation Year & UACS Object Code (Table B.4) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Target Implementation Year</label>
                      <select
                        value={reviewTargetYear || activeYears[0]}
                        onChange={e => setReviewTargetYear(parseInt(e.target.value, 10))}
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono font-bold text-xs"
                      >
                        {activeYears.map(yr => (
                          <option key={yr} value={yr}>FY {yr}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">UACS Object Code (Table B.4)</label>
                      <select
                        value={reviewUacsCode}
                        onChange={e => {
                          const code = e.target.value;
                          setReviewUacsCode(code);
                          setReviewExpClass(code.includes("(CO)") ? "Capital Outlay" : "Maintenance and Other Operating Expenses");
                        }}
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs"
                      >
                        <option value="50604070 01 - ICT Software (Perpetual CO)">50604070 01 - ICT Software (Perpetual CO) [Capital Outlay]</option>
                        <option value="50211030 00 - Consulting/Outsourced Development (MOOE)">50211030 00 - Consulting/Outsourced Development (MOOE) [MOOE]</option>
                        <option value="50299070 00 - ICT Software Subscription (MOOE)">50299070 00 - ICT Software Subscription (MOOE) [MOOE]</option>
                      </select>
                    </div>
                  </div>

                  {/* Section 2: Relational Architecture Mapping */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                        <span>Assign Strategic Concern (Part II.A)</span>
                        <span className="text-[9px] text-blue-600 font-mono">Root Problem</span>
                      </label>
                      <select
                        value={reviewConcernId}
                        onChange={e => setReviewConcernId(e.target.value)}
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer"
                      >
                        <option value="">-- No Specific Strategic Concern --</option>
                        {strategicConcerns.map(c => (
                          <option key={c.id} value={String(c.id)}>
                            [{c.mfo}] {c.critical_system}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                        <span>Bind to ICT Project (Part III.E)</span>
                        <span className="text-[9px] text-purple-600 font-mono">Part IV.A Bridge</span>
                      </label>
                      <select
                        value={reviewProjectId}
                        onChange={e => setReviewProjectId(e.target.value)}
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer"
                      >
                        <option value="">-- Standalone (No Project Binding) --</option>
                        {projects.map(p => (
                          <option key={p.id} value={String(p.id)}>
                            [{p.project_category?.includes("Cross") ? "Cross" : "Internal"}] {p.project_title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Section 3: Technical Architecture & Development Strategy */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Development Strategy</label>
                      <select
                        value={reviewDevStrategy}
                        onChange={e => setReviewDevStrategy(e.target.value)}
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white cursor-pointer"
                      >
                        {developmentStrategies.map(strat => (
                          <option key={strat.code || strat.display_name} value={strat.display_name}>
                            {strat.display_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Target Database Name</label>
                      <input
                        type="text"
                        value={reviewDatabaseName}
                        onChange={e => setReviewDatabaseName(e.target.value)}
                        placeholder="e.g. portal_registry_db"
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Platform / Technical Stack</label>
                      <input
                        type="text"
                        value={reviewPlatform}
                        onChange={e => setReviewPlatform(e.target.value)}
                        placeholder="e.g. FastAPI, PostgreSQL, React, Next.js"
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Storage Architecture</label>
                      <input
                        type="text"
                        value={reviewDataStorage}
                        onChange={e => setReviewDataStorage(e.target.value)}
                        placeholder="e.g. GovCloud Hybrid Object Storage"
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Section 4: Data Privacy Act Compliance (PIA) */}
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <span className="text-[9.5px] uppercase font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5 text-blue-500" />
                      <span>Data Privacy Act Compliance (PIA) [1]</span>
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={reviewProcessesPII}
                          onChange={e => setReviewProcessesPII(e.target.checked)}
                          className="w-4 h-4 accent-blue-600 rounded"
                        />
                        <span>Processes Personal Data (PII)</span>
                      </label>

                      {reviewProcessesPII && (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={reviewHasPIA}
                            onChange={e => setReviewHasPIA(e.target.checked)}
                            className="w-4 h-4 accent-emerald-600 rounded"
                          />
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">PIA Audit Completed</span>
                        </label>
                      )}
                    </div>

                    {reviewProcessesPII && !reviewHasPIA && (
                      <div className="space-y-1 pt-1">
                        <label className="text-[9px] uppercase font-bold text-amber-600 dark:text-amber-400 block font-mono">
                          Target PIA Completion Milestone (e.g. Q4 2027)
                        </label>
                        <input
                          type="text"
                          value={reviewPiaTargetDate}
                          onChange={e => setReviewPiaTargetDate(e.target.value)}
                          placeholder="e.g. Q3 2027 or October 2027"
                          className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs"
                        />
                      </div>
                    )}
                  </div>

                  {/* Section 5: PeGIF Interoperability */}
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <span className="text-[9.5px] uppercase font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 font-mono">
                      <Share2 className="w-3.5 h-3.5" />
                      <span>PeGIF Interoperability &amp; Data Integration Intent</span>
                    </span>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reviewIsIntegrated}
                        onChange={e => setReviewIsIntegrated(e.target.checked)}
                        className="w-4 h-4 accent-blue-600 rounded"
                      />
                      <span className="text-slate-800 dark:text-slate-200 font-semibold text-[11px]">
                        Integrated with Other Systems (Internal or External)
                      </span>
                    </label>

                    {reviewIsIntegrated && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <input
                          type="text"
                          value={reviewInternalIntegrated}
                          onChange={e => setReviewInternalIntegrated(e.target.value)}
                          placeholder="Internal Systems (e.g. HRIS, EDMS)"
                          className="p-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-xs"
                        />
                        <input
                          type="text"
                          value={reviewExternalIntegrated}
                          onChange={e => setReviewExternalIntegrated(e.target.value)}
                          placeholder="External Systems (e.g. eGovPay, PhilSys)"
                          className="p-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2 p-4 bg-rose-50 dark:bg-rose-955/30 border border-rose-200 dark:border-rose-900 rounded-xl animate-fadeIn">
                  <label className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400 block">
                    Revision Remarks / Return Feedback
                  </label>
                  <textarea
                    rows={3}
                    required={reviewAction === "RETURN"}
                    value={reviewReason}
                    onChange={e => setReviewReason(e.target.value)}
                    placeholder="Specify required corrections, missing technical specifications, or why this proposal cannot be supported..."
                    className="w-full p-2.5 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded-xl text-slate-900 dark:text-white outline-none resize-none leading-relaxed text-xs"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className={`w-full py-2.5 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs shadow-sm ${
                  reviewAction === "APPROVE" ? "bg-blue-600 hover:bg-blue-500" : "bg-rose-600 hover:bg-rose-500"
                }`}
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Processing..." : reviewAction === "APPROVE" ? "Commit Approval & Architecture Mapping" : "Confirm Return to Department"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: REGISTER / EDIT SYSTEM MODAL (ADMIN FULL ACCESS) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>{editingId ? "Update Information System" : "Register Information System (Part II.C / III.D)"}</span>
              </h3>
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              
              {/* Three-Way Relational Linkage Row: Strategic Concern + Needs Assessment + ICT Project */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center justify-between">
                    <span>Strategic Concern (II.A)</span>
                    <span className="text-[8.5px] text-blue-500 font-mono">Root Problem</span>
                  </label>
                  <select
                    value={form.strategic_concern_id}
                    onChange={e => setForm({ ...form, strategic_concern_id: e.target.value })}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer text-xs"
                  >
                    <option value="">-- No Concern Linked --</option>
                    {strategicConcerns.map(c => (
                      <option key={c.id} value={c.id}>
                        [{c.mfo}] {c.critical_system}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center justify-between">
                    <span>Needs Assessment (Sec 8)</span>
                    <span className="text-[8.5px] text-teal-600 font-mono">Dept Intake</span>
                  </label>
                  <select
                    value={form.needs_assessment_id}
                    onChange={e => setForm({ ...form, needs_assessment_id: e.target.value })}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer text-xs"
                  >
                    <option value="">-- No Needs Tied --</option>
                    {needsAssessments.map(n => (
                      <option key={n.id} value={n.id}>
                        [{n.department_name || `Dept ${n.department_id}`}] {n.title}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Target ICT Project (Part III.E Link) */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center justify-between">
                    <span>ICT Project (III.E)</span>
                    <span className="text-[8.5px] text-purple-600 font-mono">Part IV.A Bridge</span>
                  </label>
                  <select
                    value={form.project_id}
                    onChange={e => setForm({ ...form, project_id: e.target.value })}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer text-xs font-semibold"
                  >
                    <option value="">-- No ICT Project Bound --</option>
                    {projects.map(p => (
                      <option key={p.id} value={String(p.id)}>
                        [{p.project_category?.includes("Cross") ? "Cross" : "Internal"}] {p.project_title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">System Name</label>
                  <input
                    type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Citizen Frontline Registry & Payment Gateway"
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Lifecycle Status</label>
                  <select
                    value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white cursor-pointer outline-none focus:border-blue-500 font-semibold"
                  >
                    <option value="Operational">Part II.C: Operational (Existing System)</option>
                    <option value="For Enhancement">Part III.D: For Enhancement (Proposed Upgrade)</option>
                    <option value="For Development">Part III.D: For Development (Proposed New System)</option>
                  </select>
                </div>
              </div>

              {/* Proposed Development Cost */}
              {form.status !== "Operational" && (
                <div className="space-y-3 p-3.5 bg-emerald-50/50 dark:bg-emerald-955/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl animate-fadeIn">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1 font-mono">
                      <Coins className="w-3.5 h-3.5" />
                      <span>Estimated Proposed Development Cost (PHP ₱)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.proposed_cost}
                      onChange={e => {
                        const costVal = parseFloat(e.target.value) || 0;
                        setForm(prev => ({
                          ...prev,
                          proposed_cost: e.target.value,
                          uacs_object_code: costVal >= 50000 ? "50604070 01 - ICT Software (Perpetual CO)" : "50211030 00 - Consulting/Outsourced Development (MOOE)",
                          expenditure_class: costVal >= 50000 ? "Capital Outlay" : "Maintenance and Other Operating Expenses"
                        }));
                      }}
                      placeholder="0.00"
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono font-bold"
                    />
                    <span className="text-[9.5px] text-slate-500 dark:text-slate-400 block pt-0.5">
                      Will be aggregated automatically into Part IV.A budget line items upon approval.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 font-mono">
                        Target Implementation Year
                      </label>
                      <select
                        value={form.target_year || activeYears[0]}
                        onChange={e => setForm({ ...form, target_year: parseInt(e.target.value, 10) })}
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono font-bold text-xs"
                      >
                        {activeYears.map(yr => (
                          <option key={yr} value={yr}>FY {yr}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 font-mono">
                        UACS Object Code (Table B.4)
                      </label>
                      <select
                        value={form.uacs_object_code}
                        onChange={e => {
                          const code = e.target.value;
                          setForm({
                            ...form,
                            uacs_object_code: code,
                            expenditure_class: code.includes("(CO)") ? "Capital Outlay" : "Maintenance and Other Operating Expenses"
                          });
                        }}
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs"
                      >
                        <option value="50604070 01 - ICT Software (Perpetual CO)">50604070 01 - ICT Software (Perpetual CO) [Capital Outlay]</option>
                        <option value="50211030 00 - Consulting/Outsourced Development (MOOE)">50211030 00 - Consulting/Outsourced Development (MOOE) [MOOE]</option>
                        <option value="50299070 00 - ICT Software Subscription (MOOE)">50299070 00 - ICT Software Subscription (MOOE) [MOOE]</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Classification Checkboxes */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">
                  System Classification (Select all applicable categories)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <label className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_support_to_operations}
                      onChange={e => setForm(prev => ({ ...prev, is_support_to_operations: e.target.checked }))}
                      className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    />
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">Support to Operations</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_general_administrative}
                      onChange={e => setForm(prev => ({ ...prev, is_general_administrative: e.target.checked }))}
                      className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    />
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">General Administrative Systems</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_operations}
                      onChange={e => setForm(prev => ({ ...prev, is_operations: e.target.checked }))}
                      className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    />
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">Operations</span>
                  </label>
                </div>

                {form.is_operations && (
                  <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800 pl-3 border-l-2 border-blue-500 animate-fadeIn">
                    <span className="text-[9.5px] uppercase font-bold text-blue-600 dark:text-blue-400 block font-mono">
                      Operations Service Sub-Classification
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <label className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.is_frontline_service}
                          onChange={e => setForm(prev => ({ ...prev, is_frontline_service: e.target.checked }))}
                          className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                        />
                        <div className="space-y-0.5">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 block text-xs">Frontline Service</span>
                          <span className="text-[10px] text-slate-400 block">Direct public/client service delivery</span>
                        </div>
                      </label>

                      <label className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.is_non_frontline_service}
                          onChange={e => setForm(prev => ({ ...prev, is_non_frontline_service: e.target.checked }))}
                          className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                        />
                        <div className="space-y-0.5">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 block text-xs">Non-Frontline Service</span>
                          <span className="text-[10px] text-slate-400 block">Core mandate back-office operations</span>
                        </div>
                      </label>
                    </div>

                    {form.is_frontline_service && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 animate-fadeIn">
                        <div className="space-y-1">
                          <label className="text-[9.5px] uppercase font-bold text-slate-500">Frontline Hosting Type</label>
                          <select
                            value={form.frontline_hosting_type}
                            onChange={e => setForm({ ...form, frontline_hosting_type: e.target.value })}
                            className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                          >
                            <option value="Online">Online / Web Portal</option>
                            <option value="On-premise">On-premise Only</option>
                            <option value="Hybrid">Hybrid</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9.5px] uppercase font-bold text-slate-500">Public Portal URL (If Online / Hybrid)</label>
                          <input
                            type="url"
                            value={form.online_url}
                            onChange={e => setForm({ ...form, online_url: e.target.value })}
                            placeholder="https://services.agency.gov.ph"
                            className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-blue-600 dark:text-blue-400 font-mono text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Description &amp; Core Purpose</label>
                <textarea
                  rows={3} required value={form.description_and_purpose} onChange={e => setForm({ ...form, description_and_purpose: e.target.value })}
                  placeholder="Detail salient functionalities, transactional modules, target outputs, and public services provided..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none leading-relaxed text-xs outline-none focus:border-blue-500"
                />
              </div>

              {/* Technical Enhancement Details Field */}
              {form.status === "For Enhancement" && (
                <div className="space-y-1.5 p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl animate-fadeIn">
                  <label className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1 font-mono">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Planned Technical Enhancements</span>
                    </span>
                    <span className="text-[9px] text-rose-500 font-bold">*Required for Enhancement</span>
                  </label>
                  <textarea
                    rows={3}
                    required={form.status === "For Enhancement"}
                    value={form.enhancement_details}
                    onChange={e => setForm({ ...form, enhancement_details: e.target.value })}
                    placeholder="Specify modules to be redesigned, containerization milestones, PeGIF API gateway additions, or database schema upgrades..."
                    className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white resize-none leading-relaxed text-xs outline-none focus:border-blue-500"
                  />
                </div>
              )}

              {/* Technical Stack */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Development Strategy</label>
                  <select
                    value={form.development_strategy} onChange={e => setForm({ ...form, development_strategy: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white cursor-pointer outline-none"
                  >
                    {developmentStrategies.map(strat => (
                      <option key={strat.code || strat.display_name} value={strat.display_name}>
                        {strat.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Platform &amp; Tech Stack</label>
                  <input
                    type="text" required value={form.development_platform} onChange={e => setForm({ ...form, development_platform: e.target.value })}
                    placeholder="e.g. Next.js, FastAPI, PostgreSQL"
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Database Name</label>
                  <input
                    type="text" required value={form.database_name} onChange={e => setForm({ ...form, database_name: e.target.value })}
                    placeholder="e.g. production_registry_db"
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              {/* Users & Owner Office */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Data Storage Type</label>
                  <input
                    type="text" required value={form.data_storage_type} onChange={e => setForm({ ...form, data_storage_type: e.target.value })}
                    placeholder="e.g. GovCloud Hybrid Object Storage"
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Internal Users</label>
                  <input
                    type="text" required value={form.internal_users} onChange={e => setForm({ ...form, internal_users: e.target.value })}
                    placeholder="e.g. Frontline Staff, Cashiers, Auditors"
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">External Users</label>
                  <input
                    type="text" required value={form.external_users} onChange={e => setForm({ ...form, external_users: e.target.value })}
                    placeholder="e.g. General Citizens, Business Entities"
                    className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">System Owner Office</label>
                <input
                  type="text" required value={form.system_owner_office} onChange={e => setForm({ ...form, system_owner_office: e.target.value })}
                  placeholder="e.g. Public Frontline Services Division"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              {/* Interoperability */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5 font-mono">
                  <Share2 className="w-3.5 h-3.5" />
                  <span>PeGIF Interoperability &amp; Shared Infrastructure</span>
                </span>
                
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_integrated_with_others}
                      onChange={e => setForm({ ...form, is_integrated_with_others: e.target.checked })}
                      className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
                    />
                    <span className="text-slate-800 dark:text-slate-200 font-semibold">
                      Integrated with Another System
                    </span>
                  </label>

                  {form.is_integrated_with_others && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-5 border-l-2 border-blue-500 animate-fadeIn">
                      <div className="space-y-1">
                        <label className="text-[9.5px] uppercase font-bold text-slate-500">Internal Integrated Systems</label>
                        <input
                          type="text"
                          value={form.internal_integrated_systems}
                          onChange={e => setForm({ ...form, internal_integrated_systems: e.target.value })}
                          placeholder="e.g. HRMIS, Document Tracking System"
                          className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9.5px] uppercase font-bold text-slate-500">External Integrated Systems (PeGIF / NGDX)</label>
                        <input
                          type="text"
                          value={form.external_integrated_systems}
                          onChange={e => setForm({ ...form, external_integrated_systems: e.target.value })}
                          placeholder="e.g. Landbank Link.BizPortal, DICT eGov Portal, PhilSys"
                          className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.generates_data_for_others}
                        onChange={e => setForm({ ...form, generates_data_for_others: e.target.checked })}
                        className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
                      />
                      <span className="text-slate-800 dark:text-slate-200">Generates Data Utilized by Other Systems</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.processes_data_from_others}
                        onChange={e => setForm({ ...form, processes_data_from_others: e.target.checked })}
                        className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
                      />
                      <span className="text-slate-800 dark:text-slate-200">Processes Data from Other Systems</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Data Privacy Act (PIA) */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-blue-500" />
                  <span>Data Privacy Act Compliance (PIA) [1]</span>
                </span>

                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox" checked={form.processes_personal_information}
                      onChange={e => setForm({ ...form, processes_personal_information: e.target.checked })}
                      className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
                    />
                    <span className="text-slate-800 dark:text-slate-200">Processes Personal Information (PII)</span>
                  </label>

                  {form.processes_personal_information && (
                    <label className="flex items-center gap-2 cursor-pointer animate-fadeIn">
                      <input
                        type="checkbox" checked={form.has_undergone_pia}
                        onChange={e => setForm({ ...form, has_undergone_pia: e.target.checked })}
                        className="w-3.5 h-3.5 accent-emerald-600 rounded cursor-pointer"
                      />
                      <span className={form.has_undergone_pia ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-amber-600 dark:text-amber-400 font-bold"}>
                        Formal PIA Audit Completed
                      </span>
                    </label>
                  )}
                </div>

                {form.processes_personal_information && !form.has_undergone_pia && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-955/40 border border-amber-300 dark:border-amber-800 rounded-xl space-y-2 animate-fadeIn">
                    <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300 text-xs">
                      <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Data Privacy Audit Guard</span>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9.5px] uppercase font-bold text-slate-600 dark:text-slate-400">
                        Target PIA Audit Completion Date
                      </label>
                      <input
                        type="text"
                        required
                        value={form.pia_target_date_text}
                        onChange={e => setForm({ ...form, pia_target_date_text: e.target.value })}
                        placeholder="e.g. Q3 2027 or October 2027"
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs font-semibold"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Preserving..." : editingId ? "Save System Modifications" : "Register Information System"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: VIEW FULL DICT SPECIFICATION CARD */}
      {viewingSystem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <span className="text-[9px] font-mono text-blue-600 dark:text-blue-400 uppercase font-bold">
                  Official DICT v.2026 Specification Card
                </span>
                <h3 className="font-bold text-slate-900 dark:text-white text-base mt-0.5">{viewingSystem.name}</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setViewingSystem(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                <span className="text-[9.5px] uppercase font-bold text-slate-400 block font-mono">Classification Role</span>
                <div className="text-slate-800 dark:text-slate-200 font-semibold">{viewingSystem.classification}</div>
              </div>

              {viewingSystem.proposed_cost !== undefined && parseFloat(viewingSystem.proposed_cost) > 0 && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-955/30 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between font-mono">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300">
                    Estimated Development Outlay:
                  </span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">{formatPHP(viewingSystem.proposed_cost)}</span>
                </div>
              )}

              {/* Target Year & UACS Display in Detail Modal */}
              <div className="grid grid-cols-2 gap-2.5 font-mono text-[10px]">
                <div className="p-2.5 bg-blue-50/50 dark:bg-blue-955/20 border border-blue-200 dark:border-blue-900/40 rounded-xl space-y-0.5">
                  <span className="text-[8.5px] uppercase font-bold text-blue-600 dark:text-blue-400">Target Implementation Year</span>
                  <span className="font-bold text-slate-900 dark:text-white text-xs">FY {viewingSystem.target_year || activeYears[0]}</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl space-y-0.5">
                  <span className="text-[8.5px] uppercase font-bold text-slate-500 dark:text-slate-400">Expenditure Class</span>
                  <span className="font-bold text-slate-900 dark:text-white text-xs truncate block" title={viewingSystem.uacs_object_code}>
                    {viewingSystem.expenditure_class || (viewingSystem.uacs_object_code?.includes("(CO)") ? "Capital Outlay" : "MOOE")}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[9.5px] uppercase font-bold text-slate-400 block font-mono">Description &amp; Purpose</span>
                <p className="text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-955 p-3 rounded-xl border border-slate-200 dark:border-slate-800 leading-relaxed whitespace-pre-wrap">
                  {viewingSystem.description_and_purpose}
                </p>
              </div>

              {viewingSystem.enhancement_details && (
                <div className="space-y-1">
                  <span className="text-[9.5px] uppercase font-bold text-amber-600 dark:text-amber-400 block font-mono">Planned Enhancements</span>
                  <p className="text-slate-700 dark:text-slate-300 bg-amber-50/40 dark:bg-amber-955/20 p-3 rounded-xl border border-amber-200 dark:border-amber-900 leading-relaxed whitespace-pre-wrap">
                    {viewingSystem.enhancement_details}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 font-mono text-[10px]">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block text-[8px] uppercase font-bold">Strategy</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{viewingSystem.development_strategy?.value || viewingSystem.development_strategy}</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block text-[8px] uppercase font-bold">Platform / Stack</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{viewingSystem.development_platform}</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block text-[8px] uppercase font-bold">Database</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">{viewingSystem.database_name}</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block text-[8px] uppercase font-bold">Storage Architecture</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{viewingSystem.data_storage_type}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setViewingSystem(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold rounded-xl text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: DYNAMIC DEVELOPMENT STRATEGIES CUSTOM CRUD MANAGER */}
      {isStrategyModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Manage Development Strategies (System Taxonomies)</span>
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">
                  Customizable Software Procurement &amp; Build Models
                </span>
              </div>
              <button 
                type="button" 
                onClick={() => setIsStrategyModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Add New Strategy Form */}
            <form onSubmit={handleAddStrategy} className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 block font-mono">
                Register Custom Development Strategy
              </span>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Display Name (e.g. Cloud SaaS)"
                  value={newStrategyName}
                  onChange={e => setNewStrategyName(e.target.value)}
                  className="p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500 font-semibold"
                />
                <input
                  type="text"
                  placeholder="Code (Optional, e.g. CLOUD_SAAS)"
                  value={newStrategyCode}
                  onChange={e => setNewStrategyCode(e.target.value)}
                  className="p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none font-mono"
                />
              </div>

              <input
                type="text"
                placeholder="Description / Guidelines (Optional)..."
                value={newStrategyDesc}
                onChange={e => setNewStrategyDesc(e.target.value)}
                className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none"
              />

              <button
                type="submit"
                disabled={savingStrategy}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{savingStrategy ? "Registering..." : "Add Strategy to Taxonomy"}</span>
              </button>
            </form>

            {/* Existing Strategies List */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block font-mono">
                Active Development Strategies ({developmentStrategies.length})
              </span>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                {developmentStrategies.map(strat => {
                  const isStandard = ["IN_HOUSE", "OUTSOURCED", "COTS", "COMBINATION"].includes(strat.code);

                  return (
                    <div key={strat.code} className="p-3 bg-white dark:bg-slate-900 flex justify-between items-center text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-slate-900 dark:text-white">{strat.display_name}</strong>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                            {strat.code}
                          </span>
                        </div>
                        {strat.description && (
                          <span className="text-[10px] text-slate-400 block mt-0.5">{strat.description}</span>
                        )}
                      </div>

                      {!isStandard ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteStrategy(strat.code, strat.display_name)}
                          className="p-1 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-slate-400 rounded cursor-pointer"
                          title="Delete Custom Strategy"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-[8.5px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-mono font-bold">
                          Canonical
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsStrategyModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
