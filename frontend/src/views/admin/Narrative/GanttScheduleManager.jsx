// frontend/src/views/admin/Narrative/GanttScheduleManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  Save, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle,
  Calendar,
  Layers,
  ChevronRight
} from "lucide-react";

export default function GanttScheduleManager() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Notifications
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const apiEndpoint = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;

  const fetchSchedules = async () => {
    if (!activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiEndpoint}/api/admin/narratives/${activeCycle}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (!res.ok) {
        throw new Error("Failed to load SUC project implementation timelines.");
      }
      const data = await res.json();
      
      // Safe fallback if implementation_schedules is not defined or is null
      setSchedules(data.implementation_schedules || []);
    } catch (err) {
      setError(err.message || "Failed to retrieve implementation schedule matrices.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token && activeCycle) {
      fetchSchedules();
    }
  }, [user, activeCycle]);

  const handleToggleQuarter = (projectIndex, key) => {
    setError(null);
    setSuccess(null);
    
    const updatedSchedules = [...schedules];
    const project = updatedSchedules[projectIndex];
    
    // Ensure milestones dictionary exists
    if (!project.milestones) {
      project.milestones = {};
    }
    
    // Toggle state value
    project.milestones[key] = !project.milestones[key];
    setSchedules(updatedSchedules);
  };

  const handleSaveTimelines = async () => {
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${apiEndpoint}/api/admin/narratives/${activeCycle}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({ implementation_schedules: schedules })
      });

      if (!res.ok) {
        throw new Error("Failed to preserve quarterly implementation milestones.");
      }

      setSuccess("Gantt timeline implementation schedule preserved successfully.");
      fetchSchedules();
    } catch (err) {
      setError(err.message || "Failed to save Gantt milestone configurations.");
    } finally {
      setSubmitting(false);
    }
  };

  const quarters = ["Q1", "Q2", "Q3", "Q4"];

  return (
    <div className="space-y-6 text-xs text-slate-100 max-w-7xl mx-auto select-none">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 p-6 rounded-xl border border-slate-800 gap-4">
        <div>
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-500" />
            <span>Interactive Gantt Timeline Editor (Part V.A/B)</span>
          </h2>
          <p className="text-slate-400 mt-1">Configure quarterly deployment milestones and schedules across the 3-year planning horizon.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchSchedules}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
            title="Refresh Milestones"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleSaveTimelines}
            disabled={submitting || loading || schedules.length === 0}
            className="py-2 px-4 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-white flex items-center gap-1.5 cursor-pointer transition-all disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{submitting ? "Preserving..." : "Save Timelines"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-955/20 border border-red-900 text-red-400 font-bold rounded-lg flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/20 border border-emerald-800 text-emerald-400 font-bold rounded-lg flex items-center gap-2.5">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Timeline Editor Board */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 bg-slate-955/60 font-bold text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
            <Layers className="w-4 h-4 text-slate-500" />
            <span>Deployment Milestones Matrix</span>
          </span>
          <span className="text-[10px] px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-blue-400 font-bold">
            Horizon: {activeCycle || "N/A"}
          </span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-20 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
              <span>Parsing schedule matrix...</span>
            </div>
          ) : schedules.length > 0 ? (
            <table className="w-full text-center border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400">
                  <th className="p-4 text-left border-r border-b border-slate-800 w-1/4 min-w-[240px]">Project Strategic Module</th>
                  {planningYears.map(year => (
                    <th key={year} colSpan={4} className="border-r border-b border-slate-800 text-xs py-2 font-bold tracking-wider text-slate-200">
                      FY {year}
                    </th>
                  ))}
                </tr>
                <tr className="bg-slate-900/40 font-mono text-[9px] text-slate-500 border-b border-slate-800">
                  <th className="border-r border-slate-800"></th>
                  {planningYears.map(year => (
                    quarters.map(q => (
                      <th key={`${year}_${q}`} className="border-r border-slate-800 py-1.5 uppercase font-bold">
                        {q}
                      </th>
                    ))
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {schedules.map((row, projectIdx) => (
                  <tr key={row.project_id || projectIdx} className="hover:bg-slate-955/10 transition-colors">
                    {/* Project Title */}
                    <td className="text-left font-bold p-4 border-r border-slate-800 text-slate-200 max-w-[240px] break-words">
                      <div className="flex items-center gap-1">
                        <ChevronRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span>{row.project_name}</span>
                      </div>
                    </td>

                    {/* Timeline Block Toggles */}
                    {planningYears.map(year => (
                      quarters.map(q => {
                        const key = `${year}_${q}`;
                        const active = !!row.milestones?.[key];
                        return (
                          <td key={key} className="border-r border-slate-850 p-2 relative">
                            <button
                              type="button"
                              onClick={() => handleToggleQuarter(projectIdx, key)}
                              className={`w-full h-8 rounded-md border cursor-pointer transition-all duration-200 ${
                                active 
                                  ? "bg-blue-600/30 border-blue-500 text-blue-400 font-bold shadow-inner shadow-blue-500/20" 
                                  : "bg-slate-950/60 border-slate-850 text-slate-600 hover:border-slate-700 hover:bg-slate-950"
                              }`}
                              title={`${row.project_name} - FY ${year} ${q}`}
                            >
                              <span className="text-[9px] font-mono select-none">
                                {active ? "ACTIVE" : ""}
                              </span>
                            </button>
                          </td>
                        );
                      })
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-20 text-slate-500 italic">
              No project implementation schedules configured for active cycle '{activeCycle}'. Ensure proposals are categorized under standard projects.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}