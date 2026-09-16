// frontend/src/api/admin.js

const rawRoot = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
export const API_BASE_URL = rawRoot.endsWith("/") ? rawRoot.slice(0, -1) : rawRoot;

/**
 * Enhanced error parsing handler that formats Pydantic validation arrays
 * and DICT Singularity DAG violation envelopes into human-readable messages.
 */
async function handleResponse(res, errorMessage) {
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    let detailMessage = "";

    if (errorData.detail) {
      if (typeof errorData.detail === "string") {
        detailMessage = errorData.detail;
      } else if (Array.isArray(errorData.detail)) {
        // Format Pydantic field-level validation errors
        detailMessage = errorData.detail
          .map(err => `${err.loc ? err.loc.filter(p => p !== "body").join(" -> ") + ": " : ""}${err.msg || JSON.stringify(err)}`)
          .join(" | ");
      } else if (typeof errorData.detail === "object") {
        // Format DICT Singularity Engine violations list
        if (Array.isArray(errorData.detail.violations)) {
          detailMessage = `${errorData.detail.error || "Integrity Violation"}: ${errorData.detail.violations.join(" | ")}`;
        } else {
          detailMessage = JSON.stringify(errorData.detail);
        }
      }
    } else if (errorData.message) {
      detailMessage = errorData.message;
    }

    throw new Error(detailMessage || `${errorMessage} (HTTP ${res.status})`);
  }
  if (res.status === 204) {
    return null;
  }
  return res.json();
}

/**
 * Resolves standard authorization and content-type headers.
 * Safely falls back to localStorage if the token argument is omitted.
 */
const getHeaders = (token, isMultipart = false) => {
  const resolvedToken = token || (typeof window !== "undefined" ? localStorage.getItem("access_token") : null);
  const headers = {};

  if (resolvedToken) {
    headers["Authorization"] = `Bearer ${resolvedToken}`;
  }
  if (!isMultipart) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
};

// ==========================================================
// 1. BUDGET CEILINGS & PRE-FLIGHT GOVERNANCE
// ==========================================================

export const getBudgetCeilings = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/budget-ceilings`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load budget ceilings");
};

export const updateBudgetCeiling = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/budget-ceilings`, {
    method: "POST", 
    headers: getHeaders(token), 
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update budget ceiling");
};

export const updateGlobalBudgetCeiling = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/global-budget-ceiling`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update global budget ceiling");
};

export const validateBudgetPreflight = async (token, cycle = "") => {
  const params = new URLSearchParams();
  if (cycle) params.append("issp_period", cycle);
  const qs = params.toString();
  const url = `${API_BASE_URL}/api/admin/budget-validation${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: getHeaders(token) });
  return handleResponse(res, "Pre-flight budget validation failed");
};

// ==========================================================
// 2. PART I.A.4: ORGANIZATIONAL OUTCOMES (BROADER SCOPE)
// ==========================================================

export const getOutcomes = async (token, cycle = "") => {
  const params = new URLSearchParams();
  if (cycle) params.append("issp_period", cycle);
  const qs = params.toString();
  const url = `${API_BASE_URL}/api/admin/outcomes${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: getHeaders(token) });
  return handleResponse(res, "Failed to load organizational outcomes");
};

export const createOutcome = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/outcomes`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create organizational outcome");
};

export const deleteOutcome = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/outcomes/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete organizational outcome");
};

// ==========================================================
// 3. PART I.B & I.C: HUMAN CAPITAL & STAKEHOLDERS
// ==========================================================

export const getHumanCapitals = async (token, cycle) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/human-capitals`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load human capital staffing matrix");
};

export const createHumanCapital = async (token, cycle, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/human-capitals`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to record human capital entry");
};

export const updateHumanCapital = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/human-capitals/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update human capital entry");
};

export const deleteHumanCapital = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/human-capitals/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete human capital entry");
};

export const getStakeholders = async (token, cycle) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/stakeholders`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load stakeholders matrix");
};

export const createStakeholder = async (token, cycle, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/stakeholders`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to record stakeholder analysis");
};

export const updateStakeholder = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/stakeholders/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update stakeholder analysis");
};

export const deleteStakeholder = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/stakeholders/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete stakeholder analysis");
};

// ==========================================================
// 4. PART II.A: STRATEGIC CONCERNS & NEEDS INTAKE POOL
// ==========================================================

export const getStrategicConcerns = async (token, cycle) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/concerns`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load strategic concerns");
};

export const createStrategicConcern = async (token, cycle, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/concerns`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to record strategic concern");
};

export const updateStrategicConcern = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/concerns/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update strategic concern");
};

export const deleteStrategicConcern = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/concerns/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete strategic concern");
};

export const getAllNeedsAssessments = async (token, params = {}) => {
  const query = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/api/admin/needs-assessments${query ? `?${query}` : ""}`;
  const res = await fetch(url, { headers: getHeaders(token) });
  return handleResponse(res, "Failed to load department needs assessments");
};

export const aggregateNeedsToStrategicConcern = async (token, payload, cycle = "") => {
  const qs = cycle ? `?issp_period=${encodeURIComponent(cycle)}` : "";
  const res = await fetch(`${API_BASE_URL}/api/admin/concerns/aggregate-from-needs${qs}`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to aggregate needs assessment into strategic concern");
};

// ==========================================================
// 5. PART II.B & III.A: NETWORK INFRASTRUCTURE & CYBERSECURITY
// ==========================================================

export const getNetworkInfrastructures = async (token, cycle = "", isProposed = null) => {
  const params = new URLSearchParams();
  if (cycle) params.append("issp_period", cycle);
  if (isProposed !== null && isProposed !== undefined) params.append("is_proposed", String(isProposed));
  const qs = params.toString();
  const url = `${API_BASE_URL}/api/admin/network-infrastructures${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: getHeaders(token) });
  return handleResponse(res, "Failed to load network infrastructure profiles");
};

export const createNetworkInfrastructure = async (token, payload, cycle = "") => {
  const params = new URLSearchParams();
  if (cycle) params.append("issp_period", cycle);
  const qs = params.toString();
  const url = `${API_BASE_URL}/api/admin/network-infrastructures${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create network infrastructure setup");
};

export const updateNetworkInfrastructure = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/network-infrastructures/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update network infrastructure setup");
};

export const deleteNetworkInfrastructure = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/network-infrastructures/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete network infrastructure setup");
};

export const getCybersecurityControls = async (token, cycle = "", isProposed = null, domain = "") => {
  const params = new URLSearchParams();
  if (cycle) params.append("issp_period", cycle);
  if (isProposed !== null && isProposed !== undefined) params.append("is_proposed", String(isProposed));
  if (domain && domain !== "All") params.append("control_domain", domain);
  const qs = params.toString();
  const url = `${API_BASE_URL}/api/admin/cybersecurity-controls${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: getHeaders(token) });
  return handleResponse(res, "Failed to load cybersecurity controls");
};

export const createCybersecurityControl = async (token, payload, cycle = "") => {
  const params = new URLSearchParams();
  if (cycle) params.append("issp_period", cycle);
  const qs = params.toString();
  const url = `${API_BASE_URL}/api/admin/cybersecurity-controls${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to register cybersecurity control");
};

export const updateCybersecurityControl = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/cybersecurity-controls/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update cybersecurity control");
};

export const deleteCybersecurityControl = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/cybersecurity-controls/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete cybersecurity control");
};

/**
 * Seeds and restores all 29 official DICT Cybersecurity Controls (Mandatory and Optional)
 * across all 7 Security Domains for both Existing and Proposed states.
 */
export const seedDefaultCybersecurityControls = async (token, cycle = "") => {
  const params = new URLSearchParams();
  if (cycle) params.append("issp_period", cycle);
  const qs = params.toString();
  const url = `${API_BASE_URL}/api/admin/cybersecurity-controls/seed-defaults${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to initialize default DICT cybersecurity controls");
};

// ==========================================================
// 6. PART II.C & III.D: INFORMATION SYSTEMS REGISTER
// ==========================================================

export const getInformationSystems = async (token, cycle = "", statusFilter = "") => {
  const params = new URLSearchParams();
  if (cycle) params.append("issp_period", cycle);
  if (statusFilter && statusFilter !== "All") params.append("status_filter", statusFilter);
  const qs = params.toString();
  const url = `${API_BASE_URL}/api/admin/information-systems${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: getHeaders(token) });
  return handleResponse(res, "Failed to load information systems");
};

export const createInformationSystem = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/information-systems`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to register information system");
};

export const updateInformationSystem = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/information-systems/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update information system");
};

export const deleteInformationSystem = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/information-systems/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete information system");
};

// ==========================================================
// 7. PART II.D: E-GOVERNMENT PROGRAMS (EGP) CHECKLIST
// ==========================================================

export const getEgovChecklists = async (token, cycle) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/egov-checklists`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load EGP checklist");
};

export const createEgovChecklist = async (token, cycle, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/egov-checklists`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to record EGP checklist item");
};

export const updateEgovChecklist = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/egov-checklists/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update EGP checklist item");
};

export const deleteEgovChecklist = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/egov-checklists/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete EGP checklist item");
};

// ==========================================================
// 8. PART III.E & III.F: ICT PROJECTS & PMF METRICS
// ==========================================================

/**
 * Retrieves ICT projects with flexible cycle or object parameters.
 */
export const getIctProjects = async (token, cycleOrParams = "", categoryFilter = "") => {
  const params = new URLSearchParams();
  if (typeof cycleOrParams === "object" && cycleOrParams !== null) {
    if (cycleOrParams.issp_period) params.append("issp_period", cycleOrParams.issp_period);
    if (cycleOrParams.category_filter && cycleOrParams.category_filter !== "All") {
      params.append("category_filter", cycleOrParams.category_filter);
    }
  } else {
    if (cycleOrParams) params.append("issp_period", cycleOrParams);
    if (categoryFilter && categoryFilter !== "All") params.append("category_filter", categoryFilter);
  }
  const qs = params.toString();
  const url = `${API_BASE_URL}/api/admin/ict-projects${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: getHeaders(token) });
  return handleResponse(res, "Failed to load ICT projects");
};

/**
 * Creates an ICT project. Seamlessly passes aligns_others and aligns_others_specify.
 */
export const createIctProject = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/ict-projects`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create ICT project");
};

/**
 * Updates an ICT project. Seamlessly preserves aligns_others and aligns_others_specify.
 */
export const updateIctProject = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/ict-projects/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update ICT project");
};

export const deleteIctProject = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/ict-projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete ICT project");
};

export const getCrossProjects = async (token, cycle) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/cross-projects`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load cross-agency projects");
};

export const createCrossProject = async (token, cycle, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/cross-projects`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create cross-agency project");
};

export const updateCrossProject = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/cross-projects/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update cross-agency project");
};

export const deleteCrossProject = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/cross-projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete cross-agency project");
};

export const getPerformanceMetrics = async (token, cycle) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/metrics`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load performance metrics");
};

export const createPerformanceMetric = async (token, cycle, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/metrics`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create performance metric");
};

export const updatePerformanceMetric = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/metrics/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update performance metric");
};

export const deletePerformanceMetric = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/metrics/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete performance metric");
};

export const getStaffPositions = async (token, cycle) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/staff-positions`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load staff positions");
};

export const createStaffPosition = async (token, cycle, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/staff-positions`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to register staff position");
};

export const updateStaffPosition = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/staff-positions/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update staff position");
};

export const deleteStaffPosition = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/staff-positions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete staff position");
};

// ==========================================================
// 9. PART IV.B: LIVE FOUR-WAY PARITY, GOVERNANCE & LIFECYCLE
// ==========================================================

export const getParityMatrices = async (token, cycle = "") => {
  const params = new URLSearchParams();
  if (cycle) params.append("issp_period", cycle);
  const qs = params.toString();
  const url = `${API_BASE_URL}/api/admin/governance/parity-matrices${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: getHeaders(token) });
  return handleResponse(res, "Failed to load four-way parity matrices");
};

export const validateSingularityGraph = async (token, cycle = "") => {
  const params = new URLSearchParams();
  if (cycle) params.append("issp_period", cycle);
  const qs = params.toString();
  const url = `${API_BASE_URL}/api/admin/governance/validate-graph${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: getHeaders(token) });
  return handleResponse(res, "Singularity graph validation failed");
};

export const evaluateLifecycleRollover = async (token, force = false) => {
  const qs = force ? "?force=true" : "";
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/evaluate-lifecycle-rollover${qs}`, {
    method: "POST",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to evaluate cycle rollover status");
};

// ==========================================================
// 10. ANNEX 2: DRBCP (TEAMS, BIA, METRICS)
// ==========================================================

export const getDrTeams = async (token, cycle) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/dr-teams`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load disaster recovery team members");
};

export const createDrTeam = async (token, cycle, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/dr-teams`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to add disaster recovery team member");
};

export const updateDrTeam = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/dr-teams/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update disaster recovery team member");
};

export const deleteDrTeam = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/dr-teams/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete disaster recovery team member");
};

export const getDrBias = async (token, cycle) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/dr-bias`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load BIA records");
};

export const createDrBia = async (token, cycle, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/dr-bias`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to record BIA targets");
};

export const updateDrBia = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/dr-bias/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update BIA targets");
};

export const deleteDrBia = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/dr-bias/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete BIA record");
};

export const getDrMetrics = async (token, cycle) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/dr-metrics`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load DRBCP metrics");
};

export const createDrMetric = async (token, cycle, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/dr-metrics`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to register DRBCP metric");
};

export const updateDrMetric = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/dr-metrics/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update DRBCP metric");
};

export const deleteDrMetric = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/dr-metrics/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete DRBCP metric");
};

// ==========================================================
// 11. MASTER NARRATIVE, COVERSHEET & CYCLE CONTROLS
// ==========================================================

export const getNarrative = async (token, cycle) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load planning narrative");
};

/**
 * Updates the master planning narrative coversheet and statutory parameters.
 * Maps DICT v.2026 dynamic head position (agency_head_position), 
 * DRBCP approval date (drbcp_approval_date), Section 6 MITHI policies (drbcp_compliance_narrative_html),
 * and official co-branding logos (dict_logo_url, bagong_pilipinas_logo_url, agency_logo_url).
 */
export const updateNarrative = async (token, cycle, payload) => {
  const formattedPayload = {
    ...payload,
    agency_head_position: payload.agency_head_position || payload.agency_head_title || payload.head_of_agency_position || undefined,
    drbcp_approval_date: payload.drbcp_approval_date || payload.approval_date || undefined,
    drbcp_compliance_narrative_html: payload.drbcp_compliance_narrative_html || undefined,
    dict_logo_url: payload.dict_logo_url !== undefined ? payload.dict_logo_url : undefined,
    bagong_pilipinas_logo_url: payload.bagong_pilipinas_logo_url !== undefined ? payload.bagong_pilipinas_logo_url : undefined,
    agency_logo_url: payload.agency_logo_url !== undefined ? payload.agency_logo_url : undefined,
    cert_logo_url: payload.cert_logo_url !== undefined ? payload.cert_logo_url : undefined
  };

  // Strip undefined keys to allow backend defaults to handle missing inputs cleanly
  Object.keys(formattedPayload).forEach(key => {
    if (formattedPayload[key] === undefined) {
      delete formattedPayload[key];
    }
  });

  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(formattedPayload)
  });
  return handleResponse(res, "Failed to update master narrative");
};

export const activateCycle = async (token, cycle) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/activate`, {
    method: "POST",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to activate planning cycle");
};

export const resetCycle = async (token, cycle) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/reset`, {
    method: "POST",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to reset planning cycle");
};

/**
 * Uploads a diagram asset or government co-branding seal with optional metadata.
 */
export const uploadDiagram = async (token, cycle, category, file, extraData = {}) => {
  const formData = new FormData();
  formData.append("file", file);
  if (extraData && typeof extraData === "object") {
    Object.entries(extraData).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        formData.append(k, String(v));
      }
    });
  }
  const res = await fetch(
    `${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/upload-diagram?category=${encodeURIComponent(category)}`,
    {
      method: "POST",
      headers: getHeaders(token, true),
      body: formData
    }
  );
  return handleResponse(res, "Failed to upload diagram");
};

// ==========================================================
// 12. MASTER QUEUES, OVERRIDES & PROPOSALS
// ==========================================================

export const getProposalsQueue = async (token, params = {}) => {
  const query = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/api/admin/proposals${query ? `?${query}` : ""}`;
  const res = await fetch(url, { headers: getHeaders(token) });
  return handleResponse(res, "Failed to load master proposals queue");
};

export const getSubscriptionsQueue = async (token, params = {}) => {
  const query = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/api/admin/subscriptions${query ? `?${query}` : ""}`;
  const res = await fetch(url, { headers: getHeaders(token) });
  return handleResponse(res, "Failed to load subscriptions queue");
};

/**
 * Creates a resource proposal line item in Part IV.A.
 * Seamlessly accepts needs_assessment_id for Section 8.0 provenance.
 */
export const createProposal = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/proposals`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create proposal");
};

export const updateProposal = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/proposals/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update proposal");
};

export const deleteProposal = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/proposals/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete proposal");
};

export const approveProposal = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/proposals/${encodeURIComponent(id)}/approve`, {
    method: "PUT",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to approve proposal");
};

export const returnProposal = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/proposals/${encodeURIComponent(id)}/return`, {
    method: "PUT",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to return proposal");
};

/**
 * Executes an administrative override on a proposal line item.
 * Supports needs_assessment_id, category, strategic_category, and custom quantities.
 */
export const overrideProposal = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/proposals/${encodeURIComponent(id)}/override`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to override proposal");
};

export const getApprovedCanvasProposals = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/proposals/approved-canvas`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load approved proposals with quotations");
};

// ==========================================================
// 13. COMPILATION, AUDIT LOGS, VAULT & ANALYTICS
// ==========================================================

export const triggerDocumentGeneration = async (token, cycle = "") => {
  const params = new URLSearchParams();
  if (cycle) params.append("issp_period", cycle);
  const qs = params.toString();
  const url = `${API_BASE_URL}/api/admin/governance/generate-issp${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to trigger ISSP compilation");
};

export const getTaskStatus = async (token, taskId) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/task-status/${encodeURIComponent(taskId)}`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to query compilation task status");
};

export const restoreGovernanceDocument = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/restore-document`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to initiate Glacier document restoration");
};

export const getDashboardMetrics = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/dashboard-metrics`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load dashboard metrics");
};

export const getDepartmentAnalytics = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/department-analytics`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load department analytics");
};

/**
 * Retrieves immutable COA audit logs supporting module and department filtering.
 */
export const getAuditLogs = async (token, params = {}) => {
  const query = new URLSearchParams();
  if (typeof params === "object" && params !== null) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "" && v !== "All") {
        query.append(k, String(v));
      }
    });
  } else if (typeof params === "string" && params && params !== "All") {
    query.append("module", params);
  }
  const qs = query.toString();
  const url = `${API_BASE_URL}/api/admin/audit-logs${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load COA audit logs");
};

// ==========================================================
// 14. DOCUMENT TREE HIERARCHY (DICT RICT STANDARD)
// ==========================================================

export const getDocumentTree = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/issp/document-tree`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load document skeletal hierarchy");
};

export const createDocumentNode = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/issp/nodes`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create document node");
};

export const updateDocumentNode = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/issp/nodes/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update document node");
};

export const deleteDocumentNode = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/issp/nodes/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete document node");
};

export const reorderDocumentNodes = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/issp/reorder`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to reorder document nodes");
};

export const uploadDocumentAsset = async (token, nodeId, assetRole, file, customTitle = null, aspectPreserve = true) => {
  const formData = new FormData();
  formData.append("file", file);
  
  let url = `${API_BASE_URL}/api/admin/issp/assets?node_id=${encodeURIComponent(nodeId)}&asset_role=${encodeURIComponent(assetRole)}&aspect_ratio_preserve=${Boolean(aspectPreserve)}`;
  if (customTitle) {
    url += `&custom_title=${encodeURIComponent(customTitle)}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(token, true),
    body: formData
  });
  return handleResponse(res, "Failed to upload document asset");
};

// ==========================================================
// 15. REFERENCE PRICING CATALOG
// ==========================================================

export const getCatalogItems = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/catalog`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load catalog items");
};

export const createCatalogItem = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/catalog`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create catalog item");
};

export const updateCatalogItem = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/catalog/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update catalog item");
};

// ==========================================================
// 16. DEPARTMENTS DIRECTORY
// ==========================================================

export const getDepartments = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/departments`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load departments");
};

export const createDepartment = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/departments`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create department");
};

export const updateDepartment = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/departments/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update department");
};

export const deleteDepartment = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/departments/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete department");
};

// ==========================================================
// 17. USER WHITELISTING & ACCESS CONTROL (100% CREDENTIAL-BASED)
// ==========================================================

export const getWhitelistedUsers = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/users/whitelist`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load whitelisted users");
};

/**
 * Manually onboards an institutional user.
 * Mandates initial password (min 8 chars) and supports ROLE_SUPPLY_USER.
 */
export const addWhitelistedUser = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/users/whitelist`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to onboard and whitelist user");
};

export const updateWhitelistedUser = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/users/whitelist/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update whitelisted user");
};

export const deleteWhitelistedUser = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/users/whitelist/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete whitelisted user");
};

// ==========================================================
// 18. CAMPUSES
// ==========================================================

export const getCampuses = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/campuses`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load campuses");
};

export const createCampus = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/campuses`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create campus");
};

export const updateCampus = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/campuses/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update campus");
};

export const deleteCampus = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/campuses/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete campus");
};

// ==========================================================
// 19. GLOSSARY (DEFINITION OF TERMS)
// ==========================================================

export const getGlossary = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/glossary`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load glossary");
};

export const createGlossaryTerm = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/glossary`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create term");
};

export const updateGlossaryTerm = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/glossary/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update term");
};

export const deleteGlossaryTerm = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/glossary/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete term");
};

// ==========================================================
// 20. GENERAL INSTRUCTIONS
// ==========================================================

export const getInstructions = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/instructions`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load instructions");
};

export const createInstruction = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/instructions`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create instruction");
};

export const updateInstruction = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/instructions/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update instruction");
};

export const deleteInstruction = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/instructions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete instruction");
};

// ==========================================================
// 21. AUXILIARY INVENTORY CENSUS & CONTINUING COSTS
// ==========================================================

export const getServerCapacities = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/server-capacities`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load server capacities");
};

export const createServerCapacity = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/server-capacities`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to record server capacity");
};

export const deleteServerCapacity = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/server-capacities/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete server capacity");
};

export const getOsCensus = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/os-census`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load OS census");
};

export const createOsCensusRecord = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/os-census`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to record OS entry");
};

export const updateOsCensusRecord = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/os-census/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update OS entry");
};

export const deleteOsCensusRecord = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/os-census/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete OS entry");
};

export const getSoftwareCensus = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/software-census`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load software census");
};

export const createSoftwareCensus = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/software-census`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to record software entry");
};

export const deleteSoftwareCensus = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/software-census/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete software entry");
};

export const getAnnualCosts = async (token, cycle) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/costs`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load annual cost matrices");
};

export const createAnnualCost = async (token, cycle, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/costs`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to record annual cost entry");
};

export const deleteAnnualCost = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/costs/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete annual cost entry");
};

// ==========================================================
// 22. ANNEX 1: MASTER ASSET INVENTORY (ADMIN & SUPPLY ACCESS)
// ==========================================================

export const getMasterInventory = async (token, params = {}) => {
  const query = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/api/supply/inventory${query ? `?${query}` : ""}`;
  const res = await fetch(url, { headers: getHeaders(token) });
  return handleResponse(res, "Failed to load master asset inventory");
};

export const getAnnex1Summary = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/supply/inventory/annex1-summary`, {
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to compile Annex 1 inventory summary");
};

/**
 * Registers an inventory item directly to Annex 1 with DICT Standard Category support.
 * Payload supports `dict_category` and `other_category_name`.
 */
export const createInventoryItem = async (token, payload) => {
  const formattedPayload = {
    ...payload,
    dict_category: payload.dict_category || undefined,
    other_category_name: payload.other_category_name || undefined
  };

  const res = await fetch(`${API_BASE_URL}/api/supply/inventory`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(formattedPayload)
  });
  return handleResponse(res, "Failed to record asset into Annex 1 inventory");
};

/**
 * Updates an inventory item in Annex 1 with DICT Standard Category support.
 * Payload supports `dict_category` and `other_category_name`.
 */
export const updateInventoryItem = async (token, id, payload) => {
  const formattedPayload = {
    ...payload,
    dict_category: payload.dict_category || undefined,
    other_category_name: payload.other_category_name || undefined
  };

  const res = await fetch(`${API_BASE_URL}/api/supply/inventory/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(formattedPayload)
  });
  return handleResponse(res, "Failed to update asset in Annex 1 inventory");
};

export const deleteInventoryItem = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/supply/inventory/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete asset from inventory");
};