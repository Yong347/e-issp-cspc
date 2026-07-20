import React, { useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { Key, RefreshCw, AlertCircle, CheckCircle, Shield, User } from "lucide-react";

export default function ProfileSettings() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token;

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError("Validation Error: New password fields do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Validation Error: New password must be at least 8 characters long.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${apiUrl}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Password rotation rejected by the authorization system.");
      }

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

  return (
    <div className="space-y-6 max-w-lg mx-auto text-xs text-slate-100 select-none">
      {/* Account Info Card */}
      <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
        <h3 className="text-white font-bold text-sm uppercase tracking-wide flex items-center gap-1.5 border-b border-slate-850 pb-2">
          <User className="w-4 h-4 text-blue-400" />
          <span>User Profile Information</span>
        </h3>
        
        <div className="space-y-3 font-mono">
          <div className="flex justify-between border-b border-slate-850/60 pb-2">
            <span className="text-slate-500">Authorized Email:</span>
            <span className="text-slate-300 font-bold">{user?.email || "Unknown User"}</span>
          </div>
          <div className="flex justify-between border-b border-slate-850/60 pb-2">
            <span className="text-slate-500">System Role Scope:</span>
            <span className="text-blue-400 font-bold uppercase tracking-wider text-[10px]">
              {user?.role === "ROLE_MIS_ADMIN" ? "MIS Administrator" : "Department Planner"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Department Identifier:</span>
            <span className="text-slate-300 font-bold">
              {user?.department_id ? `ID Code: ${user.department_id}` : "Unassociated Profile"}
            </span>
          </div>
        </div>
      </div>

      {/* Security Credentials Card */}
      <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
        <h3 className="text-white font-bold text-sm uppercase tracking-wide flex items-center gap-1.5 border-b border-slate-850 pb-2">
          <Key className="w-4 h-4 text-amber-500" />
          <span>Rotate Account Password</span>
        </h3>

        {error && (
          <div className="p-3 bg-red-955/40 border border-red-900/50 text-red-300 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 bg-emerald-950/40 border border-emerald-900/50 text-emerald-300 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[10px] uppercase font-bold text-slate-400">Current Password</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white font-mono tracking-widest outline-none focus:border-amber-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] uppercase font-bold text-slate-400">New Password</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white font-mono tracking-widest outline-none focus:border-amber-500 placeholder:text-slate-700"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] uppercase font-bold text-slate-400">Confirm New Password</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white font-mono tracking-widest outline-none focus:border-amber-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full p-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 rounded-lg font-extrabold tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Processing password rotation...</span>
              </>
            ) : (
              <>
                <Shield className="w-3.5 h-3.5" />
                <span>Save New Credentials</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}