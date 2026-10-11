// frontend/src/api/apiClient.js
/**
 * ==============================================================================
 * CENTRALIZED API CLIENT & GLOBAL 401 INTERCEPTOR
 * DICT ISSP v.2026 Compliance Engine Client
 * ==============================================================================
 */

/**
 * Dynamically resolves API root: prioritizes current browser origin in production
 * (Azure App Service / live custom domains) to prevent Vite from hardcoding localhost:8000,
 * while preserving local development server behavior on port 5173 or 3000.
 */
export const getBaseUrl = () => {
  // 1. If running in browser and deployed (not on local Vite dev server ports):
  if (typeof window !== "undefined" && window.location?.origin) {
    const { hostname, origin, port } = window.location;
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
    const isDevPort = port === "5173" || port === "3000";

    if (!isDevPort && !isLocalHost) {
      return origin;
    }
  }

  // 2. Environment variable configuration fallback:
  const envUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim() !== "") {
    return envUrl.trim().endsWith("/") ? envUrl.trim().slice(0, -1) : envUrl.trim();
  }

  // 3. Standard local development backend default:
  return "http://localhost:8000";
};

export const API_BASE_URL = getBaseUrl();
export const API_ROOT = API_BASE_URL;

/**
 * Retrieves the stored JWT access token from localStorage safely.
 * Checks both 'access_token' and 'token' keys for maximum resilience.
 *
 * @returns {string|null}
 */
export function getStoredToken() {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("access_token") || localStorage.getItem("token") || null;
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
    localStorage.removeItem("token");
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
export function handleSessionExpired() {
  clearAuthSession();
  if (typeof window !== "undefined") {
    const currentPath = window.location.pathname + window.location.search;
    if (!currentPath.includes("/login")) {
      window.location.href = `/login?expired=true&redirect=${encodeURIComponent(currentPath)}`;
    }
  }
}

/**
 * Standardized header resolver shared across all API modules (admin.js, dept.js, auth.js).
 * Omit Content-Type when isMultipart is true so the browser configures boundary headers automatically.
 *
 * @param {string|null} token - Optional explicit token override
 * @param {boolean} isMultipart - True when sending FormData
 * @returns {HeadersInit}
 */
export function getHeaders(token = null, isMultipart = false) {
  const resolvedToken = token || getStoredToken();
  const headers = {};

  if (resolvedToken) {
    headers["Authorization"] = `Bearer ${resolvedToken}`;
  }

  if (!isMultipart) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

/**
 * Formats machine field keys into clean, human-readable titles.
 *
 * @param {string} fieldKey
 * @returns {string}
 */
export function humanizeFieldName(fieldKey) {
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
    harmonization_criteria: "Harmonization Framework Criteria",
    target_year: "Target Implementation Year",
    proposed_cost: "Proposed Development Cost",
    frontline_hosting_type: "Frontline Hosting Mode"
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
 * Unpacks Pydantic field validation arrays, extracts DICT Singularity Graph violations,
 * and intercepts 401 expirations cleanly.
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
        if (Array.isArray(rawErrorData.violations)) {
          violationList = rawErrorData.violations;
        } else if (rawErrorData.detail && Array.isArray(rawErrorData.detail.violations)) {
          violationList = rawErrorData.detail.violations;
        }

        if (typeof rawErrorData.detail === "string") {
          detailMessage = rawErrorData.detail;
        } else if (Array.isArray(rawErrorData.detail)) {
          detailMessage = rawErrorData.detail
            .map((err) => {
              if (typeof err === "string") return err;
              const fieldParts = (err.loc || []).filter(
                (p) => p !== "body" && p !== "query" && p !== "path"
              );
              const fieldName = humanizeFieldName(fieldParts.join(" "));
              const rawMsg = err.msg || "Invalid parameter";
              const cleanMsg = rawMsg.charAt(0).toUpperCase() + rawMsg.slice(1);
              return fieldName ? `[${fieldName}]: ${cleanMsg}` : cleanMsg;
            })
            .join(" | ");
        } else if (violationList.length > 0) {
          const header = rawErrorData.error || rawErrorData.detail?.error || "Compliance Integrity Failure";
          detailMessage = `${header} (${violationList.length} issue${violationList.length > 1 ? "s" : ""}):\n• ${violationList.join("\n• ")}`;
        } else if (rawErrorData.detail && typeof rawErrorData.detail === "object") {
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
      detailMessage = await res.text().catch(() => "");
    }

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
 * @param {string} endpoint - API path or full URL
 * @param {RequestInit & { token?: string, params?: Record<string, any> }} options
 * @returns {Promise<Response>}
 */
export async function customFetch(endpoint, options = {}) {
  let url =
    endpoint.startsWith("http://") || endpoint.startsWith("https://")
      ? endpoint
      : `${API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

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

  if (token && !headers["Authorization"] && !headers["authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (!isFormData && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  const fetchConfig = {
    ...options,
    headers,
  };

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

export const apiClient = {
  async get(endpoint, options = {}) {
    const res = await customFetch(endpoint, { ...options, method: "GET" });
    return handleResponse(res, `GET ${endpoint} failed`);
  },

  async post(endpoint, body = {}, options = {}) {
    const res = await customFetch(endpoint, {
      ...options,
      method: "POST",
      body,
    });
    return handleResponse(res, `POST ${endpoint} failed`);
  },

  async put(endpoint, body = {}, options = {}) {
    const res = await customFetch(endpoint, {
      ...options,
      method: "PUT",
      body,
    });
    return handleResponse(res, `PUT ${endpoint} failed`);
  },

  async delete(endpoint, options = {}) {
    const res = await customFetch(endpoint, { ...options, method: "DELETE" });
    return handleResponse(res, `DELETE ${endpoint} failed`);
  },

  async upload(endpoint, formData, options = {}) {
    const res = await customFetch(endpoint, {
      ...options,
      method: "POST",
      body: formData,
    });
    return handleResponse(res, `Upload to ${endpoint} failed`);
  },

  async blob(endpoint, options = {}) {
    const res = await customFetch(endpoint, {
      ...options,
      method: options.method || "GET",
    });
    if (!res.ok) {
      return handleResponse(res, `Download from ${endpoint} failed`);
    }
    return res.blob();
  },
};

export default apiClient;