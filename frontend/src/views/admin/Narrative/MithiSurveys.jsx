// frontend/src/views/admin/Narrative/MithiSurveys.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  Save, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Network, 
  HardDrive, 
  ShieldCheck, 
  Archive, 
  AlertTriangle,
  Globe,
  Wifi,
  Users,
  FileText
} from "lucide-react";

export default function MithiSurveys() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  // 1. Network Profile States (Fully Parameterized)
  const [hasLan, setHasLan] = useState(true);
  const [hasIntranet, setHasIntranet] = useState(false);
  const [hasVpn, setHasVpn] = useState(false);
  const [isConnectedToInternet, setIsConnectedToInternet] = useState(true);
  const [isps, setIsps] = useState("GovNet, Dedicated Leased Line, Commercial ISP");
  const [internetAccessModes, setInternetAccessModes] = useState("Dedicated Leased Line, Fiber Optic");
  const [internetBandwidth, setInternetBandwidth] = useState("100");
  const [employeesWithInternet, setEmployeesWithInternet] = useState("100");
  const [employeesWithEmail, setEmployeesWithEmail] = useState("100");

  // 2. Data Center Profile States
  const [hasDataCenter, setHasDataCenter] = useState(true);
  const [activeServersCount, setActiveServersCount] = useState(2);
  const [hasBackupSite, setHasBackupSite] = useState(false);
  const [maintenanceStrategy, setMaintenanceStrategy] = useState("In-house");

  // 3. Section 4: Security, Disaster Recovery & Backup States
  const [hasSecurityPolicy, setHasSecurityPolicy] = useState(false);
  const [hasDrPlan, setHasDrPlan] = useState(false);
  const [hasBackUpPower, setHasBackUpPower] = useState(false);
  const [hasDigitalSignatures, setHasDigitalSignatures] = useState(false);
  const [hasEncryption, setHasEncryption] = useState(false);
  const [hasOffsiteBackup, setHasOffsiteBackup] = useState(false);
  const [hasHardwareFirewall, setHasHardwareFirewall] = useState(false);

  // 4. Section 5: Data Archiving States (Fully Parameterized - Neutral Government Records)
  const [hasArchivingSystem, setHasArchivingSystem] = useState(false);
  const [archivingMode, setArchivingMode] = useState("Electronic");
  const [archivingMedium, setArchivingMedium] = useState("Hard Disk, Cloud Storage, NAS");
  const [archivedInformation, setArchivedInformation] = useState(
    "Official Publications, Public Registry Records, Executive Directives, Financial Ledgers"
  );

  // 5. Section 8.2: ICT Governance Bottlenecks
  const [hasBudgetIssues, setHasBudgetIssues] = useState(false);
  const [hasProcurementIssues, setHasProcurementIssues] = useState(false);
  const [hasReluctantStakeholders, setHasReluctantStakeholders] = useState(false);
  const [hasEmployeeSkillsIssues, setHasEmployeeSkillsIssues] = useState(false);

  const rawUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token;

  const fetchSurvey = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        
        // 1. Network Profile
        const net = data.mithi_network_profile || {};
        setHasLan(net.has_lan ?? true);
        setHasIntranet(net.has_intranet ?? false);
        setHasVpn(net.has_vpn ?? false);
        setIsConnectedToInternet(net.is_connected_to_internet ?? true);
        setIsps(
          Array.isArray(net.isps) 
            ? net.isps.join(", ") 
            : (net.isps || "GovNet, Dedicated Leased Line, Commercial ISP")
        );
        setInternetAccessModes(
          Array.isArray(net.internet_access_modes) 
            ? net.internet_access_modes.join(", ") 
            : (net.internet_access_modes || "Dedicated Leased Line, Fiber Optic")
        );
        setInternetBandwidth(String(net.combined_bandwidth_mbps || "100"));
        setEmployeesWithInternet(String(net.employees_with_internet_access ?? "100"));
        setEmployeesWithEmail(String(net.employees_with_official_email ?? "100"));

        // 2. Data Center
        const dc = data.mithi_data_center || {};
        setHasDataCenter(dc.has_data_center ?? true);
        setActiveServersCount(dc.data_center_count || 0);
        setHasBackupSite(dc.has_backup_site ?? false);
        setMaintenanceStrategy(dc.maintenance_strategy || "In-house");

        // 3. Section 4: Security & DR
        const sec = data.mithi_security_dr || {};
        setHasSecurityPolicy(sec.has_security_policy ?? false);
        setHasDrPlan(sec.has_dr_plan ?? false);
        setHasBackUpPower(sec.has_back_up_power ?? false);
        setHasDigitalSignatures(sec.has_digital_signatures ?? false);
        setHasEncryption(sec.has_encryption ?? false);
        setHasOffsiteBackup(sec.has_offsite_backup ?? false);
        setHasHardwareFirewall(sec.has_hardware_firewall ?? false);

        // 4. Section 5: Archiving
        const arc = data.mithi_data_archiving || {};
        setHasArchivingSystem(arc.has_archiving_system ?? false);
        setArchivingMode(arc.archiving_mode || "Electronic");
        setArchivingMedium(
          Array.isArray(arc.archiving_medium) 
            ? arc.archiving_medium.join(", ") 
            : (arc.archiving_medium || "Hard Disk, Cloud Storage, NAS")
        );
        setArchivedInformation(
          Array.isArray(arc.archived_information) 
            ? arc.archived_information.join(", ") 
            : (arc.archived_information || "Official Publications, Public Registry Records, Executive Directives, Financial Ledgers")
        );

        // 5. Section 8.2: ICT Bottlenecks
        const iss = data.mithi_ict_issues || {};
        setHasBudgetIssues(iss.has_budget_issues ?? false);
        setHasProcurementIssues(iss.has_procurement_issues ?? false);
        setHasReluctantStakeholders(iss.has_reluctant_stakeholders ?? false);
        setHasEmployeeSkillsIssues(iss.has_employee_skills_issues ?? false);
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to query the survey parameters.");
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

    // Parse comma-separated inputs into clean string arrays
    const parsedIsps = isps
      ? isps.split(",").map(s => s.trim()).filter(Boolean)
      : ["GovNet / Dedicated Leased Line"];

    const parsedAccessModes = internetAccessModes
      ? internetAccessModes.split(",").map(s => s.trim()).filter(Boolean)
      : ["Dedicated Leased Line"];

    const parsedMedium = archivingMedium
      ? archivingMedium.split(",").map(s => s.trim()).filter(Boolean)
      : ["Hard Disk", "Cloud Storage"];

    const parsedInfoTypes = archivedInformation
      ? archivedInformation.split(",").map(s => s.trim()).filter(Boolean)
      : ["Official Publications", "Directives", "Records"];

    const networkPayload = {
      has_lan: hasLan,
      has_intranet: hasIntranet,
      has_vpn: hasVpn,
      is_connected_to_internet: isConnectedToInternet,
      internet_access_modes: parsedAccessModes,
      isps: parsedIsps,
      combined_bandwidth_mbps: parseInt(internetBandwidth, 10) || 0,
      employees_with_internet_access: parseInt(employeesWithInternet, 10) || 0,
      employees_with_official_email: parseInt(employeesWithEmail, 10) || 0
    };

    const dcPayload = {
      has_data_center: hasDataCenter,
      data_center_count: parseInt(activeServersCount, 10) || 0,
      has_backup_site: hasBackupSite,
      maintenance_strategy: maintenanceStrategy.trim() || "In-house"
    };

    const securityPayload = {
      has_security_policy: hasSecurityPolicy,
      has_dr_plan: hasDrPlan,
      has_back_up_power: hasBackUpPower,
      has_digital_signatures: hasDigitalSignatures,
      has_encryption: hasEncryption,
      has_offsite_backup: hasOffsiteBackup,
      has_hardware_firewall: hasHardwareFirewall
    };

    const archivingPayload = {
      has_archiving_system: hasArchivingSystem,
      archiving_mode: archivingMode,
      archiving_medium: parsedMedium,
      archived_information: parsedInfoTypes
    };

    const issuesPayload = {
      has_budget_issues: hasBudgetIssues,
      has_procurement_issues: hasProcurementIssues,
      has_reluctant_stakeholders: hasReluctantStakeholders,
      has_employee_skills_issues: hasEmployeeSkillsIssues
    };

    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          mithi_network_profile: networkPayload,
          mithi_data_center: dcPayload,
          mithi_security_dr: securityPayload,
          mithi_data_archiving: archivingPayload,
          mithi_ict_issues: issuesPayload
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to update MITHI survey database parameters.");
      }
      
      setSuccess("ICT Infrastructure & MITHI Survey parameters updated successfully.");
      fetchSurvey();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto text-xs text-slate-800 dark:text-slate-100 select-none transition-colors duration-200">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
        <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-600 dark:text-blue-500" />
            <span>MITHI Survey: ICT Infrastructure & Governance Readiness</span>
          </h2>
          <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-950 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-800">
            Active Cycle: FY {activeCycle}
          </span>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 dark:bg-red-955/40 border border-rose-200 dark:border-red-900/40 text-rose-700 dark:text-red-300 rounded-lg flex items-center gap-2 animate-fadeIn shadow-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{typeof error === "object" ? error.message : error}</span>
          </div>
        )}

        {success && (
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-lg flex items-center gap-2 animate-fadeIn shadow-xs">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
            <span>Syncing infrastructure survey parameters...</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* 1. Network Profile Segment (Dynamic ISPs & Metrics) */}
              <div className="p-5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-850 space-y-4 shadow-2xs">
                <h4 className="font-bold text-slate-900 dark:text-slate-200 flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-850 pb-2">
                  <Network className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Section 1: Network Connectivity Survey</span>
                </h4>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-400">Local Area Network (LAN) present</label>
                  <input 
                    type="checkbox" checked={hasLan} onChange={(e) => setHasLan(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-400">Institutional Intranet Portal</label>
                  <input 
                    type="checkbox" checked={hasIntranet} onChange={(e) => setHasIntranet(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-400">Virtual Private Network (VPN) Support</label>
                  <input 
                    type="checkbox" checked={hasVpn} onChange={(e) => setHasVpn(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] uppercase font-bold text-slate-500">Internet Service Providers (Comma-Separated)</label>
                  <input 
                    type="text" 
                    value={isps} 
                    onChange={(e) => setIsps(e.target.value)}
                    placeholder="e.g. GovNet, Dedicated Leased Line, Commercial ISP"
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] uppercase font-bold text-slate-500">Internet Access Modes (Comma-Separated)</label>
                  <input 
                    type="text" 
                    value={internetAccessModes} 
                    onChange={(e) => setInternetAccessModes(e.target.value)}
                    placeholder="e.g. Leased Line, Fiber Optic, Fixed Wireless"
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 font-mono">
                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Bandwidth (Mbps)</label>
                    <input 
                      type="number" min="0" value={internetBandwidth} onChange={(e) => setInternetBandwidth(e.target.value)}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded text-slate-900 dark:text-white text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Net Access (%)</label>
                    <input 
                      type="number" min="0" max="100" value={employeesWithInternet} onChange={(e) => setEmployeesWithInternet(e.target.value)}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded text-slate-900 dark:text-white text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Email Access (%)</label>
                    <input 
                      type="number" min="0" max="100" value={employeesWithEmail} onChange={(e) => setEmployeesWithEmail(e.target.value)}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded text-slate-900 dark:text-white text-center"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Data Center Profile Segment */}
              <div className="p-5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-850 space-y-4 shadow-2xs">
                <h4 className="font-bold text-slate-900 dark:text-slate-200 flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-850 pb-2">
                  <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Section 2: Data Center Profile</span>
                </h4>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-400">On-Premises Physical Data Center</label>
                  <input 
                    type="checkbox" checked={hasDataCenter} onChange={(e) => setHasDataCenter(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-400">Disaster Recovery (DR) Alternate Site</label>
                  <input 
                    type="checkbox" checked={hasBackupSite} onChange={(e) => setHasBackupSite(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Active Physical / Virtual Server Count</label>
                  <input 
                    type="number" min="0" value={activeServersCount} onChange={(e) => setActiveServersCount(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded text-slate-900 dark:text-white font-mono outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Maintenance Strategy</label>
                  <input 
                    type="text" value={maintenanceStrategy} onChange={(e) => setMaintenanceStrategy(e.target.value)}
                    placeholder="e.g. In-house, Vendor SLA, Managed Cloud Services"
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              {/* 3. Section 4: Security & Disaster Recovery Checklist */}
              <div className="p-5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-850 space-y-4 shadow-2xs">
                <h4 className="font-bold text-slate-900 dark:text-slate-200 flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-850 pb-2">
                  <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Section 4: Security & Disaster Recovery Checklist</span>
                </h4>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-400">Formal Information Security Policy Adopted?</label>
                  <input 
                    type="checkbox" checked={hasSecurityPolicy} onChange={(e) => setHasSecurityPolicy(e.target.checked)}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-400">Disaster Recovery (DR) Plan Established?</label>
                  <input 
                    type="checkbox" checked={hasDrPlan} onChange={(e) => setHasDrPlan(e.target.checked)}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-400">Backup Power Generation (Generator / Rack UPS)?</label>
                  <input 
                    type="checkbox" checked={hasBackUpPower} onChange={(e) => setHasBackUpPower(e.target.checked)}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-400">Employs Digital Signatures (PNPKI)?</label>
                  <input 
                    type="checkbox" checked={hasDigitalSignatures} onChange={(e) => setHasDigitalSignatures(e.target.checked)}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-400">Database & Network Encryption Active?</label>
                  <input 
                    type="checkbox" checked={hasEncryption} onChange={(e) => setHasEncryption(e.target.checked)}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-400">Automated Off-site Backups Configured?</label>
                  <input 
                    type="checkbox" checked={hasOffsiteBackup} onChange={(e) => setHasOffsiteBackup(e.target.checked)}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-400">Hardware Firewalls (NGFW / WAF) Deployed?</label>
                  <input 
                    type="checkbox" checked={hasHardwareFirewall} onChange={(e) => setHasHardwareFirewall(e.target.checked)}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* 4. Section 5 & 8.2: Data Archiving & Institutional Bottlenecks */}
              <div className="p-5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-850 space-y-4 shadow-2xs">
                <h4 className="font-bold text-slate-900 dark:text-slate-200 flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-850 pb-2">
                  <Archive className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Sections 5 & 8.2: Archiving & Governance Issues</span>
                </h4>

                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-400">Active Electronic Archiving System?</label>
                  <input 
                    type="checkbox" checked={hasArchivingSystem} onChange={(e) => setHasArchivingSystem(e.target.checked)}
                    className="w-4 h-4 accent-amber-600 rounded cursor-pointer"
                  />
                </div>

                {hasArchivingSystem && (
                  <div className="space-y-3 animate-fadeIn">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-slate-500">Archiving Mode</label>
                      <select
                        value={archivingMode}
                        onChange={(e) => setArchivingMode(e.target.value)}
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded text-slate-800 dark:text-slate-100 outline-none cursor-pointer"
                      >
                        <option value="Manual">Manual Filing</option>
                        <option value="Electronic">Electronic / Cold Cloud Tier</option>
                        <option value="Both">Hybrid (Manual + Electronic)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-slate-500">Archiving Storage Mediums (Comma-Separated)</label>
                      <input 
                        type="text" 
                        value={archivingMedium} 
                        onChange={(e) => setArchivingMedium(e.target.value)}
                        placeholder="e.g. S3 Glacier, NAS Storage, Optical Media"
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded text-slate-900 dark:text-white text-xs outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-slate-500">Archived Record Types (Comma-Separated)</label>
                      <input 
                        type="text" 
                        value={archivedInformation} 
                        onChange={(e) => setArchivedInformation(e.target.value)}
                        placeholder="e.g. Official Communications, Public Registries, Audit Disclosures, Financial Statements"
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded text-slate-900 dark:text-white text-xs outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-200 dark:border-slate-850/60 pt-3 space-y-3">
                  <span className="block text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span>8.2 Institutional Implementation Issues</span>
                  </span>

                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-700 dark:text-slate-400">Insufficient Budgetary Constraints?</label>
                    <input 
                      type="checkbox" checked={hasBudgetIssues} onChange={(e) => setHasBudgetIssues(e.target.checked)}
                      className="w-4 h-4 accent-rose-600 rounded cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-700 dark:text-slate-400">Procurement & Public Bidding Delays?</label>
                    <input 
                      type="checkbox" checked={hasProcurementIssues} onChange={(e) => setHasProcurementIssues(e.target.checked)}
                      className="w-4 h-4 accent-rose-600 rounded cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-700 dark:text-slate-400">Stakeholder Transition Reluctance?</label>
                    <input 
                      type="checkbox" checked={hasReluctantStakeholders} onChange={(e) => setHasReluctantStakeholders(e.target.checked)}
                      className="w-4 h-4 accent-rose-600 rounded cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-700 dark:text-slate-400">Internal Technical Skills Gaps?</label>
                    <input 
                      type="checkbox" checked={hasEmployeeSkillsIssues} onChange={(e) => setHasEmployeeSkillsIssues(e.target.checked)}
                      className="w-4 h-4 accent-rose-600 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>

            </div>

            <button
              type="submit" 
              disabled={submitting}
              className="w-full p-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs shadow-md"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving MITHI survey parameters...</span>
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