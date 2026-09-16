// frontend/src/views/department/Catalog/CatalogViewer.jsx
import React, { useState, useEffect } from "react";
import { getDeptCatalog } from "../../../api/dept";
import { 
  BookOpen, 
  RefreshCw, 
  Search, 
  ShieldCheck, 
  AlertCircle,
  Tag
} from "lucide-react";

export default function CatalogViewer() {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDeptCatalog();
      setCatalog(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Failed to load reference catalog details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredCatalog = catalog.filter(item => 
    (item.display_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.item_key || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.category || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-5xl mx-auto select-none transition-colors duration-200 font-sans">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm gap-4">
        <div>
          <h2 className="text-slate-900 dark:text-white font-bold text-base flex items-center gap-2 font-serif">
            <BookOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Standard Pricing & Reference Catalog</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Browse pre-approved specifications. Planners selecting from this standard catalog bypass custom canvas review delays.
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-xs font-bold shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Catalog</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-red-955/40 border border-rose-200 dark:border-red-900 text-rose-700 dark:text-red-300 rounded-xl flex items-start gap-2.5 shadow-xs animate-fadeIn">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-850 items-center gap-2.5 max-w-md shadow-xs">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filter catalog items by key, name, or category..."
          className="w-full bg-transparent outline-none border-none text-xs text-slate-900 dark:text-white placeholder-slate-400"
        />
      </div>

      {/* Catalog Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          {loading && catalog.length === 0 ? (
            <div className="text-center py-16 text-slate-500 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <span>Fetching standard catalog entries...</span>
            </div>
          ) : filteredCatalog.length > 0 ? (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3.5">Reference Item</th>
                  <th className="p-3.5">Category Classification</th>
                  <th className="p-3.5">Maximum Approved Unit Cost</th>
                  <th className="p-3.5 text-right">Verification Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-slate-700 dark:text-slate-300">
                {filteredCatalog.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/20 transition-colors">
                    <td className="p-3.5">
                      <div className="font-semibold text-slate-900 dark:text-slate-200">{item.display_name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5 select-all">{item.item_key}</div>
                    </td>
                    <td className="p-3.5 capitalize text-slate-600 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                        <Tag className="w-3 h-3 text-slate-400" />
                        <span>{item.category ? item.category.replace(/_/g, " ") : "Uncategorized"}</span>
                      </span>
                    </td>
                    <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-slate-200">
                      ₱{parseFloat(item.standard_unit_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-3.5 text-right">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                        <ShieldCheck className="w-3.5 h-3.5" /> Pre-Approved
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-20 text-slate-400 dark:text-slate-500 italic">
              No catalog references match your search query.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}