// frontend/src/api/dept.js
/**
 * ==============================================================================
 * CSPC e-ISSP COMPLIANCE ENGINE — DEPARTMENT API CLIENT
 * Aligned with DICT ISSP Template v. 2026 & DBM National Budget Circulars
 * ==============================================================================
 * Enforces:
 * - Unified Proposals Ledger (CapEx & MOOE unified at ₱50k capitalization threshold)
 * - Mandatory Broader Scope (Organizational Outcome) Linkage (Rule 6)
 * - Section 8.0 Department Needs Assessment Full Lifecycle (Create, Read, Update, Delete)
 * - Optional Section 8.0 Department Needs Assessment Bidirectional Linkage
 * - Canvas Quotation Expiration Handling & Proof Uploads (Rule 7)
 * - Student-Developed Systems Bypass (Rule 1)
 * - Outlays >= ₱2,000,000.00 System Development Status Controls (Rule 2)
 * - Department-Scoped Inventory Isolation (Rule 9)
 * - DICT Annex 1 Standard Category (dict_category & other_category_name) Support
 * - Live S3 Glacier Cold Storage Retrieval Monitoring
 * - Dual-Pass Compilation Pre-Flight Headroom Checks
 * ==============================================================================
 */

const rawRoot = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
export const API_BASE_URL = rawRoot.endsWith("/") ? rawRoot.slice(0, -1) : rawRoot;

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
  let token = customToken;
  if (!token && typeof window !== "undefined") {
    token = localStorage.getItem("access_token");
  }
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
 * Standardized HTTP response evaluator.
 * Gracefully extracts string messages, Pydantic validation error lists,
 * and structured backend exception payloads to avoid '[object Object]' UI errors.
 *
 * @param {Response} res - Native Fetch Response object
 * @param {string} fallbackMessage - Default error context message
 * @returns {Promise<any>} Parsed JSON response
 */
async function handleResponse(res, fallbackMessage) {
  if (!res.ok) {
    let detailMessage = "";
    try {
      const errorData = await res.json();
      if (errorData) {
        if (typeof errorData.detail === "string") {
          detailMessage = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          // Flatten Pydantic validation error objects
          detailMessage = errorData.detail
            .map((err) => {
              const field = err.loc ? err.loc.filter((p) => p !== "body").join(" -> ") : "";
              return field ? `[${field}]: ${err.msg}` : err.msg;
            })
            .join(" | ");
        } else if (typeof errorData.detail === "object" && errorData.detail !== null) {
          if (errorData.detail.violations && Array.isArray(errorData.detail.violations)) {
            detailMessage = errorData.detail.violations.join(" | ");
          } else {
            detailMessage = JSON.stringify(errorData.detail);
          }
        } else if (errorData.message) {
          detailMessage = errorData.message;
        }
      }
    } catch {
      // Body is not JSON
      detailMessage = await res.text().catch(() => "");
    }

    const finalError = detailMessage || `${fallbackMessage} (HTTP Status: ${res.status})`;
    throw new Error(finalError);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return null;
  }

  return res.json();
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
 * Placed at the top of every proposal form in compliance with Rule 6.
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
 * Allows department line items to link directly to Part III.E initiatives.
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
// 3. REFERENCE CATALOG & CANVAS EXPIRATION ALERTS (Rule 7 & Rule 8)
// ==============================================================================

/**
 * Retrieves pre-approved catalog references with standard pricing and specs.
 * Automatically excludes items with expired market quotations.
 *
 * @param {string|null} customToken - Optional override token
 */
export async function getDeptCatalog(customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/catalog`, {
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to load standard equipment catalog");
}

/**
 * Identifies standard catalog references and custom draft proposals
 * whose quotation validity expires within the next 14 days (Rule 7 Alert System).
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
 *
 * @param {string} isspPeriod - Optional planning cycle filter (e.g., "2026-2028")
 * @param {string} statusFilter - Optional status filter ("Draft", "Submitted", "Approved", "Returned")
 * @param {number} skip - Pagination offset
 * @param {number} limit - Maximum items per page
 * @param {string|null} customToken - Optional override token
 */
export async function getProposals(isspPeriod = "", statusFilter = "", skip = 0, limit = 100, customToken = null) {
  const params = new URLSearchParams();
  params.append("skip", String(skip));
  params.append("limit", String(limit));
  if (isspPeriod) params.append("issp_period", isspPeriod);
  if (statusFilter && statusFilter !== "All") params.append("status_filter", statusFilter);

  const res = await fetch(`${API_BASE_URL}/api/dept/proposals?${params.toString()}`, {
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to load departmental resource proposals");
}

/**
 * Retrieves detailed parameters of a specific proposal item.
 * Automatically verifies S3 Glacier restoration progress if cold retrieval is active.
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
 * Creates a new draft proposal in the unified Part IV.A ledger.
 * - Automates target deployment office to the logged-in department (Rule 5).
 * - Bypasses quotation canvas requirement if created_by_students is True (Rule 1).
 * - Enforces System Development Status if total outlay >= ₱2,000,000.00 (Rule 2).
 * - Auto-classifies Capital Outlay (>= ₱50k) vs. MOOE (< ₱50k) (Rules 3 & 4).
 * - Supports optional linkage to Section 8.0 Department Needs Assessment (needs_assessment_id).
 *
 * @param {Object} payload - Validated ProposalCreatePayload schema
 * @param {string|null} customToken - Optional override token
 */
export async function createDraftProposal(payload, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals`, {
    method: "POST",
    headers: getHeaders(false, customToken),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create draft proposal");
}

/**
 * Updates parameters of an existing proposal in Draft or Returned state.
 * Editing is blocked if the item is currently undergoing S3 Glacier restoration.
 *
 * @param {string} proposalId - UUID of the proposal
 * @param {Object} payload - Validated ProposalCreatePayload schema
 * @param {string|null} customToken - Optional override token
 */
export async function updateProposal(proposalId, payload, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${encodeURIComponent(proposalId)}`, {
    method: "PUT",
    headers: getHeaders(false, customToken),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update proposal parameters");
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
 * Submits a draft proposal to the MIS Admin review queue.
 * - Blocks submission if quotation canvas is expired or missing (Rule 7).
 * - Allows submission without canvas if created_by_students is True (Rule 1).
 * - Validates departmental sub-ceiling budget headroom before state transition.
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
 * Triggers an AWS S3 head-object check to synchronize cold storage lifecycle
 * states and restoration progress metrics for a proposal.
 *
 * @param {string} proposalId - UUID of the proposal
 * @param {string|null} customToken - Optional override token
 */
export async function syncProposalMetadata(proposalId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${encodeURIComponent(proposalId)}/sync-metadata`, {
    method: "POST",
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to sync proposal storage metadata");
}

/**
 * Initiates an expedited or standard retrieval job for an archived canvas
 * document stored in AWS S3 Glacier.
 *
 * @param {string} proposalId - UUID of the proposal
 * @param {string|null} customToken - Optional override token
 */
export async function requestProposalRestore(proposalId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${encodeURIComponent(proposalId)}/restore`, {
    method: "POST",
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to initiate S3 Glacier cold storage restoration");
}

// ==============================================================================
// 5. SOFTWARE SUBSCRIPTIONS COMPATIBILITY ALIASES (Part IV.A MOOE)
// ==============================================================================

/**
 * Compatibility alias querying recurring MOOE software subscriptions.
 * Seamlessly interfaces with the unified issp_core ledger.
 *
 * @param {string} isspPeriod - Optional planning cycle filter
 * @param {string|null} customToken - Optional override token
 */
export async function getSubscriptions(isspPeriod = "", customToken = null) {
  const params = isspPeriod ? `?issp_period=${encodeURIComponent(isspPeriod)}` : "";
  const res = await fetch(`${API_BASE_URL}/api/dept/subscriptions${params}`, {
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to load software subscriptions");
}

export async function getSubscriptionDetail(subscriptionId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to load subscription details");
}

export async function createSubscription(payload, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/subscriptions`, {
    method: "POST",
    headers: getHeaders(false, customToken),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to create subscription proposal");
}

export async function updateSubscription(subscriptionId, payload, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PUT",
    headers: getHeaders(false, customToken),
    body: JSON.stringify(payload)
  });
  return handleResponse(res, "Failed to update subscription proposal");
}

export async function deleteSubscription(subscriptionId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to delete subscription proposal");
}

export async function submitSubscription(subscriptionId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/subscriptions/${encodeURIComponent(subscriptionId)}/submit`, {
    method: "PUT",
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to submit subscription proposal");
}

export async function syncSubscriptionMetadata(subscriptionId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/subscriptions/${encodeURIComponent(subscriptionId)}/sync-metadata`, {
    method: "POST",
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to sync subscription storage metadata");
}

export async function requestSubscriptionRestore(subscriptionId, customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/subscriptions/${encodeURIComponent(subscriptionId)}/restore`, {
    method: "POST",
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to initiate subscription restoration");
}

// ==============================================================================
// 6. QUOTATION CANVAS & UNCLASSIFIED PROPERTY INSPECTION UPLOADS (Rule 7)
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
 * Links the formal COA condemnation proof to an inventory asset.
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
// 7. ANNEX 1: DEPARTMENT INVENTORY (Read-Only Scoped View — Rule 9 & DICT Categories)
// ==============================================================================

/**
 * Retrieves the department's baseline ICT equipment and software inventory.
 * Strictly scoped so department planners view ONLY their own assets (Rule 9).
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
// 8. SECTION 8.0: NEEDS ASSESSMENT & OPERATIONAL JUSTIFICATIONS
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
 * Creates a formal Needs Assessment justifying new infrastructure outlays.
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
 * @param {Object} payload - NeedsAssessmentCreate schema (title, mfo_alignment, current_problem, proposed_solution, expected_impacts, other_impact)
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
// 9. REMARKS, FEEDBACK & COLLABORATIVE PINNED ACTION ITEMS
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
// 10. NOTIFICATIONS INBOX & ACTION ITEMS COUNTER
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
 * Used by NotificationContext to render live red badges in the sidebar.
 *
 * @param {string|null} customToken - Optional override token
 */
export async function getActionItemsSummary(customToken = null) {
  const res = await fetch(`${API_BASE_URL}/api/dept/action-items/summary`, {
    headers: getHeaders(false, customToken)
  });
  return handleResponse(res, "Failed to load action items summary count");
}