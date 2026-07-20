// frontend/src/api/dept.js

const rawRoot = import.meta.env?.VITE_API_URL || "http://localhost:8000";
export const API_BASE_URL = rawRoot.endsWith("/") ? rawRoot.slice(0, -1) : rawRoot;

/**
 * Helper to construct standard request headers.
 * Bypasses JSON Content-Type headers during file uploads to allow browser boundary resolution.
 */
function getHeaders(isMultipart = false) {
  const token = localStorage.getItem("access_token");
  const headers = { "Authorization": `Bearer ${token}` };
  if (!isMultipart) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

/**
 * Standard error parsing handler for clean response evaluation.
 */
async function handleResponse(res, errorMessage) {
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `${errorMessage} (Status: ${res.status})`);
  }
  return res.json();
}

// ==========================================================
// 1. INVENTORY (ANNEX A-5) & GENERAL DIAGNOSTICS
// ==========================================================

export async function getInventory(skip = 0, limit = 100) {
  const res = await fetch(`${API_BASE_URL}/api/dept/inventory?skip=${skip}&limit=${limit}`, { headers: getHeaders() });
  return handleResponse(res, "Failed to load inventory");
}

export async function logExistingAsset(payload) {
  const res = await fetch(`${API_BASE_URL}/api/dept/inventory`, { method: "POST", headers: getHeaders(), body: JSON.stringify(payload) });
  return handleResponse(res, "Failed to log existing inventory item");
}

export async function uploadUnserviceableReport(inventoryId, file) {
  const formData = new FormData();
  formData.append("inventory_id", inventoryId);
  formData.append("file", file);
  const res = await fetch(`${API_BASE_URL}/api/dept/upload/unserviceable-report`, { method: "POST", headers: getHeaders(true), body: formData });
  return handleResponse(res, "Failed to upload unserviceable report");
}

export async function getDeptCatalog() {
  const res = await fetch(`${API_BASE_URL}/api/dept/catalog`, { headers: getHeaders() });
  return handleResponse(res, "Failed to load standard equipment catalog");
}

// ==========================================================
// 2. BUDGET HEADROOM & SUMMARY
// ==========================================================

export async function getBudgetSummary() {
  const res = await fetch(`${API_BASE_URL}/api/dept/budget-summary`, { headers: getHeaders() });
  return handleResponse(res, "Failed to load department budget summary");
}

// ==========================================================
// 3. NEEDS ASSESSMENT (SECTION 8.0)
// ==========================================================

export async function getNeedsAssessments() {
  const res = await fetch(`${API_BASE_URL}/api/dept/needs-assessment`, { headers: getHeaders() });
  return handleResponse(res, "Failed to load needs assessments");
}

export async function createNeedsAssessment(payload) {
  const res = await fetch(`${API_BASE_URL}/api/dept/needs-assessment`, { method: "POST", headers: getHeaders(), body: JSON.stringify(payload) });
  return handleResponse(res, "Failed to create needs assessment");
}

// ==========================================================
// 4. HARDWARE PROPOSALS (ANNEX A-6 / CAPEX)
// ==========================================================

export async function getProposals(isspPeriod = "", statusFilter = "", skip = 0, limit = 100) {
  let url = `${API_BASE_URL}/api/dept/proposals?skip=${skip}&limit=${limit}`;
  if (isspPeriod) url += `&issp_period=${encodeURIComponent(isspPeriod)}`;
  if (statusFilter) url += `&status_filter=${encodeURIComponent(statusFilter)}`;
  const res = await fetch(url, { headers: getHeaders() });
  return handleResponse(res, "Failed to load proposals");
}

export async function getProposalDetail(proposalId) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${proposalId}`, { headers: getHeaders() });
  return handleResponse(res, "Failed to load proposal details");
}

export async function createDraftProposal(payload) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals`, { method: "POST", headers: getHeaders(), body: JSON.stringify(payload) });
  return handleResponse(res, "Failed to create draft proposal");
}

export async function updateProposal(proposalId, payload) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${proposalId}`, { method: "PUT", headers: getHeaders(), body: JSON.stringify(payload) });
  return handleResponse(res, "Failed to update proposal");
}

export async function deleteProposal(proposalId) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${proposalId}`, { method: "DELETE", headers: getHeaders() });
  return handleResponse(res, "Failed to delete proposal");
}

export async function submitProposal(proposalId) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${proposalId}/submit`, { method: "PUT", headers: getHeaders() });
  return handleResponse(res, "Failed to submit proposal");
}

export async function syncProposalMetadata(proposalId) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${proposalId}/sync-metadata`, { method: "POST", headers: getHeaders() });
  return handleResponse(res, "Failed to sync proposal storage metadata");
}

export async function requestProposalRestore(proposalId) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${proposalId}/restore`, { method: "POST", headers: getHeaders() });
  return handleResponse(res, "Failed to initiate proposal restoration from cold storage");
}

// ==========================================================
// 5. SOFTWARE SUBSCRIPTIONS (ANNEX A-2 / MOOE)
// ==========================================================

export async function getSubscriptions(isspPeriod = "") {
  let url = `${API_BASE_URL}/api/dept/subscriptions`;
  if (isspPeriod) url += `?issp_period=${encodeURIComponent(isspPeriod)}`;
  const res = await fetch(url, { headers: getHeaders() });
  return handleResponse(res, "Failed to load subscriptions");
}

export async function getSubscriptionDetail(subscriptionId) {
  const res = await fetch(`${API_BASE_URL}/api/dept/subscriptions/${subscriptionId}`, { headers: getHeaders() });
  return handleResponse(res, "Failed to load subscription details");
}

export async function createSubscription(payload) {
  const res = await fetch(`${API_BASE_URL}/api/dept/subscriptions`, { method: "POST", headers: getHeaders(), body: JSON.stringify(payload) });
  return handleResponse(res, "Failed to create subscription proposal");
}

export async function updateSubscription(subscriptionId, payload) {
  const res = await fetch(`${API_BASE_URL}/api/dept/subscriptions/${subscriptionId}`, { method: "PUT", headers: getHeaders(), body: JSON.stringify(payload) });
  return handleResponse(res, "Failed to update subscription proposal");
}

export async function deleteSubscription(subscriptionId) {
  const res = await fetch(`${API_BASE_URL}/api/dept/subscriptions/${subscriptionId}`, { method: "DELETE", headers: getHeaders() });
  return handleResponse(res, "Failed to delete subscription proposal");
}

export async function submitSubscription(subscriptionId) {
  const res = await fetch(`${API_BASE_URL}/api/dept/subscriptions/${subscriptionId}/submit`, { method: "PUT", headers: getHeaders() });
  return handleResponse(res, "Failed to submit subscription proposal");
}

export async function syncSubscriptionMetadata(subscriptionId) {
  const res = await fetch(`${API_BASE_URL}/api/dept/subscriptions/${subscriptionId}/sync-metadata`, { method: "POST", headers: getHeaders() });
  return handleResponse(res, "Failed to sync subscription storage metadata");
}

export async function requestSubscriptionRestore(subscriptionId) {
  const res = await fetch(`${API_BASE_URL}/api/dept/subscriptions/${subscriptionId}/restore`, { method: "POST", headers: getHeaders() });
  return handleResponse(res, "Failed to initiate subscription restoration from cold storage");
}

// ==========================================================
// 6. CANVAS EVIDENCE DOCUMENT UPLOADS
// ==========================================================

export async function uploadCanvas(proposalId, supplierName, file) {
  const formData = new FormData();
  formData.append("proposal_id", proposalId);
  formData.append("supplier_name", supplierName);
  formData.append("file", file);
  const res = await fetch(`${API_BASE_URL}/api/dept/upload/canvas`, { method: "POST", headers: getHeaders(true), body: formData });
  return handleResponse(res, "Failed to upload canvas evidence");
}

// ==========================================================
// 7. REMARKS, FEEDBACK & COLLABORATIVE COMMENTS
// ==========================================================

export async function getComments(proposalId) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${proposalId}/comments`, { headers: getHeaders() });
  return handleResponse(res, "Failed to load comments");
}

export async function postComment(proposalId, payload) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${proposalId}/comments`, { method: "POST", headers: getHeaders(), body: JSON.stringify(payload) });
  return handleResponse(res, "Failed to post comment");
}

export async function resolveComment(proposalId, commentId) {
  const res = await fetch(`${API_BASE_URL}/api/dept/proposals/${proposalId}/comments/${commentId}/resolve`, { method: "POST", headers: getHeaders() });
  return handleResponse(res, "Failed to resolve comment");
}