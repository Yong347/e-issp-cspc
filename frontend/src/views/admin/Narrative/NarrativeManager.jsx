// frontend/src/views/admin/Narrative/NarrativeManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  FileText, Save, RefreshCw, CheckCircle, AlertCircle, 
  CalendarRange, Landmark, ShieldAlert, Settings2, FileSignature, Trash2 
} from "lucide-react";

export default function NarrativeManager() {
  const { user } = useAuth();
  const { activeCycle, fetchActiveCycle } = useCycle();

  const [activeTab, setActiveTab] = useState("cycle"); 
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  // Dynamic Cycle Configuration State
  const [startYear, setStartYear] = useState("");
  const [endYear, setEndYear] = useState("");

  // Coversheet & Narrative Authorship State
  const [agencyName, setAgencyName] = useState("Camarines Sur Polytechnic Colleges");
  const [preparedBy, setPreparedBy] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [mandate, setMandate] = useState("");
  const [vision, setVision] = useState("");
  const [mission, setMission] = useState("");
  const [presentSituation, setPresentSituation] = useState("");

  // Letter of Transmittal Coversheet State
  const [recipientName, setRecipientName] = useState("ATTY. IVAN JOHN E. UY");
  const [recipientTitle, setRecipientTitle] = useState("Secretary");
  const [recipientAgency, setRecipientAgency] = useState("Department of Information and Communications Technology");
  const [recipientAddress, setRecipientAddress] = useState("DICT Bldg., C.P. Garcia Avenue, Diliman, Quezon City");
  const [transmittalDate, setTransmittalDate] = useState("");

  const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token;

  useEffect(() => {
    if (activeCycle) {
      const parts = activeCycle.split("-");
      if (parts.length === 2) {
        setStartYear(parts[0]);
        setEndYear(parts[1]);
      }
    }
  }, [activeCycle]);

  const fetchCycleData = async () => {
    if (!activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${activeCycle}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAgencyName(data.agency_name || "Camarines Sur Polytechnic Colleges");
        setPreparedBy(data.signatory_prepared_by || "");
        setApprovedBy(data.signatory_approved_by || "");
        setMandate(data.mandate_html || "");
        setVision(data.vision_html || "");
        setMission(data.mission_html || "");
        setPresentSituation(data.present_situation_html || "");
        setRecipientName(data.transmittal_recipient || "ATTY. IVAN JOHN E. UY");
        setRecipientTitle(data.transmittal_recipient_title || "Secretary");
        setRecipientAgency(data.transmittal_recipient_agency || "Department of Information and Communications Technology");
        setRecipientAddress(data.transmittal_recipient_address || "DICT Bldg., C.P. Garcia Avenue, Diliman, Quezon City");
        setTransmittalDate(data.transmittal_date || "");
      } else {
        setPreparedBy("");
        setApprovedBy("");
        setMandate("");
        setVision("");
        setMission("");
        setPresentSituation("");
      }
    } catch (e) {
      console.warn("Ready for cycle configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && activeCycle) {
      fetchCycleData();
    }
  }, [token, activeCycle]);

  const handleActivateCycle = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const start = parseInt(startYear, 10);
    const end = parseInt(endYear, 10);

    if (isNaN(start) || isNaN(end)) {
      setError("Please enter valid calendar years.");
      return;
    }

    if (start > end) {
      setError("Start Year must be less than or equal to End Year.");
      return;
    }

    const span = end - start + 1;
    if (span < 2 || span > 10) {
      setError(`ISSP cycles must span between 2 and 10 years. Currently requesting: ${span} years.`);
      return;
    }

    setSubmitting(true);
    const targetCycle = `${start}-${end}`;

    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${targetCycle}/activate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to activate cycle.");
      }

      setSuccess(`Planning cycle updated and activated to: FY ${targetCycle}`);
      await fetchActiveCycle();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetCycle = async () => {
    const confirmation = window.confirm(
      `CRITICAL ACTION CONFIRMATION:\n` +
      `Are you sure you want to safe-reset the active cycle '${activeCycle}'?\n` +
      `This will completely purge all draft/submitted/approved proposals, dynamic narratives, and ceilings linked to this span.`
    );
    if (!confirmation) return;

    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${activeCycle}/reset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to safe-reset planning cycle.");
      }

      setSuccess("Planning cycle metrics and templates safely purged. You can now define a corrected year span.");
      setStartYear("");
      setEndYear("");
      await fetchActiveCycle();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveNarratives = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${activeCycle}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          agency_name: agencyName.trim(),
          signatory_prepared_by: preparedBy.trim(),
          signatory_approved_by: approvedBy.trim(),
          mandate_html: mandate.trim(),
          vision_html: vision.trim(),
          mission_html: mission.trim(),
          present_situation_html: presentSituation.trim(),
          transmittal_recipient: recipientName.trim(),
          transmittal_recipient_title: recipientTitle.trim(),
          transmittal_recipient_agency: recipientAgency.trim(),
          transmittal_recipient_address: recipientAddress.trim(),
          transmittal_date: transmittalDate.trim(),
          issp_period_from: parseInt(startYear, 10),
          issp_period_to: parseInt(endYear, 10)
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to write narrative parameters.");
      }

      setSuccess("Coversheet narratives and transmittal fields saved successfully.");
      fetchCycleData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const calculatedSpan = parseInt(endYear, 10) - parseInt(startYear, 10) + 1;

  return (
    <div className="space-y-6 max-w-5xl mx-auto text-xs text-slate-100 select-none">
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            <span>Master ISSP Narrative and Coversheet Studio</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Centralized management of framework timelines, signatory coversheets, and legal compliance mandates.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-955/40 border border-red-900/50 text-red-300 rounded-lg flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{typeof error === "object" ? error.message : error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-900/50 text-emerald-300 rounded-lg flex items-start gap-2.5">
          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="flex gap-1.5 p-1 bg-slate-955 rounded-lg border border-slate-850 self-start max-w-md">
        <button
          onClick={() => { setError(null); setSuccess(null); setActiveTab("cycle"); }}
          className={`flex items-center gap-1.5 px-4 py-2 font-bold rounded-md transition-all cursor-pointer ${
            activeTab === "cycle" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <CalendarRange className="w-4 h-4" />
          <span>1. Cycle & Signatories</span>
        </button>
        <button
          onClick={() => { setError(null); setSuccess(null); setActiveTab("coversheet"); }}
          className={`flex items-center gap-1.5 px-4 py-2 font-bold rounded-md transition-all cursor-pointer ${
            activeTab === "coversheet" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileSignature className="w-4 h-4" />
          <span>2. Transmittal Letter</span>
        </button>
        <button
          onClick={() => { setError(null); setSuccess(null); setActiveTab("parts"); }}
          className={`flex items-center gap-1.5 px-4 py-2 font-bold rounded-md transition-all cursor-pointer ${
            activeTab === "parts" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>3. Mandates & Narratives</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          
          {activeTab === "cycle" && (
            <div className="space-y-6">
              <form onSubmit={handleActivateCycle} className="space-y-4 animate-fadeIn">
                <h3 className="text-white font-bold text-xs uppercase tracking-wide border-b border-slate-855 pb-2">
                  Active Cycle Governance Configuration
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                      Start Fiscal Year
                    </label>
                    <input
                      type="number"
                      required
                      value={startYear}
                      onChange={(e) => setStartYear(e.target.value)}
                      className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono text-center outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                      End Fiscal Year
                    </label>
                    <input
                      type="number"
                      required
                      value={endYear}
                      onChange={(e) => setEndYear(e.target.value)}
                      className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono text-center outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>
                </div>
                {!isNaN(calculatedSpan) && calculatedSpan > 0 && (
                  <div className="p-3 bg-slate-955 border border-slate-850 rounded-lg text-[10px] text-slate-400">
                    Calculated Duration: <span className="font-bold text-blue-400 font-mono">{calculatedSpan}-Year Planning Cycle</span>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full p-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Settings2 className="w-4 h-4" />
                  <span>{submitting ? "Processing..." : "Activate Cycle Framework"}</span>
                </button>
              </form>

              {/* Cycle Safe Reset Control Panel */}
              <div className="p-5 bg-slate-955 rounded-xl border border-slate-850/80 space-y-3.5 animate-fadeIn">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <span className="font-bold text-slate-200 block">Planning Cycle Reset Management</span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Need to redefine active year spans or adjust the timeline plan? Running a Safe Reset transactionally flushes active drafts, narratives, and budget ceilings for '{activeCycle}' allowing you to establish a corrected cycle from scratch.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleResetCycle}
                  disabled={submitting}
                  className="p-2 px-4 bg-red-955 hover:bg-red-900 border border-red-900 text-red-300 font-bold rounded flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Safe Reset Active Cycle</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === "coversheet" && (
            <form onSubmit={handleSaveNarratives} className="space-y-4 animate-fadeIn">
              <h3 className="text-white font-bold text-xs uppercase tracking-wide border-b border-slate-855 pb-2">
                DICT Transmittal Coversheet Mappings
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Recipient Full Name</label>
                  <input 
                    type="text" required value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white focus:ring-1 focus:ring-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Recipient Title</label>
                  <input 
                    type="text" required value={recipientTitle} onChange={(e) => setRecipientTitle(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white focus:ring-1 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Target Agency / Commission Name</label>
                <input 
                  type="text" required value={recipientAgency} onChange={(e) => setRecipientAgency(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white focus:ring-1 focus:ring-blue-600 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Physical Delivery Address</label>
                <textarea 
                  rows={2} required value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white resize-none focus:ring-1 focus:ring-blue-600 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Formal Document Date</label>
                <input 
                  type="text" required value={transmittalDate} onChange={(e) => setTransmittalDate(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white focus:ring-1 focus:ring-blue-600 outline-none"
                />
              </div>
              <button
                type="submit" disabled={submitting}
                className="w-full p-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Preserving..." : "Save Coversheet Parameters"}</span>
              </button>
            </form>
          )}

          {activeTab === "parts" && (
            <form onSubmit={handleSaveNarratives} className="space-y-4 animate-fadeIn">
              <h3 className="text-white font-bold text-xs uppercase tracking-wide border-b border-slate-855 pb-2">
                Mandates, Vision, & Mission Definitions
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Signatory: Prepared By</label>
                  <input
                    type="text" required value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)}
                    className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono focus:ring-1 focus:ring-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Signatory: Approved By</label>
                  <input
                    type="text" required value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)}
                    className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono focus:ring-1 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Part I.A.1 - Legal Mandate (HTML Formatted)</label>
                <textarea
                  value={mandate} onChange={(e) => setMandate(e.target.value)} rows={3}
                  className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono text-[11px] focus:ring-1 focus:ring-blue-600 outline-none"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">College Vision Statement</label>
                  <textarea
                    value={vision} onChange={(e) => setVision(e.target.value)} rows={3}
                    className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white focus:ring-1 focus:ring-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">College Mission Statement</label>
                  <textarea
                    value={mission} onChange={(e) => setMission(e.target.value)} rows={3}
                    className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white focus:ring-1 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Part I.D - Present ICT Situation & Vulnerabilities</label>
                <textarea
                  value={presentSituation} onChange={(e) => setPresentSituation(e.target.value)} rows={4}
                  className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white focus:ring-1 focus:ring-blue-600 outline-none"
                />
              </div>
              <button
                type="submit" disabled={submitting}
                className="w-full p-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Preserving..." : "Save Narratives"}</span>
              </button>
            </form>
          )}

        </div>

        {/* Global Reference Sidebar Info Panel */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 h-fit space-y-4 text-slate-400 leading-relaxed text-[11px]">
          <h3 className="text-white font-bold text-xs tracking-wider uppercase border-b border-slate-800 pb-3 flex items-center gap-1.5">
            <Landmark className="w-4 h-4 text-blue-500" />
            <span>Framework Details</span>
          </h3>
          <div className="space-y-3 font-mono">
            <div className="flex justify-between border-b border-slate-855 pb-2">
              <span>Institution Head:</span>
              <span className="text-slate-200 font-bold">SUC President III</span>
            </div>
            <div className="flex justify-between border-b border-slate-855 pb-2">
              <span>Active Period:</span>
              <span className="text-slate-200 font-bold">{activeCycle || "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span>DICT Mandate:</span>
              <span className="text-slate-200 font-bold">A4 Compliance</span>
            </div>
          </div>
          <div className="bg-slate-955/40 p-4 rounded-lg border border-slate-850 space-y-2">
            <span className="font-bold text-slate-300 uppercase tracking-wider block">Information</span>
            <p>
              Modifying these elements rewrites cover signatures and Part I parameters inside the twin-pass compiling engine. Make sure all signage names align with academic records.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}