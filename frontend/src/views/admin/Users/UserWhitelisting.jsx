// frontend/src/views/admin/Users/UserWhitelisting.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  Lock,
  Users,
  ShieldCheck,
  PackageCheck
} from "lucide-react";
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getWhitelistedUsers,
  addWhitelistedUser,
  updateWhitelistedUser,
  deleteWhitelistedUser
} from "../../../api/admin";

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

  const token = 
    user?.token || 
    user?.accessToken || 
    (typeof window !== "undefined" 
      ? localStorage.getItem("access_token") || localStorage.getItem("token") 
      : "") || 
    "";

  // Auto-dismiss transient notifications
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Keyboard navigation for closing edit modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (editingUser) setEditingUser(null);
        if (editingDept) setEditingDept(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingUser, editingDept]);

  const fetchDepartmentsList = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getDepartments(token);
      const list = Array.isArray(data) ? data : [];
      setDepartments(list);
      if (list.length > 0) {
        setDeptId(prev => {
          const hasExisting = list.some(d => String(d.department_id || d.id) === String(prev));
          return hasExisting ? prev : String(list[0].department_id || list[0].id);
        });
      }
    } catch (e) {
      setError(e.message || "Failed to load departments registry.");
    }
  }, [token]);

  const fetchWhitelist = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getWhitelistedUsers(token);
      setWhitelist(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Network error querying user registry.");
      setWhitelist([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchDepartmentsList();
      fetchWhitelist();
    }
  }, [token, fetchDepartmentsList, fetchWhitelist]);

  // Compute Metrics for Executive Header Bar
  const stats = useMemo(() => {
    const total = whitelist.length;
    const admins = whitelist.filter(u => u.role_tag === "ROLE_MIS_ADMIN").length;
    const supply = whitelist.filter(u => u.role_tag === "ROLE_SUPPLY_USER").length;
    const depts = whitelist.filter(u => u.role_tag === "ROLE_DEPT_USER").length;
    return { total, admins, supply, depts, totalDepts: departments.length };
  }, [whitelist, departments]);

  // CREATE USER (Mandatory Password & Multi-Role Support)
  const handleAddUser = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const emailClean = email.trim().toLowerCase();
    if (!emailClean) {
      setError("Institutional email address is required.");
      return;
    }

    if (!password || password.trim().length < 8) {
      setError("Initial account password is required and must be at least 8 characters long.");
      return;
    }

    const effectiveDeptId = role === "ROLE_MIS_ADMIN" 
      ? null 
      : (deptId ? parseInt(deptId, 10) : (departments[0]?.department_id || departments[0]?.id || null));

    if (role !== "ROLE_MIS_ADMIN" && !effectiveDeptId) {
      setError("Department assignment is mandatory for Department Planners and Supply Officers.");
      return;
    }

    setSubmitting(true);
    try {
      await addWhitelistedUser(token, {
        email: emailClean,
        password: password.trim(),
        assigned_department_id: effectiveDeptId,
        role_tag: role
      });

      setSuccess(`User account '${emailClean}' successfully onboarded and authorized.`);
      setEmail("");
      setPassword("");
      setShowPassword(false);
      fetchWhitelist();
    } catch (err) {
      setError(err.message || "Failed to onboard user account.");
    } finally {
      setSubmitting(false);
    }
  };

  // UPDATE USER
  const openEditUserModal = (u) => {
    setEditingUser(u);
    setEditEmail(u.email);
    setEditRole(u.role_tag);
    const existingDeptId = u.department_id || u.assigned_department_id || u.department?.id;
    setEditDeptId(
      existingDeptId 
        ? String(existingDeptId) 
        : (departments[0]?.department_id || departments[0]?.id ? String(departments[0].department_id || departments[0].id) : "")
    );
    setEditPassword("");
    setShowEditPassword(false);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const emailClean = editEmail.trim().toLowerCase();
    if (!emailClean) {
      setError("Institutional email address is required.");
      return;
    }

    const effectiveDeptId = editRole === "ROLE_MIS_ADMIN" 
      ? null 
      : (editDeptId ? parseInt(editDeptId, 10) : null);

    if (editRole !== "ROLE_MIS_ADMIN" && !effectiveDeptId) {
      setError("Department assignment is mandatory for this role.");
      return;
    }

    if (editPassword.trim() && editPassword.trim().length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }

    setSubmitting(true);
    const payload = {
      email: emailClean,
      role_tag: editRole,
      assigned_department_id: effectiveDeptId
    };

    if (editPassword.trim()) {
      payload.password = editPassword.trim();
    }

    try {
      await updateWhitelistedUser(token, editingUser.id, payload);
      setSuccess(`Account profile for '${emailClean}' updated successfully.`);
      setEditingUser(null);
      fetchWhitelist();
    } catch (err) {
      setError(err.message || "Failed to update user profile.");
    } finally {
      setSubmitting(false);
    }
  };

  // DELETE USER
  const handleDeleteUser = async (userId, userEmail) => {
    if (userEmail === user?.email || String(userId) === String(user?.id)) {
      setError("Administrative Guard: You are prohibited from deleting your active account session.");
      return;
    }

    if (!window.confirm(`Permanently remove account '${userEmail}' from the institutional registry?`)) return;

    setError(null);
    setSuccess(null);
    try {
      await deleteWhitelistedUser(token, userId);
      setSuccess(`Account '${userEmail}' successfully removed from registry.`);
      fetchWhitelist();
    } catch (err) {
      setError(err.message || "Failed to delete user account.");
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
      await createDepartment(token, { name: newDeptName.trim() });
      setSuccess(`Department '${newDeptName.trim()}' added successfully to active registry.`);
      setNewDeptName("");
      await fetchDepartmentsList();
    } catch (err) {
      setError(err.message || "Failed to create department.");
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
      await updateDepartment(token, targetId, { name: editDeptName.trim() });
      setSuccess("Department designation updated successfully.");
      setEditingDept(null);
      setEditDeptName("");
      await fetchDepartmentsList();
      fetchWhitelist();
    } catch (err) {
      setError(err.message || "Failed to update department details.");
    } finally {
      setCreatingDept(false);
    }
  };

  // DELETE DEPARTMENT
  const handleDeleteDepartment = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete the department '${name}'? This action will fail if active proposals are linked to it.`)) return;

    setError(null);
    setSuccess(null);
    try {
      await deleteDepartment(token, id);
      setSuccess(`Department '${name}' removed successfully from active registry.`);
      await fetchDepartmentsList();
      fetchWhitelist();
    } catch (err) {
      setError(err.message || "Failed to delete department.");
    }
  };

  // Filter accounts list based on search term
  const filteredWhitelist = useMemo(() => {
    if (!searchQuery.trim()) return whitelist;
    const q = searchQuery.toLowerCase().trim();
    return whitelist.filter((u) => {
      const matchesEmail = (u.email || "").toLowerCase().includes(q);
      const matchesRole = (u.role_tag || "").toLowerCase().includes(q);
      const deptName = u.department?.name || u.department_name || "";
      const matchesDept = deptName.toLowerCase().includes(q);
      return matchesEmail || matchesRole || matchesDept;
    });
  }, [whitelist, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-slate-800 dark:text-slate-100 select-none text-xs font-sans transition-colors duration-200">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600 dark:text-blue-500" />
            <span>Institutional Access Control &amp; User Registry</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage Department Planners, Supply Officers, and Administrators with role-based access, credential provisioning, and department mappings.
          </p>
        </div>
        <button
          onClick={() => { fetchDepartmentsList(); fetchWhitelist(); }}
          disabled={loading}
          className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer self-start shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Registry</span>
        </button>
      </div>

      {/* Summary KPI Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-955/50 rounded-lg text-blue-600 dark:text-blue-400">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Total Users</div>
            <div className="text-base font-extrabold text-slate-900 dark:text-white font-mono">{stats.total}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-2 bg-purple-50 dark:bg-purple-955/50 rounded-lg text-purple-600 dark:text-purple-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Admins</div>
            <div className="text-base font-extrabold text-purple-600 dark:text-purple-400 font-mono">{stats.admins}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-955/50 rounded-lg text-blue-600 dark:text-blue-400">
            <UserCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Planners</div>
            <div className="text-base font-extrabold text-blue-600 dark:text-blue-400 font-mono">{stats.depts}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-2 bg-amber-50 dark:bg-amber-955/50 rounded-lg text-amber-600 dark:text-amber-400">
            <PackageCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Supply Officers</div>
            <div className="text-base font-extrabold text-amber-600 dark:text-amber-400 font-mono">{stats.supply}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3 col-span-2 sm:col-span-1">
          <div className="p-2 bg-emerald-50 dark:bg-emerald-955/50 rounded-lg text-emerald-600 dark:text-emerald-400">
            <Landmark className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Departments</div>
            <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">{stats.totalDepts}</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-955/30 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 rounded-xl flex items-center justify-between gap-2.5 animate-fadeIn shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="font-medium whitespace-pre-wrap">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-center justify-between gap-2.5 animate-fadeIn shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-medium">{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Creator Form & Department Management */}
        <div className="space-y-6">
          {/* User Onboarding Form Box */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
            <h3 className="text-slate-900 dark:text-white font-bold text-xs tracking-wider uppercase border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center gap-1.5 font-serif">
              <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-500" />
              <span>Provision User Account</span>
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
                  placeholder="planner@agency.gov.ph"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:border-blue-500 text-xs transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
                  Initial Password (Min. 8 Chars)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full p-2.5 pr-10 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:border-blue-500 text-xs transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
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
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 outline-none cursor-pointer focus:border-blue-500 text-xs font-semibold"
                >
                  <option value="ROLE_DEPT_USER">Department User (Proposals &amp; Needs)</option>
                  <option value="ROLE_SUPPLY_USER">Supply Officer (Annex 1 Master Inventory)</option>
                  <option value="ROLE_MIS_ADMIN">MIS Admin (Full Governance &amp; Compiler)</option>
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
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 outline-none cursor-pointer focus:border-blue-500 text-xs font-semibold"
                      required
                    >
                      {departments.map((dept) => {
                        const dId = String(dept.department_id || dept.id);
                        const dName = dept.department_name || dept.name;
                        return (
                          <option key={dId} value={dId}>
                            {dName}
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <div className="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-955/30 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/50 text-[11px] leading-tight">
                      No departments configured. Please register a department in the panel below before creating department users.
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || (role !== "ROLE_MIS_ADMIN" && departments.length === 0)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm text-xs"
              >
                <UserPlus className="w-4 h-4" />
                <span>{submitting ? "Provisioning..." : "Provision &amp; Authorize User"}</span>
              </button>
            </form>
          </div>

          {/* Department Management Panel */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
            <h3 className="text-slate-900 dark:text-white font-bold text-xs tracking-wider uppercase border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center gap-1.5 font-serif">
              <Landmark className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Department Registry</span>
            </h3>

            <form onSubmit={handleCreateDepartment} className="flex gap-2">
              <input
                type="text"
                required
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="e.g. Planning &amp; Management Service"
                className="flex-1 p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none focus:border-purple-500 text-xs"
              />
              <button
                type="submit"
                disabled={creatingDept}
                className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl font-bold shrink-0 flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{creatingDept ? "..." : "Add"}</span>
              </button>
            </form>

            <div className="max-h-56 overflow-y-auto space-y-1.5 pt-1 pr-1 custom-scrollbar">
              {departments.length > 0 ? (
                departments.map((dept) => {
                  const deptIdVal = dept.department_id || dept.id;
                  const deptNameVal = dept.department_name || dept.name;
                  return (
                    <div key={deptIdVal} className="flex justify-between items-center bg-slate-50 dark:bg-slate-955 p-2.5 rounded-xl border border-slate-200 dark:border-slate-850 text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300 truncate pr-2">{deptNameVal}</span>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditDeptModal(dept)}
                          className="p-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-800 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer shadow-2xs"
                          title="Edit Department Name"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDepartment(deptIdVal, deptNameVal)}
                          className="p-1.5 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-955 border border-slate-300 dark:border-slate-800 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors cursor-pointer shadow-2xs"
                          title="Delete Department"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-slate-400 italic">
                  No departments configured.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: User Accounts Table */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs h-fit">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider font-serif">
                Active User Accounts
              </h3>
              <span className="text-[10px] font-mono text-slate-500">
                {whitelist.length} Authorized Identities
              </span>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by email, role, or unit..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-500 text-xs placeholder-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                <span>Synchronizing account directory...</span>
              </div>
            ) : filteredWhitelist.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold font-mono">
                    <th className="py-2.5 px-3">Email Address</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Assigned Department / Unit</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {filteredWhitelist.map((u) => {
                    const deptLabel = u.department?.name || u.department_name || (u.role_tag === "ROLE_MIS_ADMIN" ? "Global Access" : "Unassigned");
                    const isSelf = u.email === user?.email || String(u.id) === String(user?.id);

                    return (
                      <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-950/30 transition-colors">
                        <td className="py-3 px-3 font-mono font-semibold text-slate-900 dark:text-slate-200">
                          <div className="flex items-center gap-1.5">
                            <span>{u.email}</span>
                            {isSelf && (
                              <span className="text-[9px] font-sans font-bold px-1.5 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 rounded-full">
                                You
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase font-mono border ${
                            u.role_tag === "ROLE_MIS_ADMIN"
                              ? "bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300"
                              : u.role_tag === "ROLE_SUPPLY_USER"
                              ? "bg-amber-50 dark:bg-amber-955/60 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300"
                              : "bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                          }`}>
                            {u.role_tag === "ROLE_MIS_ADMIN" ? (
                              <><Shield className="w-2.5 h-2.5" /> Admin</>
                            ) : u.role_tag === "ROLE_SUPPLY_USER" ? (
                              <><PackageCheck className="w-2.5 h-2.5" /> Supply</>
                            ) : (
                              <><UserCheck className="w-2.5 h-2.5" /> Planner</>
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-1.5">
                            <Building className="w-3 h-3 text-slate-400" />
                            <span>{deptLabel}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditUserModal(u)}
                              className="p-1.5 bg-slate-100 dark:bg-slate-955 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg cursor-pointer transition-colors shadow-2xs"
                              title="Edit Credentials &amp; Role"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u.id, u.email)}
                              disabled={isSelf}
                              className={`p-1.5 border rounded-lg transition-colors ${
                                isSelf 
                                  ? "opacity-30 border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed" 
                                  : "bg-slate-100 dark:bg-slate-955 hover:bg-rose-100 dark:hover:bg-rose-955 border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer shadow-2xs"
                              }`}
                              title={isSelf ? "Self-deletion prohibited" : "Delete Account"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-16 text-slate-400 dark:text-slate-500 italic">
                {searchQuery ? "No accounts match your search filter." : "No institutional accounts registered yet. Use the provisioning form on the left to add users."}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* EDIT USER CREDENTIALS MODAL */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5 font-serif">
                <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Edit Account Credentials</span>
              </h3>
              <button 
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">Institutional Email</label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="user@agency.gov.ph"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:border-blue-500 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">
                  Rotate Password (Leave blank to keep existing)
                </label>
                <div className="relative">
                  <input
                    type={showEditPassword ? "text" : "password"}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Enter new password (min. 8 chars)"
                    className="w-full p-2.5 pr-10 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:border-blue-500 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
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
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 outline-none cursor-pointer focus:border-blue-500 text-xs font-semibold"
                >
                  <option value="ROLE_DEPT_USER">Department User (Proposals &amp; Needs)</option>
                  <option value="ROLE_SUPPLY_USER">Supply Officer (Annex 1 Master Inventory)</option>
                  <option value="ROLE_MIS_ADMIN">MIS Admin (Full Governance &amp; Compiler)</option>
                </select>
              </div>

              {editRole !== "ROLE_MIS_ADMIN" && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">Assigned Department</label>
                  <select
                    value={editDeptId}
                    onChange={(e) => setEditDeptId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 outline-none cursor-pointer focus:border-blue-500 text-xs font-semibold"
                    required
                  >
                    {departments.map((dept) => {
                      const dId = String(dept.department_id || dept.id);
                      const dName = dept.department_name || dept.name;
                      return (
                        <option key={dId} value={dId}>
                          {dName}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm text-xs"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Updating..." : "Save Credential Updates"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* EDIT DEPARTMENT MODAL */}
      {editingDept && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5 font-serif">
                <Landmark className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Edit Department Name</span>
              </h3>
              <button 
                type="button"
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
                  placeholder="e.g. Planning &amp; Management Service"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none focus:border-purple-500 text-xs font-semibold"
                />
              </div>

              <button
                type="submit"
                disabled={creatingDept}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm text-xs"
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