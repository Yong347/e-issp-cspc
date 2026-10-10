// frontend/src/api/auth.js
import { API_BASE_URL, handleResponse } from "./apiClient.js";

// Re-export API_ROOT for backwards compatibility across existing callers
export const API_ROOT = API_BASE_URL;
const BASE_URL = `${API_BASE_URL}/api/auth`;

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

  return handleResponse(response, "Authentication failed");
};