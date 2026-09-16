// frontend/src/views/admin/Users/UserWhitelisting.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { 
  UserPlus, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Shield, 
  Plus, 
  Trash2, 
  Landmark, 
  Edit2, 
  Key, 
  Save, 
  X, 
  Eye, 
  EyeOff, 
  Building,
  UserCheck,
  Search,
  Lock
} from "lucide-react";

export default function UserWhitelisting() {
  const { user } = useAuth();
  
  // Whitelist States
  const [whitelist, setWhitelist] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("ROLE_DEPT_USER");
  const [deptId, setDeptId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Department Management States
  const [departments, setDepartments] = useState([]);
  const [newDeptName, setNewDeptName] = useState("");
  const [creatingDept, setCreatingDept] = useState(false);

  // Global Notification States
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Search Filter
  const [searchQuery, setSearchQuery] = useState("");

  // EDIT MODAL STATES: USER
  const [editingUser, setEditingUser] = useState(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editRole, setEditRole] = useState("ROLE_DEPT_USER");
  const [editDeptId, setEditDeptId] = useState("");

  // EDIT MODAL STATES: DEPARTMENT
  const [editingDept, setEditingDept] = useState(null);
  const [editDeptName, setEditDeptName] = useState("");

  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token || user?.accessToken || localStorage.getItem("access_token") || "";

  const parseErrorMessage = async (res, defaultContext) => {
    let detail = "";
    try {
      const errorData = await res.json();
      if (errorData?.detail) {
        if (typeof errorData.detail === "string") {
          detail = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          detail = errorData.detail
            .map(err => `${err.loc ? err.loc.filter(p => p !== "body").join(" -> ") + ": " : ""}${err.msg || JSON.stringify(err)}`)
            .join(" | ");
        } else {
          detail = JSON.stringify(errorData.detail);
        }
      } else if (errorData?.message) {
        detail = errorData.message;
      }
    } catch {
      detail = await res.text().catch(() => `HTTP error ${res.status}`);
    }
    return detail || `${defaultContext} (HTTP ${res.status})`;
  };

  const fetchDepartments = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/departments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDepartments(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0 && !deptId) {
          setDeptId(String(data[0].department_id || data[0].id));
        }
      } else {
        const msg = await parseErrorMessage(res, "Failed to load departments registry");
        setError(msg);
      }
    } catch (e) {
      setError(e.message || "Failed to query the departments endpoint.");
    }
  };

  const fetchWhitelist = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/users/whitelist`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWhitelist(Array.isArray(data) ? data : []);
      } else {
        const msg = await parseErrorMessage(res, "Failed to query user registry");
        setError(msg);
        setWhitelist([]);
      }
    } catch (e) {
      setError(e.message || "Network error querying user registry.");
      setWhitelist([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchDepartments();
      fetchWhitelist();
    }
  }, [token]);

  // CREATE USER (Mandatory Password & Multi-Role Support)
  const handleAddUser = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Initial password is required for manual administrative onboarding
    if (!password || password.trim().length < 8) {
      setError("Initial account password is required and must be at least 8 characters long.");
      return;
    }

    if (role !== "ROLE_MIS_ADMIN" && !deptId) {
      setError("Department assignment is mandatory for Department Users and Supply Officers.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/users/whitelist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password.trim(),
          assigned_department_id: role === "ROLE_MIS_ADMIN" ? null : parseInt(deptId, 10),
          role_tag: role
        })
      });

      if (!res.ok) {
        const msg = await parseErrorMessage(res, "Failed to onboard user account");
        setError(msg);
      } else {
        setSuccess(`User account '${email}' successfully onboarded and authorized.`);
        setEmail("");
        setPassword("");
        fetchWhitelist();
      }
    } catch (err) {
      setError(err.message || "Failed to connect to user onboarding service.");
    } finally {
      setSubmitting(false);
    }
  };

  // UPDATE USER
  const openEditUserModal = (u) => {
    setEditingUser(u);
    setEditEmail(u.email);
    setEditRole(u.role_tag);
    setEditDeptId(
      u.department_id 
        ? String(u.department_id) 
        : (departments[0]?.department_id ? String(departments[0].department_id) : "")
    );
    setEditPassword("");
    setShowEditPassword(false);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (editRole !== "ROLE_MIS_ADMIN" && !editDeptId) {
      setError("Department assignment is mandatory for this role.");
      return;
    }

    if (editPassword.trim() && editPassword.trim().length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }

    setSubmitting(true);
    const payload = {
      email: editEmail.trim().toLowerCase(),
      role_tag: editRole,
      assigned_department_id: editRole === "ROLE_MIS_ADMIN" ? null : parseInt(editDeptId, 10)
    };

    if (editPassword.trim()) {
      payload.password = editPassword.trim();
    }

    try {
      const res = await fetch(`${apiUrl}/api/admin/users/whitelist/${editingUser.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const msg = await parseErrorMessage(res, "Failed to update user profile");
        setError(msg);
      } else {
        setSuccess(`Account profile for '${editEmail}' updated successfully.`);
        setEditingUser(null);
        fetchWhitelist();
      }
    } catch (err) {
      setError(err.message || "Failed to submit user updates.");
    } finally {
      setSubmitting(false);
    }
  };

  // DELETE USER
  const handleDeleteUser = async (userId, userEmail) => {
    if (userEmail === user?.email) {
      setError("Administrative Guard: You are prohibited from deleting your active account session.");
      return;
    }

    if (!window.confirm(`Permanently remove account '${userEmail}' from the institutional registry?`)) return;

    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/users/whitelist/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const msg = await parseErrorMessage(res, "Failed to delete user account");
        setError(msg);
      } else {
        setSuccess(`Account '${userEmail}' successfully removed from registry.`);
        fetchWhitelist();
      }
    } catch (err) {
      setError(err.message || "Network error deleting user.");
    }
  };

  // CREATE DEPARTMENT
  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;

    setError(null);
    setSuccess(null);
    setCreatingDept(true);

    try {
      const res = await fetch(`${apiUrl}/api/admin/departments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newDeptName.trim() })
      });

      if (!res.ok) {
        const msg = await parseErrorMessage(res, "Failed to create department");
        setError(msg);
      } else {
        setSuccess(`Department '${newDeptName.trim()}' added successfully to active registry.`);
        setNewDeptName("");
        await fetchDepartments();
      }
    } catch (err) {
      setError(err.message || "Network error creating department.");
    } finally {
      setCreatingDept(false);
    }
  };

  // UPDATE DEPARTMENT
  const openEditDeptModal = (dept) => {
    setEditingDept(dept);
    setEditDeptName(dept.department_name || dept.name || "");
  };

  const handleUpdateDepartment = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreatingDept(true);

    const targetId = editingDept.department_id || editingDept.id;

    try {
      const res = await fetch(`${apiUrl}/api/admin/departments/${targetId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: editDeptName.trim() })
      });

      if (!res.ok) {
        const msg = await parseErrorMessage(res, "Failed to update department details");
        setError(msg);
      } else {
        setSuccess("Department designation updated successfully.");
        setEditingDept(null);
        setEditDeptName("");
        fetchDepartments();
        fetchWhitelist();
      }
    } catch (err) {
      setError(err.message || "Network error updating department.");
    } finally {
      setCreatingDept(false);
    }
  };

  // DELETE DEPARTMENT
  const handleDeleteDepartment = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete the department '${name}'? This may affect linked accounts and proposals.`)) return;

    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/departments/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const msg = await parseErrorMessage(res, "Failed to delete department");
        setError(msg);
      } else {
        setSuccess(`Department '${name}' removed successfully from active registry.`);
        await fetchDepartments();
      }
    } catch (err) {
      setError(err.message || "Network error deleting department.");
    }
  };

  // Filter accounts list based on search term
  const filteredWhitelist = whitelist.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const matchesEmail = (u.email || "").toLowerCase().includes(q);
    const matchesRole = (u.role_tag || "").toLowerCase().includes(q);
    const matchesDept = (u.department_name || "").toLowerCase().includes(q);
    return matchesEmail || matchesRole || matchesDept;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-slate-800 dark:text-slate-100 select-none text-xs font-sans transition-colors duration-200">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 gap-4 shadow-sm">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600 dark:text-blue-500" />
            <span>Institutional User Management & Manual Onboarding</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manually register Department Planners, Supply Officers, and Administrators with direct credential access and department mappings.
          </p>
        </div>
        <button
          onClick={fetchWhitelist}
          disabled={loading}
          className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-red-955/20 border border-rose-200 dark:border-red-900/60 text-rose-700 dark:text-red-300 rounded-xl flex items-center gap-2.5 animate-fadeIn shadow-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-center gap-2.5 animate-fadeIn shadow-xs">
          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Creator Form & Department Management */}
        <div className="space-y-6">
          {/* User Onboarding Form Box */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
            <h3 className="text-slate-900 dark:text-white font-bold text-xs tracking-wider uppercase border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-500" />
              <span>Manually Onboard User</span>
            </h3>
            
            <form onSubmit={handleAddUser} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
                  Institutional Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@agency.gov.ph"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono outline-none focus:border-blue-500 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
                  Initial Password (Mandatory)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full p-2.5 pr-10 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono outline-none focus:border-blue-500 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
                  System Role Scope
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 outline-none cursor-pointer focus:border-blue-500 text-xs"
                >
                  <option value="ROLE_DEPT_USER">Department User (Proposals & Needs)</option>
                  <option value="ROLE_SUPPLY_USER">Supply Officer (Annex 1 Master Inventory)</option>
                  <option value="ROLE_MIS_ADMIN">MIS Admin (Full Governance & Compiler)</option>
                </select>
              </div>

              {role !== "ROLE_MIS_ADMIN" && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
                    Assigned Department
                  </label>
                  {departments.length > 0 ? (
                    <select
                      value={deptId}
                      onChange={(e) => setDeptId(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 outline-none cursor-pointer focus:border-blue-500 text-xs"
                      required
                    >
                      {departments.map((dept) => (
                        <option key={dept.department_id || dept.id} value={String(dept.department_id || dept.id)}>
                          {dept.department_name || dept.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-slate-500 italic block text-[10px] bg-slate-50 dark:bg-slate-955 p-2.5 rounded border border-slate-200 dark:border-slate-850">
                      Please register a department division below first.
                    </span>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || (role !== "ROLE_MIS_ADMIN" && departments.length === 0)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-lg cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm text-xs"
              >
                <UserPlus className="w-4 h-4" />
                <span>{submitting ? "Onboarding..." : "Create & Authorize User"}</span>
              </button>
            </form>
          </div>

          {/* Department Management Panel */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
            <h3 className="text-slate-900 dark:text-white font-bold text-xs tracking-wider uppercase border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center gap-1.5">
              <Landmark className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Department Registry</span>
            </h3>

            <form onSubmit={handleCreateDepartment} className="flex gap-2">
              <input
                type="text"
                required
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="e.g. Planning & Management Service"
                className="flex-1 p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none focus:border-purple-500 text-xs"
              />
              <button
                type="submit"
                disabled={creatingDept}
                className="p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold shrink-0 flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{creatingDept ? "..." : "Add"}</span>
              </button>
            </form>

            <div className="max-h-44 overflow-y-auto space-y-1.5 pt-1 pr-1">
              {departments.map((dept) => {
                const deptIdVal = dept.department_id || dept.id;
                const deptNameVal = dept.department_name || dept.name;
                return (
                  <div key={deptIdVal} className="flex justify-between items-center bg-slate-50 dark:bg-slate-955 p-2 rounded-lg border border-slate-200 dark:border-slate-850 text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{deptNameVal}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEditDeptModal(dept)}
                        className="p-1 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-800 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors cursor-pointer"
                        title="Edit Department Name"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteDepartment(deptIdVal, deptNameVal)}
                        className="p-1 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-red-955 border border-slate-300 dark:border-slate-800 text-slate-500 hover:text-rose-600 dark:hover:text-red-400 rounded transition-colors cursor-pointer"
                        title="Delete Department"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: User Accounts Table */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm h-fit">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                Active Institutional Accounts
              </h3>
              <span className="text-[10px] font-mono text-slate-500">
                {whitelist.length} Registered User Accounts
              </span>
            </div>

            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search email, role, or unit..."
                className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none focus:border-blue-500 text-xs placeholder-slate-400"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                <span>Loading accounts...</span>
              </div>
            ) : filteredWhitelist.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold">
                    <th className="py-2.5 px-3">Email Address</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Assigned Unit</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {filteredWhitelist.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-950/30 transition-colors">
                      <td className="py-3 px-3 font-mono font-semibold text-slate-900 dark:text-slate-200">{u.email}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase font-mono border ${
                          u.role_tag === "ROLE_MIS_ADMIN"
                            ? "bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-400"
                            : u.role_tag === "ROLE_SUPPLY_USER"
                            ? "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-400"
                            : "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400"
                        }`}>
                          {u.role_tag === "ROLE_MIS_ADMIN" ? "Admin" : u.role_tag === "ROLE_SUPPLY_USER" ? "Supply" : "Dept"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                        {u.department_name || (u.role_tag === "ROLE_MIS_ADMIN" ? "Global Access" : "Unassigned")}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => openEditUserModal(u)}
                            className="p-1.5 bg-slate-100 dark:bg-slate-955 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded cursor-pointer transition-colors"
                            title="Edit Credentials"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id, u.email)}
                            className="p-1.5 bg-slate-100 dark:bg-slate-955 hover:bg-rose-100 dark:hover:bg-red-955 border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-red-400 rounded cursor-pointer transition-colors"
                            title="Delete Account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-16 text-slate-400 dark:text-slate-500 italic">
                {searchQuery ? "No accounts match your search filter." : "No institutional accounts registered yet. Use the onboarding form on the left to add users."}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* EDIT USER CREDENTIALS MODAL */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Edit User Credentials</h3>
              <button 
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">Email Address</label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="user@agency.gov.ph"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono outline-none focus:border-blue-500 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">
                  Change Password (Leave blank to keep existing)
                </label>
                <div className="relative">
                  <input
                    type={showEditPassword ? "text" : "password"}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Enter new password (min. 8 chars)"
                    className="w-full p-2.5 pr-10 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono outline-none focus:border-blue-500 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                  >
                    {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">System Role Scope</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 outline-none cursor-pointer focus:border-blue-500 text-xs"
                >
                  <option value="ROLE_DEPT_USER">Department User (Proposals & Needs)</option>
                  <option value="ROLE_SUPPLY_USER">Supply Officer (Annex 1 Master Inventory)</option>
                  <option value="ROLE_MIS_ADMIN">MIS Admin (Full Governance & Compiler)</option>
                </select>
              </div>

              {editRole !== "ROLE_MIS_ADMIN" && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">Assigned Department</label>
                  <select
                    value={editDeptId}
                    onChange={(e) => setEditDeptId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 outline-none cursor-pointer focus:border-blue-500 text-xs"
                    required
                  >
                    {departments.map((dept) => (
                      <option key={dept.department_id || dept.id} value={String(dept.department_id || dept.id)}>
                        {dept.department_name || dept.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm text-xs"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Saving..." : "Save Credentials"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* EDIT DEPARTMENT MODAL */}
      {editingDept && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Edit Department Name</h3>
              <button 
                onClick={() => setEditingDept(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateDepartment} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">Department Name</label>
                <input
                  type="text"
                  required
                  value={editDeptName}
                  onChange={(e) => setEditDeptName(e.target.value)}
                  placeholder="e.g. Planning & Management Service"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none focus:border-purple-500 text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={creatingDept}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm text-xs"
              >
                <Save className="w-4 h-4" />
                <span>{creatingDept ? "Updating..." : "Update Department"}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}