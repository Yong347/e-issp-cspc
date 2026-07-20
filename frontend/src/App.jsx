// frontend/src/App.jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./views/auth/Login";
import DashboardLayout from "./components/layout/DashboardLayout";

// Department User Workspaces
import DeptDashboard from "./views/department/Dashboard/DeptDashboard";
import InventoryManager from "./views/department/Inventory/InventoryManager";
import NeedsAssessment from "./views/department/Needs/NeedsAssessment";
import CapExProposals from "./views/department/Proposals/CapExProposals";
import MooeSubscriptions from "./views/department/Proposals/MooeSubscriptions";
import QuotationManager from "./views/department/Proposals/QuotationManager";
import GlacierConsole from "./views/department/Proposals/GlacierConsole";
import ActionInbox from "./views/department/Proposals/ActionInbox";
import CatalogViewer from "./views/department/Catalog/CatalogViewer";
import ProfileSettings from "./views/department/Profile/ProfileSettings";

// Administrator & Governance Workspaces
import Dashboard from "./views/admin/Dashboard/Dashboard";
import ConsolidatedQueue from "./views/admin/Queue/ConsolidatedQueue";
import CeilingControl from "./views/admin/Budget/CeilingControl";
import ComplianceAnalytics from "./views/admin/Analytics/ComplianceAnalytics";
import NarrativeManager from "./views/admin/Narrative/NarrativeManager";
import DiagramVault from "./views/admin/Narrative/DiagramVault";
import MithiSurveys from "./views/admin/Narrative/MithiSurveys";
import UserWhitelisting from "./views/admin/Users/UserWhitelisting";
import CatalogManager from "./views/admin/Catalog/CatalogManager";
import AuditTrails from "./views/admin/Audit/AuditTrails";
import DocumentVault from "./views/shared/DocumentVault/DocumentVault";

// Newly Integrated Administrative Sub-Workspaces
import CampusManager from "./views/admin/Campus/CampusManager";
import GlossaryManager from "./views/admin/Glossary/GlossaryManager";
import InstructionsManager from "./views/admin/Instructions/InstructionsManager";
import ServerCapacityManager from "./views/admin/Inventory/ServerCapacityManager";
import OsCensusManager from "./views/admin/Inventory/OsCensusManager";
import OfficeSoftwareManager from "./views/admin/Inventory/OfficeSoftwareManager";
import CoreOfficesManager from "./views/admin/Narrative/CoreOfficesManager";
import CostBreakdownManager from "./views/admin/Narrative/CostBreakdownManager";
import CrossProjectsManager from "./views/admin/Narrative/CrossProjectsManager";
import DegreeOfferings from "./views/admin/Narrative/DegreeOfferings";
import GaaTargets from "./views/admin/Narrative/GaaTargets";
import GanttScheduleManager from "./views/admin/Narrative/GanttScheduleManager";
import PerformanceMetricsManager from "./views/admin/Narrative/PerformanceMetricsManager";
import StrategicConcernsManager from "./views/admin/Narrative/StrategicConcernsManager";
import TransmittalLetterPreview from "./views/admin/Narrative/TransmittalLetterPreview";
import StaffPositionsManager from "./views/admin/Narrative/StaffPositionsManager";

import { useAuth } from "./context/AuthContext";

// --- ROLE-BASED ROUTE GUARD ---
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-955 text-slate-100 font-mono text-[10px]">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Verifying secure session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

// --- AUTOMATED ROOT PATH REDIRECTION ---
const RootRedirect = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-955 text-slate-100 font-mono text-[10px]">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Resolving user path...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === "ROLE_MIS_ADMIN") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <Navigate to="/dept/dashboard" replace />;
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RootRedirect />} />

        {/* Department User Workspace Paths */}
        <Route
          path="/dept"
          element={
            <ProtectedRoute allowedRoles={["ROLE_DEPT_USER"]}>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DeptDashboard />} />
          <Route path="inventory" element={<InventoryManager />} />
          <Route path="needs" element={<NeedsAssessment />} />
          <Route path="proposals" element={<CapExProposals />} />
          <Route path="subscriptions" element={<MooeSubscriptions />} />
          <Route path="quotations" element={<QuotationManager />} />
          <Route path="glacier" element={<GlacierConsole />} />
          <Route path="vault" element={<DocumentVault />} />
          <Route path="inbox" element={<ActionInbox />} />
          <Route path="catalog" element={<CatalogViewer />} />
          <Route path="profile" element={<ProfileSettings />} />
        </Route>

        {/* Administrator & Governance Paths */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["ROLE_MIS_ADMIN"]}>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="queue" element={<ConsolidatedQueue />} />
          <Route path="budget" element={<CeilingControl />} />
          <Route path="analytics" element={<ComplianceAnalytics />} />
          
          <Route path="narratives" element={<NarrativeManager />} />
          <Route path="diagrams" element={<DiagramVault />} />
          <Route path="mithi" element={<MithiSurveys />} />
          <Route path="users" element={<UserWhitelisting />} />
          <Route path="catalog" element={<CatalogManager />} />
          <Route path="audit" element={<AuditTrails />} />
          <Route path="vault" element={<DocumentVault />} />

          {/* Newly Mapped Administrative Sub-Routes */}
          <Route path="campuses" element={<CampusManager />} />
          <Route path="glossary" element={<GlossaryManager />} />
          <Route path="instructions" element={<InstructionsManager />} />
          <Route path="inventory/server-capacity" element={<ServerCapacityManager />} />
          <Route path="inventory/os-census" element={<OsCensusManager />} />
          <Route path="inventory/software-census" element={<OfficeSoftwareManager />} />
          <Route path="narratives/offices" element={<CoreOfficesManager />} />
          <Route path="narratives/costs" element={<CostBreakdownManager />} />
          <Route path="narratives/cross-projects" element={<CrossProjectsManager />} />
          <Route path="narratives/degrees" element={<DegreeOfferings />} />
          <Route path="narratives/gaa" element={<GaaTargets />} />
          <Route path="narratives/gantt" element={<GanttScheduleManager />} />
          <Route path="narratives/metrics" element={<PerformanceMetricsManager />} />
          <Route path="narratives/concerns" element={<StrategicConcernsManager />} />
          <Route path="narratives/transmittal" element={<TransmittalLetterPreview />} />
          <Route path="narratives/staff-positions" element={<StaffPositionsManager />} />
          
          {/* Administrator profile routing configuration */}
          <Route path="profile" element={<ProfileSettings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}