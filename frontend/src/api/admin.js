// frontend/src/api/admin.js
import { API_BASE_URL, handleResponse, getStoredToken } from "./apiClient.js";

// Re-export API_BASE_URL so existing modules importing it from admin.js remain fully compatible
export { API_BASE_URL };

/**
 * Resolves standard authorization and content-type headers.
 * Safely falls back to stored tokens if the explicit token parameter is omitted.
 *
 * @param {string|null} token - Optional explicit Bearer JWT
 * @param {boolean} isMultipart - If true, omits Content-Type so browser sets boundary
 * @returns {Record<string, string>}
 */
const getHeaders = (token, isMultipart = false) => {
  const resolvedToken = token || getStoredToken() || (typeof window !== "undefined" ? (localStorage.getItem("access_token") || localStorage.getItem("token")) : null);
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

export const getBudgetCeilings = async (token, cycle = "") => {
  const params = new URLSearchParams();
  if (cycle) params.append("issp_period", cycle);
  const qs = params.toString();
  const url = `${API_BASE_URL}/api/admin/budget-ceilings${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { 
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
// 2. GOVERNANCE POLICIES, INFLATION ADJUSTMENT & DBM CSV EXPORT
// ==========================================================

export const getPolicySettings = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/policy-settings`, {
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to load governance policy settings");
};

export const updatePolicySettings = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/policy-settings`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update governance policy settings");
};

export const getInflationSettings = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/inflation-settings`, {
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to load annual inflation buffer settings");
};

export const updateInflationSettings = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/inflation-settings`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update annual inflation buffer settings");
};

export const exportBudgetBlob = async (token, cycle = "") => {
  const params = new URLSearchParams();
  if (cycle) params.append("issp_period", cycle);
  const qs = params.toString();
  const url = `${API_BASE_URL}/api/admin/governance/export-budget-csv${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: getHeaders(token) });
  if (!res.ok) {
    throw new Error(`Failed to export DBM budget CSV (HTTP ${res.status})`);
  }
  return res.blob();
};

export const getExportBudgetCsvUrl = (cycle = "") => {
  const params = new URLSearchParams();
  if (cycle) params.append("issp_period", cycle);
  const qs = params.toString();
  return `${API_BASE_URL}/api/admin/governance/export-budget-csv${qs ? `?${qs}` : ""}`;
};

// ==========================================================
// 3. DYNAMIC STRATEGIC CATEGORIES (PART IV.A & TABLE B.1)
// ==========================================================

export const getStrategicCategories = async (token, params = {}) => {
  const query = new URLSearchParams();
  if (typeof params === "object" && params !== null) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        query.append(k, String(v));
      }
    });
  } else if (typeof params === "string" && params) {
    query.append("issp_period", params);
  }
  const qs = query.toString();
  let res = await fetch(`${API_BASE_URL}/api/admin/strategic-categories${qs ? `?${qs}` : ""}`, {
    headers: getHeaders(token)
  });
  if (res.status === 404) {
    res = await fetch(`${API_BASE_URL}/api/admin/governance/strategic-categories${qs ? `?${qs}` : ""}`, {
      headers: getHeaders(token)
    });
  }
  return handleResponse(res, "Failed to load strategic categories");
};

export const createStrategicCategory = async (token, payload) => {
  let res = await fetch(`${API_BASE_URL}/api/admin/strategic-categories`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  if (res.status === 404) {
    res = await fetch(`${API_BASE_URL}/api/admin/governance/strategic-categories`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify(payload)
    });
  }
  return handleResponse(res, "Failed to create strategic category");
};

export const updateStrategicCategory = async (token, id, payload) => {
  let res = await fetch(`${API_BASE_URL}/api/admin/strategic-categories/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  if (res.status === 404) {
    res = await fetch(`${API_BASE_URL}/api/admin/governance/strategic-categories/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: getHeaders(token),
      body: JSON.stringify(payload)
    });
  }
  return handleResponse(res, "Failed to update strategic category");
};

export const deleteStrategicCategory = async (token, id) => {
  let res = await fetch(`${API_BASE_URL}/api/admin/strategic-categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  if (res.status === 404) {
    res = await fetch(`${API_BASE_URL}/api/admin/governance/strategic-categories/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: getHeaders(token)
    });
  }
  return handleResponse(res, "Failed to delete strategic category");
};

// ==========================================================
// 4. DYNAMIC UACS / OBJECT OF EXPENDITURE CATALOG (TABLE B.4)
// ==========================================================

export const getUacsCatalog = async (token, params = {}) => {
  const query = new URLSearchParams();
  if (typeof params === "object" && params !== null) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "" && v !== "all" && v !== "All") {
        query.append(k, String(v));
      }
    });
  }
  const qs = query.toString();
  const url = `${API_BASE_URL}/api/admin/uacs-catalog${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to load UACS catalog");
};

export const createUacsEntry = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/uacs-catalog`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create UACS object code entry");
};

export const updateUacsEntry = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/uacs-catalog/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update UACS object code entry");
};

export const deleteUacsEntry = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/uacs-catalog/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete UACS object code entry");
};

/**
 * Assigns an explicit UACS Object Code and Expenditure Class to a proposal line item.
 * Directly updates Table B.4 accounting linkage.
 */
export const assignProposalUacs = async (token, proposalId, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/proposals/${encodeURIComponent(proposalId)}/uacs`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to assign UACS object code to proposal");
};

// ==========================================================
// 5. DYNAMIC HARMONIZATION CRITERIA, DEVELOPMENT STRATEGIES & DYNAMIC FUND SOURCES
// ==========================================================

export const getHarmonizationCriteria = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/harmonization-criteria`, {
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to load harmonization framework criteria");
};

export const createHarmonizationCriterion = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/harmonization-criteria`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create harmonization criterion");
};

export const updateHarmonizationCriterion = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/harmonization-criteria/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update harmonization criterion");
};

export const deleteHarmonizationCriterion = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/harmonization-criteria/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete harmonization criterion");
};

export const getDevelopmentStrategies = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/development-strategies`, {
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to load development strategies");
};

export const createDevelopmentStrategy = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/development-strategies`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to register development strategy");
};

export const deleteDevelopmentStrategy = async (token, code) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/development-strategies/${encodeURIComponent(code)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete development strategy");
};

export const getFundSources = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/fund-sources`, {
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to load fund sources");
};

export const createFundSource = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/fund-sources`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create fund source");
};

export const deleteFundSource = async (token, code) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/fund-sources/${encodeURIComponent(code)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete fund source");
};

// ==========================================================
// 6. PART I.A.4: ORGANIZATIONAL OUTCOMES (BROADER SCOPE)
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

export const updateOutcome = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/outcomes/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update organizational outcome");
};

export const deleteOutcome = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/outcomes/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete organizational outcome");
};

// ==========================================================
// 7. PART I.B & I.C: HUMAN CAPITAL & STAKEHOLDERS
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

export const getStakeholders = async (token, cycle = "") => {
  const url = cycle 
    ? `${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/stakeholders`
    : `${API_BASE_URL}/api/admin/stakeholders`;
  const res = await fetch(url, { headers: getHeaders(token) });
  return handleResponse(res, "Failed to load stakeholders matrix");
};

export const createStakeholder = async (token, cycleOrPayload, maybePayload = null) => {
  let url = `${API_BASE_URL}/api/admin/stakeholders`;
  let body = cycleOrPayload;

  if (typeof cycleOrPayload === "string" && maybePayload) {
    url = `${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycleOrPayload)}/stakeholders`;
    body = maybePayload;
  } else if (typeof cycleOrPayload === "object" && cycleOrPayload?.issp_period) {
    url = `${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycleOrPayload.issp_period)}/stakeholders`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(body)
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
// 8. PART II.A: STRATEGIC CONCERNS & NEEDS INTAKE POOL
// ==========================================================

export const getStrategicConcerns = async (token, cycle) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/concerns`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load strategic concerns");
};

export const createStrategicConcern = async (token, cycle, payload) => {
  const formattedPayload = {
    ...payload,
    outcome_id: payload.outcome_id ? parseInt(payload.outcome_id, 10) : null,
    order_index: payload.order_index ? parseInt(payload.order_index, 10) : 0
  };
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/concerns`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(formattedPayload)
  });
  return handleResponse(res, "Failed to record strategic concern");
};

export const updateStrategicConcern = async (token, id, payload) => {
  const formattedPayload = {
    ...payload,
    outcome_id: payload.outcome_id ? parseInt(payload.outcome_id, 10) : null,
    order_index: payload.order_index ? parseInt(payload.order_index, 10) : 0
  };
  const res = await fetch(`${API_BASE_URL}/api/admin/concerns/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(formattedPayload)
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
  const formattedPayload = {
    ...payload,
    outcome_id: payload.outcome_id ? parseInt(payload.outcome_id, 10) : null,
    order_index: payload.order_index ? parseInt(payload.order_index, 10) : 1
  };
  const res = await fetch(`${API_BASE_URL}/api/admin/concerns/aggregate-from-needs${qs}`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(formattedPayload)
  });
  return handleResponse(res, "Failed to aggregate needs assessment into strategic concern");
};

// ==========================================================
// 9. PART II.B & III.A: NETWORK INFRASTRUCTURE & CYBERSECURITY
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
  if (domain && domain !== "All" && domain !== "all") params.append("control_domain", domain);
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
// 10. PART II.C & III.D: INFORMATION SYSTEMS REGISTER & INTAKE
// ==========================================================

export const getInformationSystems = async (token, cycleOrParams = "", statusFilter = "", submissionStatus = "", deptId = "") => {
  const params = new URLSearchParams();
  if (typeof cycleOrParams === "object" && cycleOrParams !== null) {
    if (cycleOrParams.issp_period) params.append("issp_period", cycleOrParams.issp_period);
    if (cycleOrParams.status_filter && cycleOrParams.status_filter !== "All" && cycleOrParams.status_filter !== "all") {
      params.append("status_filter", cycleOrParams.status_filter);
    }
    if (cycleOrParams.submission_status && cycleOrParams.submission_status !== "All" && cycleOrParams.submission_status !== "all") {
      params.append("submission_status", cycleOrParams.submission_status);
    }
    if (cycleOrParams.dept_id) params.append("dept_id", String(cycleOrParams.dept_id));
  } else {
    if (cycleOrParams) params.append("issp_period", cycleOrParams);
    if (statusFilter && statusFilter !== "All" && statusFilter !== "all") params.append("status_filter", statusFilter);
    if (submissionStatus && submissionStatus !== "All" && submissionStatus !== "all") params.append("submission_status", submissionStatus);
    if (deptId) params.append("dept_id", String(deptId));
  }
  const qs = params.toString();
  const url = `${API_BASE_URL}/api/admin/information-systems${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: getHeaders(token) });
  return handleResponse(res, "Failed to load information systems");
};

export const createInformationSystem = async (token, payload) => {
  const formattedPayload = {
    ...payload,
    project_id: payload.project_id || null,
    strategic_concern_id: payload.strategic_concern_id || null,
    needs_assessment_id: payload.needs_assessment_id || null,
    department_id: payload.department_id ? parseInt(payload.department_id, 10) : null
  };
  const res = await fetch(`${API_BASE_URL}/api/admin/information-systems`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(formattedPayload)
  });
  return handleResponse(res, "Failed to register information system");
};

export const updateInformationSystem = async (token, id, payload) => {
  const formattedPayload = {
    ...payload,
    project_id: payload.project_id !== undefined ? (payload.project_id || null) : undefined,
    strategic_concern_id: payload.strategic_concern_id !== undefined ? (payload.strategic_concern_id || null) : undefined,
    needs_assessment_id: payload.needs_assessment_id !== undefined ? (payload.needs_assessment_id || null) : undefined,
    department_id: payload.department_id !== undefined ? (payload.department_id ? parseInt(payload.department_id, 10) : null) : undefined
  };

  Object.keys(formattedPayload).forEach((key) => {
    if (formattedPayload[key] === undefined) {
      delete formattedPayload[key];
    }
  });

  const res = await fetch(`${API_BASE_URL}/api/admin/information-systems/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(formattedPayload)
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

/**
 * Reviews and classifies a department-proposed information system (Part III.D).
 * Enforces project linkage, binds to Strategic Concern / Outcome, and commits architecture.
 */
export const reviewProposedSystem = async (token, systemId, payload) => {
  const formattedPayload = {
    ...payload,
    project_id: payload.project_id || null,
    strategic_concern_id: payload.strategic_concern_id || null,
    action: payload.action ? payload.action.toUpperCase() : "APPROVE",
    status: payload.status || "For Development",
    rejection_reason: payload.action === "RETURN" ? (payload.rejection_reason || "Proposal returned for revision.") : null
  };
  const res = await fetch(`${API_BASE_URL}/api/admin/information-systems/${encodeURIComponent(systemId)}/review`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(formattedPayload)
  });
  return handleResponse(res, "Failed to review and classify proposed information system");
};

// ==========================================================
// 11. PART II.D: E-GOVERNMENT PROGRAMS (EGP) CHECKLIST
// ==========================================================

export const getEgovChecklists = async (token, cycle = "") => {
  const url = cycle 
    ? `${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/egov-checklists`
    : `${API_BASE_URL}/api/admin/egov-checklists`;
  const res = await fetch(url, { headers: getHeaders(token) });
  return handleResponse(res, "Failed to load EGP checklist");
};

export const createEgovChecklist = async (token, cycleOrPayload, maybePayload = null) => {
  const cycle = typeof cycleOrPayload === "string" ? cycleOrPayload : (cycleOrPayload?.issp_period || "");
  const body = typeof cycleOrPayload === "string" ? maybePayload : cycleOrPayload;
  
  const url = cycle
    ? `${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/egov-checklists`
    : `${API_BASE_URL}/api/admin/egov-checklists`;

  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(body)
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
// 12. PART III.E & III.F: ICT PROJECTS & PMF METRICS
// ==========================================================

export const getIctProjects = async (token, cycleOrParams = "", categoryFilter = "") => {
  const params = new URLSearchParams();
  if (typeof cycleOrParams === "object" && cycleOrParams !== null) {
    if (cycleOrParams.issp_period) params.append("issp_period", cycleOrParams.issp_period);
    if (cycleOrParams.category_filter && cycleOrParams.category_filter !== "All" && cycleOrParams.category_filter !== "all") {
      params.append("category_filter", cycleOrParams.category_filter);
    }
  } else {
    if (cycleOrParams) params.append("issp_period", cycleOrParams);
    if (categoryFilter && categoryFilter !== "All" && categoryFilter !== "all") {
      params.append("category_filter", categoryFilter);
    }
  }
  const qs = params.toString();
  const url = `${API_BASE_URL}/api/admin/ict-projects${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: getHeaders(token) });
  return handleResponse(res, "Failed to load ICT projects");
};

export const createIctProject = async (token, payload) => {
  const formattedPayload = {
    ...payload,
    system_id: payload.system_id || null,
    project_category: payload.project_category || "Internal ICT Projects",
    aligns_others_specify: payload.aligns_others ? (payload.aligns_others_specify || null) : null
  };
  const res = await fetch(`${API_BASE_URL}/api/admin/ict-projects`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(formattedPayload)
  });
  return handleResponse(res, "Failed to create ICT project");
};

export const updateIctProject = async (token, id, payload) => {
  const formattedPayload = {
    ...payload,
    system_id: payload.system_id !== undefined ? (payload.system_id || null) : undefined,
    project_category: payload.project_category !== undefined ? payload.project_category : undefined,
    aligns_others_specify: payload.aligns_others !== undefined ? (payload.aligns_others ? (payload.aligns_others_specify || null) : null) : undefined
  };

  Object.keys(formattedPayload).forEach((key) => {
    if (formattedPayload[key] === undefined) {
      delete formattedPayload[key];
    }
  });

  const res = await fetch(`${API_BASE_URL}/api/admin/ict-projects/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(formattedPayload)
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

/**
 * Binds or unbinds proposals and information systems to an ICT project in Part III.E.
 * Automatically recalculates and synchronizes total derived project cost.
 */
export const updateProjectLinks = async (token, projectId, payload) => {
  const formattedPayload = {
    proposal_ids: Array.isArray(payload?.proposal_ids) ? payload.proposal_ids : [],
    system_ids: Array.isArray(payload?.system_ids) ? payload.system_ids : []
  };
  const res = await fetch(`${API_BASE_URL}/api/admin/ict-projects/${encodeURIComponent(projectId)}/links`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(formattedPayload)
  });
  return handleResponse(res, "Failed to update ICT project linkages");
};

export const getCrossProjects = async (token, cycle) => {
  let res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/cross-projects`, { 
    headers: getHeaders(token) 
  });
  if (res.status === 404) {
    res = await fetch(`${API_BASE_URL}/api/admin/ict-projects?issp_period=${encodeURIComponent(cycle)}&category_filter=Cross-Agency%20ICT%20Projects`, {
      headers: getHeaders(token)
    });
  }
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
// 13. PART IV.B: LIVE FOUR-WAY PARITY, GOVERNANCE & LIFECYCLE
// ==========================================================

export const getParityMatrices = async (token, cycleOrParams = "", onlyApproved = false) => {
  const params = new URLSearchParams();
  if (typeof cycleOrParams === "object" && cycleOrParams !== null) {
    if (cycleOrParams.issp_period) params.append("issp_period", cycleOrParams.issp_period);
    if (cycleOrParams.only_approved !== undefined) params.append("only_approved", String(cycleOrParams.only_approved));
  } else {
    if (cycleOrParams) params.append("issp_period", cycleOrParams);
    if (onlyApproved) params.append("only_approved", "true");
  }
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

export const verifyCompilerSync = async (token, moduleName, cycle = "") => {
  const params = new URLSearchParams();
  params.append("module", moduleName);
  if (cycle) params.append("issp_period", cycle);
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/verify-compiler-sync?${params.toString()}`, {
    method: "POST",
    headers: getHeaders(token)
  });
  return handleResponse(res, `Compiler sync verification failed for ${moduleName}`);
};

// ==========================================================
// 14. ANNEX 2: DRBCP (TEAMS, BIA, METRICS)
// ==========================================================

export const getDrTeams = async (token, cycle) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/dr-teams`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load disaster recovery team members");
};

export const createDrTeam = async (token, cycleOrPayload, maybePayload = null) => {
  const cycle = typeof cycleOrPayload === "string" ? cycleOrPayload : (cycleOrPayload?.issp_period || "");
  const body = typeof cycleOrPayload === "string" ? maybePayload : cycleOrPayload;
  
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/dr-teams`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(body)
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

export const createDrBia = async (token, cycleOrPayload, maybePayload = null) => {
  const cycle = typeof cycleOrPayload === "string" ? cycleOrPayload : (cycleOrPayload?.issp_period || "");
  const body = typeof cycleOrPayload === "string" ? maybePayload : cycleOrPayload;

  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/dr-bias`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(body)
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

export const createDrMetric = async (token, cycleOrPayload, maybePayload = null) => {
  const cycle = typeof cycleOrPayload === "string" ? cycleOrPayload : (cycleOrPayload?.issp_period || "");
  const body = typeof cycleOrPayload === "string" ? maybePayload : cycleOrPayload;

  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/dr-metrics`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(body)
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
// 15. MASTER NARRATIVE, COVERSHEET & CYCLE CONTROLS
// ==========================================================

export const getNarrative = async (token, cycle) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load planning narrative");
};

export const updateNarrative = async (token, cycle, payload) => {
  const cioResolvedName = (payload.signatory_prepared_by || payload.cio_name || "").trim();
  const headResolvedName = (payload.signatory_approved_by || payload.head_of_agency_name || "").trim();

  const formattedPayload = {
    ...payload,
    cio_name: cioResolvedName || undefined,
    head_of_agency_name: headResolvedName || undefined,
    signatory_prepared_by: cioResolvedName || undefined,
    signatory_approved_by: headResolvedName || undefined,
    preparer_position: payload.preparer_position || payload.cio_position || "Chief Information Officer",
    agency_head_position: payload.agency_head_position || payload.agency_head_title || payload.head_of_agency_position || undefined,
    
    mandate_text: payload.mandate_text || payload.mandate_html || payload.legal_basis || "",
    functions: payload.functions || undefined,
    vision_text: payload.vision_text || payload.vision_html || payload.vision_statement || "",
    mission_text: payload.mission_text || payload.mission_html || payload.mission_statement || "",
    present_situation_text: payload.present_situation_text || payload.present_situation_html || "",
    enterprise_architecture_narrative: payload.enterprise_architecture_narrative || undefined,
    drbcp_recovery_strategy_text: payload.drbcp_recovery_strategy_text || payload.drbcp_recovery_strategy_html || undefined,
    drbcp_sop_phases_text: payload.drbcp_sop_phases_text || payload.drbcp_sop_phases_html || undefined,
    drbcp_compliance_narrative_text: payload.drbcp_compliance_narrative_text || payload.drbcp_compliance_narrative_html || undefined,
    drbcp_approval_date: payload.drbcp_approval_date || payload.approval_date || undefined,
    
    agency_logo_url: payload.agency_logo_url !== undefined ? payload.agency_logo_url : undefined,
    dict_logo_url: payload.dict_logo_url !== undefined ? payload.dict_logo_url : undefined,
    bagong_pilipinas_logo_url: payload.bagong_pilipinas_logo_url !== undefined ? payload.bagong_pilipinas_logo_url : undefined,
    
    existing_ict_org_url: payload.existing_ict_org_url !== undefined ? payload.existing_ict_org_url : undefined,
    proposed_ict_org_url: payload.proposed_ict_org_url !== undefined ? payload.proposed_ict_org_url : undefined,
    site_development_plan_url: payload.site_development_plan_url !== undefined ? payload.site_development_plan_url : undefined,
    process_flow_diagram_url: payload.process_flow_diagram_url !== undefined ? payload.process_flow_diagram_url : undefined,
    network_diagram_url: payload.network_diagram_url !== undefined ? payload.network_diagram_url : undefined,
    fiber_backbone_url: payload.fiber_backbone_url !== undefined ? payload.fiber_backbone_url : undefined,
    system_architecture_url: payload.system_architecture_url !== undefined ? payload.system_architecture_url : undefined
  };

  delete formattedPayload.mandate_html;
  delete formattedPayload.vision_html;
  delete formattedPayload.mission_html;
  delete formattedPayload.present_situation_html;
  delete formattedPayload.drbcp_recovery_strategy_html;
  delete formattedPayload.drbcp_sop_phases_html;
  delete formattedPayload.drbcp_compliance_narrative_html;
  delete formattedPayload.cio_signature_url;
  delete formattedPayload.head_signature_url;
  delete formattedPayload.cert_logo_url;
  delete formattedPayload.subsystem_network_layouts_json;

  Object.keys(formattedPayload).forEach((key) => {
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

export const uploadDiagram = async (token, cycle, category, file, extraData = {}) => {
  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams();
  params.append("category", category);

  if (extraData && typeof extraData === "object") {
    Object.entries(extraData).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        params.append(k, String(v));
        formData.append(k, String(v));
      }
    });
  }

  const res = await fetch(
    `${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(cycle)}/upload-diagram?${params.toString()}`,
    {
      method: "POST",
      headers: getHeaders(token, true),
      body: formData
    }
  );
  return handleResponse(res, "Failed to upload diagram asset");
};

// ==========================================================
// 16. MASTER QUEUES, OVERRIDES, BATCH ACTIONS & PROPOSALS
// ==========================================================

export const getProposalsQueue = async (token, params = {}) => {
  const query = new URLSearchParams();
  if (typeof params === "object" && params !== null) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "" && v !== "all" && v !== "All") {
        query.append(k, String(v));
      }
    });
  }
  const qs = query.toString();
  const url = `${API_BASE_URL}/api/admin/proposals${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: getHeaders(token) });
  return handleResponse(res, "Failed to load master proposals queue");
};

export const createProposal = async (token, payload) => {
  const formattedPayload = {
    ...payload,
    project_id: payload.project_id || null,
    outcome_id: payload.outcome_id ? parseInt(payload.outcome_id, 10) : null,
    strategic_category_id: payload.strategic_category_id || null,
    needs_assessment_id: payload.needs_assessment_id || null
  };
  const res = await fetch(`${API_BASE_URL}/api/admin/proposals`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(formattedPayload)
  });
  return handleResponse(res, "Failed to create proposal");
};

export const updateProposal = async (token, id, payload) => {
  const formattedPayload = {
    ...payload,
    project_id: payload.project_id || null,
    outcome_id: payload.outcome_id ? parseInt(payload.outcome_id, 10) : null,
    strategic_category_id: payload.strategic_category_id || null,
    needs_assessment_id: payload.needs_assessment_id || null
  };
  const res = await fetch(`${API_BASE_URL}/api/admin/proposals/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(formattedPayload)
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

export const approveProposal = async (token, id, payload = null) => {
  const options = {
    method: "PUT",
    headers: getHeaders(token)
  };
  if (payload && typeof payload === "object") {
    options.body = JSON.stringify({
      ...payload,
      project_id: payload.project_id || null,
      outcome_id: payload.outcome_id ? parseInt(payload.outcome_id, 10) : null,
      uacs_object_code: payload.uacs_object_code || undefined,
      strategic_category_id: payload.strategic_category_id || undefined,
      expenditure_class: payload.expenditure_class || undefined
    });
  }
  const res = await fetch(`${API_BASE_URL}/api/admin/proposals/${encodeURIComponent(id)}/approve`, options);
  return handleResponse(res, "Failed to approve proposal");
};

export const returnProposal = async (token, id, payload = {}) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/proposals/${encodeURIComponent(id)}/return`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to return proposal");
};

export const overrideProposal = async (token, id, payload) => {
  const formattedPayload = {
    ...payload,
    project_id: payload.project_id || null,
    outcome_id: payload.outcome_id ? parseInt(payload.outcome_id, 10) : null,
    strategic_category_id: payload.strategic_category_id || null,
    needs_assessment_id: payload.needs_assessment_id || null
  };
  const res = await fetch(`${API_BASE_URL}/api/admin/proposals/${encodeURIComponent(id)}/override`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(formattedPayload)
  });
  return handleResponse(res, "Failed to override proposal");
};

export const batchApproveProposals = async (token, proposalIds) => {
  const payload = Array.isArray(proposalIds) ? { proposal_ids: proposalIds } : proposalIds;
  const res = await fetch(`${API_BASE_URL}/api/admin/proposals/batch-approve`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to batch approve proposals");
};

export const getApprovedCanvasProposals = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/proposals/approved-canvas`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load approved proposals with quotations");
};

// ==========================================================
// 17. COMPILATION, AUDIT LOGS, VAULT & ANALYTICS
// ==========================================================

export const triggerDocumentGeneration = async (token, cycleOrParams = "", exportFormat = "pdf") => {
  const params = new URLSearchParams();
  if (typeof cycleOrParams === "object" && cycleOrParams !== null) {
    if (cycleOrParams.issp_period) params.append("issp_period", cycleOrParams.issp_period);
    if (cycleOrParams.export_format || cycleOrParams.format) {
      params.append("export_format", cycleOrParams.export_format || cycleOrParams.format);
    }
  } else {
    if (cycleOrParams) params.append("issp_period", cycleOrParams);
    if (exportFormat) params.append("export_format", exportFormat);
  }
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

export const retrieveArchivedDocument = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/governance/restore-document`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to retrieve archived document");
};

export const restoreGovernanceDocument = retrieveArchivedDocument;
export const restoreDocument = retrieveArchivedDocument;
export const requestGlacierRestore = retrieveArchivedDocument;

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

export const getAuditLogs = async (token, params = {}) => {
  const query = new URLSearchParams();
  if (typeof params === "object" && params !== null) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "" && v !== "All" && v !== "all") {
        query.append(k, String(v));
      }
    });
  } else if (typeof params === "string" && params && params !== "All" && params !== "all") {
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
// 18. REFERENCE PRICING CATALOG
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

export const deleteCatalogItem = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/catalog/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete catalog item");
};

// ==========================================================
// 19. DEPARTMENTS DIRECTORY
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
// 20. USER WHITELISTING & ACCESS CONTROL (CREDENTIAL-BASED)
// ==========================================================

export const getWhitelistedUsers = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/users/whitelist`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load whitelisted users");
};

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
// 21. GLOSSARY (DEFINITION OF TERMS - TEMPLATE PAGE 5)
// ==========================================================

export const getGlossary = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/glossary`, { 
    headers: getHeaders(token) 
  });
  return handleResponse(res, "Failed to load glossary terms");
};

export const createGlossaryTerm = async (token, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/glossary`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create glossary term");
};

export const updateGlossaryTerm = async (token, id, payload) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/glossary/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update glossary term");
};

export const deleteGlossaryTerm = async (token, id) => {
  const res = await fetch(`${API_BASE_URL}/api/admin/glossary/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  return handleResponse(res, "Failed to delete glossary term");
};

// ==========================================================
// 22. GENERAL INSTRUCTIONS (TEMPLATE PAGE 11)
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
// 23. ANNEX 1: MASTER ASSET INVENTORY (ADMIN & SUPPLY ACCESS)
// ==========================================================

export const getMasterInventory = async (token, params = {}) => {
  const query = new URLSearchParams();
  if (typeof params === "object" && params !== null) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "" && v !== "all" && v !== "All") {
        query.append(k, String(v));
      }
    });
  }
  const qs = query.toString();
  let res = await fetch(`${API_BASE_URL}/api/supply/inventory${qs ? `?${qs}` : ""}`, { headers: getHeaders(token) });
  if (res.status === 404) {
    res = await fetch(`${API_BASE_URL}/api/admin/inventory${qs ? `?${qs}` : ""}`, { headers: getHeaders(token) });
  }
  return handleResponse(res, "Failed to load master asset inventory");
};

export const getAnnex1Summary = async (token, cycle = "") => {
  const params = new URLSearchParams();
  if (cycle) params.append("issp_period", cycle);
  const qs = params.toString();
  let res = await fetch(`${API_BASE_URL}/api/supply/inventory/annex1-summary${qs ? `?${qs}` : ""}`, {
    headers: getHeaders(token)
  });
  if (res.status === 404) {
    res = await fetch(`${API_BASE_URL}/api/admin/inventory/annex1-summary${qs ? `?${qs}` : ""}`, {
      headers: getHeaders(token)
    });
  }
  return handleResponse(res, "Failed to compile Annex 1 inventory summary");
};

export const createInventoryItem = async (token, payload) => {
  const formattedPayload = {
    ...payload,
    dict_category: payload.dict_category || undefined,
    other_category_name: payload.other_category_name || undefined
  };

  let res = await fetch(`${API_BASE_URL}/api/supply/inventory`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(formattedPayload)
  });
  if (res.status === 404) {
    res = await fetch(`${API_BASE_URL}/api/admin/inventory`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify(formattedPayload)
    });
  }
  return handleResponse(res, "Failed to record asset into Annex 1 inventory");
};

export const updateInventoryItem = async (token, id, payload) => {
  const formattedPayload = {
    ...payload,
    dict_category: payload.dict_category || undefined,
    other_category_name: payload.other_category_name || undefined
  };

  let res = await fetch(`${API_BASE_URL}/api/supply/inventory/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(formattedPayload)
  });
  if (res.status === 404) {
    res = await fetch(`${API_BASE_URL}/api/admin/inventory/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: getHeaders(token),
      body: JSON.stringify(formattedPayload)
    });
  }
  return handleResponse(res, "Failed to update asset in Annex 1 inventory");
};

export const deleteInventoryItem = async (token, id) => {
  let res = await fetch(`${API_BASE_URL}/api/supply/inventory/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(token)
  });
  if (res.status === 404) {
    res = await fetch(`${API_BASE_URL}/api/admin/inventory/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: getHeaders(token)
    });
  }
  return handleResponse(res, "Failed to delete asset from inventory");
};

// ==========================================================
// 24. SAFE DEPRECATED COMPATIBILITY ALIASES & STUBS
// ==========================================================
export const getUsersWhitelist = getWhitelistedUsers;
export const getUsers = getWhitelistedUsers;
export const getWhitelist = getWhitelistedUsers;
export const getNarratives = getNarrative;
export const deleteSubsystemDiagram = async () => null;
export const getSubscriptionsQueue = async (token, params = {}) => getProposalsQueue(token, params);
export const getCampuses = async () => [];
export const createCampus = async () => null;
export const updateCampus = async () => null;
export const deleteCampus = async () => null;
export const getServerCapacities = async () => [];
export const createServerCapacity = async () => null;
export const deleteServerCapacity = async () => null;
export const getOsCensus = async () => [];
export const createOsCensusRecord = async () => null;
export const updateOsCensusRecord = async () => null;
export const deleteOsCensusRecord = async () => null;
export const getSoftwareCensus = async () => [];
export const createSoftwareCensus = async () => null;
export const deleteSoftwareCensus = async () => null;
export const getAnnualCosts = async () => [];
export const createAnnualCost = async () => null;
export const deleteAnnualCost = async () => null;