// frontend/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

/**
 * Safe Base64-URL decoding utility.
 * Handles URL-safe character conversions (- to +, _ to /), proper padding,
 * and multi-byte UTF-8 string encoding to prevent window.atob exceptions.
 */
const safeDecodeJWT = (token) => {
  if (!token || typeof token !== "string") return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const paddedBase64 = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');

    const jsonPayload = decodeURIComponent(
      window.atob(paddedBase64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("JWT Decoding Failure:", error);
    return null;
  }
};

/**
 * Targeted Storage Cleanup.
 * Wipes only authentication-specific keys, avoiding destruction of unrelated
 * storage keys like UI theme preferences or table sorting states.
 */
const clearAuthSession = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("token");
  localStorage.removeItem("user_role");
  localStorage.removeItem("department_id");
  localStorage.removeItem("user_email");
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Synchronizes and restores existing session credentials on mount
  useEffect(() => {
    try {
      const token = localStorage.getItem("access_token") || localStorage.getItem("token");
      const storedRole = localStorage.getItem("user_role");
      const storedDeptId = localStorage.getItem("department_id");
      const storedEmail = localStorage.getItem("user_email");

      if (token) {
        const payload = safeDecodeJWT(token);

        if (payload) {
          // Hydration Deadlock & Clock Skew Guard:
          // Uses a 60-second grace window to absorb system clock drift.
          const isExpired = payload.exp ? (((payload.exp * 1000) - 60000) <= Date.now()) : false;

          if (!isExpired) {
            const resolvedRole = payload.role || storedRole || "ROLE_DEPT_USER";
            const resolvedEmail = payload.sub || storedEmail || "";
            const rawDept = payload.dept_id !== undefined ? payload.dept_id : storedDeptId;
            const resolvedDeptId = rawDept !== null && rawDept !== undefined && rawDept !== "null"
              ? parseInt(rawDept, 10) 
              : null;

            setUser({
              token,
              email: resolvedEmail,
              role: resolvedRole,
              department_id: resolvedDeptId
            });
          } else {
            console.warn("Hydration pre-flight notice: Access token has expired. Clearing session.");
            clearAuthSession();
            setUser(null);
          }
        } else {
          console.error("Malformed authentication token encountered. Purging session.");
          clearAuthSession();
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (e) {
      console.error("Failed to restore previous authentication session:", e);
      clearAuthSession();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Atomically commits user credentials and claims to both state and localStorage.
   * Automatically decodes the JWT token to extract the user's email (`sub`) if not explicitly supplied.
   *
   * @param {string} token - Bearer JWT access token
   * @param {string} role - Authorization role tag (e.g., ROLE_MIS_ADMIN, ROLE_DEPT_USER, ROLE_SUPPLY_USER)
   * @param {number|string|null} departmentId - Assigned institutional unit ID
   * @param {string|null} email - Optional explicit email override
   */
  const loginSession = (token, role, departmentId, email = null) => {
    const payload = safeDecodeJWT(token);
    const resolvedEmail = email || payload?.sub || "";
    const resolvedRole = role || payload?.role || "ROLE_DEPT_USER";
    const rawDept = departmentId !== undefined && departmentId !== null ? departmentId : payload?.dept_id;
    const resolvedDeptId = rawDept !== null && rawDept !== undefined && rawDept !== "null"
      ? parseInt(rawDept, 10)
      : null;

    localStorage.setItem("access_token", token);
    localStorage.setItem("token", token);
    localStorage.setItem("user_role", resolvedRole);

    if (resolvedEmail) {
      localStorage.setItem("user_email", resolvedEmail);
    } else {
      localStorage.removeItem("user_email");
    }

    if (resolvedDeptId !== null && !isNaN(resolvedDeptId)) {
      localStorage.setItem("department_id", String(resolvedDeptId));
    } else {
      localStorage.removeItem("department_id");
    }

    setUser({
      token,
      email: resolvedEmail,
      role: resolvedRole,
      department_id: resolvedDeptId
    });
  };

  /**
   * Dynamically updates user metadata in context and localStorage without requiring a full re-login.
   *
   * @param {Object} updates - Object containing fields to update (e.g., { email, role, department_id })
   */
  const updateUser = (updates) => {
    setUser((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...updates };

      if (updates.role) localStorage.setItem("user_role", updates.role);
      if (updates.email) localStorage.setItem("user_email", updates.email);
      if (updates.department_id !== undefined) {
        if (updates.department_id !== null && !isNaN(updates.department_id)) {
          localStorage.setItem("department_id", String(updates.department_id));
        } else {
          localStorage.removeItem("department_id");
        }
      }
      return next;
    });
  };

  /**
   * Atomically clears all active session parameters to prevent authorization leaks.
   */
  const logoutSession = () => {
    clearAuthSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginSession, logoutSession, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be consumed within an AuthProvider boundary.");
  }
  return context;
};