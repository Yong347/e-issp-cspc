// frontend/src/api/dept.js
/**
 * ==============================================================================
 * e-ISSP COMPLIANCE ENGINE — DEPARTMENT API CLIENT
 * Aligned with DICT ISSP Template v.2026 & DBM National Budget Circulars
 * ==============================================================================
 * Core Governance Modules:
 * - Unified Resource Proposals Ledger (Part IV.A: Hardware Equipment, Perpetual COTS Software Licenses, Cloud Subscriptions, Technical Services)
 * - 1-Step Proposal Creation with Direct Quotation Canvas Upload (createProposalWithCanvas)
 * - 1-Click Proposal Duplication (duplicateProposal)
 * - Proposed Information Systems & Platform Upgrades (Part III.D Enterprise Applications)
 * - Direct Strategic ICT Project Linkage (project_id) on Proposals and Information Systems
 * - Pre-Approved Standard Equipment & COTS Software Catalog
 * - Section 8.0 Department Needs Assessment Full Lifecycle (Create, Read, Update, Delete)
 * - Quotation Validity & Canvas Expiration Guards (DBM & COA Procurement Rules)
 * - In-House / Non-Commercial Systems Turnover Deed Support
 * - Department-Scoped Asset Inventory Isolation (Annex 1)
 * - Automated 401 Unauthorized Interceptor with Return Route Preservation
 * - Dual-Pool Independent Sub-Ceiling Pre-Flight Headroom Checks (CapEx vs. MOOE)
 * - Transparent Document Archive Access via Official Document Vault (Zero Cloud Vendor Jargon)
 * ==============================================================================
 */

import { API_BASE_URL, getStoredToken } from "./apiClient.js";

// Re-export centralized API root for backwards compatibility
export { API_BASE_URL };

/**
 * Builds standard authorization and content headers.
 * Automatically omits 'Content-Type' during multipart/form-data uploads 
 * to let the browser configure boundary identifiers cleanly.
 *
 * @param {boolean} isMultipart - True if uploading FormData (files)
 * @param {string|null} customToken - Optional override token
 * @returns {HeadersInit} Standard request headers
 */
function getHeaders(isMultipart = false, customToken = null) {
  const token = customToken || getStoredToken();
  const headers = {};

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (!isMultipart) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

/**
 * Formats machine field keys into clean, human-readable labels.
 *
 * @param {string} fieldKey
 * @returns {string}
 */
function humanizeFieldName(fieldKey) {
  if (!fieldKey) return "";
  const specialMap = {
    uacs_object_code: "UACS Object Code",
    expenditure_class: "Expenditure Class",
    strategic_category: "Strategic Spending Category",
    issp_period: "ISSP Planning Horizon",
    yearly_quantities: "Annual Target Quantities",
    item_name: "Resource Description",
    unit_cost: "Unit Cost",
    total_cost: "Total Outlay",
    project_id: "Strategic ICT Project",
    system_id: "Information System",
    outcome_id: "Organizational Outcome",
    needs_assessment_id: "Needs Assessment",
    canvas_evidence_url: "Quotation Canvas PDF",
    canvas_expiration_date: "Quotation Expiration Date",
    supplier_name: "Supplier Name",
    proposed_cost: "Proposed Development Cost",
    system_development_status: "System Development Status"
  };

  if (specialMap[fieldKey]) {
    return specialMap[fieldKey];
  }

  return fieldKey
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Standardized HTTP response evaluator with global 401 session interceptor.
 * Gracefully extracts string messages, Pydantic validation error lists,
 * and structured backend exception payloads to avoid '[object Object]' UI errors.
 *
 * @param {Response} res - Native Fetch Response object
 * @param {string} fallbackMessage - Default error context message
 * @returns {Promise<any>} Parsed JSON response
 */
async function handleResponse(res, fallbackMessage) {
  if (!res.ok) {
    // Global 401 Unauthorized Interceptor: Clears session and redirects with return path
    if (res.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("user_role");
      localStorage.removeItem("department_id");
      localStorage.removeItem("user_email");
      const currentPath = window.location.pathname + window.location.search;
      if (!currentPath.includes("/login")) {
        window.location.href = `/login?expired=true&redirect=${encodeURIComponent(currentPath)}`;
      }
    }

    let detailMessage = "";
    let rawErrorData = null;
    let violationList = [];

    try {
      rawErrorData = await res.json();
      if (rawErrorData) {
        if (typeof rawErrorData.detail === "string") {
          detailMessage = rawErrorData.detail;
        } else if (Array.isArray(rawErrorData.detail)) {
          // Format Pydantic field-level validation errors cleanly
          detailMessage = rawErrorData.detail
            .map((err) => {
              const fieldParts = (err.loc || []).filter(
                (p) => p !== "body" && p !== "query" && p !== "path"
              );
              const fieldName = humanizeFieldName(fieldParts.join(" "));
              const rawMsg = err.msg || "Invalid parameter";
              const cleanMsg = rawMsg.charAt(0).toUpperCase() + rawMsg.slice(1);
              return fieldName ? `${fieldName}: ${cleanMsg}` : cleanMsg;
            })
            .join(" | ");
        } else if (typeof rawErrorData.detail === "object" && rawErrorData.detail !== null) {
          // Format DICT Singularity Engine violations list
          if (Array.isArray(rawErrorData.detail.violations)) {
            violationList = rawErrorData.detail.violations;
            const header = rawErrorData.detail.error || "Compliance Integrity Failure";
            detailMessage = `${header} (${violationList.length} issue${violationList.length > 1 ? "s" : ""}):\n• ${violationList.join("\n• ")}`;
          } else {
            detailMessage = JSON.stringify(rawErrorData.detail);
          }
        } else if (rawErrorData.message) {
          detailMessage = rawErrorData.message;
        }
      }
    } catch {
      // Body is non-JSON text
      detailMessage = await res.text().catch(() => "");
    }

    const finalError = detailMessage || `${fallbackMessage} (HTTP Status: ${res.status})`;
    const err = new Error(finalError);
    err.status = res.status;
    err.data = rawErrorData;
    if (violationList.length > 0) {
      err.violations = violationList;
    }
    throw err;
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return null;
  }

  return res.json();
}

/**
 * Normalizes and sanitizes proposal payloads before network dispatch.
 * - Formats multi-year quantity maps: casts values to non-negative integers.
 * - Converts empty string UUIDs or null representations to null to prevent Pydantic parsing errors.
 * - Synchronizes created_by_students and is_in_house_turnover aliases bidirectionally.
 * - Auto-aligns strategic_category to 'Internal ICT Projects' if project_id is provided.
 *
 * @param {Object} payload - Raw proposal creation or update payload
 * @returns {Object} Sanitized payload
 */
function sanitizeProposalPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const sanitized = { ...payload };

  // 1. Sanitize Multi-Year Quantity Mapping
  if (sanitized.yearly_quantities && typeof sanitized.yearly_quantities === "object") {
    const cleanQuantities = {};
    Object.entries(sanitized.yearly_quantities).forEach(([k, v]) => {
      const parsed = parseInt(v, 10);
      cleanQuantities[String(k).trim()] = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    });
    sanitized.yearly_quantities = cleanQuantities;
  }

  // 2. Coerce Empty Strings and "null" literals to real nulls
  const nullableFields = [
    "project_id", 
    "needs_assessment_id", 
    "outcome_id", 
    "strategic_category_id", 
    "canvas_evidence_url", 
    "supplier_name", 
    "uacs_object_code", 
    "expenditure_class",
    "justification",
    "canvas_expiration_date"
  ];
  
  nullableFields.forEach(field => {
    if (sanitized[field] === "" || sanitized[field] === "null" || sanitized[field] === "undefined") {
      sanitized[field] = null;
    }
  });

  // 3. Align Non-Commercial / In-House Turnover Aliases bidirectionally
  if (sanitized.is_in_house_turnover !== undefined) {
    sanitized.created_by_students = Boolean(sanitized.is_in_house_turnover);
  } else if (sanitized.created_by_students !== undefined) {
    sanitized.is_in_house_turnover = Boolean(sanitized.created_by_students);
  }

  // 4. Auto-align strategic category if linked to an internal project
  if (sanitized.project_id && (!sanitized.strategic_category || sanitized.strategic_category === "Office Productivity")) {
    sanitized.strategic_category = "Internal ICT Projects";
  }

  return sanitized;
}

/**
 * Normalizes system proposal payloads for simplified intake (Part III.D).
 * Sanitizes proposed_cost, binds project_id, sets technical fallbacks, and cleans string values.
 *
 * @param {Object} payload - Raw system proposal payload
 * @returns {Object} Sanitized payload
 */
function sanitizeSystemPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const sanitized = { ...payload };

  if (sanitized.proposed_cost !== undefined && sanitized.proposed_cost !== null) {
    const parsedCost = parseFloat(sanitized.proposed_cost);
    sanitized.proposed_cost = isNaN(parsedCost) || parsedCost < 0 ? 0 : parsedCost;
  }

  const nullableFields = [
    "project_id",
    "needs_assessment_id",
    "strategic_concern_id",
    "online_url",
    "enhancement_details",
    "pia_target_date_text",
    "internal_integrated_systems",
    "external_integrated_systems"
  ];
  nullableFields.forEach(field => {
    if (sanitized[field] === "" || sanitized[field] === "null" || sanitized[field] === "undefined") {
      sanitized[field] = null;
    }
  });

  return sanitized;
}

// ==============================================================================
// 1. BUDGET HEADROOM & GOVERNANCE PRE-FLIGHT (Part IV.B)
// ==============================================================================

/**
 * Retrieves the logged-in department's allocated CapEx/MOOE sub-ceiling,
 * approved expenditures, and active draft dry-run calculations.
 *
 * @param {string|null} customToken - Optional override token
 */
export async function getBudgetSummary(customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/budget-summary`, {
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to load department budget summary");
}

// ==============================================================================
// 2. BROADER SCOPE (PART I.A.4) & STRATEGIC ICT PROJECTS (PART III.E)
// ==============================================================================

/**
 * Retrieves Organizational Outcomes (Major Final Outputs / KRA categories).
 * Rendered at the top of proposal reviews in compliance with DICT standards.
 *
 * @param {string|null} customToken - Optional override token
 */
export async function getOutcomes(customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/outcomes`, {
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to load organizational outcomes");
}

/**
 * Retrieves strategic ICT projects configured for the active cycle.
 * Allows department line items and proposed systems to link directly to Part III.E initiatives.
 *
 * @param {string|null} customToken - Optional override token
 */
export async function getProjects(customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/projects`, {
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to load strategic ICT projects");
}

// ==============================================================================
// 3. REFERENCE CATALOG & CANVAS EXPIRATION ALERTS
// ==============================================================================

/**
 * Retrieves pre-approved catalog references with standard pricing and specs.
 * Automatically excludes items with expired market quotations and filters by allowed_offices.
 * Supports optional category and search filtering parameters.
 *
 * @param {Object|string|null} paramsOrToken - Optional filter object { category, search } or token override
 * @param {string|null} customToken - Optional explicit token override
 */
export async function getDeptCatalog(paramsOrToken = null, customToken = null) {
  let token = customToken;
  const queryParams = new URLSearchParams();

  if (typeof paramsOrToken === "string") {
    token = paramsOrToken;
  } else if (typeof paramsOrToken === "object" && paramsOrToken !== null) {
    if (paramsOrToken.category && paramsOrToken.category !== "All") {
      queryParams.append("category", paramsOrToken.category);
    }
    if (paramsOrToken.search) {
      queryParams.append("search", paramsOrToken.search);
    }
    if (paramsOrToken.token) {
      token = paramsOrToken.token;
    }
  }

  const qs = queryParams.toString();
  const url = `${API_BASE_URL}/api/dept/catalog${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    headers: getHeaders(false, token)
  });
  return handleResponse(res, "Failed to load standard equipment catalog");
}

/**
 * Identifies standard catalog references and custom draft proposals
 * whose quotation validity expires within the policy warning threshold.
 *
 * @param {string|null} customToken - Optional override token
 */
export async function getExpiringCanvasAlerts(customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/catalog/expiring-alerts`, {
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to load quotation canvas expiration alerts");
}

// ==============================================================================
// 4. UNIFIED RESOURCE PROPOSALS LEDGER (Part IV.A — CapEx & MOOE Merged)
// ==============================================================================

/**
 * Retrieves all unified resource proposals for the active cycle.
 * Expired canvas items are preserved in the table with an alert flag.
 * Accepts either an options object or positional parameters.
 *
 * @param {string|Object} paramsOrPeriod - Optional cycle string (e.g., "2028-2030") OR filter object
 * @param {string} statusFilter - Optional status filter ("Draft", "Submitted", "Approved", "Returned")
 * @param {number} skip - Pagination offset
 * @param {number} limit - Maximum items per page
 * @param {string|null} customToken - Optional override token
 */
export async function getProposals(paramsOrPeriod = "", statusFilter = "", skip = 0, limit = 100, customToken = null) {
  const params = new URLSearchParams();
  let token = customToken;

  if (typeof paramsOrPeriod === "object" && paramsOrPeriod !== null) {
    const {
      issp_period = "",
      isspPeriod = "",
      status_filter = "",
      statusFilter: sFilter = "",
      category = "",
      strategic_category = "",
      strategicCategory = "",
      search = "",
      skip: sk = 0,
      limit: lim = 100,
      token: optToken = null
    } = paramsOrPeriod;

    params.append("skip", String(sk));
    params.append("limit", String(lim));
    const cycle = issp_period || isspPeriod;
    if (cycle) params.append("issp_period", cycle);
    const st = status_filter || sFilter;
    if (st && st !== "All" && st !== "all") params.append("status_filter", st);
    if (category && category !== "All" && category !== "all") params.append("category", category);
    const sc = strategic_category || strategicCategory;
    if (sc && sc !== "All" && sc !== "all") params.append("strategic_category", sc);
    if (search) params.append("search", search);
    if (optToken) token = optToken;
  } else {
    params.append("skip", String(skip));
    params.append("limit", String(limit));
    if (paramsOrPeriod) params.append("issp_period", paramsOrPeriod);
    if (statusFilter && statusFilter !== "All" && statusFilter !== "all") {
      params.append("status_filter", statusFilter);
    }
  }

  const res = await fetch(`${API_BASE_URL}/api/dept/proposals?${params.toString()}`, {
    headers: getHeaders(false, token)
  });
  return handleResponse(res, "Failed to load departmental resource proposals");
}

/**
 * Retrieves detailed parameters of a specific proposal item.
 * Transparently verifies archive availability and document metadata.
 *
 * @param {string} proposalId - UUID of the proposal item
 * @param {string|null} customToken - Optional override token
 */
export async function getProposalDetail(proposalId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${encodeURIComponent(proposalId)}`, {
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to load proposal details");
}

/**
 * 1-Step Unified Proposal Creation with Direct Quotation File Upload.
 * Accepts proposal metadata and an optional PDF file in a single request.
 *
 * @param {Object} payload - ProposalCreatePayload schema
 * @param {File|null} file - Optional quotation canvas PDF file
 * @param {string|null} customToken - Optional override token
 */
export async function createProposalWithCanvas(payload, file = null, customToken = null) {
  const cleanPayload = sanitizeProposalPayload(payload);

  if (file && file instanceof File) {
    const formData = new FormData();
    formData.append("payload_json", JSON.stringify(cleanPayload));
    formData.append("file", file);

    const res = await fetch(`${API_BASE_URL}/api/dept/proposals/with-canvas`, {
      method: "POST",
      headers: getHeaders(true, customToken),
      body: formData
    });
    return handleResponse(res, "Failed to create proposal with canvas evidence");
  }

  // Fallback to standard JSON endpoint if no file was provided
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals`, {
    method: "POST",
    headers: getHeaders(false, customToken),
    body: JSON.stringify(cleanPayload)
  });
  return handleResponse(res, "Failed to create draft proposal");
}

/**
 * Creates a new draft proposal in the unified Part IV.A ledger.
 * Overloaded to support optional file upload as the second argument.
 *
 * @param {Object} payload - Validated ProposalCreatePayload schema
 * @param {File|string|null} fileOrToken - Optional File object or override token string
 * @param {string|null} customToken - Optional override token
 */
export async function createDraftProposal(payload, fileOrToken = null, customToken = null) {
  let file = null;
  let token = customToken;

  if (fileOrToken instanceof File) {
    file = fileOrToken;
  } else if (typeof fileOrToken === "string") {
    token = fileOrToken;
  }

  if (file) {
    return createProposalWithCanvas(payload, file, token);
  }

  const cleanPayload = sanitizeProposalPayload(payload);
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals`, {
    method: "POST",
    headers: getHeaders(false, token),
    body: JSON.stringify(cleanPayload)
  });
  return handleResponse(res, "Failed to create draft proposal");
}

/**
 * Clones an existing proposal into a fresh Draft state.
 * Enables 1-click duplication for batch authoring without re-entering technical specs.
 *
 * @param {string} proposalId - UUID of the source proposal
 * @param {string|null} customToken - Optional override token
 */
export async function duplicateProposal(proposalId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${encodeURIComponent(proposalId)}/duplicate`, {
    method: "POST",
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to duplicate proposal");
}

/**
 * Updates parameters of an existing proposal in Draft or Returned state.
 * Optionally uploads an updated canvas file if supplied.
 *
 * @param {string} proposalId - UUID of the proposal
 * @param {Object} payload - Validated ProposalCreatePayload schema
 * @param {File|string|null} fileOrToken - Optional File object or override token string
 * @param {string|null} customToken - Optional override token
 */
export async function updateProposal(proposalId, payload, fileOrToken = null, customToken = null) {
  let file = null;
  let token = customToken;

  if (fileOrToken instanceof File) {
    file = fileOrToken;
  } else if (typeof fileOrToken === "string") {
    token = fileOrToken;
  }

  const cleanPayload = sanitizeProposalPayload(payload);
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${encodeURIComponent(proposalId)}`, {
    method: "PUT",
    headers: getHeaders(false, token),
    body: JSON.stringify(cleanPayload)
  });
  const updatedProposal = await handleResponse(res, "Failed to update proposal parameters");

  // If a file was attached alongside updates, upload it to link cleanly
  if (file) {
    const supplier = cleanPayload.supplier_name || "Supplier";
    const expiry = cleanPayload.canvas_expiration_date || null;
    await uploadCanvas(proposalId, supplier, file, expiry, token);
  }

  return updatedProposal;
}

/**
 * Permanently deletes a proposal draft.
 * Forbidden if the item is in Submitted or Approved status.
 *
 * @param {string} proposalId - UUID of the proposal
 * @param {string|null} customToken - Optional override token
 */
export async function deleteProposal(proposalId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${encodeURIComponent(proposalId)}`, {
    method: "DELETE",
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to delete proposal record");
}

/**
 * Submits a draft proposal to the review queue.
 * - Bypasses canvas checks for pre-approved catalog items and in-house turnovers.
 * - Blocks custom proposals if quotation canvas is missing or expired.
 * - Validates departmental dual-pool (CapEx vs MOOE) sub-ceiling headroom.
 *
 * @param {string} proposalId - UUID of the proposal
 * @param {string|null} customToken - Optional override token
 */
export async function submitProposal(proposalId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${encodeURIComponent(proposalId)}/submit`, {
    method: "PUT",
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to submit proposal to review queue");
}

/**
 * Verifies document availability and synchronizes storage properties for a proposal.
 *
 * @param {string} proposalId - UUID of the proposal
 * @param {string|null} customToken - Optional override token
 */
export async function syncProposalMetadata(proposalId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${encodeURIComponent(proposalId)}/sync-metadata`, {
    method: "POST",
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to synchronize proposal document status");
}

/**
 * Retrieves access to an archived supporting document from the official document archive.
 * Transparent and immediate without requiring manual vendor restoration steps.
 *
 * @param {string} proposalId - UUID of the proposal
 * @param {string|null} customToken - Optional override token
 */
export async function retrieveArchivedDocument(proposalId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${encodeURIComponent(proposalId)}/restore`, {
    method: "POST",
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to retrieve archived document");
}

// Backward-compatible alias for existing callers
export const requestProposalRestore = retrieveArchivedDocument;

// ==============================================================================
// 5. QUOTATION CANVAS & UNCLASSIFIED PROPERTY INSPECTION UPLOADS
// ==============================================================================

/**
 * Uploads a verified market quotation canvas PDF and links it to a proposal.
 * Accepts an optional canvasExpirationDate to establish validity guards.
 *
 * @param {string} proposalId - UUID of the target proposal
 * @param {string} supplierName - Name of the bidding supplier
 * @param {File} file - PDF document binary
 * @param {string|null} canvasExpirationDate - ISO date string of quotation validity
 * @param {string|null} customToken - Optional override token
 */
export async function uploadCanvas(proposalId, supplierName, file, canvasExpirationDate = null, customToken = null) {
  const formData = new FormData();
  formData.append("proposal_id", proposalId);
  formData.append("supplier_name", supplierName);
  formData.append("file", file);

  if (canvasExpirationDate) {
    formData.append("canvas_expiration_date", canvasExpirationDate);
  }

  const res = await fetch(`${API_BASE_URL}/api/dept/upload/canvas`, {
    method: "POST",
    headers: getHeaders(true, customToken),
    body: formData
  });
  return handleResponse(res, "Failed to upload quotation canvas evidence");
}

/**
 * Uploads an Inventory and Inspection Report of Unserviceable Property (IIRUP) PDF.
 * Links the formal COA condemnation proof to an inventory asset in Annex 1.
 *
 * @param {string} inventoryId - UUID of the condemned asset
 * @param {File} file - IIRUP PDF document binary
 * @param {string|null} customToken - Optional override token
 */
export async function uploadUnserviceableReport(inventoryId, file, customToken = null) {
  const formData = new FormData();
  formData.append("inventory_id", inventoryId);
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/api/dept/upload/unserviceable-report`, {
    method: "POST",
    headers: getHeaders(true, customToken),
    body: formData
  });
  return handleResponse(res, "Failed to upload unserviceable property report");
}

// ==============================================================================
// 6. ANNEX 1: DEPARTMENT INVENTORY (Read-Only Scoped View)
// ==============================================================================

/**
 * Retrieves the department's baseline ICT equipment and software inventory.
 * Strictly scoped so department planners view ONLY their own assets.
 * Supports optional filtering by DICT standard category (dict_category), search query,
 * obsolescence/EOL flags, software classification, and condition status.
 *
 * @param {number|Object} paramsOrSkip - Pagination offset (number) OR options/filter object
 * @param {number} limit - Items per page (if first parameter is numeric offset)
 * @param {string|null} customToken - Optional override token
 */
export async function getInventory(paramsOrSkip = 0, limit = 100, customToken = null) {
  const queryParams = new URLSearchParams();
  let token = customToken;

  if (typeof paramsOrSkip === "object" && paramsOrSkip !== null) {
    const {
      skip = 0,
      limit: lim = 100,
      search = "",
      dict_category = "",
      dictCategory = "",
      is_software = null,
      isSoftware = null,
      is_end_of_life = null,
      isEndOfLife = null,
      is_backup = null,
      isBackup = null,
      status_filter = "",
      statusFilter = "",
      token: optToken = null
    } = paramsOrSkip;

    queryParams.append("skip", String(skip));
    queryParams.append("limit", String(lim));
    if (search) queryParams.append("search", String(search).trim());

    const resolvedCategory = dict_category || dictCategory;
    if (resolvedCategory && resolvedCategory !== "All") {
      queryParams.append("dict_category", String(resolvedCategory).trim());
    }

    const resolvedIsSoftware = is_software !== null ? is_software : isSoftware;
    if (resolvedIsSoftware !== null && resolvedIsSoftware !== undefined) {
      queryParams.append("is_software", String(resolvedIsSoftware));
    }

    const resolvedEol = is_end_of_life !== null ? is_end_of_life : isEndOfLife;
    if (resolvedEol !== null && resolvedEol !== undefined) {
      queryParams.append("is_end_of_life", String(resolvedEol));
    }

    const resolvedBackup = is_backup !== null ? is_backup : isBackup;
    if (resolvedBackup !== null && resolvedBackup !== undefined) {
      queryParams.append("is_backup", String(resolvedBackup));
    }

    const resolvedStatus = status_filter || statusFilter;
    if (resolvedStatus && resolvedStatus !== "All") {
      queryParams.append("status_filter", String(resolvedStatus).trim());
    }

    if (optToken) token = optToken;
  } else {
    queryParams.append("skip", String(paramsOrSkip));
    queryParams.append("limit", String(limit));
  }

  const res = await fetch(`${API_BASE_URL}/api/dept/inventory?${queryParams.toString()}`, {
    headers: getHeaders(false, token)
  });
  return handleResponse(res, "Failed to load departmental baseline inventory");
}

/**
 * Logs an inventory asset into Annex 1.
 * Routes to the master supply handler with fallback support.
 * Explicitly preserves dict_category and other_category_name in payload.
 *
 * @param {Object} payload - SupplyInventoryCreate schema (including dict_category and other_category_name)
 * @param {string|null} customToken - Optional override token
 */
export async function logExistingAsset(payload, customToken = null) {
  let res = await fetch(`${API_BASE_URL}/api/supply/inventory`, {
    method: "POST",
    headers: getHeaders(false, customToken),
    body: JSON.stringify(payload)
  });

  if (res.status === 404 || res.status === 405) {
    res = await fetch(`${API_BASE_URL}/api/dept/inventory`, {
      method: "POST",
      headers: getHeaders(false, customToken),
      body: JSON.stringify(payload)
    });
  }

  return handleResponse(res, "Failed to register baseline inventory asset");
}

// ==============================================================================
// 7. SECTION 8.0: NEEDS ASSESSMENT & OPERATIONAL JUSTIFICATIONS
// ==============================================================================

/**
 * Retrieves documented technical needs assessments and operational justifications.
 * Accepts optional query parameters or authorization override tokens.
 *
 * @param {Object|string} paramsOrToken - Optional query parameters object or token string
 * @param {string|null} customToken - Optional explicit token override
 */
export async function getNeedsAssessments(paramsOrToken = {}, customToken = null) {
  let params = {};
  let token = customToken;

  if (typeof paramsOrToken === "string") {
    token = paramsOrToken;
  } else if (typeof paramsOrToken === "object" && paramsOrToken !== null) {
    params = paramsOrToken;
  }

  const query = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/api/dept/needs-assessment${query ? `?${query}` : ""}`;
  const res = await fetch(url, {
    headers: getHeaders(false, token)
  });
  return handleResponse(res, "Failed to load department needs assessments");
}

/**
 * Creates a formal Needs Assessment justifying new ICT infrastructure outlays.
 *
 * @param {Object} payload - NeedsAssessmentCreate schema
 * @param {string|null} customToken - Optional override token
 */
export async function createNeedsAssessment(payload, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/needs-assessment`, {
    method: "POST",
    headers: getHeaders(false, customToken),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to record needs assessment");
}

/**
 * Updates an existing Section 8.0 Department Needs Assessment.
 *
 * @param {string} assessmentId - UUID of the needs assessment record
 * @param {Object} payload - NeedsAssessmentCreate schema
 * @param {string|null} customToken - Optional override token
 */
export async function updateNeedsAssessment(assessmentId, payload, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/needs-assessment/${encodeURIComponent(assessmentId)}`, {
    method: "PUT",
    headers: getHeaders(false, customToken),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update needs assessment");
}

/**
 * Deletes an unaggregated Section 8.0 Department Needs Assessment.
 * If already aggregated into Part II.A Strategic Concerns by the MIS Admin, deletion is blocked by the backend.
 *
 * @param {string} assessmentId - UUID of the needs assessment record
 * @param {string|null} customToken - Optional override token
 */
export async function deleteNeedsAssessment(assessmentId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/needs-assessment/${encodeURIComponent(assessmentId)}`, {
    method: "DELETE",
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to delete needs assessment");
}

// ==============================================================================
// 8. REMARKS, FEEDBACK & COLLABORATIVE ACTION ITEMS
// ==============================================================================

/**
 * Retrieves the collaborative discussion thread and admin remarks for a proposal.
 *
 * @param {string} proposalId - UUID of the proposal
 * @param {string|null} customToken - Optional override token
 */
export async function getComments(proposalId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${encodeURIComponent(proposalId)}/comments`, {
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to load proposal comments thread");
}

/**
 * Posts an inline feedback remark or flags a revision action item on a proposal.
 *
 * @param {string} proposalId - UUID of the proposal
 * @param {Object} payload - CommentCreate schema
 * @param {string|null} customToken - Optional override token
 */
export async function postComment(proposalId, payload, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${encodeURIComponent(proposalId)}/comments`, {
    method: "POST",
    headers: getHeaders(false, customToken),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to post comment");
}

/**
 * Marks a flagged administrative action item as resolved,
 * releasing the submission lock on the proposal draft.
 *
 * @param {string} proposalId - UUID of the proposal
 * @param {string} commentId - Unique identifier of the pinned remark
 * @param {string|null} customToken - Optional override token
 */
export async function resolveComment(proposalId, commentId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${encodeURIComponent(proposalId)}/comments/${encodeURIComponent(commentId)}/resolve`, {
    method: "POST",
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to resolve action item");
}

// ==============================================================================
// 9. NOTIFICATIONS INBOX & ACTION ITEMS COUNTER
// ==============================================================================

/**
 * Retrieves unified audit alerts, status transitions, and pending feedback
 * for the department's workspace inbox.
 *
 * @param {string|null} category - Optional notification filter
 * @param {number|null} days - Optional days horizon filter
 * @param {string|null} customToken - Optional override token
 */
export async function getNotifications(category = null, days = null, customToken = null) {
  const params = new URLSearchParams();
  if (category) params.append("category", category);
  if (days) params.append("days", String(days));

  const qs = params.toString();
  const url = `${API_BASE_URL}/api/dept/notifications${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to load workspace notifications");
}

/**
 * Queries counts of unresolved action items and returned proposals.
 * Used by NotificationContext to render live badges in the navigation menu.
 *
 * @param {string|null} customToken - Optional override token
 */
export async function getActionItemsSummary(customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/action-items/summary`, {
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to load action items summary count");
}

// ==============================================================================
// 10. PROPOSED INFORMATION SYSTEMS & ENHANCEMENTS (Part III.D — Enterprise Systems)
// ==============================================================================

/**
 * Retrieves information systems proposed by or assigned to this department.
 * Supports status filtering.
 *
 * @param {string|Object} statusOrParams - Optional status filter ("Draft", "Submitted", "Approved", "Returned") or filter object
 * @param {string|null} customToken - Optional override token
 */
export async function getDeptSystems(statusOrParams = "", customToken = null) {
  const params = new URLSearchParams();
  let token = customToken;

  if (typeof statusOrParams === "object" && statusOrParams !== null) {
    const {
      submission_status = "",
      submissionStatus = "",
      token: optToken = null
    } = statusOrParams;
    const st = submission_status || submissionStatus;
    if (st && st !== "All" && st !== "all") {
      params.append("submission_status", st);
    }
    if (optToken) token = optToken;
  } else if (typeof statusOrParams === "string" && statusOrParams && statusOrParams !== "All" && statusOrParams !== "all") {
    params.append("submission_status", statusOrParams);
  }

  const qs = params.toString();
  const url = `${API_BASE_URL}/api/dept/systems${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    headers: getHeaders(false, token)
  });
  return handleResponse(res, "Failed to load proposed information systems");
}

/**
 * Retrieves detailed specifications of a specific proposed information system.
 *
 * @param {string} systemId - UUID of the proposed system
 * @param {string|null} customToken - Optional override token
 */
export async function getDeptSystemDetail(systemId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/systems/${encodeURIComponent(systemId)}`, {
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to load proposed system details");
}

/**
 * Drafts a new Information System proposal or platform enhancement (Part III.D).
 * Automatically sanitizes inputs, binds project_id, enforces non-negative proposed costs,
 * and links to Section 8.0 Needs Assessments without requiring technical architecture jargon.
 *
 * @param {Object} payload - InformationSystemCreate schema (including project_id)
 * @param {string|null} customToken - Optional override token
 */
export async function createProposedSystem(payload, customToken = null) {
  const cleanPayload = sanitizeSystemPayload(payload);
  const res = await fetch(`${API_BASE_URL}/api/dept/systems`, {
    method: "POST",
    headers: getHeaders(false, customToken),
    body: JSON.stringify(cleanPayload)
  });
  return handleResponse(res, "Failed to draft proposed information system");
}

/**
 * Updates an existing Information System proposal in Draft or Returned status.
 *
 * @param {string} systemId - UUID of the proposed system
 * @param {Object} payload - InformationSystemUpdate schema (including project_id)
 * @param {string|null} customToken - Optional override token
 */
export async function updateProposedSystem(systemId, payload, customToken = null) {
  const cleanPayload = sanitizeSystemPayload(payload);
  const res = await fetch(`${API_BASE_URL}/api/dept/systems/${encodeURIComponent(systemId)}`, {
    method: "PUT",
    headers: getHeaders(false, customToken),
    body: JSON.stringify(cleanPayload)
  });
  return handleResponse(res, "Failed to update proposed information system");
}

/**
 * Permanently deletes a draft or returned Information System proposal.
 *
 * @param {string} systemId - UUID of the proposed system
 * @param {string|null} customToken - Optional override token
 */
export async function deleteProposedSystem(systemId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/systems/${encodeURIComponent(systemId)}`, {
    method: "DELETE",
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to delete proposed information system");
}

/**
 * Submits an Information System proposal draft to the MIS Administrator review queue.
 *
 * @param {string} systemId - UUID of the proposed system
 * @param {string|null} customToken - Optional override token
 */
export async function submitProposedSystem(systemId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/systems/${encodeURIComponent(systemId)}/submit`, {
    method: "PUT",
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to submit proposed system to review queue");
}

export default {
  API_BASE_URL,
  getBudgetSummary,
  getOutcomes,
  getProjects,
  getDeptCatalog,
  getExpiringCanvasAlerts,
  getProposals,
  getProposalDetail,
  createDraftProposal,
  createProposalWithCanvas,
  duplicateProposal,
  updateProposal,
  deleteProposal,
  submitProposal,
  syncProposalMetadata,
  retrieveArchivedDocument,
  requestProposalRestore,
  uploadCanvas,
  uploadUnserviceableReport,
  getInventory,
  logExistingAsset,
  getNeedsAssessments,
  createNeedsAssessment,
  updateNeedsAssessment,
  deleteNeedsAssessment,
  getComments,
  postComment,
  resolveComment,
  getNotifications,
  getActionItemsSummary,
  getDeptSystems,
  getDeptSystemDetail,
  createProposedSystem,
  updateProposedSystem,
  deleteProposedSystem,
  submitProposedSystem
};
