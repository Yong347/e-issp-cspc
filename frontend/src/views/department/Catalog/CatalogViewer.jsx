import React, { useState, useEffect } from "react";
import { getDeptCatalog } from "../../../api/dept";
import { BookOpen, RefreshCw, Search, ShieldCheck } from "lucide-react";

export default function CatalogViewer() {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getDeptCatalog();
      setCatalog(data);
    } catch (e) {
      console.error("Failed to load reference catalog details:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredCatalog = catalog.filter(item => 
    item.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.item_key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 text-xs max-w-5xl mx-auto select-none">
      {/* Header */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-400" />
            <span>Standard Pricing & Reference Catalog</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Browse pre-approved specifications. Planners must select from this standard ledger to bypass validation locks.
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Catalog</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex bg-slate-900 p-3 rounded-lg border border-slate-850 items-center gap-2.5 max-w-md">
        <Search className="w-4 h-4 text-slate-500 shrink-0" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filter catalog items by key or name..."
          className="w-full bg-transparent outline-none border-none text-xs text-white"
        />
      </div>

      {/* Catalog Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-16 text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
              <span>Fetching standard catalog...</span>
            </div>
          ) : filteredCatalog.length > 0 ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-850 bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Reference Item</th>
                  <th className="p-3">Category Classification</th>
                  <th className="p-3">Maximum Approved Unit Cost</th>
                  <th className="p-3 text-right">Verification Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-300">
                {filteredCatalog.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-955/20 transition-colors">
                    <td className="p-3">
                      <div className="font-semibold text-slate-200">{item.display_name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5 select-all">{item.item_key}</div>
                    </td>
                    <td className="p-3 capitalize text-slate-400">
                      {item.category ? item.category.replace("_", " ") : "Uncategorized"}
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-200">
                      ₱{parseFloat(item.standard_unit_cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 uppercase tracking-wider">
                        <ShieldCheck className="w-3.5 h-3.5" /> Pre-Approved
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-20 text-slate-500 italic">No catalog references match your search.</div>
          )}
        </div>
      </div>
    </div>
  );
}