// frontend/src/views/admin/Catalog/CatalogManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { Plus, Settings2, RefreshCw, AlertCircle, CheckCircle, Package, ToggleLeft, ToggleRight, FileSearch, Calendar } from "lucide-react";

export default function CatalogManager() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [approvedProposals, setApprovedProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Form states matching CatalogItem schemas (Extended to support expiration dates)
  const [form, setForm] = useState({
    item_key: "",
    display_name: "",
    standard_unit_cost: "",
    category: "computing_devices",
    allowed_offices: "",
    supplier_name: "",
    canvas_evidence_url: "",
    canvas_expiration_date: "" // Added
  });

  const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token || user?.accessToken;

  const fetchCatalog = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/catalog`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      } else {
        const errData = await res.json();
        throw new Error(errData.detail || "Could not retrieve the dynamic catalog list.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchApprovedProposals = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/proposals/approved-canvas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setApprovedProposals(await res.json());
      }
    } catch (e) {
      console.warn("Failed to load approved references dropdown: ", e);
    }
  };

  useEffect(() => {
    if (token) {
      fetchCatalog();
      fetchApprovedProposals();
    }
  }, [token]);

  const handleReferenceSelect = (e) => {
    const refId = e.target.value;
    if (!refId) return;

    const selected = approvedProposals.find(item => item.id === refId);
    if (selected) {
      // Auto-fill form fields with database parameters from chosen reference
      setForm({
        ...form,
        item_key: selected.display_name.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
        display_name: selected.display_name,
        standard_unit_cost: String(selected.unit_cost),
        category: selected.type === "CapEx" ? "computing_devices" : "software",
        supplier_name: selected.supplier_name,
        canvas_evidence_url: selected.canvas_evidence_url,
        canvas_expiration_date: selected.canvas_expiration_date ? selected.canvas_expiration_date.split("T")[0] : "" // Auto-map existing date if available
      });
      setSuccess(`Referenced approved request fields compiled dynamically.`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (form.item_key.trim().toLowerCase() === "other") {
      setError("Registration Error: 'other' is a reserved system keyword and cannot be used as an item key.");
      return;
    }

    setSubmitting(true);
    const parsedOffices = form.allowed_offices
      ? form.allowed_offices.split(",").map((o) => o.trim()).filter((o) => o.length > 0)
      : [];

    try {
      // Format expiration date into an ISO String or null before sending to the backend API
      const expirationPayload = form.canvas_expiration_date 
        ? new Date(form.canvas_expiration_date).toISOString() 
        : null;

      const res = await fetch(`${apiUrl}/api/admin/catalog`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          item_key: form.item_key.trim(),
          display_name: form.display_name.trim(),
          standard_unit_cost: parseFloat(form.standard_unit_cost) || 0.0,
          category: form.category,
          allowed_offices: parsedOffices,
          supplier_name: form.supplier_name.trim() || null,
          canvas_evidence_url: form.canvas_evidence_url.trim() || null,
          canvas_expiration_date: expirationPayload, // Bind mapped expiration payload
          is_active: true
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to register standard catalog item.");
      }

      setSuccess(`Catalog item '${form.display_name}' created successfully.`);
      setForm({
        item_key: "",
        display_name: "",
        standard_unit_cost: "",
        category: "computing_devices",
        allowed_offices: "",
        supplier_name: "",
        canvas_evidence_url: "",
        canvas_expiration_date: "" // Reset field
      });
      fetchCatalog();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleItemState = async (item) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/catalog/${item.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          is_active: !item.is_active
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to transition catalog item state.");
      }

      setSuccess(`State transition successful for item '${item.display_name}'.`);
      fetchCatalog();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto text-xs">
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-500" />
            <span>Standard Pricing Reference Catalog Manager</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Establish pricing limits and standard specifications. Populate catalog items directly from approved custom requests.
          </p>
        </div>
        <button
          onClick={fetchCatalog}
          disabled={loading}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5 text-xs disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh List</span>
        </button>
      </div>

      {/* Status Notifications */}
      {error && (
        <div className="p-4 bg-red-955/40 border border-red-900/30 text-red-300 rounded-lg flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-900/30 text-emerald-300 rounded-lg flex items-start gap-2.5">
          <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Creator Form Sidebar */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 h-fit space-y-4">
          <h3 className="text-white font-bold text-xs tracking-wider uppercase border-b border-slate-800 pb-3 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-blue-500" />
            <span>Add Catalog Reference</span>
          </h3>

          {/* Reference approved proposals dropdown */}
          <div className="space-y-1.5 p-3 bg-slate-950 border border-slate-850 rounded-lg">
            <label className="block text-[9px] uppercase font-bold text-slate-400 flex items-center gap-1">
              <FileSearch className="w-3.5 h-3.5 text-blue-400" />
              <span>Reference Approved Custom Request</span>
            </label>
            <select
              onChange={handleReferenceSelect}
              className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-slate-200 outline-none text-xs"
            >
              <option value="">-- Click to select reference --</option>
              {approvedProposals.map((ref) => (
                <option key={ref.id} value={ref.id}>
                  [{ref.type}] {ref.display_name}
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                Catalog Item Identifier Key (Unique, Lowercase)
              </label>
              <input
                type="text"
                required
                value={form.item_key}
                onChange={(e) => setForm({ ...form, item_key: e.target.value })}
                placeholder="e.g. projector_classroom_v2"
                className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white text-xs outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                Display Name (Procurement Reference Label)
              </label>
              <input
                type="text"
                required
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="e.g. Standard Core-i5 Laptop (16GB)"
                className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white text-xs outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                  Standard Unit Price (PHP)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={form.standard_unit_cost}
                  onChange={(e) => setForm({ ...form, standard_unit_cost: e.target.value })}
                  placeholder="0.00"
                  className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white text-xs outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                  Category Type
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white text-xs outline-none cursor-pointer"
                >
                  <option value="computing_devices">Computing Devices</option>
                  <option value="networking">Networking & Connectivity</option>
                  <option value="printers_imaging">Printers & Imaging</option>
                  <option value="software">Software & Licenses</option>
                  <option value="other">Other Operations Items</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                Division Access Permissions (Optional, CSV List)
              </label>
              <input
                type="text"
                value={form.allowed_offices}
                onChange={(e) => setForm({ ...form, allowed_offices: e.target.value })}
                placeholder="e.g. MIS Department, College of Science"
                className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white text-xs outline-none"
              />
            </div>

            <div className="border-t border-slate-800/80 pt-3 mt-2 space-y-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5 flex justify-between">
                  <span>Authorized Supplier Reference Name</span>
                  <span className="text-[9px] text-blue-400">Auto-Linked</span>
                </label>
                <input
                  type="text"
                  value={form.supplier_name}
                  onChange={(e) => setForm({ ...form, supplier_name: e.target.value })}
                  readOnly
                  placeholder="Auto-filled from referenced proposal..."
                  className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 text-xs outline-none cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5 flex justify-between">
                  <span>Canvas Proof S3 URL Link</span>
                  <span className="text-[9px] text-blue-400">Auto-Linked</span>
                </label>
                <input
                  type="url"
                  value={form.canvas_evidence_url}
                  onChange={(e) => setForm({ ...form, canvas_evidence_url: e.target.value })}
                  readOnly
                  placeholder="Auto-filled from referenced proposal..."
                  className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 text-xs outline-none font-mono cursor-not-allowed"
                />
              </div>

              {/* NEW EXPIRATION DATE INPUT FIELD */}
              <div className="space-y-1.5 pt-1.5">
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider flex justify-between items-center">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    <span>Canvas Validity Expiration Date</span>
                  </span>
                  <span className="text-[9px] text-blue-400">Required</span>
                </label>
                <input
                  type="date"
                  required
                  value={form.canvas_expiration_date}
                  onChange={(e) => setForm({ ...form, canvas_expiration_date: e.target.value })}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs outline-none font-mono focus:border-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full p-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 mt-4 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{submitting ? "Processing..." : "Add Catalog Item"}</span>
            </button>
          </form>
        </div>

        {/* Dynamic Items Listing Board */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h3 className="text-white font-bold text-xs tracking-wider uppercase">
              Current Standard Reference Catalog
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-955 border border-slate-800 text-slate-400 font-mono">
              Total Items: {items.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                <span className="text-xs">Loading standard references catalog...</span>
              </div>
            ) : items.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 text-[10px] uppercase tracking-wider font-bold">
                    <th className="py-3 px-2">Key / Label</th>
                    <th className="py-3 px-2">Category</th>
                    <th className="py-3 px-2">Standard Unit Cost</th>
                    <th className="py-3 px-2">Scope / Validity</th>
                    <th className="py-3 px-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-955/30 transition-colors">
                      <td className="py-3.5 px-2">
                        <div className="font-semibold text-slate-200">{item.display_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5 select-all">{item.item_key}</div>
                      </td>
                      <td className="py-3.5 px-2 text-slate-400 capitalize">
                        {item.category ? item.category.replace("_", " ") : "N/A"}
                      </td>
                      <td className="py-3.5 px-2 font-mono text-slate-200">
                        ₱{parseFloat(item.standard_unit_cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-2 text-slate-400 space-y-1">
                        {/* Displaying expiration dates in the grid */}
                        {item.canvas_expiration_date ? (
                          <div className="font-mono text-[9px] text-amber-400 flex items-center gap-1 font-bold">
                            <Calendar className="w-3 h-3 shrink-0" />
                            <span>Expires: {new Date(item.canvas_expiration_date).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <div className="text-[9px] text-slate-500 italic">No Expiration Configured</div>
                        )}
                        {item.allowed_offices && item.allowed_offices.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {item.allowed_offices.map((office, oIdx) => (
                              <span key={oIdx} className="px-1.5 py-0.5 text-[9px] bg-slate-955 rounded border border-slate-800 text-slate-400 truncate max-w-[100px]">
                                {office}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic text-[10px] block">Global Access</span>
                        )}
                      </td>
                      <td className="py-3.5 px-2 text-right">
                        <button
                          onClick={() => toggleItemState(item)}
                          className="hover:scale-105 transition-transform inline-block cursor-pointer align-middle"
                        >
                          {item.is_active ? (
                            <div className="flex items-center gap-1 text-emerald-400">
                              <span className="text-[10px] uppercase font-bold">Active</span>
                              <ToggleRight className="w-5 h-5 text-emerald-500" />
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-slate-500">
                              <span className="text-[10px] uppercase font-bold">Disabled</span>
                              <ToggleLeft className="w-5 h-5 text-slate-500" />
                            </div>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-20 text-slate-500 text-xs">
                The standard reference catalog is currently empty.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}