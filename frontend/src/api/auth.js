// frontend/src/api/auth.js

/**
 * Dynamically resolves the API root:
 * In deployed/production browser environments (not running on local Vite dev server ports),
 * it uses window.location.origin so requests hit the live server instead of localhost:8000.
 */
const getApiRoot = () => {
  if (typeof window !== "undefined" && window.location?.origin) {
    const { hostname, origin, port } = window.location;
    if (
      port !== "5173" &&
      port !== "3000" &&
      hostname !== "localhost" &&
      hostname !== "127.0.0.1"
    ) {
      return origin;
    }
  }

  const rawRoot = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL;
  if (rawRoot && rawRoot.trim() !== "") {
    return rawRoot.trim().endsWith("/") ? rawRoot.trim().slice(0, -1) : rawRoot.trim();
  }

  return "http://localhost:8000";
};

export const API_ROOT = getApiRoot();
const BASE_URL = `${API_ROOT}/api/auth`;

/**
 * Parses FastAPI error envelopes, handling strings, Pydantic validation arrays,
 * or custom exception objects into clear, human-readable messages.
 */
async function parseErrorMessage(response, defaultMsg) {
  try {
    const errorData = await response.json();
    if (errorData) {
      if (errorData.detail) {
        if (typeof errorData.detail === "string") {
          return errorData.detail;
        }
        if (Array.isArray(errorData.detail)) {
          // Flatten and format Pydantic validation error lists
          return errorData.detail
            .map((err) => {
              const field = err.loc ? err.loc.filter((p) => p !== "body").join(" -> ") : "";
              return field ? `[${field}]: ${err.msg}` : (err.msg || JSON.stringify(err));
            })
            .join(" | ");
        }
        return JSON.stringify(errorData.detail);
      }
      if (errorData.message) {
        return errorData.message;
      }
      return JSON.stringify(errorData);
    }
  } catch (err) {
    console.error("API response parsing note: Response body is not valid JSON.", err);
  }
  return `${defaultMsg} (HTTP ${response.status})`;
}

/**
 * Authenticates an institutional user via standard manual credentials (email + password).
 * Dispatches an application/x-www-form-urlencoded payload conforming to OAuth2PasswordRequestForm.
 *
 * @param {string} email - Institutional email address
 * @param {string} password - User password
 * @returns {Promise<{ access_token: string, token_type: string, role: string, department_id: number|null }>}
 */
export const login = async (email, password) => {
  const formData = new URLSearchParams();
  formData.append("username", (email || "").trim().toLowerCase());
  formData.append("password", password);

  const response = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  if (!response.ok) {
    const errorMessage = await parseErrorMessage(response, "Authentication failed");
    throw new Error(errorMessage);
  }

  return response.json();
};