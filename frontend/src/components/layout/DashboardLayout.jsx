// frontend/src/components/layout/DashboardLayout.jsx
import React, { useState, useEffect, useRef } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCycle } from "../../context/CycleContext";
import { useNotifications } from "../../context/NotificationContext";
import { useTheme } from "../../context/ThemeContext";
import { 
  Search, Bell, Mail, CheckCircle2, Sun, Moon, 
  LayoutDashboard, FolderKanban, Database, 
  Landmark, Coins, TrendingUp, Users, 
  ImageIcon, History, LogOut,
  ChevronDown, ChevronRight, Key, FileText,
  ClipboardList, UploadCloud, Inbox, BookOpen,
  GraduationCap, ShieldCheck, MapPin, Network,
  ShieldAlert, CheckSquare, Activity,
  FileBarChart, MessageSquare, ArrowRight, X
} from "lucide-react";

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logoutSession } = useAuth();
  const { activeCycle, agencyLogoUrl, agencyName: cycleAgencyName } = useCycle();
  const { actionCount, returnedCount, recentNotifications, recentRemarks } = useNotifications();
  const { theme, toggleTheme } = useTheme();

  const [globalSearch, setGlobalSearch] = useState("");
  const [headroom, setHeadroom] = useState(null);
  const searchInputRef = useRef(null);

  const [activePopover, setActivePopover] = useState(null);
  const popoverRef = useRef(null);

  const [openSections, setOpenSections] = useState({
    dashboards: true,
    strategy: true,
    finance: true,
    governance: true
  });

  const toggleSection = (sectionKey) => {
    setOpenSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setActivePopover(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const defaultAgencyName = import.meta.env.VITE_DEFAULT_AGENCY_NAME || "National Government Agency";
  const agencyName = import.meta.env.VITE_AGENCY_NAME || cycleAgencyName || user?.agency_name || defaultAgencyName;
  const userEmail = user?.email || "admin@agency.gov.ph";
  const userRole = user?.role || "ROLE_DEPT_USER";

  const deptName = user?.department_name || (
    userRole === "ROLE_MIS_ADMIN" 
      ? "MIS Governance Directorate" 
      : userRole === "ROLE_SUPPLY_USER" 
      ? "Property & Supply Office" 
      : "Department Planning Office"
  );

  const currentPath = location.pathname.split("/").filter(Boolean);
  const breadcrumbSection = currentPath[0]?.toUpperCase() || "WORKSPACE";
  const breadcrumbPage = currentPath[1] 
    ? currentPath[1].replace(/-/g, " ").toUpperCase() 
    : "DASHBOARD";

  useEffect(() => {
    if (userRole === "ROLE_DEPT_USER") {
      const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
      const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
      const authToken = user?.token || localStorage.getItem("access_token") || "";

      fetch(`${apiUrl}/api/dept/budget-summary`, {
        headers: { Authorization: `Bearer ${authToken}` }
      })
      .then(res => res.ok ? res.json() : null)
      .then(data => data && setHeadroom(data))
      .catch(() => {});
    }
  }, [userRole, user?.token, activeCycle]);

  const handleLogout = () => {
    if (logoutSession) logoutSession();
    navigate("/login");
  };

  const executeGlobalSearch = () => {
    if (!globalSearch.trim()) return;
    const q = encodeURIComponent(globalSearch.trim());
    if (userRole === "ROLE_MIS_ADMIN") {
      navigate(`/admin/queue?search=${q}`);
    } else if (userRole === "ROLE_DEPT_USER") {
      navigate(`/dept/proposals?search=${q}`);
    } else {
      navigate(`/supply/inventory?search=${q}`);
    }
    setGlobalSearch("");
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      executeGlobalSearch();
    }
  };

  const navClass = ({ isActive }) => 
    `group flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-lg transition-all duration-150 select-none ${
      isActive 
        ? "bg-blue-600 text-white shadow-xs font-bold dark:bg-blue-600 dark:text-white" 
        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
    }`;

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-[#0b1329] overflow-hidden text-slate-800 dark:text-slate-100 font-sans antialiased transition-colors duration-200">
      
      {/* SIDEBAR NAVIGATION */}
      <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200/90 dark:border-slate-800 flex flex-col justify-between select-none z-20 shrink-0 shadow-xs print-hide">
        <div className="overflow-y-auto flex-1 p-4 space-y-5 custom-scrollbar">
          
          {/* Institutional Brand Header */}
          <div className="flex items-center gap-3 px-1 py-1">
            <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 p-1 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-xs shrink-0 overflow-hidden">
              {agencyLogoUrl ? (
                <img 
                  src={agencyLogoUrl} 
                  alt={agencyName} 
                  className="w-full h-full object-contain"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div className="w-full h-full rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5" />
                </div>
              )}
            </div>
            <div className="truncate">
              <h1 className="font-bold text-sm text-slate-900 dark:text-white tracking-tight truncate">e-ISSP Compliance</h1>
              <p className="text-[10px] text-slate-400 font-mono uppercase truncate">{agencyName}</p>
            </div>
          </div>

          {/* User Profile Mini-Badge */}
          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 font-mono">
              {userEmail.slice(0, 2).toUpperCase()}
            </div>
            <div className="truncate flex-1">
              <span className="font-bold text-xs text-slate-900 dark:text-white block truncate">
                {userEmail.split("@")[0].replace(".", " ").toUpperCase()}
              </span>
              <span className="text-[10px] text-slate-400 block truncate font-mono">
                {deptName}
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-4">
            {userRole === "ROLE_MIS_ADMIN" && (
              <>
                <div className="space-y-1">
                  <button 
                    onClick={() => toggleSection("dashboards")}
                    className="flex items-center justify-between w-full px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                  >
                    <span>Overview &amp; Reviews</span>
                    {openSections.dashboards ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                  {openSections.dashboards && (
                    <div className="space-y-0.5 pt-0.5">
                      <NavLink to="/admin/dashboard" end className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <LayoutDashboard className="w-4 h-4 opacity-75" />
                          <span>Executive Dashboard</span>
                        </div>
                      </NavLink>
                      <NavLink to="/admin/queue" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <FolderKanban className="w-4 h-4 opacity-75" />
                          <span>Review Queue</span>
                        </div>
                        {actionCount > 0 && (
                          <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded text-[9px] font-bold font-mono">
                            {actionCount}
                          </span>
                        )}
                      </NavLink>
                      <NavLink to="/admin/analytics" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <Activity className="w-4 h-4 opacity-75" />
                          <span>Compliance Analytics</span>
                        </div>
                      </NavLink>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <button 
                    onClick={() => toggleSection("strategy")}
                    className="flex items-center justify-between w-full px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                  >
                    <span>Strategic Framework</span>
                    {openSections.strategy ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                  {openSections.strategy && (
                    <div className="space-y-0.5 pt-0.5">
                      <NavLink to="/admin/outcomes" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <GraduationCap className="w-4 h-4 opacity-75" />
                          <span>Outcomes (I.A.4)</span>
                        </div>
                      </NavLink>
                      <NavLink to="/admin/narratives" end className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <FileText className="w-4 h-4 opacity-75" />
                          <span>Narrative Studio</span>
                        </div>
                      </NavLink>
                      <NavLink to="/admin/narratives/concerns" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <ShieldAlert className="w-4 h-4 opacity-75" />
                          <span>Strategic Concerns (II.A)</span>
                        </div>
                      </NavLink>
                      <NavLink to="/admin/systems" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <Database className="w-4 h-4 opacity-75" />
                          <span>Information Systems</span>
                        </div>
                      </NavLink>
                      <NavLink to="/admin/projects/internal" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <TrendingUp className="w-4 h-4 opacity-75" />
                          <span>ICT Projects Portfolio</span>
                        </div>
                      </NavLink>
                      <NavLink to="/admin/narratives/cross-projects" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <Network className="w-4 h-4 opacity-75" />
                          <span>Cross-Agency Projects</span>
                        </div>
                      </NavLink>
                      <NavLink to="/admin/narratives/metrics" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <CheckSquare className="w-4 h-4 opacity-75" />
                          <span>PMF Scorecard (III.F)</span>
                        </div>
                      </NavLink>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <button 
                    onClick={() => toggleSection("finance")}
                    className="flex items-center justify-between w-full px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                  >
                    <span>Finance &amp; Parity</span>
                    {openSections.finance ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                  {openSections.finance && (
                    <div className="space-y-0.5 pt-0.5">
                      <NavLink to="/admin/budget" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <Landmark className="w-4 h-4 opacity-75" />
                          <span>Budget Sub-Ceilings</span>
                        </div>
                      </NavLink>
                      <NavLink to="/admin/parity-summary" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <Coins className="w-4 h-4 opacity-75" />
                          <span>4-Way Parity Ledger</span>
                        </div>
                      </NavLink>
                      <NavLink to="/admin/narratives/costs" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <Coins className="w-4 h-4 opacity-75" />
                          <span>Resource Costs (IV.A)</span>
                        </div>
                      </NavLink>
                      <NavLink to="/admin/catalog" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <BookOpen className="w-4 h-4 opacity-75" />
                          <span>Price Catalog</span>
                        </div>
                      </NavLink>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <button 
                    onClick={() => toggleSection("governance")}
                    className="flex items-center justify-between w-full px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                  >
                    <span>Vault &amp; Governance</span>
                    {openSections.governance ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                  {openSections.governance && (
                    <div className="space-y-0.5 pt-0.5">
                      <NavLink to="/admin/vault" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <ShieldCheck className="w-4 h-4 opacity-75" />
                          <span>Official PDF Compiler</span>
                        </div>
                      </NavLink>
                      <NavLink to="/admin/diagrams" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <ImageIcon className="w-4 h-4 opacity-75" />
                          <span>Diagram &amp; Seals Vault</span>
                        </div>
                      </NavLink>
                      <NavLink to="/admin/campuses" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <MapPin className="w-4 h-4 opacity-75" />
                          <span>Facility &amp; Sites</span>
                        </div>
                      </NavLink>
                      <NavLink to="/admin/users" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <Users className="w-4 h-4 opacity-75" />
                          <span>User Whitelisting</span>
                        </div>
                      </NavLink>
                      <NavLink to="/admin/audit" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <History className="w-4 h-4 opacity-75" />
                          <span>COA Audit Trail</span>
                        </div>
                      </NavLink>
                      <NavLink to="/admin/profile" className={navClass}>
                        <div className="flex items-center gap-2.5">
                          <Key className="w-4 h-4 opacity-75" />
                          <span>Security Profile</span>
                        </div>
                      </NavLink>
                    </div>
                  )}
                </div>
              </>
            )}

            {userRole === "ROLE_DEPT_USER" && (
              <>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 block mb-1">
                    Department Planner
                  </span>
                  <NavLink to="/dept/dashboard" end className={navClass}>
                    <div className="flex items-center gap-2.5">
                      <LayoutDashboard className="w-4 h-4 opacity-75" />
                      <span>Workspace Overview</span>
                    </div>
                  </NavLink>
                  <NavLink to="/dept/proposals" className={navClass}>
                    <div className="flex items-center gap-2.5">
                      <FolderKanban className="w-4 h-4 opacity-75" />
                      <span>Resource Proposals</span>
                    </div>
                  </NavLink>
                  <NavLink to="/dept/needs" className={navClass}>
                    <div className="flex items-center gap-2.5">
                      <ClipboardList className="w-4 h-4 opacity-75" />
                      <span>Needs Assessment (Sec 8)</span>
                    </div>
                  </NavLink>
                  <NavLink to="/dept/inventory" className={navClass}>
                    <div className="flex items-center gap-2.5">
                      <Database className="w-4 h-4 opacity-75" />
                      <span>Annex 1 Inventory</span>
                    </div>
                  </NavLink>
                  <NavLink to="/dept/inbox" className={navClass}>
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2.5">
                        <Inbox className="w-4 h-4 opacity-75" />
                        <span>Action Inbox</span>
                      </div>
                      {actionCount > 0 && (
                        <span className="px-1.5 py-0.2 bg-rose-600 text-white rounded text-[9px] font-bold font-mono">
                          {actionCount}
                        </span>
                      )}
                    </div>
                  </NavLink>
                </div>

                <div className="space-y-1 pt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 block mb-1">
                    Tools &amp; Quotations
                  </span>
                  <NavLink to="/dept/quotations" className={navClass}>
                    <div className="flex items-center gap-2.5">
                      <UploadCloud className="w-4 h-4 opacity-75" />
                      <span>Canvas Quotations</span>
                    </div>
                  </NavLink>
                  <NavLink to="/dept/catalog" className={navClass}>
                    <div className="flex items-center gap-2.5">
                      <BookOpen className="w-4 h-4 opacity-75" />
                      <span>Reference Catalog</span>
                    </div>
                  </NavLink>
                  <NavLink to="/dept/vault" className={navClass}>
                    <div className="flex items-center gap-2.5">
                      <FileBarChart className="w-4 h-4 opacity-75" />
                      <span>Document Vault</span>
                    </div>
                  </NavLink>
                  <NavLink to="/dept/profile" className={navClass}>
                    <div className="flex items-center gap-2.5">
                      <Key className="w-4 h-4 opacity-75" />
                      <span>Account Profile</span>
                    </div>
                  </NavLink>
                </div>
              </>
            )}

            {userRole === "ROLE_SUPPLY_USER" && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 block mb-1">
                  Property &amp; Supply
                </span>
                <NavLink to="/supply/inventory" end className={navClass}>
                  <div className="flex items-center gap-2.5">
                    <Database className="w-4 h-4 opacity-75" />
                    <span>Master Inventory (Annex 1)</span>
                  </div>
                </NavLink>
                <NavLink to="/supply/profile" className={navClass}>
                  <div className="flex items-center gap-2.5">
                    <Key className="w-4 h-4 opacity-75" />
                    <span>Account Profile</span>
                  </div>
                </NavLink>
              </div>
            )}
          </nav>
        </div>

        <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
          {userRole === "ROLE_DEPT_USER" && headroom && (
            <div className="space-y-1.5 p-2.5 bg-white dark:bg-slate-955 rounded-lg border border-slate-200 dark:border-slate-800 text-[10px]">
              <div className="flex justify-between font-bold">
                <span className="text-slate-500">Sub-Ceiling</span>
                <span className="text-blue-600 dark:text-blue-400 font-mono">
                  ₱{(headroom.total_spent || 0).toLocaleString()} / ₱{(headroom.sub_ceiling || 0).toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(((headroom.total_spent || 0) / (headroom.sub_ceiling || 1)) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* MAIN WORKSPACE */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* Top Navbar with Real Working Global Search */}
        <header className="h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 flex items-center justify-between px-6 z-30 shrink-0 print-hide">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-72 sm:w-96 max-w-md flex items-center">
              <Search className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={globalSearch}
                onChange={e => setGlobalSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search proposals, systems, records (Press Enter)..."
                className="w-full pl-9 pr-16 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 text-xs outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 transition-all font-sans"
              />
              {globalSearch ? (
                <button
                  type="button"
                  onClick={executeGlobalSearch}
                  className="absolute right-1.5 px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold cursor-pointer"
                  title="Search now"
                >
                  Go
                </button>
              ) : (
                <span className="absolute right-2.5 text-[9px] font-mono text-slate-400 bg-white dark:bg-slate-700 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-600 pointer-events-none">
                  ⌘K
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 relative" ref={popoverRef}>
            
            {/* NOTIFICATIONS POPOVER */}
            <div className="relative">
              <button 
                onClick={() => setActivePopover(activePopover === "notif" ? null : "notif")}
                className={`p-2 rounded-lg transition-colors cursor-pointer relative ${
                  activePopover === "notif"
                    ? "bg-blue-50 text-blue-600 dark:bg-slate-800 dark:text-blue-400" 
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
                title="System Notifications & Alerts"
              >
                <Bell className="w-4 h-4" />
                {actionCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 absolute top-1.5 right-1.5 ring-2 ring-white dark:ring-slate-900" />
                )}
              </button>

              {activePopover === "notif" && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl p-3 space-y-2 z-50 animate-fadeIn">
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-blue-500" />
                      <span>Notifications &amp; Activity</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {recentNotifications.length} Events
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1.5 divide-y divide-slate-100 dark:divide-slate-800/50">
                    {recentNotifications.length > 0 ? (
                      recentNotifications.slice(0, 6).map(n => (
                        <div 
                          key={n.id} 
                          onClick={() => { setActivePopover(null); navigate(n.url_path || "/"); }}
                          className="pt-1.5 first:pt-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 p-1.5 rounded transition-colors"
                        >
                          <div className="flex justify-between items-start text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                            <span className="truncate pr-2">{n.title}</span>
                            <span className="text-[9px] text-slate-400 font-mono shrink-0">
                              {n.timestamp ? new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {n.description}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-center py-6 text-slate-400 italic text-[11px]">No unread alerts in this cycle.</p>
                    )}
                  </div>
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 text-center">
                    <button
                      onClick={() => { setActivePopover(null); navigate(userRole === "ROLE_MIS_ADMIN" ? "/admin/audit" : "/dept/inbox"); }}
                      className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      View All Activity Trails &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* MESSAGES / REMARKS POPOVER */}
            <div className="relative">
              <button 
                onClick={() => setActivePopover(activePopover === "messages" ? null : "messages")}
                className={`p-2 rounded-lg transition-colors cursor-pointer relative ${
                  activePopover === "messages"
                    ? "bg-blue-50 text-blue-600 dark:bg-slate-800 dark:text-blue-400" 
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
                title="Action Remarks &amp; Feedback Thread"
              >
                <Mail className="w-4 h-4" />
                {returnedCount > 0 && (
                  <span className="px-1 py-0.2 rounded-full bg-amber-500 text-white text-[8px] font-bold font-mono absolute -top-0.5 -right-0.5">
                    {returnedCount}
                  </span>
                )}
              </button>

              {activePopover === "messages" && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl p-3 space-y-2 z-50 animate-fadeIn">
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                      <span>Revision Remarks &amp; Feedback</span>
                    </span>
                    <span className="text-[10px] text-amber-500 font-mono font-bold">
                      {returnedCount} Returned
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1.5">
                    {recentRemarks.length > 0 ? (
                      recentRemarks.slice(0, 5).map(r => (
                        <div 
                          key={r.id}
                          onClick={() => { setActivePopover(null); navigate(r.url_path || "/dept/inbox"); }}
                          className="p-2 bg-slate-50 dark:bg-slate-955 rounded-lg border border-slate-100 dark:border-slate-800/80 cursor-pointer hover:border-blue-300 transition-colors"
                        >
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-800 dark:text-slate-200">
                            <span className="truncate">{r.target_name || "Proposal Remark"}</span>
                            <span className="text-[9px] text-slate-400 font-mono">{r.operator_email?.split('@')[0]}</span>
                          </div>
                          <p className="text-[10.5px] text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                            {r.description}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-center py-6 text-slate-400 italic text-[11px]">All remarks and action items resolved.</p>
                    )}
                  </div>
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 text-center">
                    <button
                      onClick={() => { setActivePopover(null); navigate(userRole === "ROLE_MIS_ADMIN" ? "/admin/queue" : "/dept/inbox"); }}
                      className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Open Action Inbox &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* QUICK COMPILER LINK */}
            <button 
              onClick={() => navigate(userRole === "ROLE_MIS_ADMIN" ? "/admin/vault" : "/dept/proposals")}
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer" 
              title={userRole === "ROLE_MIS_ADMIN" ? "Quick Compiler & PDF Vault" : "Manage Resource Proposals"}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </button>

            {/* THEME TOGGLE */}
            <button 
              onClick={toggleTheme} 
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer" 
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Sub-Header Context Bar */}
        <div className="h-10 bg-white dark:bg-slate-900 border-b border-slate-200/90 dark:border-slate-800 px-6 flex items-center justify-between text-xs text-slate-500 font-medium shrink-0 print-hide">
          <div className="flex items-center gap-2 truncate">
            <span className="text-slate-900 dark:text-white font-bold truncate max-w-[200px]">{agencyName}</span>
            <span>&rsaquo;</span>
            <span className="text-slate-600 dark:text-slate-400">{breadcrumbSection}</span>
            <span>&rsaquo;</span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold">{breadcrumbPage}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-mono font-bold text-[10px] border border-blue-200 dark:border-blue-900">
              Active Cycle: FY {activeCycle || "2026-2028"}
            </span>
          </div>
        </div>

        {/* Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <Outlet />
        </main>

        {/* Institutional Footer */}
        <footer className="h-9 border-t border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between text-[10.5px] text-slate-500 bg-white dark:bg-slate-900 shrink-0 print-hide">
          <span>{agencyName} &copy; {new Date().getFullYear()}</span>
          <span className="text-[10px] tracking-wide text-slate-400 uppercase font-mono">DICT ISSP v.2026 Standard</span>
        </footer>
      </div>

    </div>
  );
}
