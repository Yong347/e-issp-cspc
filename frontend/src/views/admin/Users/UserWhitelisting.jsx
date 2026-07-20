// frontend/src/views/admin/Users/UserWhitelisting.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { 
  UserPlus, RefreshCw, AlertCircle, CheckCircle, Shield, 
  Plus, Trash2, Landmark, Edit2, Key, Save, X 
} from "lucide-react";

export default function UserWhitelisting() {
  const { user } = useAuth();
  
  // Whitelist States
  const [whitelist, setWhitelist] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  // EDIT MODAL STATES: USER
  const [editingUser, setEditingUser] = useState(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("ROLE_DEPT_USER");
  const [editDeptId, setEditDeptId] = useState("");

  // EDIT MODAL STATES: DEPARTMENT
  const [editingDept, setEditingDept] = useState(null);
  const [editDeptName, setEditDeptName] = useState("");

  const rawUrl = import.meta.env?.VITE_API_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token;

  const handleFetchError = async (res, url, customContextMessage) => {
    let errorDetail = "No detailed error payload returned from the server.";
    let rawBody = "";
    
    try {
      rawBody = await res.text();
      const parsed = JSON.parse(rawBody);
      errorDetail = parsed.detail || JSON.stringify(parsed);
    } catch (e) {
      errorDetail = rawBody || `HTTP status code ${res.status}`;
    }

    const formattedDetail = typeof errorDetail === "string" ? errorDetail : JSON.stringify(errorDetail);

    return {
      context: customContextMessage,
      message: formattedDetail,
      url: url,
      status: res.status
    };
  };

  const fetchDepartments = async () => {
    const targetUrl = `${apiUrl}/api/admin/departments`;
    try {
      const res = await fetch(targetUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDepartments(data);
        if (data.length > 0 && !deptId) {
          setDeptId(String(data[0].department_id));
        }
      } else {
        const errorObj = await handleFetchError(res, targetUrl, "Failed to load departments registry");
        setError(errorObj);
      }
    } catch (e) {
      setError({
        context: "Network Connection Failure",
        message: e.message || "Failed to query the departments endpoint.",
        url: targetUrl
      });
    }
  };

  const fetchWhitelist = async () => {
    setLoading(true);
    setError(null);
    const targetUrl = `${apiUrl}/api/admin/users/whitelist`;
    try {
      const res = await fetch(targetUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWhitelist(data);
      } else {
        const errorObj = await handleFetchError(res, targetUrl, "Failed to query whitelisted users pool");
        setError(errorObj);
        setWhitelist([]); 
      }
    } catch (e) {
      setError({
        context: "Network Connection Failure",
        message: e.message || "Is the backend server running?",
        url: targetUrl
      });
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

  // CREATE USER
  const handleAddUser = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.toLowerCase().endsWith("@cspc.edu.ph")) {
      setError({
        context: "Compliance Check Blocked",
        message: "Institutional accounts must reside strictly under the @cspc.edu.ph domain space."
      });
      return;
    }

    setSubmitting(true);
    const targetUrl = `${apiUrl}/api/admin/users/whitelist`;
    try {
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password.trim() || null,
          assigned_department_id: role === "ROLE_MIS_ADMIN" ? null : parseInt(deptId, 10),
          role_tag: role
        })
      });

      if (!res.ok) {
        const errorObj = await handleFetchError(res, targetUrl, "Failed to whitelist target user account");
        setError(errorObj);
      } else {
        setSuccess(`Account '${email}' has been whitelisted and linked successfully.`);
        setEmail("");
        setPassword(""); 
        fetchWhitelist();
      }
    } catch (err) {
      setError({
        context: "Network Connection Failure",
        message: err.message,
        url: targetUrl
      });
    } finally {
      setSubmitting(false);
    }
  };

  // UPDATE USER
  const openEditUserModal = (u) => {
    setEditingUser(u);
    setEditEmail(u.email);
    setEditRole(u.role_tag);
    setEditDeptId(u.department_id ? String(u.department_id) : "");
    setEditPassword("");
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    const targetUrl = `${apiUrl}/api/admin/users/whitelist/${editingUser.id}`;
    const payload = {
      email: editEmail.trim().toLowerCase(),
      role_tag: editRole,
      assigned_department_id: editRole === "ROLE_MIS_ADMIN" ? 0 : parseInt(editDeptId, 10)
    };

    if (editPassword.trim()) {
      payload.password = editPassword.trim();
    }

    try {
      const res = await fetch(targetUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorObj = await handleFetchError(res, targetUrl, "Failed to update user profile");
        setError(errorObj);
      } else {
        setSuccess(`Successfully updated profile details for '${editEmail}'.`);
        setEditingUser(null);
        fetchWhitelist();
      }
    } catch (err) {
      setError({
        context: "Network Connection Failure",
        message: err.message,
        url: targetUrl
      });
    } finally {
      setSubmitting(false);
    }
  };

  // DELETE USER
  const handleDeleteUser = async (userId, userEmail) => {
    if (userEmail === user?.email) {
      setError({
        context: "Administrative Guard Block",
        message: "You are prohibited from removing your active administrative account session."
      });
      return;
    }

    if (!window.confirm(`Confirm: Delete whitelisted account '${userEmail}'?`)) return;

    setError(null);
    setSuccess(null);
    const targetUrl = `${apiUrl}/api/admin/users/whitelist/${userId}`;
    try {
      const res = await fetch(targetUrl, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const errorObj = await handleFetchError(res, targetUrl, "Failed to delete whitelisted user");
        setError(errorObj);
      } else {
        setSuccess(`Account '${userEmail}' purged successfully.`);
        fetchWhitelist();
      }
    } catch (err) {
      setError({
        context: "Network Connection Failure",
        message: err.message,
        url: targetUrl
      });
    }
  };

  // CREATE DEPARTMENT
  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;

    setError(null);
    setSuccess(null);
    setCreatingDept(true);

    const targetUrl = `${apiUrl}/api/admin/departments`;
    try {
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newDeptName.trim() })
      });

      if (!res.ok) {
        const errorObj = await handleFetchError(res, targetUrl, "Failed to create department");
        setError(errorObj);
      } else {
        setSuccess(`Department '${newDeptName.trim()}' added successfully to active registry.`);
        setNewDeptName("");
        await fetchDepartments();
      }
    } catch (err) {
      setError({
        context: "Network Connection Failure",
        message: err.message,
        url: targetUrl
      });
    } finally {
      setCreatingDept(false);
    }
  };

  // UPDATE DEPARTMENT
  const openEditDeptModal = (dept) => {
    setEditingDept(dept);
    setEditDeptName(dept.department_name);
  };

  const handleUpdateDepartment = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreatingDept(true);

    const targetUrl = `${apiUrl}/api/admin/departments/${editingDept.department_id}`;
    try {
      const res = await fetch(targetUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: editDeptName.trim() })
      });

      if (!res.ok) {
        const errorObj = await handleFetchError(res, targetUrl, "Failed to update department details");
        setError(errorObj);
      } else {
        setSuccess("Department designation updated successfully.");
        setEditingDept(null);
        setEditDeptName("");
        fetchDepartments();
        fetchWhitelist();
      }
    } catch (err) {
      setError({
        context: "Network Connection Failure",
        message: err.message,
        url: targetUrl
      });
    } finally {
      setCreatingDept(false);
    }
  };

  // DELETE DEPARTMENT
  const handleDeleteDepartment = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete the department '${name}'?`)) return;

    setError(null);
    setSuccess(null);
    const targetUrl = `${apiUrl}/api/admin/departments/${id}`;
    try {
      const res = await fetch(targetUrl, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const errorObj = await handleFetchError(res, targetUrl, "Failed to delete department");
        setError(errorObj);
      } else {
        setSuccess(`Department '${name}' removed successfully from active registry.`);
        await fetchDepartments();
      }
    } catch (err) {
      setError({
        context: "Network Connection Failure",
        message: err.message,
        url: targetUrl
      });
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-slate-100 select-none">
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-500" />
            <span>CSPC Domain Whitelist & Onboarding Control</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Pre-authorize @cspc.edu.ph institutional emails and manage dynamic college divisions.
          </p>
        </div>
        <button
          onClick={fetchWhitelist}
          disabled={loading}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5 text-xs disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {error && (
        <div className="p-5 bg-red-955/20 border border-red-900/60 text-red-300 rounded-xl space-y-3 text-xs leading-relaxed">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <span className="font-bold text-slate-200 block text-sm">
                {error.context || "Operation Failure Intercepted"}
              </span>
              <p className="text-red-300 font-medium">
                {error.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-900/50 text-emerald-300 rounded-lg flex items-start gap-2.5 text-xs">
          <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Creator Form Box */}
        <div className="space-y-6">
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
            <h3 className="text-white font-bold text-xs tracking-wider uppercase border-b border-slate-800 pb-3 flex items-center gap-1.5">
              <UserPlus className="w-4.5 h-4.5 text-blue-500" />
              <span>Register Whitelist</span>
            </h3>
            
            <form onSubmit={handleAddUser} className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                  Official Institutional Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="account@cspc.edu.ph"
                  className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono outline-none focus:ring-1 focus:ring-blue-600 transition-all text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                  Initial Local Password (Optional)
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters (Optional)"
                  className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono outline-none focus:ring-1 focus:ring-blue-600 transition-all text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                  Assigned Operational Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-slate-100 outline-none focus:ring-1 focus:ring-blue-600 transition-all cursor-pointer"
                >
                  <option value="ROLE_DEPT_USER" className="bg-slate-900 text-slate-200">Department User (Draft, Submissions)</option>
                  <option value="ROLE_MIS_ADMIN" className="bg-slate-900 text-slate-200">MIS Admin (Governance, Whitelist)</option>
                </select>
              </div>

              {role !== "ROLE_MIS_ADMIN" && (
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                    Linked Institutional Department Mapping
                  </label>
                  {departments.length > 0 ? (
                    <select
                      value={deptId}
                      onChange={(e) => setDeptId(e.target.value)}
                      className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-slate-100 outline-none focus:ring-1 focus:ring-blue-600 transition-all cursor-pointer"
                    >
                      {departments.map((dept) => (
                        <option key={dept.department_id} value={String(dept.department_id)} className="bg-slate-900 text-slate-200">
                          {dept.department_name} (ID: {dept.department_id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-slate-500 italic block text-[10px] bg-slate-955 p-3 rounded border border-slate-850">
                      Please register a department division first.
                    </span>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || (role !== "ROLE_MIS_ADMIN" && departments.length === 0)}
                className="w-full p-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 mt-4 cursor-pointer"
              >
                <UserPlus className="w-4.5 h-4.5" />
                <span>{submitting ? "Processing..." : "Whitelist Account"}</span>
              </button>
            </form>
          </div>

          {/* Department Registry CRUD Control Panel */}
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
            <h3 className="text-white font-bold text-xs tracking-wider uppercase border-b border-slate-800 pb-3 flex items-center gap-1.5">
              <Landmark className="w-4.5 h-4.5 text-purple-500" />
              <span>College Division Registry</span>
            </h3>

            <form onSubmit={handleCreateDepartment} className="flex gap-2">
              <input
                type="text"
                required
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="e.g. Office of Academic Affairs"
                className="flex-1 p-2 bg-slate-955 border border-slate-800 rounded text-xs text-white outline-none"
              />
              <button
                type="submit"
                disabled={creatingDept}
                className="p-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold shrink-0 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{creatingDept ? "Saving..." : "Add"}</span>
              </button>
            </form>

            <div className="max-h-44 overflow-y-auto space-y-1.5 pt-2">
              {departments.map((dept) => (
                <div key={dept.department_id} className="flex justify-between items-center bg-slate-955 p-2 rounded border border-slate-850 text-xs">
                  <span className="font-semibold text-slate-300">{dept.department_name}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEditDeptModal(dept)}
                      className="p-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-blue-400 rounded transition-colors cursor-pointer"
                      title="Edit Department Name"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteDepartment(dept.department_id, dept.department_name)}
                      className="p-1 bg-slate-900 hover:bg-red-955 border border-slate-800 text-slate-500 hover:text-red-400 rounded transition-colors cursor-pointer"
                      title="Delete Department"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Data List Display Container */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 h-fit">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h3 className="text-white font-bold text-xs tracking-wider uppercase">
              Authorized Institutional Users Pool
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-955 border border-slate-800 text-slate-400 font-mono">
              Total Accounts: {whitelist.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                <span>Loading authorized users...</span>
              </div>
            ) : whitelist.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 text-[10px] uppercase tracking-wider font-bold">
                    <th className="py-3 px-2">Institutional Email</th>
                    <th className="py-3 px-2">Department Assignment</th>
                    <th className="py-3 px-2">Access Rank</th>
                    <th className="py-3 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {whitelist.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-950/30 transition-colors">
                      <td className="py-3.5 px-2 font-semibold text-slate-200 font-mono">{item.email}</td>
                      <td className="py-3.5 px-2 text-slate-400">
                        {item.department_name || "Global Admin"}
                      </td>
                      <td className="py-3.5 px-2">
                        <span className={`inline-block px-2.5 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${
                          item.role_tag === "ROLE_MIS_ADMIN" 
                            ? "bg-purple-950/40 border-purple-800/60 text-purple-400" 
                            : "bg-blue-950/40 border-blue-800/60 text-blue-400"
                        }`}>
                          {item.role_tag === "ROLE_MIS_ADMIN" ? "Admin" : "Dept User"}
                        </span>
                      </td>
                      <td className="py-3.5 px-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => openEditUserModal(item)}
                            className="p-1 bg-slate-955 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-blue-400 rounded transition-colors cursor-pointer"
                            title="Edit User Parameters"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(item.id, item.email)}
                            className="p-1 bg-slate-955 hover:bg-red-955 border border-slate-800 text-slate-500 hover:text-red-400 rounded transition-colors cursor-pointer"
                            title="Remove User"
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
              <div className="text-center py-16 text-slate-500">
                No users have been pre-whitelisted yet. Pre-authorize an email address to begin onboarding.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* USER EDIT MODAL */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm">Edit User Parameters</h3>
              <button 
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-white font-bold text-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                  Institutional Email Address
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                  Rotate Password (Leave blank to keep current)
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Enter new password (Min 8 chars)"
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                  Access Rank Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-slate-100 outline-none"
                >
                  <option value="ROLE_DEPT_USER" className="bg-slate-900 text-slate-200">Department User</option>
                  <option value="ROLE_MIS_ADMIN" className="bg-slate-900 text-slate-200">MIS Admin</option>
                </select>
              </div>

              {editRole !== "ROLE_MIS_ADMIN" && (
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                    Department Mapping
                  </label>
                  <select
                    value={editDeptId}
                    onChange={(e) => setEditDeptId(e.target.value)}
                    className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-slate-100 outline-none"
                  >
                    <option value="" className="bg-slate-900 text-slate-200">Unassociated</option>
                    {departments.map((dept) => (
                      <option key={dept.department_id} value={String(dept.department_id)} className="bg-slate-900 text-slate-200">
                        {dept.department_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full p-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 mt-4 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Saving changes..." : "Save User Parameters"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* DEPARTMENT EDIT MODAL */}
      {editingDept && (
        <div className="fixed inset-0 bg-slate-955/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm">Edit Department Name</h3>
              <button 
                onClick={() => setEditingDept(null)}
                className="text-slate-400 hover:text-white font-bold text-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateDepartment} className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                  Department Name Designation
                </label>
                <input
                  type="text"
                  required
                  value={editDeptName}
                  onChange={(e) => setEditDeptName(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={creatingDept}
                className="w-full p-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 mt-4 cursor-pointer"
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