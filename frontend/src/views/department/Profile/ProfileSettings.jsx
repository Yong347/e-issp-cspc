// frontend/src/views/department/Profile/ProfileSettings.jsx
import React, { useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { 
  Key, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Shield, 
  User, 
  Eye, 
  EyeOff,
  Building,
  Mail,
  Lock,
  X
} from "lucide-react";
import { API_BASE_URL, handleResponse, getHeaders } from "../../../api/apiClient";

export default function ProfileSettings() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const token = 
    user?.token || 
    user?.accessToken || 
    (typeof window !== "undefined" 
      ? localStorage.getItem("access_token") || localStorage.getItem("token") || "" 
      : "");

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError("Validation Error: New password and confirmation do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Validation Error: New password must be at least 8 characters long.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: getHeaders(token),
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });

      await handleResponse(res, "Password rotation rejected by the authorization system.");

      setSuccess("Account password rotated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message || "An error occurred during password modification.");
    } finally {
      setSubmitting(false);
    }
  };

  const roleLabel = 
    user?.role === "ROLE_MIS_ADMIN" 
      ? "MIS Administrator (Full Governance)" 
      : user?.role === "ROLE_SUPPLY_USER" 
      ? "Supply & Property Officer (Annex 1 Custody)" 
      : "Department Planner (Resource Proposals)";

  const deptLabel = 
    user?.department_name 
      ? `${user.department_name} (ID: #${user.department_id})` 
      : user?.department_id 
      ? `Department ID: #${user.department_id}` 
      : user?.role === "ROLE_MIS_ADMIN"
      ? "MIS Governance Directorate / Global Administration"
      : "Central Office / Unassigned";

  return (
    <div className="space-y-6 max-w-xl mx-auto text-xs text-slate-800 dark:text-slate-100 select-none transition-colors duration-200 font-sans">
      
      {/* Account Info Card */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs">
        <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 font-serif">
          <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>Institutional Account Profile</span>
        </h3>
        
        <div className="space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-sans">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              <span>Authorized Email:</span>
            </span>
            <span className="text-slate-900 dark:text-white font-bold">{user?.email || "user@agency.gov.ph"}</span>
          </div>

          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-sans">
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              <span>System Role Scope:</span>
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
              user?.role === "ROLE_MIS_ADMIN"
                ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20"
                : user?.role === "ROLE_SUPPLY_USER"
                ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20"
                : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"
            }`}>
              {roleLabel}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-sans">
              <Building className="w-3.5 h-3.5 text-slate-400" />
              <span>Department Assignment:</span>
            </span>
            <span className="text-slate-900 dark:text-white font-bold text-right truncate max-w-[240px]" title={deptLabel}>
              {deptLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Security Credentials Card */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs">
        <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 font-serif">
          <Key className="w-4 h-4 text-amber-500" />
          <span>Rotate Security Password</span>
        </h3>

        {error && (
          <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-center justify-between gap-2 shadow-xs animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span className="font-semibold whitespace-pre-wrap">{error}</span>
            </div>
            <button 
              type="button"
              onClick={() => setError(null)} 
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-955/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-center justify-between gap-2 shadow-xs animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="font-semibold">{success}</span>
            </div>
            <button 
              type="button"
              onClick={() => setSuccess(null)} 
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
              Current Account Password
            </label>
            <div className="relative">
              <input
                type={showCurrentPassword ? "text" : "password"}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password..."
                className="w-full p-2.5 pr-10 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:border-amber-500 transition-colors text-xs"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                title={showCurrentPassword ? "Hide password" : "Show password"}
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
              New Password (Min. 8 Characters)
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? "text" : "password"}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters..."
                className="w-full p-2.5 pr-10 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:border-amber-500 transition-colors text-xs placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                title={showNewPassword ? "Hide password" : "Show password"}
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-type new password..."
                className="w-full p-2.5 pr-10 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:border-amber-500 transition-colors text-xs"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                title={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl font-bold tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm text-xs"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Processing password rotation...</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Save New Credentials</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}