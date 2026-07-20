// frontend/src/views/department/Proposals/GlacierConsole.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getProposals, 
  getSubscriptions, 
  syncProposalMetadata, 
  requestProposalRestore,
  syncSubscriptionMetadata,
  requestSubscriptionRestore
} from "../../../api/dept";
import { 
  Snowflake, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  DownloadCloud, 
  HardDrive, 
  Clock 
} from "lucide-react";

export default function GlacierConsole() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const [archivedProposals, setArchivedProposals] = useState([]);
  const [archivedSubscriptions, setArchivedSubscriptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchArchivedItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pData, sData] = await Promise.all([
        getProposals(activeCycle),
        getSubscriptions(activeCycle)
      ]);
      
      // Filter items stored in cold storage or currently undergoing active Glacier restoration
      setArchivedProposals(pData.filter(p => p.s3_storage_class === "GLACIER" || p.is_restoring));
      setArchivedSubscriptions(sData.filter(s => s.s3_storage_class === "GLACIER" || s.is_restoring));
    } catch (err) {
      setError(err.message || "Failed to load archival records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) {
      fetchArchivedItems();
    }
  }, [user, activeCycle]);

  // Dynamic Background Polling to monitor ongoing restorations
  useEffect(() => {
    const activeProposalIds = archivedProposals.filter(p => p.is_restoring).map(p => p.id);
    const activeSubscriptionIds = archivedSubscriptions.filter(s => s.is_restoring).map(s => s.id);

    if (activeProposalIds.length === 0 && activeSubscriptionIds.length === 0) return;

    const intervalId = setInterval(async () => {
      // Background poll for proposals
      for (const id of activeProposalIds) {
        try {
          const res = await syncProposalMetadata(id);
          setArchivedProposals(prev => 
            prev.map(item => 
              item.id === id 
                ? { 
                    ...item, 
                    s3_storage_class: res.storage_class, 
                    is_restoring: res.is_restoring, 
                    restore_progress: res.restore_progress 
                  } 
                : item
            )
          );
        } catch (err) {
          console.error(`Error background polling metadata for proposal ${id}:`, err);
        }
      }

      // Background poll for subscriptions
      for (const id of activeSubscriptionIds) {
        try {
          const res = await syncSubscriptionMetadata(id);
          setArchivedSubscriptions(prev => 
            prev.map(item => 
              item.id === id 
                ? { 
                    ...item, 
                    s3_storage_class: res.storage_class, 
                    is_restoring: res.is_restoring, 
                    restore_progress: res.restore_progress 
                  } 
                : item
            )
          );
        } catch (err) {
          console.error(`Error background polling metadata for subscription ${id}:`, err);
        }
      }
    }, 10000); // Poll restoration progress updates every 10 seconds

    return () => clearInterval(intervalId);
  }, [
    archivedProposals.filter(p => p.is_restoring).map(p => p.id).join(","),
    archivedSubscriptions.filter(s => s.is_restoring).map(s => s.id).join(",")
  ]);

  const handleSyncMetadata = async (id, isMooe) => {
    setSyncingId(id);
    setError(null);
    setSuccess(null);
    try {
      const syncFn = isMooe ? syncSubscriptionMetadata : syncProposalMetadata;
      const res = await syncFn(id);
      setSuccess(`Metadata synchronized. Storage Class is currently: '${res.storage_class}'`);
      
      const updateState = (prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                s3_storage_class: res.storage_class,
                is_restoring: res.is_restoring,
                restore_progress: res.restore_progress,
              }
            : item
        );

      if (isMooe) {
        setArchivedSubscriptions(updateState);
      } else {
        setArchivedProposals(updateState);
      }
    } catch (err) {
      setError(err.message || "Sync operation failed.");
    } finally {
      setSyncingId(null);
    }
  };

  const handleRestore = async (id, isMooe) => {
    setRestoringId(id);
    setError(null);
    setSuccess(null);
    try {
      const restoreFn = isMooe ? requestSubscriptionRestore : requestProposalRestore;
      await restoreFn(id);
      setSuccess("S3 Glacier cold retrieval initiated. Progress tracking has begun.");
      fetchArchivedItems();
    } catch (err) {
      setError(err.message || "Restore operation failed.");
    } finally {
      setRestoringId(null);
    }
  };

  const totalArchived = archivedProposals.length + archivedSubscriptions.length;

  return (
    <div className="space-y-6 text-xs max-w-5xl mx-auto select-none">
      {/* Header Banner */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <Snowflake className="w-5 h-5 text-cyan-400" />
            <span>AWS S3 Glacier Retrieval & Lifecycles Console</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Cold storage archival control panel. Initiate retrievals for canvas quotations transitioned to Glacier.
          </p>
        </div>
        <button
          onClick={fetchArchivedItems}
          disabled={loading}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Vault Tiers</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-955/40 border border-red-900/50 text-red-300 rounded-lg flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-900/50 text-emerald-300 rounded-lg flex items-start gap-2.5">
          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Main Archival Register Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 bg-slate-955 font-bold uppercase tracking-wider text-slate-400 flex justify-between items-center">
          <span>Document Archival Register (S3 Storage)</span>
          <span className="text-[10px] px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-cyan-400">
            Cold Records: {totalArchived}
          </span>
        </div>
        
        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-16 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
              <span>Querying storage properties...</span>
            </div>
          ) : totalArchived > 0 ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-850 bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Proposal Item</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Storage Class</th>
                  <th className="p-3">Retrieval Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-300">
                {/* CapEx Hardware Entries */}
                {archivedProposals.map(item => (
                  <tr key={item.id} className="hover:bg-slate-955/20 transition-colors">
                    <td className="p-3">
                      <div className="font-semibold text-slate-200">{item.item_name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 font-mono select-all">{item.id}</div>
                    </td>
                    <td className="p-3 text-slate-400">CapEx</td>
                    <td className="p-3 font-mono font-bold text-slate-400">
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-3.5 h-3.5 text-slate-600" />
                        <span>{item.s3_storage_class}</span>
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-xs">
                      {item.is_restoring ? (
                        <div className="space-y-2 max-w-[150px]">
                          <span className="text-cyan-400 animate-pulse flex items-center gap-1 font-mono text-[10px]">
                            <Clock className="w-3 h-3 animate-spin" />
                            <span>RESTORING ({item.restore_progress || 50}%)</span>
                          </span>
                          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                            <div 
                              className="h-full bg-cyan-400 rounded-full transition-all duration-500 animate-pulse" 
                              style={{ width: `${item.restore_progress || 50}%` }} 
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-red-400 italic">Archived (Offline)</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleSyncMetadata(item.id, false)}
                          disabled={syncingId === item.id}
                          className="p-1.5 bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-850 rounded cursor-pointer transition-colors"
                          title="Sync active storage class"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${syncingId === item.id ? "animate-spin" : ""}`} />
                        </button>
                        {item.s3_storage_class === "GLACIER" && !item.is_restoring && (
                          <button
                            onClick={() => handleRestore(item.id, false)}
                            disabled={restoringId === item.id}
                            className="p-1.5 bg-slate-950 hover:bg-amber-950/40 border border-slate-850 text-amber-400 rounded cursor-pointer flex items-center gap-1 transition-colors"
                            title="Initiate Glacier Cold Retrieval"
                          >
                            <DownloadCloud className="w-3.5 h-3.5" />
                            <span>Request S3 Restore</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {/* MOOE Subscription Entries */}
                {archivedSubscriptions.map(item => (
                  <tr key={item.id} className="hover:bg-slate-955/20 transition-colors">
                    <td className="p-3">
                      <div className="font-semibold text-slate-200">{item.software_name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 font-mono select-all">{item.id}</div>
                    </td>
                    <td className="p-3 text-slate-400">MOOE</td>
                    <td className="p-3 font-mono font-bold text-slate-400">
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-3.5 h-3.5 text-slate-600" />
                        <span>{item.s3_storage_class}</span>
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-xs">
                      {item.is_restoring ? (
                        <div className="space-y-2 max-w-[150px]">
                          <span className="text-cyan-400 animate-pulse flex items-center gap-1 font-mono text-[10px]">
                            <Clock className="w-3 h-3 animate-spin" />
                            <span>RESTORING ({item.restore_progress || 50}%)</span>
                          </span>
                          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                            <div 
                              className="h-full bg-cyan-400 rounded-full transition-all duration-500 animate-pulse" 
                              style={{ width: `${item.restore_progress || 50}%` }} 
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-red-400 italic">Archived (Offline)</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleSyncMetadata(item.id, true)}
                          disabled={syncingId === item.id}
                          className="p-1.5 bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-850 rounded cursor-pointer transition-colors"
                          title="Sync active storage class"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${syncingId === item.id ? "animate-spin" : ""}`} />
                        </button>
                        {item.s3_storage_class === "GLACIER" && !item.is_restoring && (
                          <button
                            onClick={() => handleRestore(item.id, true)}
                            disabled={restoringId === item.id}
                            className="p-1.5 bg-slate-950 hover:bg-amber-950/40 border border-slate-850 text-amber-400 rounded cursor-pointer flex items-center gap-1 transition-colors"
                            title="Initiate Glacier Cold Retrieval"
                          >
                            <DownloadCloud className="w-3.5 h-3.5" />
                            <span>Request S3 Restore</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-20 text-slate-500 italic">No offline archived canvas files logged.</div>
          )}
        </div>
      </div>
    </div>
  );
}