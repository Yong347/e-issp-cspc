// frontend/src/components/layout/DashboardLayout.jsx
import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCycle } from '../../context/CycleContext';
import { useNotifications } from '../../context/NotificationContext';
import { 
  FileText, ShieldCheck, Database, ClipboardList, 
  FolderKanban, LogOut, FileBarChart, LayoutDashboard, UserCheck, 
  Shield, Landmark, AlertTriangle, History, Key, Settings,
  ChevronDown, ChevronRight, FileSignature, ImageIcon, Map,
  UploadCloud, Snowflake, Inbox, BookOpen, MapPin, HardDrive, 
  Layers, FileCode, Building, Coins, Network, GraduationCap, 
  Target, Calendar, TrendingUp, ShieldAlert, Mail, Users,
  FolderTree // <-- Add this icon import

} from 'lucide-react';

export default function DashboardLayout() {
  const navigate = useNavigate();
  const { user, logoutSession } = useAuth();
  const { activeCycle } = useCycle();
  const { actionCount } = useNotifications();
  const [headroom, setHeadroom] = useState(null);

  // Submenu open states
  const [authorshipOpen, setAuthorshipOpen] = useState(true);
  const [securityOpen, setSecurityOpen] = useState(true);
  const [surveyAuditsOpen, setSurveyAuditsOpen] = useState(true);
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const [workflowOpen, setWorkflowOpen] = useState(true);

  useEffect(() => {
    if (user?.role === "ROLE_DEPT_USER") {
      const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
      const authToken = user.token;

      fetch(`${apiUrl}/api/dept/budget-summary`, {
        headers: { Authorization: `Bearer ${authToken}` }
      })
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch headroom.");
        return res.json();
      })
      .then(data => setHeadroom(data))
      .catch(err => console.error("Error retrieving headroom balances:", err));
    }
  }, [user]);

  const handleLogout = () => {
    if (logoutSession) logoutSession();
    navigate("/login");
  };

  const userRole = user?.role || "ROLE_DEPT_USER";
  const deptName = user?.department_name || "My Department";

  const navLinkClass = ({ isActive }) => 
    `flex items-center space-x-3 w-full px-3 py-2 text-xs font-semibold rounded-md transition-all ${
      isActive 
        ? "bg-blue-600 text-white" 
        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
    }`;

  const subNavLinkClass = ({ isActive }) => 
    `flex items-center space-x-3 w-full pl-8 pr-3 py-1.5 text-[11px] font-medium rounded-md transition-all ${
      isActive 
        ? "text-blue-400 font-bold" 
        : "text-slate-500 hover:text-slate-200"
    }`;

  return (
    <div className="flex h-screen bg-slate-955 overflow-hidden text-slate-100 font-sans">
      {/* Sidebar navigation */}
      <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col justify-between select-none border-r border-slate-800">
        <div className="overflow-y-auto flex-1">
          <div className="p-5 border-b border-slate-800 flex items-center space-x-3 bg-slate-955">
            <Shield className="w-6 h-6 text-blue-500" />
            <div>
              <h1 className="font-bold text-sm tracking-wide text-white">e-ISSP Engine</h1>
              <p className="text-[10px] text-slate-500">CSPC Compliance Suite</p>
            </div>
          </div>
          <nav className="p-4 space-y-1">
            {userRole === 'ROLE_DEPT_USER' && (
              <>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 mb-2">My Workspace</p>
                <NavLink to="/dept/dashboard" className={navLinkClass}>
                  <LayoutDashboard className="w-4 h-4 text-sky-400" />
                  <span>Dashboard & Headroom</span>
                </NavLink>
                <NavLink to="/dept/inventory" className={navLinkClass}>
                  <Database className="w-4 h-4 text-blue-400" />
                  <span>Log Inventory (A-5)</span>
                </NavLink>
                <NavLink to="/dept/needs" className={navLinkClass}>
                  <ClipboardList className="w-4 h-4 text-teal-400" />
                  <span>Needs Assessment (Sec 8)</span>
                </NavLink>
                <NavLink to="/dept/proposals" className={navLinkClass}>
                  <FolderKanban className="w-4 h-4 text-amber-400" />
                  <span>CapEx Proposals (A-6)</span>
                </NavLink>
                <NavLink to="/dept/subscriptions" className={navLinkClass}>
                  <FileText className="w-4 h-4 text-indigo-400" />
                  <span>MOOE Subscriptions (A-2)</span>
                </NavLink>

                {/* Collapsible Evidence & Compliance */}
                <div className="pt-2">
                  <button 
                    onClick={() => setEvidenceOpen(!evidenceOpen)}
                    className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    <span className="uppercase tracking-wider text-[10px]">Evidence & Compliance</span>
                    {evidenceOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                  {evidenceOpen && (
                    <div className="mt-1 space-y-0.5">
                      <NavLink to="/dept/quotations" className={subNavLinkClass}>
                        <UploadCloud className="w-3.5 h-3.5 text-blue-400" />
                        <span>Canvas & Quotation Manager</span>
                      </NavLink>
                      <NavLink to="/dept/glacier" className={subNavLinkClass}>
                        <Snowflake className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Glacier S3 Console</span>
                      </NavLink>
                      <NavLink to="/dept/vault" className={subNavLinkClass}>
                        <FileBarChart className="w-3.5 h-3.5 text-purple-400" />
                        <span>Document Vault</span>
                      </NavLink>
                    </div>
                  )}
                </div>

                {/* Collapsible Workflow & Inbox */}
                <div className="pt-2">
                  <button 
                    onClick={() => setWorkflowOpen(!workflowOpen)}
                    className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    <span className="uppercase tracking-wider text-[10px]">Workflow & Inbox</span>
                    {workflowOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                  {workflowOpen && (
                    <div className="mt-1 space-y-0.5">
                      <NavLink 
                        to="/dept/inbox" 
                        className={({ isActive }) => 
                          `flex items-center justify-between w-full pl-8 pr-3 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                            isActive 
                              ? "text-blue-400 font-bold" 
                              : "text-slate-500 hover:text-slate-200"
                          }`
                        }
                      >
                        <div className="flex items-center space-x-3">
                          <Inbox className="w-3.5 h-3.5 text-red-400" />
                          <span>Remarks & Action Items</span>
                        </div>
                        {actionCount > 0 && (
                          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white animate-pulse">
                            {actionCount}
                          </span>
                        )}
                      </NavLink>
                      <NavLink to="/dept/catalog" className={subNavLinkClass}>
                        <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Standard Price Catalog</span>
                      </NavLink>
                      <NavLink to="/dept/profile" className={subNavLinkClass}>
                        <Key className="w-3.5 h-3.5 text-amber-400" />
                        <span>Account Profile</span>
                      </NavLink>
                    </div>
                  )}
                </div>
              </>
            )}

            {userRole === 'ROLE_MIS_ADMIN' && (
              <>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 mb-2">MIS Governance Console</p>
                <NavLink to="/admin/dashboard" className={navLinkClass}>
                  <LayoutDashboard className="w-4 h-4 text-sky-400" />
                  <span>Dashboard & Metrics</span>
                </NavLink>
                <NavLink to="/admin/queue" className={navLinkClass}>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Master Queue</span>
                </NavLink>
                <NavLink to="/admin/catalog" className={navLinkClass}>
                  <Database className="w-4 h-4 text-amber-400" />
                  <span>Price Catalog Manager</span>
                </NavLink>
                <NavLink to="/admin/budget" className={navLinkClass}>
                  <Landmark className="w-4 h-4 text-purple-400" />
                  <span>Budget Governance</span>
                </NavLink>
                <NavLink to="/admin/analytics" className={navLinkClass}>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Compliance Analytics</span>
                </NavLink>
                <NavLink to="/admin/campuses" className={navLinkClass}>
                  <MapPin className="w-4 h-4 text-sky-400" />
                  <span>Campus Registries</span>
                </NavLink>

                {/* Collapsible ISSP Authorship Suite */}
                <div className="pt-2">
                  <button 
                    onClick={() => setAuthorshipOpen(!authorshipOpen)}
                    className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    <span className="uppercase tracking-wider text-[10px]">ISSP Authorship Suite</span>
                    {authorshipOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                  {authorshipOpen && (
                    <div className="mt-1 space-y-0.5">
                      <NavLink to="/admin/narratives" className={subNavLinkClass}>
                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                        <span>ISSP Narrative Manager</span>
                      </NavLink>
                      <NavLink to="/admin/narratives/transmittal" className={subNavLinkClass}>
                        <Mail className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Coversheet & Transmittal</span>
                      </NavLink>
                      <NavLink to="/admin/narratives/offices" className={subNavLinkClass}>
                        <Building className="w-3.5 h-3.5 text-purple-400" />
                        <span>Core Offices (A-3)</span>
                      </NavLink>
                      <NavLink to="/admin/narratives/degrees" className={subNavLinkClass}>
                        <GraduationCap className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Degree Offerings (A-4)</span>
                      </NavLink>
                      <NavLink to="/admin/narratives/gaa" className={subNavLinkClass}>
                        <Target className="w-3.5 h-3.5 text-amber-400" />
                        <span>GAA Target Indicators</span>
                      </NavLink>
                      <NavLink to="/admin/narratives/concerns" className={subNavLinkClass}>
                        <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                        <span>Strategic Concerns (I.E)</span>
                      </NavLink>
                      <NavLink to="/admin/narratives/cross-projects" className={subNavLinkClass}>
                        <Network className="w-3.5 h-3.5 text-teal-400" />
                        <span>Cross-Agency Projects</span>
                      </NavLink>
                      <NavLink to="/admin/narratives/gantt" className={subNavLinkClass}>
                        <Calendar className="w-3.5 h-3.5 text-amber-500" />
                        <span>Gantt Timeline Editor</span>
                      </NavLink>
                      <NavLink to="/admin/narratives/metrics" className={subNavLinkClass}>
                        <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
                        <span>PMF Metrics Framework</span>
                      </NavLink>
                      <NavLink to="/admin/narratives/costs" className={subNavLinkClass}>
                        <Coins className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Detailed Cost Breakdown</span>
                      </NavLink>
                      <NavLink to="/admin/narratives/staff-positions" className={subNavLinkClass}>
                        <Users className="w-3.5 h-3.5 text-blue-400" />
                        <span>IT Staffing (Part IV.B)</span>
                      </NavLink>
                      {/* Add the missing link here */}
                      <NavLink to="/admin/narratives/structure" className={subNavLinkClass}>
                        <FolderTree className="w-3.5 h-3.5 text-blue-400" />
                        <span>Document Structure Manager</span>
                      </NavLink>
                      <NavLink to="/admin/diagrams" className={subNavLinkClass}>
                        <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                        <span>Diagram & Architecture Vault</span>
                      </NavLink>
                      <NavLink to="/admin/mithi" className={subNavLinkClass}>
                        <Map className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Annex A-1 (MITHI Surveys)</span>
                      </NavLink>
                    </div>
                  )}
                </div>

                {/* Collapsible DICT Survey & Audits */}
                <div className="pt-2">
                  <button 
                    onClick={() => setSurveyAuditsOpen(!surveyAuditsOpen)}
                    className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    <span className="uppercase tracking-wider text-[10px]">DICT Survey & Audits</span>
                    {surveyAuditsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                  {surveyAuditsOpen && (
                    <div className="mt-1 space-y-0.5">
                      <NavLink to="/admin/inventory/server-capacity" className={subNavLinkClass}>
                        <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                        <span>Server HDD Capacities</span>
                      </NavLink>
                      <NavLink to="/admin/inventory/os-census" className={subNavLinkClass}>
                        <Layers className="w-3.5 h-3.5 text-purple-400" />
                        <span>Client OS Census</span>
                      </NavLink>
                      <NavLink to="/admin/inventory/software-census" className={subNavLinkClass}>
                        <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Office Software Census</span>
                      </NavLink>
                      <NavLink to="/admin/glossary" className={subNavLinkClass}>
                        <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Glossary Terms (Pages 6-10)</span>
                      </NavLink>
                      <NavLink to="/admin/instructions" className={subNavLinkClass}>
                        <ClipboardList className="w-3.5 h-3.5 text-teal-400" />
                        <span>General Instructions (Page 11)</span>
                      </NavLink>
                    </div>
                  )}
                </div>

                {/* Collapsible Governance & Security */}
                <div className="pt-2">
                  <button 
                    onClick={() => setSecurityOpen(!securityOpen)}
                    className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    <span className="uppercase tracking-wider text-[10px]">Governance & Security</span>
                    {securityOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                  {securityOpen && (
                    <div className="mt-1 space-y-0.5">
                      <NavLink to="/admin/vault" className={subNavLinkClass}>
                        <Database className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Document Vault & Compiler</span>
                      </NavLink>
                      <NavLink to="/admin/users" className={subNavLinkClass}>
                        <UserCheck className="w-3.5 h-3.5 text-teal-400" />
                        <span>Whitelisting & Onboarding</span>
                      </NavLink>
                      <NavLink to="/admin/audit" className={subNavLinkClass}>
                        <History className="w-3.5 h-3.5 text-slate-400" />
                        <span>COA Immutable Audit Trails</span>
                      </NavLink>
                      <NavLink to="/admin/profile" className={subNavLinkClass}>
                        <Settings className="w-3.5 h-3.5 text-slate-400" />
                        <span>Profile & Security</span>
                      </NavLink>
                    </div>
                  )}
                </div>
              </>
            )}
          </nav>
        </div>

        {/* Sidebar Footer with Headroom Widget */}
        <div className="p-4 border-t border-slate-800 bg-slate-955 flex flex-col space-y-4">
          {userRole === 'ROLE_DEPT_USER' && headroom && (
            <div className="space-y-1.5 p-3 bg-slate-900/50 rounded-lg border border-slate-800/80">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Budget Headroom</span>
              <div className="flex justify-between text-[9px] text-slate-400">
                <span>₱{headroom.total_spent.toLocaleString()} spent</span>
                <span>of ₱{headroom.sub_ceiling.toLocaleString()}</span>
              </div>
              <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800/50">
                <div 
                  className="h-full bg-blue-500 rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min((headroom.total_spent / (headroom.sub_ceiling || 1)) * 100, 100)}%` }} 
                />
              </div>
            </div>
          )}
          
          <div className="flex items-center justify-between text-xs px-2">
            <span className="text-slate-400 font-medium truncate max-w-[130px]">{deptName}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-blue-400 border border-slate-700 uppercase font-bold">
              {userRole === 'ROLE_MIS_ADMIN' ? 'Admin' : 'Dept'}
            </span>
          </div>
          <button 
            onClick={handleLogout} 
            className="flex items-center justify-center space-x-2 w-full py-2 bg-red-955/45 border border-red-900/50 text-red-300 text-xs font-bold rounded-md hover:bg-red-900/60 hover:text-white transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-955">
        <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-8 flex-shrink-0">
          <div className="flex items-center space-x-4">
            <span className="text-xs text-slate-500 font-semibold">Active Planning Framework:</span>
            <span className="text-xs bg-blue-950 text-blue-300 border border-blue-800/60 px-2.5 py-1 rounded-full font-bold">
              FY {activeCycle} Cycle
            </span>
          </div>
        </header>
        
        <div className="flex-1 p-8 overflow-y-auto bg-slate-955">
          <Outlet />
        </div>
      </main>
    </div>
  );
}