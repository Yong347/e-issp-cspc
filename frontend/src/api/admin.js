// frontend/src/api/admin.js

const rawRoot = import.meta.env?.VITE_API_URL || "http://localhost:8000";
const API_ROOT = rawRoot.endsWith("/") ? rawRoot.slice(0, -1) : rawRoot;
const BASE_URL = `${API_ROOT}/api/admin`;

// ==========================================
// Existing Endpoints (Preserved)
// ==========================================

export const getBudgetCeilings = async (token) => {
  const res = await fetch(`${BASE_URL}/budget-ceilings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load budget ceilings");
  return res.json();
};

export const updateBudgetCeiling = async (token, payload) => {
  const res = await fetch(`${BASE_URL}/budget-ceilings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to update ceiling allocation");
  }
  return res.json();
};

export const getDepartmentAnalytics = async (token) => {
  const res = await fetch(`${BASE_URL}/department-analytics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load department audit metrics");
  return res.json();
};

export const triggerIsspGeneration = async (token, period) => {
  const res = await fetch(`${BASE_URL}/governance/generate-issp?issp_period=${period}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error("Failed to trigger ISSP compilation");
  return res.json();
};

// ==========================================
// Gap 1: Multi-Campus Configurations
// ==========================================

export const getCampuses = async (token) => {
  const res = await fetch(`${BASE_URL}/campuses`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load campus registries.");
  return res.json();
};

export const createCampus = async (token, payload) => {
  const res = await fetch(`${BASE_URL}/campuses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to register campus.");
  }
  return res.json();
};

export const updateCampus = async (token, campusId, payload) => {
  const res = await fetch(`${BASE_URL}/campuses/${campusId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to update campus configuration.");
  }
  return res.json();
};

export const deleteCampus = async (token, campusId) => {
  const res = await fetch(`${BASE_URL}/campuses/${campusId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to purge campus record.");
  return res.json();
};

// ==========================================
// Gap 2: Accreditation Levels (Annex A-4)
// ==========================================

export const getDegrees = async (token) => {
  const res = await fetch(`${BASE_URL}/degrees`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load academic program offerings.");
  return res.json();
};

export const createDegree = async (token, payload) => {
  const res = await fetch(`${BASE_URL}/degrees`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to document academic program.");
  }
  return res.json();
};

export const updateDegree = async (token, degreeId, payload) => {
  const res = await fetch(`${BASE_URL}/degrees/${degreeId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to update academic program metrics.");
  }
  return res.json();
};

export const deleteDegree = async (token, degreeId) => {
  const res = await fetch(`${BASE_URL}/degrees/${degreeId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to purge academic program record.");
  return res.json();
};

// ==========================================
// Gap 3: GAA Target Milestones (Annex A-4)
// ==========================================

export const getGaaTargets = async (token) => {
  const res = await fetch(`${BASE_URL}/gaa-targets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to retrieve GAA target indicators.");
  return res.json();
};

export const createGaaTarget = async (token, payload) => {
  const res = await fetch(`${BASE_URL}/gaa-targets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to register GAA performance target.");
  }
  return res.json();
};

export const updateGaaTarget = async (token, targetId, payload) => {
  const res = await fetch(`${BASE_URL}/gaa-targets/${targetId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to modify GAA performance metric.");
  }
  return res.json();
};

export const deleteGaaTarget = async (token, targetId) => {
  const res = await fetch(`${BASE_URL}/gaa-targets/${targetId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to remove GAA target indicator.");
  return res.json();
};

// ==========================================
// Gap 4: Strategic Concerns Matrix (Table I.E)
// ==========================================

export const getStrategicConcerns = async (token, isspPeriod) => {
  const res = await fetch(`${BASE_URL}/narratives/${isspPeriod}/concerns`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to read strategic concerns matrix.");
  return res.json();
};

export const createStrategicConcern = async (token, isspPeriod, payload) => {
  const res = await fetch(`${BASE_URL}/narratives/${isspPeriod}/concerns`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to register strategic concern.");
  }
  return res.json();
};

export const updateStrategicConcern = async (token, concernId, payload) => {
  const res = await fetch(`${BASE_URL}/concerns/${concernId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to modify strategic concern entry.");
  }
  return res.json();
};

export const deleteStrategicConcern = async (token, concernId) => {
  const res = await fetch(`${BASE_URL}/concerns/${concernId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to remove strategic concern.");
  return res.json();
};

// ==========================================
// Gap 19: Core Offices Directory (Annex A-3)
// ==========================================

export const getOfficeFunctions = async (token, isspPeriod) => {
  const res = await fetch(`${BASE_URL}/narratives/${isspPeriod}/offices`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load core offices list.");
  return res.json();
};

export const createOfficeFunction = async (token, isspPeriod, payload) => {
  const res = await fetch(`${BASE_URL}/narratives/${isspPeriod}/offices`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to document SUC core office details.");
  }
  return res.json();
};

export const updateOfficeFunction = async (token, officeId, payload) => {
  const res = await fetch(`${BASE_URL}/offices/${officeId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to adjust office parameters.");
  }
  return res.json();
};

export const deleteOfficeFunction = async (token, officeId) => {
  const res = await fetch(`${BASE_URL}/offices/${officeId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to clear office documentation registry.");
  return res.json();
};

// ==========================================
// Gap 7: Glossary Terms
// ==========================================

export const getGlossary = async (token) => {
  const res = await fetch(`${BASE_URL}/glossary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to read glossary vocabulary items.");
  return res.json();
};

export const createGlossaryTerm = async (token, payload) => {
  const res = await fetch(`${BASE_URL}/glossary`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to preserve glossary registry key.");
  }
  return res.json();
};

export const updateGlossaryTerm = async (token, termId, payload) => {
  const res = await fetch(`${BASE_URL}/glossary/${termId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to update glossary term.");
  }
  return res.json();
};

export const deleteGlossaryTerm = async (token, termId) => {
  const res = await fetch(`${BASE_URL}/glossary/${termId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to remove term from registry.");
  return res.json();
};

// ==========================================
// Gap 8: General Submission Instructions
// ==========================================

export const getInstructions = async (token) => {
  const res = await fetch(`${BASE_URL}/instructions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load guideline protocols.");
  return res.json();
};

export const createInstruction = async (token, payload) => {
  const res = await fetch(`${BASE_URL}/instructions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to append submission instruction.");
  }
  return res.json();
};

export const updateInstruction = async (token, instId, payload) => {
  const res = await fetch(`${BASE_URL}/instructions/${instId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to adjust instruction guidelines.");
  }
  return res.json();
};

export const deleteInstruction = async (token, instId) => {
  const res = await fetch(`${BASE_URL}/instructions/${instId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to purge instruction registry index.");
  return res.json();
};

// ==========================================
// Gap 15: HDD Server Capacities (Annex A-1)
// ==========================================

export const getServerCapacities = async (token) => {
  const res = await fetch(`${BASE_URL}/server-capacities`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to retrieve server inventory configurations.");
  return res.json();
};

export const createServerCapacity = async (token, payload) => {
  const res = await fetch(`${BASE_URL}/server-capacities`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to log server storage allocation metrics.");
  }
  return res.json();
};

export const deleteServerCapacity = async (token, capacityId) => {
  const res = await fetch(`${BASE_URL}/server-capacities/${capacityId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to remove storage server checklist metrics.");
  return res.json();
};

// ==========================================
// Gap 16: Client OS License Census
// ==========================================

export const getOsCensus = async (token) => {
  const res = await fetch(`${BASE_URL}/os-census`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to read active system platforms census.");
  return res.json();
};

export const createOsCensusRecord = async (token, payload) => {
  const res = await fetch(`${BASE_URL}/os-census`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to record software licenses parameters.");
  }
  return res.json();
};

export const updateOsCensusRecord = async (token, censusId, payload) => {
  const res = await fetch(`${BASE_URL}/os-census/${censusId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to update license allocations.");
  }
  return res.json();
};

export const deleteOsCensusRecord = async (token, censusId) => {
  const res = await fetch(`${BASE_URL}/os-census/${censusId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to purge software platform from census.");
  return res.json();
};

// ==========================================
// Gap 17: Office Software Census
// ==========================================

export const getSoftwareCensus = async (token) => {
  const res = await fetch(`${BASE_URL}/software-census`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to gather office automation suite profiles.");
  return res.json();
};

export const createSoftwareCensus = async (token, payload) => {
  const res = await fetch(`${BASE_URL}/software-census`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to index office automation platform.");
  }
  return res.json();
};

export const deleteSoftwareCensus = async (token, censusId) => {
  const res = await fetch(`${BASE_URL}/software-census/${censusId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to purge license configuration.");
  return res.json();
};

// ==========================================
// Gap 24: Cross-Agency Cooperative Projects
// ==========================================

export const getCrossProjects = async (token, isspPeriod) => {
  const res = await fetch(`${BASE_URL}/narratives/${isspPeriod}/cross-projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load joint cooperative pipeline registries.");
  return res.json();
};

export const createCrossProject = async (token, isspPeriod, payload) => {
  const res = await fetch(`${BASE_URL}/narratives/${isspPeriod}/cross-projects`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to index collaborative project.");
  }
  return res.json();
};

export const deleteCrossProject = async (token, projectId) => {
  const res = await fetch(`${BASE_URL}/cross-projects/${projectId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to purge collaborative project profile.");
  return res.json();
};

// ==========================================
// Gap 25: Performance Measurement Framework (PMF)
// ==========================================

export const getPerformanceMetrics = async (token, isspPeriod) => {
  const res = await fetch(`${BASE_URL}/narratives/${isspPeriod}/metrics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to gather performance measurement framework indices.");
  return res.json();
};

export const createPerformanceMetric = async (token, isspPeriod, payload) => {
  const res = await fetch(`${BASE_URL}/narratives/${isspPeriod}/metrics`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to append performance framework milestone.");
  }
  return res.json();
};

export const deletePerformanceMetric = async (token, metricId) => {
  const res = await fetch(`${BASE_URL}/metrics/${metricId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to clear performance milestone.");
  return res.json();
};

// ==========================================
// Gap 11 & 12: Cost Breakdowns Matrix
// ==========================================

export const getAnnualCosts = async (token, isspPeriod) => {
  const res = await fetch(`${BASE_URL}/narratives/${isspPeriod}/costs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to read annual budget distribution charts.");
  return res.json();
};

export const createAnnualCost = async (token, isspPeriod, payload) => {
  const res = await fetch(`${BASE_URL}/narratives/${isspPeriod}/costs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to log cost breakdown matrix index.");
  }
  return res.json();
};

export const deleteAnnualCost = async (token, costId) => {
  const res = await fetch(`${BASE_URL}/costs/${costId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to remove budget mapping record.");
  return res.json();
};

// ==========================================
// GAP 18: Relational IT Staffing Positions
// ==========================================

export const getStaffPositions = async (token, isspPeriod) => {
  const res = await fetch(`${BASE_URL}/narratives/${isspPeriod}/staff-positions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load SUC IT staff positions.");
  return res.json();
};

export const createStaffPosition = async (token, isspPeriod, payload) => {
  const res = await fetch(`${BASE_URL}/narratives/${isspPeriod}/staff-positions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to record SUC staff position details.");
  }
  return res.json();
};

export const updateStaffPosition = async (token, positionId, payload) => {
  const res = await fetch(`${BASE_URL}/staff-positions/${positionId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to update SUC staff position details.");
  }
  return res.json();
};

export const deleteStaffPosition = async (token, positionId) => {
  const res = await fetch(`${BASE_URL}/staff-positions/${positionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to clear staff position record.");
  return res.json();
};

// ==========================================
// Gaps 5, 6, 20, 21, 22, 26: S3 Multipart Diagrams
// ==========================================

export const uploadSystemDiagram = async (token, isspPeriod, category, file) => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/narratives/${isspPeriod}/upload-diagram?category=${category}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to store target layout graphic.");
  }
  return res.json();
};