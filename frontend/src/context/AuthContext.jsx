// frontend/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

// Safe Base64-URL decoding
// Standard atob() crashes on non-ASCII characters and unescaped base64url characters (- and _)
const safeDecodeJWT = (token) => {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    
    // Convert Base64Url to standard Base64
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    
    // Safely decode parsing URI components to prevent Unicode string exceptions
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
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

// Targeted Storage Cleanup
// Prevents erasing unrelated application caches (like dark mode toggles or saved table filters)
const clearAuthSession = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("user_role");
  localStorage.removeItem("department_id");
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Synchronizes and restores existing session states on component boot
  useEffect(() => {
    try {
      const token = localStorage.getItem("access_token");
      const role = localStorage.getItem("user_role");
      const departmentId = localStorage.getItem("department_id");

      if (token && role) {
        // Safely parse the JWT payload
        const payload = safeDecodeJWT(token);

        if (payload) {
          // Hydration Deadlock Bypass
          // If the backend drops the 'exp' claim, fallback to treating the token as valid 
          // rather than evaluating NaN > Date.now() which triggers an infinite logout loop.
          // Incorporates a 60-second grace window to absorb clock drift and prevent premature logouts.
          const isExpired = payload.exp ? (((payload.exp * 1000) - 60000) <= Date.now()) : false;

          if (!isExpired) {
            setUser({
              token,
              role,
              department_id: departmentId && departmentId !== "null" ? parseInt(departmentId, 10) : null
            });
          } else {
            console.warn("Hydration pre-flight check: Access token has expired. Clearing local session.");
            clearAuthSession();
            setUser(null);
          }
        } else {
          // Clear malformed tokens automatically
          console.error("Malformed token detected during hydration. Purging session credentials.");
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
   * Atomically commits user credentials and session parameters to both 
   * React state and localStorage to prevent state drift during transition.
   */
  const loginSession = (token, role, departmentId) => {
    localStorage.setItem("access_token", token);
    localStorage.setItem("user_role", role);
    
    if (departmentId !== undefined && departmentId !== null) {
      localStorage.setItem("department_id", String(departmentId));
    } else {
      localStorage.removeItem("department_id");
    }

    setUser({
      token,
      role,
      department_id: departmentId !== undefined && departmentId !== null ? parseInt(departmentId, 10) : null
    });
  };

  /**
   * Atomically wipes active session parameters to prevent authorization leaks.
   */
  const logoutSession = () => {
    clearAuthSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginSession, logoutSession }}>
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