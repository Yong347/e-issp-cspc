// frontend/src/api/auth.js

const rawRoot = import.meta.env?.VITE_API_URL || "http://localhost:8000";
export const API_ROOT = rawRoot.endsWith("/") ? rawRoot.slice(0, -1) : rawRoot;
const BASE_URL = `${API_ROOT}/api/auth`;

/**
 * Parses FastAPI error details, accommodating strings, arrays of validation errors,
 * or general objects. Avoids ReferenceErrors by validating scope variables.
 */
async function parseErrorMessage(response, defaultMsg) {
  try {
    const errorData = await response.json();
    if (errorData) {
      if (errorData.detail) {
        if (typeof errorData.detail === 'string') {
          return errorData.detail;
        }
        if (Array.isArray(errorData.detail)) {
          // Return the first validation error message if available
          return errorData.detail[0]?.msg || JSON.stringify(errorData.detail);
        }
        return JSON.stringify(errorData.detail);
      }
      // Standard fallback to serialize the raw error envelope if 'detail' is not present
      return JSON.stringify(errorData);
    }
  } catch (err) {
    // Log parsing failures to avoid blocking login runtime actions
    console.error("API response parsing failed. Body is likely not valid JSON:", err);
  }
  // Return the default message appended with the HTTP status code for better context
  return `${defaultMsg} (Status Code: ${response.status})`;
}

export const login = async (email, password) => {
  const formData = new URLSearchParams();
  formData.append("username", email);
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

export const loginWithGoogle = async (idToken, email) => {
  const response = await fetch(`${BASE_URL}/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken, email }),
  });

  if (!response.ok) {
    const errorMessage = await parseErrorMessage(response, "Google authentication failed");
    throw new Error(errorMessage);
  }
  return response.json();
};