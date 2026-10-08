// frontend/src/views/admin/Projects/InternalProjectsManager.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getIctProjects, 
  createIctProject, 
  updateIctProject, 
  deleteIctProject, 
  updateProjectLinks,
  getInformationSystems,
  getPolicySettings,
  getPerformanceMetrics,
  getProposalsQueue,
  getStrategicCategories,
  getHarmonizationCriteria
} from "../../../api/admin";
import CompilerSyncButton from "../../../components/common/CompilerSyncButton";
import { 
  FolderKanban, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  X, 
  RefreshCw, 
  Search, 
  Coins, 
  Building, 
  CheckSquare, 
  ExternalLink, 
  ShieldCheck, 
  Target,
  Layers,
  AlertCircle,
  CheckCircle,
  Database,
  Network,
  Info,
  Calendar,
  Sparkles,
  SlidersHorizontal,
  ShieldAlert,
  Filter,
  ArrowUpRight,
  Lock,
  Share2,
  Check,
  RotateCcw,
  Eye,
  FileText,
  ChevronDown,
  ChevronUp,
  Link2,
  Unlink,
  Table,
  Tag
} from "lucide-react";

// Default Canonical Harmonization Framework Criteria (DICT ISSP Guidelines v.2026)
const CANONICAL_HARMONIZATION_CRITERIA = [
  { id: 1, name: "National Prioritization (PDP 2023-2028)", is_mandatory: false, description: "Alignment with National Development Goals" },
  { id: 2, name: "Resource Optimization (GovNet, GovCloud)", is_mandatory: false, description: "Shared infrastructure hosting & bandwidth" },
  { id: 3, name: "PeGIF Standardized APIs & Interoperability", is_mandatory: true, description: "Interoperability with NGDX / PeGIF" },
  { id: 4, name: "Cross-Agency Collaboration (JMC / MOA)", is_mandatory: false, description: "Formal cross-agency governance agreement" },
  { id: 5, name: "Scalability and Sustainability (SPAR / PREXC)", is_mandatory: true, description: "Program convergence & performance alignment" }
];

export default function InternalProjectsManager() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();
  const navigate = useNavigate();

  // Dynamic institutional default unit
  const defaultImplementingUnit = 
    import.meta.env.VITE_DEFAULT_IMPLEMENTING_UNIT || 
    user?.department_name || 
    "ICT Management Office";

  // Data States
  const [projects, setProjects] = useState([]);
  const [systems, setSystems] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [strategicCategories, setStrategicCategories] = useState([]);
  const [availableCriteria, setAvailableCriteria] = useState(CANONICAL_HARMONIZATION_CRITERIA);
  const [majorOutlayThreshold, setMajorOutlayThreshold] = useState(2000000.00);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Filter & Search States
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Internal ICT Projects");
  const [systemFilter, setSystemFilter] = useState("All");
  const [reviewGateFilter, setReviewGateFilter] = useState("All");

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [customCriterionInput, setCustomCriterionInput] = useState("");

  // Linked Items Collapsed State per Project (default expanded)
  const [collapsedTables, setCollapsedTables] = useState({});

  // Assign / Manage Links Modal State
  const [linkingProject, setLinkingProject] = useState(null);
  const [linkModalTab, setLinkModalTab] = useState("proposals"); // "proposals" | "systems"
  const [proposalStatusFilter, setProposalStatusFilter] = useState("All"); // "All" | "Approved" | "Submitted"
  const [proposalLinkFilter, setProposalLinkFilter] = useState("All"); // "All" | "Unassigned" | "AssignedCurrent" | "AssignedOther"
  const [selectedProposalIds, setSelectedProposalIds] = useState([]);
  const [selectedSystemIds, setSelectedSystemIds] = useState([]);
  const [allAvailableProposals, setAllAvailableProposals] = useState([]);
  const [linkSearchTerm, setLinkSearchTerm] = useState("");
  const [savingLinks, setSavingLinks] = useState(false);

  // Dynamic Form State
  const initialFormState = {
    system_id: "",
    project_title: "",
    project_category: "Internal ICT Projects",
    description: "",
    objectives: "",
    aligns_pip: false,
    aligns_ncsp: false,
    aligns_egmp: true,
    aligns_pcb: true,
    aligns_others: false,
    aligns_others_specify: "",
    harmonization_criteria: {
      "National Prioritization (PDP 2023-2028)": true,
      "Resource Optimization (GovNet, GovCloud)": true,
      "PeGIF Standardized APIs & Interoperability": true,
      "Cross-Agency Collaboration (JMC / MOA)": false,
      "Scalability and Sustainability (SPAR / PREXC)": true
    },
    harmonizes_national_priority: true,
    harmonizes_resource_optimization: true,
    harmonizes_pegif: true,
    harmonizes_cross_collaboration: false,
    harmonizes_scalability: true,
    duration_start_year: (planningYears && planningYears[0]) || 2028,
    duration_end_year: (planningYears && planningYears[planningYears.length - 1]) || 2030,
    annual_deliverables: {},
    year_1_deliverables: "",
    year_2_deliverables: "",
    year_3_deliverables: "",
    implementing_unit: defaultImplementingUnit,
    funding_source: "General Appropriations Act (GAA)",
    lead_agency: "",
    partner_agencies: ""
  };
  const [form, setForm] = useState(initialFormState);

  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Synchronize duration bounds with active planning horizon
  useEffect(() => {
    if (activeCycle) {
      const parts = activeCycle.split("-");
      if (parts.length === 2) {
        const start = parseInt(parts[0], 10);
        const end = parseInt(parts[1], 10);
        setForm(prev => ({
          ...prev,
          duration_start_year: isNaN(start) ? 2028 : start,
          duration_end_year: isNaN(end) ? 2030 : end
        }));
      }
    }
  }, [activeCycle]);

  // Data Fetching Pipeline
  const fetchAllData = useCallback(async () => {
    if (!token || !activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      const [projectsData, systemsData, policyData, metricsData, harmData, categoriesData] = await Promise.all([
        getIctProjects(token, activeCycle).catch(() => []),
        getInformationSystems(token, activeCycle).catch(() => []),
        getPolicySettings(token).catch(() => null),
        getPerformanceMetrics(token, activeCycle).catch(() => []),
        getHarmonizationCriteria(token).catch(() => null),
        getStrategicCategories(token).catch(() => [])
      ]);

      setProjects(Array.isArray(projectsData) ? projectsData : (projectsData?.data || []));
      setSystems(Array.isArray(systemsData) ? systemsData : (systemsData?.data || []));
      setMetrics(Array.isArray(metricsData) ? metricsData : []);
      setStrategicCategories(Array.isArray(categoriesData) ? categoriesData : []);
      
      if (policyData && policyData.major_outlay_review_threshold) {
        setMajorOutlayThreshold(parseFloat(policyData.major_outlay_review_threshold) || 2000000.00);
      }

      if (harmData && Array.isArray(harmData) && harmData.length > 0) {
        setAvailableCriteria(harmData);
      }
    } catch (err) {
      setError(err.message || "Failed to load project portfolio.");
    } finally {
      setLoading(false);
    }
  }, [activeCycle, token]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Toggle Project Table Collapse
  const toggleTableCollapse = (projId) => {
    setCollapsedTables(prev => ({
      ...prev,
      [projId]: !prev[projId]
    }));
  };

  // Open Assign / Manage Links Modal
  const handleOpenLinkModal = async (proj) => {
    setLinkingProject(proj);
    setError(null);
    setLinkModalTab("proposals");
    setProposalStatusFilter("All");
    setProposalLinkFilter("All");
    setLinkSearchTerm("");

    const currentPids = (proj.linked_proposals || []).map(p => String(p.id));
    const currentSids = (proj.linked_systems || []).map(s => String(s.id));
    if (proj.system_id && !currentSids.includes(String(proj.system_id))) {
      currentSids.push(String(proj.system_id));
    }

    setSelectedProposalIds(currentPids);
    setSelectedSystemIds(currentSids);

    try {
      const res = await getProposalsQueue(token, { issp_period: activeCycle, limit: 1000 });
      const list = Array.isArray(res) ? res : (res?.data || []);
      
      // Ensure all currently linked proposals of the project are present in the list
      const seenIds = new Set(list.map(p => String(p.id)));
      const mergedList = [...list];
      (proj.linked_proposals || []).forEach(lp => {
        if (!seenIds.has(String(lp.id))) {
          mergedList.push({
            id: lp.id,
            item_name: lp.item_name,
            category: lp.category,
            office_location: lp.office_location,
            uacs_object_code: lp.uacs_object_code,
            total_cost: lp.total_cost,
            unit_cost: lp.unit_cost,
            total_qty: lp.total_qty,
            status: lp.status,
            project_id: proj.id
          });
          seenIds.add(String(lp.id));
        }
      });
      setAllAvailableProposals(mergedList);
    } catch {
      setAllAvailableProposals(proj.linked_proposals || []);
    }
  };

  // Toggle selection in link modal
  const handleToggleProposalLink = (pId) => {
    const pStr = String(pId);
    setSelectedProposalIds(prev => 
      prev.includes(pStr) ? prev.filter(id => id !== pStr) : [...prev, pStr]
    );
  };

  const handleToggleSystemLink = (sId) => {
    const sStr = String(sId);
    setSelectedSystemIds(prev => 
      prev.includes(sStr) ? prev.filter(id => id !== sStr) : [...prev, sStr]
    );
  };

  // Save Project Linkages via API
  const handleSaveProjectLinks = async () => {
    if (!linkingProject) return;
    setSavingLinks(true);
    setError(null);
    try {
      await updateProjectLinks(token, linkingProject.id, {
        proposal_ids: selectedProposalIds,
        system_ids: selectedSystemIds
      });

      setSuccess(`Resource line items and systems successfully assigned to '${linkingProject.project_title}'. Items are now actively included in the compiled plan.`);
      setLinkingProject(null);
      await fetchAllData();
    } catch (err) {
      setError(err.message || "Failed to link items to project.");
    } finally {
      setSavingLinks(false);
    }
  };

  // 1-Click Unlink Action from Project Card Table
  const handleUnlinkItem = async (proj, itemId, itemType, cardLinkedSystems = []) => {
    const itemLabel = itemType === "system" ? "information system" : "line item";
    if (!window.confirm(`Unlink this ${itemLabel} from '${proj.project_title}'? It will be returned to the Intake Pool and removed from active plan outlays.`)) return;

    try {
      let nextProposalIds = (proj.linked_proposals || []).map(p => String(p.id));
      let nextSystemIds = (cardLinkedSystems.length > 0 ? cardLinkedSystems : (proj.linked_systems || [])).map(s => String(s.id));
      
      if (proj.system_id && !nextSystemIds.includes(String(proj.system_id))) {
        nextSystemIds.push(String(proj.system_id));
      }

      if (itemType === "system") {
        nextSystemIds = nextSystemIds.filter(id => id !== String(itemId));
      } else {
        nextProposalIds = nextProposalIds.filter(id => id !== String(itemId));
      }

      await updateProjectLinks(token, proj.id, {
        proposal_ids: nextProposalIds,
        system_ids: nextSystemIds
      });

      setSuccess("Item unlinked successfully. Quarantined in Intake Pool and deducted from project total.");
      await fetchAllData();
    } catch (err) {
      setError(err.message || "Failed to unlink item.");
    }
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingId(null);
    const startYr = (planningYears && planningYears[0]) || 2028;
    const endYr = (planningYears && planningYears[planningYears.length - 1]) || 2030;

    const initialDelivs = {};
    for (let y = startYr; y <= endYr; y++) {
      initialDelivs[String(y)] = "";
      initialDelivs[`Year ${y - startYr + 1}`] = "";
    }

    const defaultHarm = {};
    availableCriteria.forEach(c => {
      defaultHarm[c.name] = Boolean(c.is_mandatory);
    });

    const initialCategory = categoryFilter !== "All" ? categoryFilter : "Internal ICT Projects";

    setForm({
      ...initialFormState,
      project_category: initialCategory,
      duration_start_year: startYr,
      duration_end_year: endYr,
      annual_deliverables: initialDelivs,
      harmonization_criteria: defaultHarm,
      implementing_unit: defaultImplementingUnit
    });
    setCustomCriterionInput("");
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (proj) => {
    setEditingId(proj.id);
    const startYr = parseInt(proj.duration_start_year, 10) || (planningYears && planningYears[0]) || 2028;
    const endYr = parseInt(proj.duration_end_year, 10) || (planningYears && planningYears[planningYears.length - 1]) || 2030;

    let parsedAnnual = proj.annual_deliverables;
    if (typeof parsedAnnual === "string") {
      try { parsedAnnual = JSON.parse(parsedAnnual); } catch { parsedAnnual = {}; }
    }
    parsedAnnual = parsedAnnual && typeof parsedAnnual === "object" ? { ...parsedAnnual } : {};

    for (let y = startYr; y <= endYr; y++) {
      const idx = y - startYr + 1;
      let text = parsedAnnual[String(y)] || parsedAnnual[`Year ${idx}`] || "";
      if (!text) {
        if (idx === 1) text = proj.year_1_deliverables || "";
        else if (idx === 2) text = proj.year_2_deliverables || "";
        else if (idx === 3) text = proj.year_3_deliverables || "";
      }
      parsedAnnual[String(y)] = text;
      parsedAnnual[`Year ${idx}`] = text;
    }

    let parsedHarm = proj.harmonization_criteria;
    if (typeof parsedHarm === "string") {
      try { parsedHarm = JSON.parse(parsedHarm); } catch { parsedHarm = {}; }
    }
    if (!parsedHarm || typeof parsedHarm !== "object" || Object.keys(parsedHarm).length === 0) {
      parsedHarm = {
        "National Prioritization (PDP 2023-2028)": Boolean(proj.harmonizes_national_priority),
        "Resource Optimization (GovNet, GovCloud)": Boolean(proj.harmonizes_resource_optimization),
        "PeGIF Standardized APIs & Interoperability": Boolean(proj.harmonizes_pegif),
        "Cross-Agency Collaboration (JMC / MOA)": Boolean(proj.harmonizes_cross_collaboration),
        "Scalability and Sustainability (SPAR / PREXC)": Boolean(proj.harmonizes_scalability)
      };
    }

    availableCriteria.forEach(c => {
      if (parsedHarm[c.name] === undefined) {
        parsedHarm[c.name] = Boolean(c.is_mandatory);
      }
    });

    setForm({
      system_id: proj.system_id || "",
      project_title: proj.project_title || "",
      project_category: proj.project_category || "Internal ICT Projects",
      description: proj.description || "",
      objectives: proj.objectives || "",
      aligns_pip: Boolean(proj.aligns_pip),
      aligns_ncsp: Boolean(proj.aligns_ncsp),
      aligns_egmp: Boolean(proj.aligns_egmp),
      aligns_pcb: Boolean(proj.aligns_pcb),
      aligns_others: Boolean(proj.aligns_others),
      aligns_others_specify: proj.aligns_others_specify || "",
      harmonization_criteria: parsedHarm,
      harmonizes_national_priority: Boolean(proj.harmonizes_national_priority),
      harmonizes_resource_optimization: Boolean(proj.harmonizes_resource_optimization),
      harmonizes_pegif: Boolean(proj.harmonizes_pegif),
      harmonizes_cross_collaboration: Boolean(proj.harmonizes_cross_collaboration),
      harmonizes_scalability: Boolean(proj.harmonizes_scalability),
      duration_start_year: startYr,
      duration_end_year: endYr,
      annual_deliverables: parsedAnnual,
      year_1_deliverables: parsedAnnual["Year 1"] || parsedAnnual[String(startYr)] || proj.year_1_deliverables || "",
      year_2_deliverables: parsedAnnual["Year 2"] || parsedAnnual[String(startYr + 1)] || proj.year_2_deliverables || "",
      year_3_deliverables: parsedAnnual["Year 3"] || parsedAnnual[String(endYr)] || proj.year_3_deliverables || "",
      implementing_unit: proj.implementing_unit || defaultImplementingUnit,
      funding_source: proj.funding_source || "General Appropriations Act (GAA)",
      lead_agency: proj.lead_agency || "",
      partner_agencies: proj.partner_agencies || ""
    });
    setCustomCriterionInput("");
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleAnnualDeliverableChange = (yr, yearIndex, value) => {
    setForm(prev => {
      const updated = { ...(prev.annual_deliverables || {}) };
      updated[String(yr)] = value;
      updated[`Year ${yearIndex}`] = value;
      return {
        ...prev,
        annual_deliverables: updated,
        ...(yearIndex === 1 ? { year_1_deliverables: value } : {}),
        ...(yearIndex === 2 ? { year_2_deliverables: value } : {}),
        ...(yearIndex === 3 ? { year_3_deliverables: value } : {})
      };
    });
  };

  const handleToggleHarmonizationCriterion = (name) => {
    setForm(prev => {
      const currentMap = { ...(prev.harmonization_criteria || {}) };
      currentMap[name] = !currentMap[name];
      return { ...prev, harmonization_criteria: currentMap };
    });
  };

  const handleAddCustomCriterion = (e) => {
    e.preventDefault();
    const clean = customCriterionInput.trim();
    if (!clean) return;

    setForm(prev => ({
      ...prev,
      harmonization_criteria: {
        ...(prev.harmonization_criteria || {}),
        [clean]: true
      }
    }));

    setAvailableCriteria(prev => {
      if (prev.some(c => c.name.toLowerCase() === clean.toLowerCase())) return prev;
      return [...prev, { id: Date.now(), name: clean, is_mandatory: false, description: "Custom Institutional Criterion" }];
    });

    setCustomCriterionInput("");
  };

  const handleRemoveCustomCriterion = (name) => {
    setForm(prev => {
      const currentMap = { ...(prev.harmonization_criteria || {}) };
      delete currentMap[name];
      return { ...prev, harmonization_criteria: currentMap };
    });
  };

  const applyHorizonPreset = (yearsSpan) => {
    const startYr = parseInt(form.duration_start_year, 10) || (planningYears && planningYears[0]) || 2028;
    const endYr = startYr + yearsSpan - 1;
    setForm(prev => ({ ...prev, duration_end_year: endYr }));
  };

  const handleSyncDurationToCycle = () => {
    const startYr = (planningYears && planningYears[0]) || 2028;
    const endYr = (planningYears && planningYears[planningYears.length - 1]) || 2030;
    setForm(prev => {
      const updatedDelivs = { ...(prev.annual_deliverables || {}) };
      for (let y = startYr; y <= endYr; y++) {
        if (!updatedDelivs[String(y)]) updatedDelivs[String(y)] = "";
      }
      return {
        ...prev,
        duration_start_year: startYr,
        duration_end_year: endYr,
        annual_deliverables: updatedDelivs
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.project_title.trim()) {
      setError("Project Title is required.");
      return;
    }

    if (form.aligns_others && !form.aligns_others_specify.trim()) {
      setError("Please specify the statutory directive under Strategic Alignment 'Others (Specify)'.");
      return;
    }

    if (form.project_category === "Cross-Agency ICT Projects" && !form.lead_agency?.trim()) {
      setError("Please designate a Lead Agency for Cross-Agency ICT Projects (Part III.E.2).");
      return;
    }

    const startYr = parseInt(form.duration_start_year, 10) || 2028;
    const endYr = parseInt(form.duration_end_year, 10) || (startYr + 2);

    if (startYr > endYr) {
      setError("Start Year cannot be later than End Year.");
      return;
    }

    setSubmitting(true);

    const cleanAnnual = {};
    for (let y = startYr; y <= endYr; y++) {
      const idx = y - startYr + 1;
      let text = form.annual_deliverables?.[String(y)] || form.annual_deliverables?.[`Year ${idx}`] || "";
      if (!text) {
        if (idx === 1) text = form.year_1_deliverables || "";
        else if (idx === 2) text = form.year_2_deliverables || "";
        else if (idx === 3) text = form.year_3_deliverables || "";
      }
      cleanAnnual[String(y)] = text;
      cleanAnnual[`Year ${idx}`] = text;
    }

    const y1 = cleanAnnual["Year 1"] || cleanAnnual[String(startYr)] || form.year_1_deliverables || "";
    const y2 = cleanAnnual["Year 2"] || cleanAnnual[String(startYr + 1)] || form.year_2_deliverables || "";
    const y3 = cleanAnnual["Year 3"] || cleanAnnual[String(endYr)] || form.year_3_deliverables || "";

    const harm = form.harmonization_criteria || {};
    let natPri = Boolean(form.harmonizes_national_priority);
    let resOpt = Boolean(form.harmonizes_resource_optimization);
    let pegif = Boolean(form.harmonizes_pegif);
    let crossCol = Boolean(form.harmonizes_cross_collaboration);
    let scal = Boolean(form.harmonizes_scalability);

    Object.entries(harm).forEach(([k, val]) => {
      const lower = k.toLowerCase();
      if (lower.includes("priority") || lower.includes("pdp")) natPri = Boolean(val);
      if (lower.includes("resource") || lower.includes("cloud") || lower.includes("govnet")) resOpt = Boolean(val);
      if (lower.includes("pegif") || lower.includes("api") || lower.includes("interoperab")) pegif = Boolean(val);
      if (lower.includes("cross") || lower.includes("collaboration") || lower.includes("jmc")) crossCol = Boolean(val);
      if (lower.includes("scalab") || lower.includes("sustainab") || lower.includes("prexc")) scal = Boolean(val);
    });

    const payload = {
      ...form,
      project_title: form.project_title.trim(),
      description: form.description.trim(),
      objectives: form.objectives.trim(),
      implementing_unit: form.implementing_unit.trim() || defaultImplementingUnit,
      duration_start_year: startYr,
      duration_end_year: endYr,
      annual_deliverables: cleanAnnual,
      year_1_deliverables: y1,
      year_2_deliverables: y2,
      year_3_deliverables: y3,
      harmonization_criteria: harm,
      harmonizes_national_priority: natPri,
      harmonizes_resource_optimization: resOpt,
      harmonizes_pegif: pegif,
      harmonizes_cross_collaboration: crossCol,
      harmonizes_scalability: scal,
      system_id: form.system_id || null,
      aligns_others: Boolean(form.aligns_others),
      aligns_others_specify: form.aligns_others ? form.aligns_others_specify.trim() : null,
      lead_agency: form.project_category === "Cross-Agency ICT Projects" ? (form.lead_agency?.trim() || null) : null,
      partner_agencies: form.project_category === "Cross-Agency ICT Projects" ? (form.partner_agencies?.trim() || null) : null
    };

    try {
      if (editingId) {
        await updateIctProject(token, editingId, payload);
      } else {
        await createIctProject(token, payload);
      }

      setSuccess(`ICT Project '${form.project_title}' saved successfully.`);
      setIsModalOpen(false);
      await fetchAllData();
    } catch (err) {
      setError(err.message || "Failed to persist ICT project.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Permanently delete '${title}'? This action will be blocked by the server if active budget line items are linked in Part IV.A.`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteIctProject(token, id);
      setSuccess(`Project '${title}' deleted successfully.`);
      await fetchAllData();
    } catch (err) {
      setError(err.message || "Deletion failed.");
    }
  };

  const getDeliverableText = (proj, yearNum, calYear) => {
    let annual = proj.annual_deliverables;
    if (typeof annual === "string") {
      try { annual = JSON.parse(annual); } catch { annual = {}; }
    }
    if (annual && typeof annual === "object") {
      if (annual[String(calYear)]) return annual[String(calYear)];
      if (annual[`Year ${yearNum}`]) return annual[`Year ${yearNum}`];
    }
    if (yearNum === 1) return proj.year_1_deliverables || "";
    if (yearNum === 2) return proj.year_2_deliverables || "";
    if (yearNum === 3) return proj.year_3_deliverables || "";
    return "";
  };

  const getProjectPmfCount = useCallback((proj) => {
    const projTitle = (proj.project_title || "").toLowerCase().trim();
    return metrics.filter(m => {
      if (m.project_id && String(m.project_id) === String(proj.id)) return true;
      if (m.project_title && m.project_title.toLowerCase().trim() === projTitle) return true;
      return false;
    }).length;
  }, [metrics]);

  const modalCriteriaList = useMemo(() => {
    const seen = new Set();
    const list = [];
    availableCriteria.forEach(c => {
      seen.add(c.name);
      list.push(c);
    });

    Object.keys(form.harmonization_criteria || {}).forEach(k => {
      if (!seen.has(k)) {
        seen.add(k);
        list.push({ id: k, name: k, is_custom: true });
      }
    });

    return list;
  }, [availableCriteria, form.harmonization_criteria]);

  const modalStartYr = parseInt(form.duration_start_year, 10) || 2028;
  const modalEndYr = parseInt(form.duration_end_year, 10) || (modalStartYr + 2);
  const modalHorizonYears = useMemo(() => {
    const years = [];
    if (modalStartYr <= modalEndYr) {
      for (let y = modalStartYr; y <= modalEndYr; y++) {
        years.push(y);
      }
    }
    return years;
  }, [modalStartYr, modalEndYr]);

  const modalSelectedSystem = useMemo(() => {
    if (!form.system_id) return null;
    return systems.find(s => String(s.id) === String(form.system_id));
  }, [form.system_id, systems]);

  const modalPiaWarning = useMemo(() => {
    if (!modalSelectedSystem) return false;
    return modalSelectedSystem.processes_personal_information && !modalSelectedSystem.has_undergone_pia;
  }, [modalSelectedSystem]);

  const totalPortfolioValue = useMemo(() => {
    return projects.reduce((acc, p) => acc + parseFloat(p.computed_total_project_cost || 0), 0);
  }, [projects]);

  const majorOutlaysCount = useMemo(() => {
    return projects.filter(p => parseFloat(p.computed_total_project_cost || 0) >= majorOutlayThreshold).length;
  }, [projects, majorOutlayThreshold]);

  const internalCount = useMemo(() => {
    return projects.filter(p => {
      const cat = (p.project_category || "").toLowerCase();
      return cat === "internal ict projects" || (cat.includes("internal") && !cat.includes("cross"));
    }).length;
  }, [projects]);

  const crossAgencyCount = useMemo(() => {
    return projects.filter(p => (p.project_category || "").toLowerCase().includes("cross")).length;
  }, [projects]);

  const projectsMissingKpisCount = useMemo(() => {
    return projects.filter(p => getProjectPmfCount(p) === 0).length;
  }, [projects, getProjectPmfCount]);

  const projectsUnfundedCount = useMemo(() => {
    return projects.filter(p => !((p.project_category || "").toLowerCase().includes("cross")) && parseFloat(p.computed_total_project_cost || 0) === 0).length;
  }, [projects]);

  // Projected Cost in Link Modal
  const projectedModalCost = useMemo(() => {
    if (!linkingProject) return 0;
    
    // Sum selected proposals
    const propSum = allAvailableProposals
      .filter(p => selectedProposalIds.includes(String(p.id)))
      .reduce((acc, p) => acc + (parseFloat(p.total_cost) || 0), 0);

    // Sum selected systems not covered by proposal names
    const coveredNames = new Set(
      allAvailableProposals
        .filter(p => selectedProposalIds.includes(String(p.id)))
        .map(p => (p.item_name || "").toLowerCase().trim())
    );

    const sysSum = systems
      .filter(s => selectedSystemIds.includes(String(s.id)))
      .filter(s => (s.status?.value || s.status || "").toLowerCase() !== "operational")
      .reduce((acc, s) => {
        const sName = (s.name || "").toLowerCase().trim();
        const covered = Array.from(coveredNames).some(c => c.includes(sName) || sName.includes(c));
        return covered ? acc : acc + (parseFloat(s.proposed_cost) || 0);
      }, 0);

    return propSum + sysSum;
  }, [linkingProject, selectedProposalIds, selectedSystemIds, allAvailableProposals, systems]);

  // Filter Pipeline for Main List (Integrated with Dynamic Categories)
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const cat = (p.project_category || "").trim();
      const catLower = cat.toLowerCase();
      const cost = parseFloat(p.computed_total_project_cost || 0);
      const isMajor = cost >= majorOutlayThreshold;
      const linkedSys = systems.find(s => String(s.id) === String(p.system_id));
      const sysStatus = (linkedSys?.status?.value || linkedSys?.status || "").toLowerCase();
      const isDevOrEnhance = sysStatus.includes("development") || sysStatus.includes("enhancement");
      const pmfCount = getProjectPmfCount(p);

      let matchesCategory = true;
      if (categoryFilter === "Internal ICT Projects") {
        matchesCategory = catLower === "internal ict projects" || (catLower.includes("internal") && !catLower.includes("cross"));
      } else if (categoryFilter === "Cross-Agency ICT Projects") {
        matchesCategory = catLower.includes("cross");
      } else if (categoryFilter !== "All") {
        matchesCategory = catLower === categoryFilter.toLowerCase();
      }

      let matchesSystem = true;
      if (systemFilter === "unlinked") {
        matchesSystem = !p.system_id && (!p.linked_systems || p.linked_systems.length === 0);
      } else if (systemFilter !== "All") {
        const sysIdStr = String(systemFilter);
        const hasDirect = String(p.system_id) === sysIdStr;
        const hasInList = (p.linked_systems || []).some(s => String(s.id) === sysIdStr);
        matchesSystem = hasDirect || hasInList;
      }

      let matchesReviewGate = true;
      if (reviewGateFilter === "MajorOutlay") {
        matchesReviewGate = isMajor;
      } else if (reviewGateFilter === "GateBreached") {
        matchesReviewGate = isMajor && (!linkedSys || !isDevOrEnhance);
      } else if (reviewGateFilter === "Compliant") {
        matchesReviewGate = isMajor && linkedSys && isDevOrEnhance;
      } else if (reviewGateFilter === "MissingKpis") {
        matchesReviewGate = pmfCount === 0;
      } else if (reviewGateFilter === "Unfunded") {
        matchesReviewGate = !catLower.includes("cross") && cost === 0;
      }

      const q = searchTerm.toLowerCase().trim();
      const matchesSearch = q === "" || 
        (p.project_title || "").toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q) ||
        (p.implementing_unit || "").toLowerCase().includes(q) ||
        (linkedSys?.name || "").toLowerCase().includes(q);

      return matchesCategory && matchesSystem && matchesReviewGate && matchesSearch;
    });
  }, [projects, categoryFilter, systemFilter, reviewGateFilter, searchTerm, systems, majorOutlayThreshold, getProjectPmfCount]);

  // Filter Pipeline for Proposals in Linking Modal
  const filteredModalProposals = useMemo(() => {
    if (!linkingProject) return [];
    return allAvailableProposals.filter(p => {
      const isSelected = selectedProposalIds.includes(String(p.id));
      const isAssignedOther = p.project_id && String(p.project_id) !== String(linkingProject.id);
      const isAssignedCurrent = String(p.project_id) === String(linkingProject.id) || isSelected;

      // Status filter
      if (proposalStatusFilter !== "All") {
        const st = (p.status || "").toLowerCase();
        if (st !== proposalStatusFilter.toLowerCase()) return false;
      }

      // Link state filter
      if (proposalLinkFilter === "Unassigned" && (isAssignedOther || isAssignedCurrent)) return false;
      if (proposalLinkFilter === "AssignedCurrent" && !isAssignedCurrent) return false;
      if (proposalLinkFilter === "AssignedOther" && !isAssignedOther) return false;

      // Text search
      if (linkSearchTerm.trim()) {
        const q = linkSearchTerm.toLowerCase();
        const matches = (p.item_name || "").toLowerCase().includes(q) ||
                        (p.category || "").toLowerCase().includes(q) ||
                        (p.office_location || "").toLowerCase().includes(q) ||
                        (p.uacs_object_code || "").toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [allAvailableProposals, linkingProject, selectedProposalIds, proposalStatusFilter, proposalLinkFilter, linkSearchTerm]);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
              <span>Part III.E: ICT Projects Portfolio &amp; Strategic Deliverables</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              Cycle: FY {activeCycle || "2028-2030"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Manage multi-year milestones across dynamic horizons (2 to 5+ years), configure Harmonization Criteria, inspect linked hardware/software proposals &amp; systems, and enforce ₱2M Major Outlay Review Gates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Link to Categorization Manager for CRUD category management */}
          <Link
            to="/admin/categorizations"
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 font-bold shadow-xs cursor-pointer text-xs transition-all"
            title="Manage Strategic Categories &amp; UACS Codes in Categorizations Module"
          >
            <Tag className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Manage Categories</span>
          </Link>

          {/* Automated Compiler Diagnostic Verification Action */}
          <CompilerSyncButton
            moduleName="projects"
            activeCycle={activeCycle}
            token={token}
            onSaveAndSync={fetchAllData}
            label="Save &amp; Verify Compiler Pipeline"
          />

          <button
            onClick={fetchAllData}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 font-bold shadow-xs cursor-pointer text-xs"
            title="Refresh Portfolio Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm text-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Create ICT Project</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Portfolio</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{projects.length} Initiatives</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Aggregated Total Outlays</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
              {formatPHP(totalPortfolioValue)}
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-50 dark:bg-slate-800 text-purple-600 dark:text-purple-400 rounded-xl shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Internal vs Cross</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">
              {internalCount} <span className="text-xs text-slate-400 font-normal">Internal</span> / {crossAgencyCount} <span className="text-xs text-purple-600 dark:text-purple-400 font-normal">Cross</span>
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-amber-50 dark:bg-slate-800 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Major Outlays (&ge; ₱2M)</span>
            <h3 className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">
              {majorOutlaysCount} Review Gates
            </h3>
          </div>
        </div>

        <div className={`p-5 rounded-2xl border flex items-center gap-3.5 shadow-xs transition-all ${
          projectsMissingKpisCount > 0 
            ? "bg-rose-50 dark:bg-rose-955/30 border-rose-300 dark:border-rose-900 text-rose-900 dark:text-rose-300 animate-pulse" 
            : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800"
        }`}>
          <div className={`p-3 rounded-xl shrink-0 ${projectsMissingKpisCount > 0 ? "bg-rose-600 text-white" : "bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400"}`}>
            <Target className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-75">PMF Scorecard Audit</span>
            <h3 className={`text-base font-bold font-mono mt-0.5 ${projectsMissingKpisCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {projectsMissingKpisCount > 0 ? `${projectsMissingKpisCount} Missing KPIs` : "100% KPIs Linked"}
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
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-955/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Proactive Compiler Readiness Alert */}
      {(projectsMissingKpisCount > 0 || projectsUnfundedCount > 0) && (
        <div className="p-4 bg-amber-50 dark:bg-amber-955/30 border border-amber-300 dark:border-amber-900/60 rounded-2xl flex items-start gap-3 shadow-xs animate-fadeIn">
          <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs text-amber-950 dark:text-amber-200 leading-relaxed flex-1">
            <h4 className="font-bold text-sm text-amber-900 dark:text-amber-300">
              Compilation Prerequisites Notice: Potential Compiler Blockers Detected
            </h4>
            <p>
              Under the DICT ISSP compliance framework, compiling the official plan requires every registered project to satisfy relational integrity rules:
            </p>
            <ul className="list-disc list-inside space-y-0.5 pt-0.5 font-mono text-[11px]">
              {projectsMissingKpisCount > 0 && (
                <li className="text-rose-700 dark:text-rose-400 font-bold">
                  {projectsMissingKpisCount} project(s) have NO Key Performance Indicators in Part III.F. (Causes "PMF Disconnect" during compilation).
                </li>
              )}
              {projectsUnfundedCount > 0 && (
                <li className="text-amber-800 dark:text-amber-300 font-bold">
                  {projectsUnfundedCount} internal project(s) have ₱0.00 in approved Part IV.A budget line items. (Items remain quarantined in the Intake Pool until linked).
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Advanced Filter Toolbar (Updated with Dynamic Categories) */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        
        {/* Dynamic Category Tabs */}
        <div className="flex flex-wrap bg-slate-100 dark:bg-slate-955 p-1 border border-slate-200 dark:border-slate-800 rounded-xl self-start md:self-auto gap-1">
          {[
            { id: "Internal ICT Projects", label: "Internal (III.E.1)" },
            { id: "Cross-Agency ICT Projects", label: "Cross-Agency (III.E.2)" },
            ...strategicCategories
              .filter(sc => !["Internal ICT Projects", "Cross-Agency ICT Projects"].includes(sc.name))
              .map(sc => ({ id: sc.name, label: sc.name })),
            { id: "All", label: "All Portfolio" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setCategoryFilter(tab.id)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                categoryFilter === tab.id 
                  ? "bg-blue-600 text-white shadow-xs" 
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          {/* Linked System Filter Dropdown */}
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={systemFilter}
              onChange={e => setSystemFilter(e.target.value)}
              className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 outline-none text-xs cursor-pointer max-w-[190px] truncate font-semibold"
            >
              <option value="All">All Linked Systems</option>
              <option value="unlinked">-- Unlinked Projects --</option>
              {systems.map(s => (
                <option key={s.id} value={s.id}>
                  [{s.status?.value || s.status}] {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Compliance & Review Gate Filter */}
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
            <select
              value={reviewGateFilter}
              onChange={e => setReviewGateFilter(e.target.value)}
              className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 outline-none text-xs cursor-pointer font-semibold max-w-[210px] truncate"
            >
              <option value="All">All Status Filters</option>
              <option value="MajorOutlay">Outlays &ge; ₱2M (Major Gate Active)</option>
              <option value="GateBreached">⚠️ ₱2M Gate Needs Attention</option>
              <option value="Compliant">✓ ₱2M Gate Compliant</option>
              <option value="MissingKpis">⚠️ Missing Part III.F KPIs</option>
              <option value="Unfunded">⚠️ Unfunded in Part IV.A (₱0.00)</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search project, unit, system..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 text-xs outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Projects Cards Directory */}
      <div className="space-y-4">
        {loading && projects.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-500 shadow-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <span>Loading strategic project portfolios...</span>
          </div>
        ) : filteredProjects.length > 0 ? (
          filteredProjects.map(proj => {
            const pStart = parseInt(proj.duration_start_year, 10) || 2028;
            const pEnd = parseInt(proj.duration_end_year, 10) || (pStart + 2);
            const pYears = [];
            for (let y = pStart; y <= pEnd; y++) {
              pYears.push(y);
            }

            const linkedSystem = systems.find(s => String(s.id) === String(proj.system_id));
            const isCross = (proj.project_category || "").toLowerCase().includes("cross");
            const computedCost = parseFloat(proj.computed_total_project_cost || 0);
            const isMajorOutlay = computedCost >= majorOutlayThreshold;
            const pmfCount = getProjectPmfCount(proj);
            const isUnfunded = !isCross && computedCost === 0;

            const linkedSystemStatus = (linkedSystem?.status?.value || linkedSystem?.status || "").toLowerCase();
            const isSystemValidForMajorGate = linkedSystemStatus.includes("development") || linkedSystemStatus.includes("enhancement");
            const hasReviewGateBreach = isMajorOutlay && (!linkedSystem || !isSystemValidForMajorGate);

            // Reconstruct card-level linked systems ensuring primary system is present without duplicates
            const cardLinkedSystems = (() => {
              const list = [...(proj.linked_systems || [])];
              if (proj.system_id && !list.some(s => String(s.id) === String(proj.system_id))) {
                const matchSys = systems.find(s => String(s.id) === String(proj.system_id));
                if (matchSys) {
                  list.push({
                    id: String(matchSys.id),
                    name: matchSys.name,
                    status: matchSys.status?.value || matchSys.status || "Operational",
                    proposed_cost: parseFloat(matchSys.proposed_cost || 0),
                    classification: matchSys.classification?.value || matchSys.classification || ""
                  });
                }
              }
              return list;
            })();

            let harmMap = proj.harmonization_criteria;
            if (typeof harmMap === "string") {
              try { harmMap = JSON.parse(harmMap); } catch { harmMap = {}; }
            }
            harmMap = harmMap && typeof harmMap === "object" ? harmMap : {};

            const isTableCollapsed = Boolean(collapsedTables[proj.id]);
            const totalLinkedItemsCount = (proj.linked_proposals?.length || 0) + cardLinkedSystems.length;

            return (
              <div 
                key={proj.id}
                className={`p-6 rounded-2xl border bg-white dark:bg-slate-900 transition-all space-y-4 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 ${
                  pmfCount === 0 || hasReviewGateBreach
                    ? "border-amber-300 dark:border-amber-900/60"
                    : "border-slate-200/90 dark:border-slate-800"
                }`}
              >
                {/* Header Bar */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono ${
                        isCross
                          ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20"
                          : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"
                      }`}>
                        {proj.project_category}
                      </span>

                      {/* ₱2M Review Gate Badge */}
                      {isMajorOutlay && (
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono flex items-center gap-1 ${
                          hasReviewGateBreach
                            ? "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-955/40 dark:text-amber-400 dark:border-amber-900"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                        }`}>
                          <ShieldAlert className="w-3 h-3" />
                          <span>Outlay &ge; ₱2M Review Gate</span>
                        </span>
                      )}

                      {/* PMF KPI Count Badge */}
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono flex items-center gap-1 ${
                        pmfCount > 0
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                          : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 animate-pulse"
                      }`}>
                        <Target className="w-3 h-3" />
                        <span>{pmfCount > 0 ? `${pmfCount} PMF KPIs` : "0 KPIs (Compiler Blocker)"}</span>
                      </span>

                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">{proj.project_title}</h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1">
                      <span>Implementing Unit: <strong className="text-slate-700 dark:text-slate-300">{proj.implementing_unit}</strong></span>
                      <span>•</span>
                      <span>Fund Source: <strong className="text-blue-600 dark:text-blue-400">{proj.funding_source}</strong></span>
                      <span>•</span>
                      <span>Horizon: <strong className="text-slate-700 dark:text-slate-300">FY {pStart} – FY {pEnd} ({pYears.length} Years)</strong></span>
                      {linkedSystem && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
                            <Database className="w-3 h-3" />
                            <span>System: {linkedSystem.name} [{linkedSystem.status?.value || linkedSystem.status}]</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block font-mono">Aggregated Project Cost</span>
                      <span className={`text-sm font-bold font-mono ${isUnfunded ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {formatPHP(computedCost)}
                      </span>
                      {isUnfunded && (
                        <span className="text-[8.5px] text-amber-600 dark:text-amber-400 font-bold block">
                          Unfunded in Part IV.A
                        </span>
                      )}
                    </div>

                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleOpenLinkModal(proj)}
                        className="p-1.5 bg-blue-50 dark:bg-blue-955/40 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 rounded-lg cursor-pointer flex items-center gap-1 font-bold text-[10px]"
                        title="Assign or Manage Linked Items & Systems"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>Manage Items</span>
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(proj)}
                        className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 cursor-pointer"
                        title="Edit Project & Milestones"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(proj.id, proj.project_title)}
                        className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-955/40 dark:hover:text-rose-400 rounded-lg text-slate-500 cursor-pointer"
                        title="Delete Project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* ₱2M Major Outlay Review Gate Alert Banner */}
                {hasReviewGateBreach && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-955/30 border border-amber-300 dark:border-amber-900/60 rounded-xl space-y-1 text-amber-900 dark:text-amber-300 animate-fadeIn">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Review Gate Action Required: Total Outlay Exceeds ₱2,000,000.00 (Rule 2)</span>
                    </div>
                    <p className="text-[10.5px] leading-relaxed text-slate-700 dark:text-slate-300">
                      Under DBM and DICT guidelines, projects with outlays &ge; ₱2M must link to an Information System in Part III.D flagged as <strong>"For Development"</strong> or <strong>"For Enhancement"</strong>. 
                      {!linkedSystem ? " Currently, this project is unlinked." : ` Currently linked system '${linkedSystem.name}' has status '${linkedSystem.status?.value || linkedSystem.status}'.`}
                    </p>
                  </div>
                )}

                {/* Missing PMF KPIs Warning */}
                {pmfCount === 0 && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-955/30 border border-rose-300 dark:border-rose-900/60 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-rose-900 dark:text-rose-300 animate-fadeIn">
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>Compiler Blocker: No Key Performance Indicators (KPIs) in Part III.F Scorecard</span>
                    </div>
                    <button
                      onClick={() => navigate(`/admin/narratives/metrics`, { state: { prefillProject: proj } })}
                      className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-[10.5px] cursor-pointer shadow-xs transition-all flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add KPI in Scorecard</span>
                    </button>
                  </div>
                )}

                {/* Narrative Context */}
                <div className="space-y-1 text-xs">
                  <p className="text-slate-700 dark:text-slate-300"><strong>Description:</strong> {proj.description}</p>
                  <p className="text-slate-500 dark:text-slate-400"><strong>Objectives:</strong> {proj.objectives}</p>
                </div>

                {/* Cross-Agency Details Box */}
                {isCross && (
                  <div className="text-xs p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-wrap gap-6 text-slate-700 dark:text-slate-300">
                    <div>
                      <strong className="text-slate-900 dark:text-white">Lead Agency:</strong> 
                      <span className="text-blue-600 dark:text-blue-400 ml-1 font-mono font-bold">{proj.lead_agency || "Not Specified"}</span>
                    </div>
                    <div>
                      <strong className="text-slate-900 dark:text-white">Partner Agencies:</strong> 
                      <span className="text-slate-600 dark:text-slate-400 ml-1">{proj.partner_agencies || "None Configured"}</span>
                    </div>
                  </div>
                )}

                {/* LINKED RESOURCE PROPOSALS & SYSTEMS BREAKDOWN TABLE */}
                <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => toggleTableCollapse(proj.id)}
                      className="flex items-center gap-1.5 font-bold font-mono text-[10.5px] uppercase text-slate-700 dark:text-slate-300 hover:text-blue-600 cursor-pointer"
                    >
                      <Coins className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Linked Proposals &amp; Systems ({totalLinkedItemsCount} Items)</span>
                      {isTableCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronUp className="w-3.5 h-3.5 text-slate-400" />}
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-500">
                        Sum: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{formatPHP(computedCost)}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenLinkModal(proj)}
                        className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-blue-500 rounded-lg text-blue-600 dark:text-blue-400 font-bold text-[9.5px] cursor-pointer flex items-center gap-1 shadow-2xs"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Manage Items</span>
                      </button>
                    </div>
                  </div>

                  {!isTableCollapsed && (
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 animate-fadeIn">
                      {totalLinkedItemsCount > 0 ? (
                        <table className="w-full text-left border-collapse text-[10.5px]">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 font-bold text-slate-500 dark:text-slate-400 uppercase font-mono text-[9px]">
                              <th className="p-2.5">Type</th>
                              <th className="p-2.5">Item / System Title</th>
                              <th className="p-2.5">Deployment Site</th>
                              <th className="p-2.5 text-center">Qty</th>
                              <th className="p-2.5 text-right font-mono">Unit Rate</th>
                              <th className="p-2.5 text-right font-mono">Total Outlay</th>
                              <th className="p-2.5 text-center">Status</th>
                              <th className="p-2.5 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                            {/* 1. Linked Information Systems */}
                            {cardLinkedSystems.map(sys => (
                              <tr key={`sys-${sys.id}`} className="hover:bg-slate-50/60 dark:hover:bg-slate-955/40 text-blue-900 dark:text-blue-200">
                                <td className="p-2.5 font-bold font-mono">
                                  <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-955 dark:text-blue-300 dark:border-blue-900 text-[8.5px] font-bold uppercase">
                                    SYSTEM
                                  </span>
                                </td>
                                <td className="p-2.5 font-bold">
                                  <div>{sys.name}</div>
                                  <div className="text-[9px] text-slate-400 dark:text-slate-500 font-mono font-normal">{sys.classification || "Information System"}</div>
                                </td>
                                <td className="p-2.5 text-slate-500 dark:text-slate-400">Central Office</td>
                                <td className="p-2.5 text-center font-mono font-bold">1</td>
                                <td className="p-2.5 text-right font-mono text-slate-600 dark:text-slate-400">{formatPHP(sys.proposed_cost)}</td>
                                <td className="p-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatPHP(sys.proposed_cost)}</td>
                                <td className="p-2.5 text-center font-mono font-bold text-[9px] uppercase">
                                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-955 dark:text-blue-300">
                                    {sys.status}
                                  </span>
                                </td>
                                <td className="p-2.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleUnlinkItem(proj, sys.id, "system", cardLinkedSystems)}
                                    className="p-1 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-955/40 text-slate-400 rounded cursor-pointer"
                                    title="Unlink System from Project"
                                  >
                                    <Unlink className="w-3 h-3" />
                                  </button>
                                </td>
                              </tr>
                            ))}

                            {/* 2. Linked Proposals (Hardware, Software, Subscriptions, Services) */}
                            {proj.linked_proposals && proj.linked_proposals.map(itm => (
                              <tr key={`item-${itm.id}`} className="hover:bg-slate-50/60 dark:hover:bg-slate-955/40 text-slate-800 dark:text-slate-200">
                                <td className="p-2.5 font-bold font-mono">
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[8.5px] uppercase">
                                    {itm.category || "ITEM"}
                                  </span>
                                </td>
                                <td className="p-2.5 font-semibold">
                                  <div>{itm.item_name}</div>
                                  <div className="text-[9px] text-slate-400 dark:text-slate-500 font-mono font-normal">{itm.uacs_object_code}</div>
                                </td>
                                <td className="p-2.5 text-slate-500 dark:text-slate-400 font-mono text-[10px]">{itm.office_location}</td>
                                <td className="p-2.5 text-center font-mono font-bold">{itm.total_qty}</td>
                                <td className="p-2.5 text-right font-mono text-slate-600 dark:text-slate-400">{formatPHP(itm.unit_cost)}</td>
                                <td className="p-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatPHP(itm.total_cost)}</td>
                                <td className="p-2.5 text-center">
                                  <span className={`px-2 py-0.5 rounded text-[8.5px] font-bold font-mono uppercase ${
                                    itm.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {itm.status}
                                  </span>
                                </td>
                                <td className="p-2.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleUnlinkItem(proj, itm.id, "proposal", cardLinkedSystems)}
                                    className="p-1 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-955/40 text-slate-400 rounded cursor-pointer"
                                    title="Unlink Line Item from Project (Returns to Intake Pool)"
                                  >
                                    <Unlink className="w-3 h-3" />
                                  </button>
                                </td>
                              </tr>
                            ))}

                            {/* Aggregated Total Row */}
                            <tr className="bg-slate-100/80 dark:bg-slate-955 font-bold border-t-2 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
                              <td colSpan={5} className="p-2.5 uppercase font-bold text-right font-mono text-[10px]">
                                Derived Project Cost Total:
                              </td>
                              <td className="p-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 text-xs">
                                {formatPHP(computedCost)}
                              </td>
                              <td colSpan={2}></td>
                            </tr>
                          </tbody>
                        </table>
                      ) : (
                        <div className="p-8 text-center text-slate-400 dark:text-slate-500 italic space-y-1">
                          <p>No proposals or systems currently assigned to this project.</p>
                          <p className="text-[10px]">Click "Manage Items" to link hardware line items, subscriptions, or software systems.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Dynamic Multi-Year Deliverables / Milestones Matrix */}
                <div className="space-y-1 pt-1">
                  <span className="text-[9.5px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-1 font-mono">
                    <Calendar className="w-3.5 h-3.5 text-blue-500" />
                    <span>Annual Milestones &amp; Deliverables Breakdown ({pYears.length} Years Horizon)</span>
                  </span>
                  <div 
                    className="grid gap-3 bg-slate-50 dark:bg-slate-955 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] leading-relaxed"
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${Math.min(pYears.length, 4)}, minmax(0, 1fr))`
                    }}
                  >
                    {pYears.map((yr, idx) => {
                      const text = getDeliverableText(proj, idx + 1, yr);
                      return (
                        <div key={yr}>
                          <span className="text-blue-600 dark:text-blue-400 uppercase font-bold text-[10px] block mb-1 font-mono">
                            Year {idx + 1} Deliverables ({yr}):
                          </span>
                          <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                            {text || <span className="text-slate-400 dark:text-slate-500 italic">No deliverables specified.</span>}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Strategic Alignment & Dynamic Harmonization Tags */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[9.5px] font-mono">
                  {/* National Blueprints */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-400 font-bold uppercase mr-1">Alignment:</span>
                    {proj.aligns_pip && <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">PIP</span>}
                    {proj.aligns_ncsp && <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">NCSP</span>}
                    {proj.aligns_egmp && <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">EGMP</span>}
                    {proj.aligns_pcb && <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">PCB</span>}
                    {proj.aligns_others && (
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-bold">
                        Others: {proj.aligns_others_specify || "Special Mandate"}
                      </span>
                    )}
                  </div>

                  {/* Dynamic Harmonization Criteria Tags */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-400 font-bold uppercase mr-1">Harmonization:</span>
                    {Object.keys(harmMap).length > 0 ? (
                      Object.entries(harmMap).map(([critName, isChecked]) => {
                        if (!isChecked) return null;
                        const shortName = critName.split(" (")[0];
                        return (
                          <span key={critName} className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-bold">
                            {shortName}
                          </span>
                        );
                      })
                    ) : (
                      <>
                        {proj.harmonizes_national_priority && <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">National Priority</span>}
                        {proj.harmonizes_resource_optimization && <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">Resource Optimization</span>}
                        {proj.harmonizes_pegif && <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-bold">PeGIF / APIs</span>}
                        {proj.harmonizes_scalability && <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20 font-bold">SPAR / PREXC</span>}
                      </>
                    )}
                  </div>
                </div>

                {/* Quick Navigation Footer */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 text-[10.5px]">
                  <Link
                    to={`/admin/queue?strategic_category=${encodeURIComponent(proj.project_category)}`}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-bold flex items-center gap-1"
                  >
                    <span>View Part IV.A Line Items</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    to={`/admin/narratives/metrics`}
                    className="text-purple-600 dark:text-purple-400 hover:underline font-bold flex items-center gap-1"
                  >
                    <span>Manage Scorecard KPIs ({pmfCount})</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-400 dark:text-slate-500 italic shadow-xs">
            No ICT projects match your active search or filter criteria. Click "Create ICT Project" to register initiatives.
          </div>
        )}
      </div>

      {/* MODAL 1: ASSIGN / LINK PROPOSALS & SYSTEMS TO PROJECT */}
      {linkingProject && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-955">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-blue-600" />
                  <span>Assign Line Items &amp; Systems to Project</span>
                </h3>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  Project: <strong>{linkingProject.project_title}</strong> &bull; Selected: {selectedProposalIds.length} proposals, {selectedSystemIds.length} systems
                </span>
              </div>
              <button 
                type="button" 
                onClick={() => setLinkingProject(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live Recalculation Sub-header */}
            <div className="px-5 py-2.5 bg-blue-50/50 dark:bg-blue-955/20 border-b border-slate-200 dark:border-slate-800 flex flex-wrap justify-between items-center text-[11px] font-mono">
              <span className="text-slate-600 dark:text-slate-400">
                Projected Aggregated Cost: <strong className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">{formatPHP(projectedModalCost)}</strong>
              </span>
              <span className="text-[10px] text-slate-500">
                {selectedProposalIds.length} proposal items &bull; {selectedSystemIds.length} systems active
              </span>
            </div>

            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-3">
              {/* Tab Switcher */}
              <div className="flex bg-slate-100 dark:bg-slate-955 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setLinkModalTab("proposals")}
                  className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    linkModalTab === "proposals" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Resource Proposals ({selectedProposalIds.length})
                </button>
                <button
                  type="button"
                  onClick={() => setLinkModalTab("systems")}
                  className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    linkModalTab === "systems" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Information Systems ({selectedSystemIds.length})
                </button>
              </div>

              {/* Sub-Filters for Proposals */}
              {linkModalTab === "proposals" && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={proposalStatusFilter}
                    onChange={e => setProposalStatusFilter(e.target.value)}
                    className="p-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Approved">Approved Only</option>
                    <option value="Submitted">Submitted Only</option>
                    <option value="Draft">Draft Only</option>
                  </select>

                  <select
                    value={proposalLinkFilter}
                    onChange={e => setProposalLinkFilter(e.target.value)}
                    className="p-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    <option value="All">All Link States</option>
                    <option value="Unassigned">Unassigned Only</option>
                    <option value="AssignedCurrent">Assigned To This Project</option>
                    <option value="AssignedOther">Assigned To Other Projects</option>
                  </select>
                </div>
              )}

              {/* Search Box */}
              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter items..."
                  value={linkSearchTerm}
                  onChange={e => setLinkSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {linkModalTab === "proposals" ? (
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 pb-1 flex justify-between items-center">
                    <span>Check items below to link to this ICT Project. Unchecking immediately quarantines the proposal back in the Intake Pool.</span>
                    <button
                      type="button"
                      onClick={() => {
                        const matchingIds = filteredModalProposals.map(p => String(p.id));
                        const allSelected = matchingIds.every(id => selectedProposalIds.includes(id));
                        if (allSelected) {
                          setSelectedProposalIds(prev => prev.filter(id => !matchingIds.includes(id)));
                        } else {
                          setSelectedProposalIds(prev => Array.from(new Set([...prev, ...matchingIds])));
                        }
                      }}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-bold font-mono text-[10px] cursor-pointer"
                    >
                      Toggle Visible Items
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {filteredModalProposals.length > 0 ? (
                      filteredModalProposals.map(p => {
                        const isSelected = selectedProposalIds.includes(String(p.id));
                        const isAlreadyLinkedOther = p.project_id && String(p.project_id) !== String(linkingProject.id);

                        return (
                          <label
                            key={p.id}
                            className={`p-3 flex items-center justify-between cursor-pointer transition-colors text-xs ${
                              isSelected 
                                ? "bg-blue-50/70 dark:bg-blue-955/30" 
                                : "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-955/20"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleProposalLink(p.id)}
                                className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                              />
                              <div>
                                <span className="font-bold text-slate-900 dark:text-white block">{p.item_name}</span>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                                  <span>{p.category || "Hardware"}</span>
                                  <span>•</span>
                                  <span>{p.office_location || "Central Office"}</span>
                                  <span>•</span>
                                  <span>{p.uacs_object_code}</span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right font-mono">
                              <span className="font-bold text-slate-900 dark:text-white block">{formatPHP(p.total_cost)}</span>
                              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                                <span className={`px-1.5 py-0.2 rounded text-[8.5px] font-bold uppercase font-mono ${
                                  p.status === "Approved" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-955 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-955 dark:text-amber-300"
                                }`}>
                                  {p.status}
                                </span>
                                {isAlreadyLinkedOther ? (
                                  <span className="text-[9px] text-amber-600 font-bold block">Assigned Other</span>
                                ) : isSelected ? (
                                  <span className="text-[9px] text-emerald-600 font-bold block">✓ Assigned (Included)</span>
                                ) : (
                                  <span className="text-[9px] text-slate-400 block">Intake Pool (Quarantined)</span>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })
                    ) : (
                      <div className="p-8 text-center text-slate-400 italic">
                        No proposals match your active filters in the current planning cycle.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-500 pb-1">
                    Select Information Systems that form the core applications of this ICT Project:
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {systems
                      .filter(s => !linkSearchTerm.trim() || s.name.toLowerCase().includes(linkSearchTerm.toLowerCase()))
                      .map(s => {
                        const isSelected = selectedSystemIds.includes(String(s.id));
                        const isAlreadyLinkedOther = s.project_id && String(s.project_id) !== String(linkingProject.id);

                        return (
                          <label
                            key={s.id}
                            className={`p-3 flex items-center justify-between cursor-pointer transition-colors text-xs ${
                              isSelected 
                                ? "bg-blue-50/70 dark:bg-blue-955/30" 
                                : "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-955/20"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSystemLink(s.id)}
                                className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                              />
                              <div>
                                <span className="font-bold text-slate-900 dark:text-white block">{s.name}</span>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                                  <span>Status: <strong>{s.status?.value || s.status}</strong></span>
                                  <span>•</span>
                                  <span>{s.classification?.value || s.classification}</span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right font-mono">
                              <span className="font-bold text-emerald-600 block">{formatPHP(s.proposed_cost)}</span>
                              {isAlreadyLinkedOther ? (
                                <span className="text-[9px] text-amber-600 font-bold block">Assigned Other</span>
                              ) : isSelected ? (
                                <span className="text-[9px] text-emerald-600 font-bold block">✓ Assigned</span>
                              ) : (
                                <span className="text-[9px] text-slate-400 block">Unlinked</span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-955">
              <span className="text-[11px] text-slate-500">
                Saving will update all foreign keys and recalculate total project costs.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLinkingProject(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveProjectLinks}
                  disabled={savingLinks}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl cursor-pointer shadow-sm text-xs flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingLinks ? "Saving Linkages..." : "Save Linkages"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE / EDIT PROJECT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <FolderKanban className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>{editingId ? "Update ICT Project Parameters" : "Create Strategic ICT Project (Part III.E)"}</span>
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">
                  DICT v.2026 Architectural Alignment &amp; Dynamic Horizon Sequencer
                </span>
              </div>
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              
              {/* Linked Information System Dropdown */}
              <div className="space-y-1.5 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Link to Primary Information System (Architecture Provenance)</span>
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">Parts II.C &amp; III.D</span>
                </label>

                <select
                  value={form.system_id}
                  onChange={e => setForm({ ...form, system_id: e.target.value })}
                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none cursor-pointer font-semibold text-xs"
                >
                  <option value="">-- Standalone (Network / Facility / Non-System Project) --</option>
                  
                  <optgroup label="Part III.D Proposed Systems (Qualifies for ₱2M Outlay Gate)" className="text-emerald-700 dark:text-emerald-400 font-bold bg-white dark:bg-slate-900">
                    {systems
                      .filter(s => (s.status?.value || s.status || "").toLowerCase().includes("development") || (s.status?.value || s.status || "").toLowerCase().includes("enhancement"))
                      .map(s => (
                        <option key={s.id} value={s.id} className="text-slate-800 dark:text-slate-200 font-normal">
                          [{s.status?.value || s.status}] {s.name} ({s.classification?.value || s.classification})
                        </option>
                      ))}
                  </optgroup>

                  <optgroup label="Part II.C Operational Systems" className="text-blue-700 dark:text-blue-400 font-bold bg-white dark:bg-slate-900">
                    {systems
                      .filter(s => (s.status?.value || s.status || "").toLowerCase() === "operational")
                      .map(s => (
                        <option key={s.id} value={s.id} className="text-slate-800 dark:text-slate-200 font-normal">
                          [Operational] {s.name} ({s.classification?.value || s.classification})
                        </option>
                      ))}
                  </optgroup>
                </select>

                {modalSelectedSystem && (
                  <div className="mt-2 p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1 font-mono text-[10px]">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Classification:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{modalSelectedSystem.classification?.value || modalSelectedSystem.classification}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Hosting &amp; Strategy:</span>
                      <span className="text-slate-700 dark:text-slate-300">{modalSelectedSystem.hosting_type?.value || modalSelectedSystem.hosting_type} &bull; {modalSelectedSystem.development_strategy?.value || modalSelectedSystem.development_strategy}</span>
                    </div>
                  </div>
                )}

                {modalPiaWarning && (
                  <div className="mt-2 p-2.5 bg-amber-50 dark:bg-amber-955/30 border border-amber-300 dark:border-amber-900/60 rounded-lg text-amber-900 dark:text-amber-300 text-[10.5px] leading-relaxed flex items-start gap-1.5">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                    <span>
                      <strong>Privacy Act Compliance Requirement:</strong> System '{modalSelectedSystem.name}' processes personal information without a completed PIA. Ensure at least one milestone deliverable below schedules a <strong>Privacy Impact Assessment (PIA)</strong> phase.
                    </span>
                  </div>
                )}
              </div>

              {/* Title & Category (Integrated with Dynamic Strategic Categories) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Project Title</label>
                  <input
                    type="text" required value={form.project_title} onChange={e => setForm({ ...form, project_title: e.target.value })}
                    placeholder="e.g. Enterprise Portal Modernization and GovCloud Migration"
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Portfolio Category</label>
                    <Link
                      to="/admin/categorizations"
                      className="text-[9px] text-blue-600 dark:text-blue-400 hover:underline font-mono"
                    >
                      + Add New Category
                    </Link>
                  </div>
                  <select
                    value={form.project_category} onChange={e => setForm({ ...form, project_category: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 cursor-pointer outline-none focus:border-blue-500 font-semibold text-xs"
                  >
                    <option value="Internal ICT Projects">Internal ICT Projects (Part III.E.1)</option>
                    <option value="Cross-Agency ICT Projects">Cross-Agency ICT Projects (Part III.E.2)</option>
                    {strategicCategories
                      .filter(sc => !["Internal ICT Projects", "Cross-Agency ICT Projects"].includes(sc.name))
                      .map(sc => (
                        <option key={sc.id || sc.code} value={sc.name}>
                          {sc.name} {sc.is_project_linked ? "(Project-Linked)" : ""}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Description</label>
                <textarea
                  rows={2} required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="High-level technical overview of the digital transformation initiative..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none outline-none focus:border-blue-500 leading-relaxed text-xs"
                />
              </div>

              {/* Objectives */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Project Objectives (The "Why")</label>
                <textarea
                  rows={2} required value={form.objectives} onChange={e => setForm({ ...form, objectives: e.target.value })}
                  placeholder="Specific operational pain points and performance targets this project resolves..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none outline-none focus:border-blue-500 leading-relaxed text-xs"
                />
              </div>

              {/* Implementing Unit & Fund Source */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Implementing Unit</label>
                  <input
                    type="text" required value={form.implementing_unit} onChange={e => setForm({ ...form, implementing_unit: e.target.value })}
                    placeholder="e.g. Information and Communications Technology Division"
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Funding Source</label>
                  <select
                    value={form.funding_source} onChange={e => setForm({ ...form, funding_source: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 cursor-pointer outline-none focus:border-blue-500"
                  >
                    <option value="General Appropriations Act (GAA)">General Appropriations Act (GAA)</option>
                    <option value="Foreign-Assisted Projects (FAP)">Foreign-Assisted Projects (FAP)</option>
                    <option value="Locally Funded">Locally Funded Special Grant</option>
                    <option value="Other Income Generating Sources">Other Income / Retained Earnings</option>
                  </select>
                </div>
              </div>

              {/* Dynamic Planning Horizon Bounds & Presets */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex flex-wrap justify-between items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    Project Horizon Duration Bounds
                  </span>
                  <div className="flex items-center gap-1 font-mono text-[9px]">
                    <span className="text-slate-400">Presets:</span>
                    <button
                      type="button"
                      onClick={() => applyHorizonPreset(2)}
                      className="px-2 py-0.5 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 hover:border-blue-400 text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      2 Years
                    </button>
                    <button
                      type="button"
                      onClick={() => applyHorizonPreset(3)}
                      className="px-2 py-0.5 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 hover:border-blue-400 text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      3 Years (Std)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyHorizonPreset(4)}
                      className="px-2 py-0.5 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 hover:border-blue-400 text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      4 Years
                    </button>
                    <button
                      type="button"
                      onClick={() => applyHorizonPreset(5)}
                      className="px-2 py-0.5 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 hover:border-blue-400 text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      5 Years
                    </button>
                    <button
                      type="button"
                      onClick={handleSyncDurationToCycle}
                      className="px-2 py-0.5 bg-blue-50 dark:bg-blue-955 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800 font-bold hover:bg-blue-100 cursor-pointer ml-1"
                    >
                      Sync Cycle
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9.5px] uppercase font-bold text-slate-500">Duration Start Year</label>
                    <input
                      type="number"
                      required
                      value={form.duration_start_year}
                      onChange={e => {
                        const start = parseInt(e.target.value, 10) || 2028;
                        setForm(prev => ({ ...prev, duration_start_year: start }));
                      }}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-center text-slate-900 dark:text-white font-mono font-bold text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9.5px] uppercase font-bold text-slate-500">Duration End Year</label>
                    <input
                      type="number"
                      required
                      value={form.duration_end_year}
                      onChange={e => {
                        const end = parseInt(e.target.value, 10) || 2030;
                        setForm(prev => ({ ...prev, duration_end_year: end }));
                      }}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-center text-slate-900 dark:text-white font-mono font-bold text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Cross Agency Parameters */}
              {form.project_category === "Cross-Agency ICT Projects" && (
                <div className="p-3 bg-purple-50 dark:bg-purple-955/20 border border-purple-200 dark:border-purple-900/40 rounded-xl space-y-2 animate-fadeIn">
                  <span className="text-[10px] uppercase font-bold text-purple-800 dark:text-purple-400">Cross-Agency Partnerships (III.E.2)</span>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text" placeholder="Lead Agency (e.g. DICT)"
                      value={form.lead_agency} onChange={e => setForm({ ...form, lead_agency: e.target.value })}
                      className="p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs"
                    />
                    <input
                      type="text" placeholder="Partner Agencies (e.g. DBM, BTr, DOH)"
                      value={form.partner_agencies} onChange={e => setForm({ ...form, partner_agencies: e.target.value })}
                      className="p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Strategic Alignment Checklists with 'Others (Specify)' Support */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 block font-mono">
                  National Strategic Alignment (Part III.E)
                </span>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px]">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={form.aligns_pip} onChange={e => setForm({ ...form, aligns_pip: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>Public Investment (PIP)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={form.aligns_ncsp} onChange={e => setForm({ ...form, aligns_ncsp: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>Cybersecurity (NCSP)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={form.aligns_egmp} onChange={e => setForm({ ...form, aligns_egmp: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>E-Gov Plan (EGMP)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={form.aligns_pcb} onChange={e => setForm({ ...form, aligns_pcb: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>Convergence (PCB)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={form.aligns_others} onChange={e => setForm({ ...form, aligns_others: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>Others (Specify)</span>
                  </label>
                </div>

                {form.aligns_others && (
                  <div className="pt-2 animate-fadeIn space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                      <span>Specify Strategic Framework / Policy Directive</span>
                      <span className="text-[9px] text-rose-500 font-bold">*Required</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={form.aligns_others_specify}
                      onChange={e => setForm({ ...form, aligns_others_specify: e.target.value })}
                      placeholder="e.g. Commission Directive on Institutional Cloud Migration"
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500 font-semibold"
                    />
                  </div>
                )}
              </div>

              {/* DYNAMIC HARMONIZATION FRAMEWORK CRITERIA BUILDER */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 block font-mono">
                    Dynamic Harmonization Framework Criteria
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const allTrue = {};
                        modalCriteriaList.forEach(c => { allTrue[c.name] = true; });
                        setForm(prev => ({ ...prev, harmonization_criteria: allTrue }));
                      }}
                      className="text-[9.5px] text-blue-600 hover:underline font-mono cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        const mandOnly = {};
                        modalCriteriaList.forEach(c => { mandOnly[c.name] = Boolean(c.is_mandatory); });
                        setForm(prev => ({ ...prev, harmonization_criteria: mandOnly }));
                      }}
                      className="text-[9.5px] text-purple-600 hover:underline font-mono cursor-pointer"
                    >
                      Mandatory Only
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                  {modalCriteriaList.map(criterion => {
                    const isChecked = Boolean(form.harmonization_criteria?.[criterion.name]);
                    return (
                      <div 
                        key={criterion.id || criterion.name} 
                        className={`flex items-start justify-between p-2 rounded-lg border transition-all ${
                          isChecked 
                            ? "bg-purple-50/60 dark:bg-purple-955/30 border-purple-300 dark:border-purple-800 text-purple-900 dark:text-purple-200 font-semibold" 
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <label className="flex items-start gap-2 cursor-pointer select-none flex-1">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleHarmonizationCriterion(criterion.name)}
                            className="w-4 h-4 accent-purple-600 rounded cursor-pointer mt-0.5 shrink-0"
                          />
                          <div className="space-y-0.5">
                            <span className="block text-xs">{criterion.name}</span>
                            {criterion.is_mandatory && (
                              <span className="text-[8.5px] px-1.5 py-0.2 bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 rounded font-bold font-mono uppercase">
                                Required
                              </span>
                            )}
                            {criterion.description && (
                              <span className="text-[9.5px] text-slate-400 block leading-tight">{criterion.description}</span>
                            )}
                          </div>
                        </label>

                        {criterion.is_custom && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomCriterion(criterion.name)}
                            className="text-slate-400 hover:text-rose-500 p-0.5 ml-1 cursor-pointer"
                            title="Remove custom criterion"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add Custom Harmonization Criterion Input */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex gap-2">
                  <input
                    type="text"
                    placeholder="+ Register custom harmonization criterion (e.g. Zero Trust Architecture)..."
                    value={customCriterionInput}
                    onChange={e => setCustomCriterionInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleAddCustomCriterion(e); }}
                    className="flex-1 p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none focus:border-purple-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomCriterion}
                    disabled={!customCriterionInput.trim()}
                    className="px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold rounded-lg cursor-pointer text-xs shrink-0 transition-all"
                  >
                    Add Criterion
                  </button>
                </div>
              </div>

              {/* DYNAMIC MULTI-YEAR DELIVERABLES / MILESTONES SEQUENCER */}
              <div className="space-y-3 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block font-mono">
                    Annual Project Milestones &amp; Deliverables ({modalHorizonYears.length} Years Horizon)
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">
                    FY {modalStartYr} – FY {modalEndYr}
                  </span>
                </div>

                <div 
                  className="grid gap-3"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${Math.min(modalHorizonYears.length, 3)}, minmax(0, 1fr))`
                  }}
                >
                  {modalHorizonYears.map((yr, idx) => (
                    <div key={yr} className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[9.5px] uppercase font-bold text-slate-600 dark:text-slate-400">
                          Year {idx + 1} ({yr})
                        </label>
                        {form.annual_deliverables?.[String(yr)] ? (
                          <span className="text-[8.5px] text-emerald-600 font-bold font-mono">✓ Configured</span>
                        ) : (
                          <span className="text-[8.5px] text-amber-500 font-bold font-mono">Empty</span>
                        )}
                      </div>
                      <textarea
                        rows={3}
                        required={idx === 0}
                        value={form.annual_deliverables?.[String(yr)] || ""}
                        onChange={e => handleAnnualDeliverableChange(yr, idx + 1, e.target.value)}
                        placeholder={`Key deliverables, architecture milestones, or targets for FY ${yr}...`}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white resize-none outline-none focus:border-blue-500 leading-relaxed text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[10.5px] text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Financial Provenance Notice:</strong> The total project cost is dynamically aggregated by the compliance engine from linked resource outlays in <em>Part IV.A (Detailed Resource Deployment)</em> and linked Information Systems.
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Preserving..." : editingId ? "Update Project Portfolio" : "Save ICT Project"}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
