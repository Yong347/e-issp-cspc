// frontend/src/views/admin/Narrative/MithiSurveys.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { Save, RefreshCw, AlertCircle, CheckCircle, Network, HardDrive } from "lucide-react";

export default function MithiSurveys() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  // Network Profile States
  const [hasLan, setHasLan] = useState(true);
  const [hasIntranet, setHasIntranet] = useState(false);
  const [hasVpn, setHasVpn] = useState(false);
  const [internetBandwidth, setInternetBandwidth] = useState("");

  // Data Center profile states
  const [hasDataCenter, setHasDataCenter] = useState(true);
  const [activeServersCount, setActiveServersCount] = useState(0);
  const [hasBackupSite, setHasBackupSite] = useState(false);
  const [maintenanceStrategy, setMaintenanceStrategy] = useState("In-house");

  const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token;

  const fetchSurvey = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${activeCycle}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const net = data.mithi_network_profile || {};
        setHasLan(net.has_lan ?? true);
        setHasIntranet(net.has_intranet ?? false);
        setHasVpn(net.has_vpn ?? false);
        setInternetBandwidth(String(net.combined_bandwidth_mbps || ""));

        const dc = data.mithi_data_center || {};
        setHasDataCenter(dc.has_data_center ?? true);
        setActiveServersCount(dc.data_center_count || 0);
        setHasBackupSite(dc.has_backup_site ?? false);
        setMaintenanceStrategy(dc.maintenance_strategy || "In-house");
      } else {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to query the survey template.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && activeCycle) {
      fetchSurvey();
    }
  }, [token, activeCycle]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const networkPayload = {
      has_lan: hasLan,
      has_intranet: hasIntranet,
      has_vpn: hasVpn,
      is_connected_to_internet: true,
      internet_access_modes: ["Leased Line"],
      isps: ["PLDT"],
      combined_bandwidth_mbps: parseInt(internetBandwidth, 10) || 0,
      employees_with_internet_access: 100,
      employees_with_official_email: 100
    };

    const dcPayload = {
      has_data_center: hasDataCenter,
      data_center_count: parseInt(activeServersCount, 10) || 0,
      has_backup_site: hasBackupSite,
      maintenance_strategy: maintenanceStrategy
    };

    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${activeCycle}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          mithi_network_profile: networkPayload,
          mithi_data_center: dcPayload
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to update MITHI survey database data.");
      }
      
      setSuccess("Annex A-1 Technical MITHI Survey data updated successfully.");
      fetchSurvey();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto text-xs text-slate-100">
      <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
        <h2 className="text-white font-bold text-base flex items-center gap-2 border-b border-slate-800 pb-3">
          <Network className="w-5 h-5 text-blue-500" />
          <span>DICT Annex A-1 (MITHI Survey Profiles)</span>
        </h2>

        {error && (
          <div className="p-3.5 bg-red-955/40 border border-red-900/30 text-red-300 rounded flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{typeof error === "object" ? error.message : error}</span>
          </div>
        )}

        {success && (
          <div className="p-3.5 bg-emerald-950/40 border border-emerald-900/30 text-emerald-300 rounded flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
            <span>Syncing database parameters...</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Network segment */}
              <div className="p-5 bg-slate-950 rounded-xl border border-slate-850 space-y-4">
                <h4 className="font-bold text-slate-200 flex items-center gap-1.5 border-b border-slate-850 pb-2">
                  <Network className="w-4 h-4 text-blue-400" />
                  <span>Network Connectivity Survey</span>
                </h4>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-400">Local Area Network (LAN) presence</label>
                  <input 
                    type="checkbox" checked={hasLan} onChange={(e) => setHasLan(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-400">Institutional Intranet Portal</label>
                  <input 
                    type="checkbox" checked={hasIntranet} onChange={(e) => setHasIntranet(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-400">VPN Tunneling Capability</label>
                  <input 
                    type="checkbox" checked={hasVpn} onChange={(e) => setHasVpn(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">Combined Internet Bandwidth (Mbps)</label>
                  <input 
                    type="number" value={internetBandwidth} onChange={(e) => setInternetBandwidth(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Data Center segment */}
              <div className="p-5 bg-slate-955 rounded-xl border border-slate-850 space-y-4">
                <h4 className="font-bold text-slate-200 flex items-center gap-1.5 border-b border-slate-850 pb-2">
                  <HardDrive className="w-4 h-4 text-emerald-400" />
                  <span>Data Center Profile</span>
                </h4>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-400">On-Premise Physical Data Center</label>
                  <input 
                    type="checkbox" checked={hasDataCenter} onChange={(e) => setHasDataCenter(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-400">Disaster Recovery (DR) Backup Site</label>
                  <input 
                    type="checkbox" checked={hasBackupSite} onChange={(e) => setHasBackupSite(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">Active Servers Count</label>
                  <input 
                    type="number" value={activeServersCount} onChange={(e) => setActiveServersCount(e.target.value)}
                    placeholder="e.g. 2"
                    className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">Maintenance Strategy</label>
                  <input 
                    type="text" value={maintenanceStrategy} onChange={(e) => setMaintenanceStrategy(e.target.value)}
                    className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit" disabled={submitting}
              className="w-full p-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving MITHI survey profiles...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Commit MITHI Survey Profiles</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}