// frontend/src/api/apiClient.js
/**
 * ==============================================================================
 * CENTRALIZED API CLIENT & GLOBAL 401 INTERCEPTOR
 * DICT ISSP v.2026 Compliance Engine Client
 * ==============================================================================
 * Capabilities & Safeguards:
 * - Dynamic Base URL Resolution (VITE_API_URL / VITE_API_BASE_URL fallback)
 * - Automatic Bearer Token Extraction & Authorization Injection
 * - Global 401 Unauthorized Interceptor with Clean Route Preservation
 * - Multi-Part FormData Boundary Protection (Zero Content-Type override)
 * - Comprehensive Human-Readable Error Parsing:
 *    * Pydantic array transformation without machine "body ->" jargon
 *    * DICT Singularity Graph violation list extraction (err.violations)
 *    * Complete elimination of "[object Object]" display bugs
 *    * Rich Error object metadata (err.status, err.data, err.violations)
 * - URL Query Parameter helper integration (options.params support)
 * ==============================================================================
 */

const rawRoot =
  import.meta.env?.VITE_API_URL ||
  import.meta.env?.VITE_API_BASE_URL ||
  "http://localhost:8000";

export const API_BASE_URL = rawRoot.endsWith("/")
  ? rawRoot.slice(0, -1)
  : rawRoot;

/**
 * Retrieves the stored JWT access token from localStorage safely.
 *
 * @returns {string|null}
 */
export function getStoredToken() {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("access_token");
  } catch {
    return null;
  }
}

/**
 * Clears all authentication-specific credentials from local storage.
 */
export function clearAuthSession() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_role");
    localStorage.removeItem("department_id");
    localStorage.removeItem("user_email");
  } catch (err) {
    console.error("Failed to clear auth session keys:", err);
  }
}

/**
 * Handles expired authentication sessions by preserving the user's current route
 * and safely redirecting to the login screen.
 */
function handleSessionExpired() {
  clearAuthSession();
  if (typeof window !== "undefined") {
    const currentPath = window.location.pathname + window.location.search;
    if (!currentPath.includes("/login")) {
      window.location.href = `/login?expired=true&redirect=${encodeURIComponent(
        currentPath
      )}`;
    }
  }
}

/**
 * Formats machine field keys into clean, human-readable titles.
 * e.g., "yearly_quantities" -> "Yearly Quantities", "uacs_object_code" -> "UACS Object Code"
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
    strategic_category_id: "Strategic Category",
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
    project_title: "Project Title",
    project_category: "Project Portfolio Category",
    lead_agency: "Lead Agency",
    implementing_unit: "Implementing Unit",
    funding_source: "Financing Source",
    system_development_status: "System Development Status",
    created_by_students: "In-House Turnover",
    is_in_house_turnover: "In-House Turnover",
    is_expansion: "Expansion Project",
    office_location: "Deployment Location",
    annual_deliverables: "Annual Deliverables",
    harmonization_criteria: "Harmonization Framework Criteria"
  };

  if (specialMap[fieldKey]) {
    return specialMap[fieldKey];
  }

  return fieldKey
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Comprehensive HTTP response parser.
 * Unpacks Pydantic validation arrays, custom DAG violation envelopes,
 * and attaches structured metadata directly to the thrown Error object.
 *
 * @param {Response} res - Native Fetch Response object
 * @param {string} fallbackMessage - Default message if parsing fails
 * @returns {Promise<any>} Parsed JSON or text response
 */
export async function handleResponse(res, fallbackMessage = "Request failed") {
  if (!res.ok) {
    if (res.status === 401) {
      handleSessionExpired();
    }

    let detailMessage = "";
    let rawErrorData = null;
    let violationList = [];

    try {
      rawErrorData = await res.json();
      if (rawErrorData) {
        // 1. Detect Singularity DAG Violations Envelope (Top-level or detail-nested)
        if (Array.isArray(rawErrorData.violations)) {
          violationList = rawErrorData.violations;
        } else if (rawErrorData.detail && Array.isArray(rawErrorData.detail.violations)) {
          violationList = rawErrorData.detail.violations;
        }

        if (typeof rawErrorData.detail === "string") {
          detailMessage = rawErrorData.detail;
        } else if (Array.isArray(rawErrorData.detail)) {
          // 2. Format Pydantic field-level validation errors
          detailMessage = rawErrorData.detail
            .map((err) => {
              if (typeof err === "string") return err;
              const fieldParts = (err.loc || []).filter(
                (p) => p !== "body" && p !== "query" && p !== "path"
              );
              const fieldName = humanizeFieldName(fieldParts.join(" "));
              const rawMsg = err.msg || "Invalid parameter";
              const cleanMsg = rawMsg.charAt(0).toUpperCase() + rawMsg.slice(1);
              return fieldName ? `${fieldName}: ${cleanMsg}` : cleanMsg;
            })
            .join(" | ");
        } else if (violationList.length > 0) {
          // 3. Format DAG Violations Checklist
          const header = rawErrorData.error || rawErrorData.detail?.error || "Compliance Integrity Failure";
          detailMessage = `${header} (${violationList.length} issue${violationList.length > 1 ? "s" : ""}):\n• ${violationList.join("\n• ")}`;
        } else if (rawErrorData.detail && typeof rawErrorData.detail === "object") {
          // 4. Nested detail object handling (prevent [object Object])
          if (rawErrorData.detail.message) {
            detailMessage = rawErrorData.detail.message;
          } else if (rawErrorData.detail.error) {
            detailMessage = rawErrorData.detail.error;
          } else {
            detailMessage = Object.entries(rawErrorData.detail)
              .map(([k, v]) => `${humanizeFieldName(k)}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
              .join(" | ");
          }
        } else if (rawErrorData.message) {
          detailMessage = rawErrorData.message;
        } else if (rawErrorData.error) {
          detailMessage = rawErrorData.error;
        }
      }
    } catch {
      // Body is not JSON (raw text or HTML)
      detailMessage = await res.text().catch(() => "");
    }

    // Safety fallback: Ensure [object Object] is never rendered to the user
    const finalErrorMessage =
      detailMessage && String(detailMessage).trim() !== "[object Object]"
        ? String(detailMessage).trim()
        : `${fallbackMessage} (HTTP Error ${res.status})`;

    const errorObj = new Error(finalErrorMessage);
    errorObj.status = res.status;
    errorObj.data = rawErrorData;
    if (violationList.length > 0) {
      errorObj.violations = violationList;
    }

    throw errorObj;
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return null;
  }

  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

/**
 * Central fetch wrapper that injects headers, tokens, query params, and dispatches requests.
 *
 * @param {string} endpoint - API path (e.g. "/api/admin/proposals") or full URL
 * @param {RequestInit & { token?: string, params?: Record<string, any> }} options - Fetch options
 * @returns {Promise<Response>} Native fetch response
 */
export async function customFetch(endpoint, options = {}) {
  let url =
    endpoint.startsWith("http://") || endpoint.startsWith("https://")
      ? endpoint
      : `${API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  // Process optional query parameters dictionary (options.params)
  if (options.params && typeof options.params === "object") {
    const query = new URLSearchParams();
    Object.entries(options.params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "" && v !== "All" && v !== "all") {
        query.append(k, String(v));
      }
    });
    const qs = query.toString();
    if (qs) {
      url += (url.includes("?") ? "&" : "?") + qs;
    }
  }

  const token = options.token || getStoredToken();
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const headers = { ...(options.headers || {}) };

  // Inject Authorization header if not explicitly provided
  if (token && !headers["Authorization"] && !headers["authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Do not set Content-Type if FormData is used; browser must determine multi-part boundary
  if (!isFormData && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  const fetchConfig = {
    ...options,
    headers,
  };

  // Automatically serialize objects into JSON strings if not FormData or URLSearchParams
  if (
    fetchConfig.body &&
    typeof fetchConfig.body === "object" &&
    !isFormData &&
    !(fetchConfig.body instanceof URLSearchParams)
  ) {
    fetchConfig.body = JSON.stringify(fetchConfig.body);
  }

  try {
    const response = await fetch(url, fetchConfig);
    if (response.status === 401) {
      handleSessionExpired();
    }
    return response;
  } catch (networkError) {
    console.error(`Network communication error reaching [${url}]:`, networkError);
    throw new Error(
      `Network Connection Failure: Unable to communicate with the compliance backend (${networkError.message}). Please verify that the API server is online.`
    );
  }
}

/**
 * Standardized API client with helper methods for REST operations.
 */
export const apiClient = {
  /**
   * Performs a GET request and returns parsed JSON.
   */
  async get(endpoint, options = {}) {
    const res = await customFetch(endpoint, { ...options, method: "GET" });
    return handleResponse(res, `GET ${endpoint} failed`);
  },

  /**
   * Performs a POST request and returns parsed JSON.
   */
  async post(endpoint, body = {}, options = {}) {
    const res = await customFetch(endpoint, {
      ...options,
      method: "POST",
      body,
    });
    return handleResponse(res, `POST ${endpoint} failed`);
  },

  /**
   * Performs a PUT request and returns parsed JSON.
   */
  async put(endpoint, body = {}, options = {}) {
    const res = await customFetch(endpoint, {
      ...options,
      method: "PUT",
      body,
    });
    return handleResponse(res, `PUT ${endpoint} failed`);
  },

  /**
   * Performs a DELETE request and returns parsed JSON.
   */
  async delete(endpoint, options = {}) {
    const res = await customFetch(endpoint, { ...options, method: "DELETE" });
    return handleResponse(res, `DELETE ${endpoint} failed`);
  },

  /**
   * Performs a multipart upload (FormData) and returns parsed JSON.
   */
  async upload(endpoint, formData, options = {}) {
    const res = await customFetch(endpoint, {
      ...options,
      method: "POST",
      body: formData,
    });
    return handleResponse(res, `Upload to ${endpoint} failed`);
  },
};

export default apiClient;