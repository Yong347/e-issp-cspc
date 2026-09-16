// frontend/src/views/admin/Narrative/GanttScheduleManager.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  Save, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle,
  Calendar,
  Layers,
  ChevronRight,
  FolderKanban,
  Clock,
  Activity,
  Sparkles,
  Info
} from "lucide-react";

export default function GanttScheduleManager() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();
  
  // Data States
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Notification States
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiEndpoint = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  // Safe fallback for planning years
  const activeYears = (planningYears && planningYears.length > 0) ? planningYears : [2026, 2027, 2028];
  const quarters = ["Q1", "Q2", "Q3", "Q4"];

  const fetchSchedulesAndProjects = useCallback(async () => {
    if (!activeCycle || !token) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Narrative to retrieve saved implementation_schedules
      const narrativeRes = await fetch(`${apiEndpoint}/api/admin/narratives/${encodeURIComponent(activeCycle)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const narrativeData = narrativeRes.ok ? await narrativeRes.json() : {};
      const savedSchedules = Array.isArray(narrativeData.implementation_schedules) 
        ? narrativeData.implementation_schedules 
        : [];

      // 2. Fetch Active ICT Projects (Part III.E) to ensure complete synchronization
      const projRes = await fetch(`${apiEndpoint}/api/admin/ict-projects?issp_period=${encodeURIComponent(activeCycle)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const projData = projRes.ok ? await projRes.json() : [];
      const activeProjects = Array.isArray(projData) ? projData : (projData.data || []);

      // 3. Intelligently merge Part III.E projects with saved milestones
      if (activeProjects.length > 0) {
        const merged = activeProjects.map(proj => {
          const existing = savedSchedules.find(s => 
            (s.project_id && String(s.project_id) === String(proj.id)) ||
            (s.project_name && s.project_name.toLowerCase().trim() === (proj.project_title || "").toLowerCase().trim())
          );
          return {
            project_id: proj.id,
            project_name: proj.project_title,
            milestones: existing?.milestones || {}
          };
        });
        setSchedules(merged);
      } else {
        setSchedules(savedSchedules);
      }
    } catch (err) {
      setError(err.message || "Failed to retrieve implementation schedule matrices.");
    } finally {
      setLoading(false);
    }
  }, [activeCycle, apiEndpoint, token]);

  useEffect(() => {
    if (token && activeCycle) {
      fetchSchedulesAndProjects();
    }
  }, [fetchSchedulesAndProjects, token, activeCycle]);

  const handleToggleQuarter = (projectIndex, key) => {
    setError(null);
    setSuccess(null);
    
    const updatedSchedules = [...schedules];
    const project = { ...updatedSchedules[projectIndex] };
    const currentMilestones = { ...(project.milestones || {}) };
    
    currentMilestones[key] = !currentMilestones[key];
    project.milestones = currentMilestones;
    updatedSchedules[projectIndex] = project;
    
    setSchedules(updatedSchedules);
  };

  const handleSaveTimelines = async () => {
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${apiEndpoint}/api/admin/narratives/${encodeURIComponent(activeCycle)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ implementation_schedules: schedules })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to preserve quarterly implementation milestones.");
      }

      setSuccess("Gantt timeline implementation schedule preserved successfully.");
      fetchSchedulesAndProjects();
    } catch (err) {
      setError(err.message || "Failed to save Gantt milestone configurations.");
    } finally {
      setSubmitting(false);
    }
  };

  // KPI Calculations
  const totalProjectsCount = schedules.length;
  const activeMilestonesCount = schedules.reduce((total, row) => {
    return total + Object.values(row.milestones || {}).filter(Boolean).length;
  }, 0);
  const totalQuartersSpan = activeYears.length * 4;

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      
      {/* Title Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 gap-4 shadow-sm">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-500" />
            <span>Interactive Gantt Timeline Editor (Part III.E Implementation Schedule)</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Configure quarterly deployment milestones and schedules across the planning horizon (FY {activeCycle}). Automatically synchronizes with Part III.E ICT projects.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchSchedulesAndProjects}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs font-bold"
            title="Refresh Milestones"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
          <button
            onClick={handleSaveTimelines}
            disabled={submitting || loading || schedules.length === 0}
            className="py-2.5 px-4 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-white flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{submitting ? "Preserving..." : "Save Timelines"}</span>
          </button>
        </div>
      </div>

      {/* Aggregate KPI Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg shrink-0">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Scheduled Projects</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{totalProjectsCount} Initiatives</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Active Quarter Blocks</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{activeMilestonesCount} Milestones</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Planning Horizon</span>
            <h3 className="text-base font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5">{activeYears.length} Years ({totalQuartersSpan} Quarters)</h3>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-red-955/40 border border-rose-200 dark:border-red-900 text-rose-700 dark:text-red-300 font-bold rounded-xl flex items-center gap-2.5 animate-fadeIn shadow-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center gap-2.5 animate-fadeIn shadow-xs">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      {/* Timeline Editor Board Container */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 font-bold text-slate-600 dark:text-slate-400 flex items-center justify-between text-[10px] uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-slate-500" />
            <span>Quarterly Deployment Milestones Matrix (Click blocks to toggle execution quarters)</span>
          </span>
          <span className="text-[10px] px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-blue-600 dark:text-blue-400 font-bold">
            Horizon: FY {activeCycle || "N/A"}
          </span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-20 text-slate-500 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <span>Parsing schedule matrix and registered ICT projects...</span>
            </div>
          ) : schedules.length > 0 ? (
            <table className="w-full text-center border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                  <th className="p-4 text-left border-r border-b border-slate-200 dark:border-slate-800 w-1/4 min-w-[240px] text-xs font-bold uppercase tracking-wider">
                    Project Strategic Module
                  </th>
                  {activeYears.map(year => (
                    <th key={year} colSpan={4} className="border-r border-b border-slate-200 dark:border-slate-800 text-xs py-2.5 font-bold tracking-wider text-slate-800 dark:text-slate-200">
                      FY {year}
                    </th>
                  ))}
                </tr>
                <tr className="bg-slate-50 dark:bg-slate-900/50 font-mono text-[9px] text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <th className="border-r border-slate-200 dark:border-slate-800"></th>
                  {activeYears.map(year => (
                    quarters.map(q => (
                      <th key={`${year}_${q}`} className="border-r border-slate-200 dark:border-slate-800 py-1.5 uppercase font-bold text-center">
                        {q}
                      </th>
                    ))
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-slate-700 dark:text-slate-300">
                {schedules.map((row, projectIdx) => (
                  <tr key={row.project_id || projectIdx} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-colors">
                    {/* Project Title Column */}
                    <td className="text-left font-bold p-4 border-r border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-200 max-w-[240px] break-words">
                      <div className="flex items-center gap-1.5">
                        <ChevronRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>{row.project_name}</span>
                      </div>
                    </td>

                    {/* Timeline Block Toggles */}
                    {activeYears.map(year => (
                      quarters.map(q => {
                        const key = `${year}_${q}`;
                        const active = !!row.milestones?.[key];
                        return (
                          <td key={key} className="border-r border-slate-200 dark:border-slate-850 p-2 relative">
                            <button
                              type="button"
                              onClick={() => handleToggleQuarter(projectIdx, key)}
                              className={`w-full h-8 rounded-md border cursor-pointer transition-all duration-150 flex items-center justify-center font-mono text-[9px] font-bold ${
                                active 
                                  ? "bg-blue-600 text-white border-blue-600 shadow-xs dark:bg-blue-600/30 dark:border-blue-500 dark:text-blue-400 dark:shadow-inner dark:shadow-blue-500/20" 
                                  : "bg-slate-50 dark:bg-slate-955/60 border-slate-200 dark:border-slate-850 text-slate-300 dark:text-slate-700 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-950"
                              }`}
                              title={`${row.project_name} - FY ${year} ${q} (Click to toggle)`}
                            >
                              <span>{active ? "ACTIVE" : "—"}</span>
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
            <div className="text-center py-20 text-slate-400 dark:text-slate-500 italic">
              No project implementation schedules found for active cycle '{activeCycle}'. Register projects in Part III.E to populate this matrix.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}