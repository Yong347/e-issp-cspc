// frontend/src/App.jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./views/auth/Login";
import DashboardLayout from "./components/layout/DashboardLayout";

// Department User Workspaces
import DeptDashboard from "./views/department/Dashboard/DeptDashboard";
import InventoryManager from "./views/department/Inventory/InventoryManager";
import NeedsAssessment from "./views/department/Needs/NeedsAssessment";
import UnifiedProposals from "./views/department/Proposals/UnifiedProposals";
import QuotationManager from "./views/department/Proposals/QuotationManager";
import GlacierConsole from "./views/department/Proposals/GlacierConsole";
import ActionInbox from "./views/department/Proposals/ActionInbox";
import CatalogViewer from "./views/department/Catalog/CatalogViewer";
import ProfileSettings from "./views/department/Profile/ProfileSettings";

// Supply User Workspace (DICT Annex 1)
import SupplyInventory from "./views/supply/SupplyInventory";

// Administrator & Governance Workspaces
import Dashboard from "./views/admin/Dashboard/Dashboard";
import ConsolidatedQueue from "./views/admin/Queue/ConsolidatedQueue";
import CeilingControl from "./views/admin/Budget/CeilingControl";
import ComplianceAnalytics from "./views/admin/Analytics/ComplianceAnalytics";
import NarrativeManager from "./views/admin/Narrative/NarrativeManager";
import DiagramVault from "./views/admin/Narrative/DiagramVault";
import MithiSurveys from "./views/admin/Narrative/MithiSurveys";
import UserWhitelisting from "./views/admin/Users/UserWhitelisting";
import CatalogManager from "./views/admin/catalog/CatalogManager";
import AuditTrails from "./views/admin/Audit/AuditTrails";
import DocumentVault from "./views/shared/DocumentVault/DocumentVault";

// Specialized DICT v.2026 Core Singularity Workspaces
import OrganizationalOutcomes from "./views/admin/Narrative/OrganizationalOutcomes";
import StrategicConcernsManager from "./views/admin/Narrative/StrategicConcernsManager";
import InformationSystemsManager from "./views/admin/Systems/InformationSystemsManager";
import InternalProjectsManager from "./views/admin/Projects/InternalProjectsManager";
import CrossProjectsManager from "./views/admin/Narrative/CrossProjectsManager";
import PerformanceMetricsManager from "./views/admin/Narrative/PerformanceMetricsManager";
import CostBreakdownManager from "./views/admin/Narrative/CostBreakdownManager";
import InvestmentSummaryViewer from "./views/admin/Budget/InvestmentSummaryViewer";
import GanttScheduleManager from "./views/admin/Narrative/GanttScheduleManager";
import StaffPositionsManager from "./views/admin/Narrative/StaffPositionsManager";
import DocumentStructureManager from "./views/admin/Narrative/DocumentStructureManager";

// Retained Administrative Registries & Surveys
import CampusManager from "./views/admin/Campus/CampusManager";
import GlossaryManager from "./views/admin/Glossary/GlossaryManager";
import InstructionsManager from "./views/admin/Instructions/InstructionsManager";
import ServerCapacityManager from "./views/admin/Inventory/ServerCapacityManager";
import OsCensusManager from "./views/admin/Inventory/OsCensusManager";
import OfficeSoftwareManager from "./views/admin/Inventory/OfficeSoftwareManager";

import { useAuth } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";

// --- ROLE-BASED ROUTE GUARD ---
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-955 text-slate-700 dark:text-slate-200 font-mono text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span>Verifying institutional session credentials...</span>
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-955 text-slate-700 dark:text-slate-200 font-mono text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span>Resolving user navigation path...</span>
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

  if (user.role === "ROLE_SUPPLY_USER") {
    return <Navigate to="/supply/inventory" replace />;
  }

  return <Navigate to="/dept/dashboard" replace />;
};

export default function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <NotificationProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RootRedirect />} />

          {/* Department User Workspace Routes */}
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
            <Route path="proposals" element={<UnifiedProposals />} />
            <Route path="inventory" element={<InventoryManager />} />
            <Route path="needs" element={<NeedsAssessment />} />
            <Route path="quotations" element={<QuotationManager />} />
            <Route path="glacier" element={<GlacierConsole />} />
            <Route path="vault" element={<DocumentVault />} />
            <Route path="inbox" element={<ActionInbox />} />
            <Route path="catalog" element={<CatalogViewer />} />
            <Route path="profile" element={<ProfileSettings />} />
          </Route>

          {/* Supply User Workspace Routes (Annex 1 Management) */}
          <Route
            path="/supply"
            element={
              <ProtectedRoute allowedRoles={["ROLE_SUPPLY_USER", "ROLE_MIS_ADMIN"]}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="inventory" replace />} />
            <Route path="inventory" element={<SupplyInventory />} />
            <Route path="profile" element={<ProfileSettings />} />
          </Route>

          {/* Administrator & Governance Routes */}
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

            {/* Core Singularity Workspaces */}
            <Route path="outcomes" element={<OrganizationalOutcomes />} />
            <Route path="narratives/concerns" element={<StrategicConcernsManager />} />
            <Route path="systems" element={<InformationSystemsManager />} />
            <Route path="projects/internal" element={<InternalProjectsManager />} />
            <Route path="narratives/cross-projects" element={<CrossProjectsManager />} />
            <Route path="narratives/gantt" element={<GanttScheduleManager />} />
            <Route path="narratives/metrics" element={<PerformanceMetricsManager />} />
            <Route path="narratives/costs" element={<CostBreakdownManager />} />
            <Route path="parity-summary" element={<InvestmentSummaryViewer />} />
            <Route path="narratives/staff-positions" element={<StaffPositionsManager />} />
            <Route path="narratives/structure" element={<DocumentStructureManager />} />

            {/* Mapped Administrative Registries & Surveys */}
            <Route path="campuses" element={<CampusManager />} />
            <Route path="glossary" element={<GlossaryManager />} />
            <Route path="instructions" element={<InstructionsManager />} />
            <Route path="inventory/server-capacity" element={<ServerCapacityManager />} />
            <Route path="inventory/os-census" element={<OsCensusManager />} />
            <Route path="inventory/software-census" element={<OfficeSoftwareManager />} />
            <Route path="profile" element={<ProfileSettings />} />
          </Route>

          {/* Catch-all Wildcard Route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </NotificationProvider>
    </Router>
  );
}