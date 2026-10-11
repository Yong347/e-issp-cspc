// frontend/src/context/CycleContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { API_BASE_URL } from '../api/apiClient';

const CycleContext = createContext(null);

export function CycleProvider({ children }) {
  // Dynamically derive current calendar year to eliminate static year hardcoding
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // Standard statutory 3-year horizon state: [Y1, Y2, Y3] where Y3 = Y1 + 2
  const [activeCycle, setActiveCycleState] = useState(`${currentYear}-${currentYear + 2}`);
  const [planningYears, setPlanningYears] = useState([currentYear, currentYear + 1, currentYear + 2]);
  const [fromYear, setFromYear] = useState(currentYear);
  const [toYear, setToYear] = useState(currentYear + 2);

  const [agencyName, setAgencyName] = useState(
    import.meta.env?.VITE_DEFAULT_AGENCY_NAME || 
    import.meta.env?.VITE_AGENCY_NAME || 
    "National Government Agency"
  );
  const [agencyHeadPosition, setAgencyHeadPosition] = useState(
    import.meta.env?.VITE_DEFAULT_AGENCY_HEAD_TITLE || "Head of Agency"
  );
  const [agencyLogoUrl, setAgencyLogoUrl] = useState(null);
  const [dictLogoUrl, setDictLogoUrl] = useState(null);
  const [bagongPilipinasLogoUrl, setBagongPilipinasLogoUrl] = useState(null);
  const [cycleLoading, setCycleLoading] = useState(true);

  /**
   * Enforces the statutory 3-year planning horizon constraint:
   * End Year is strictly calculated as Start Year + 2.
   * Horizon sequence is always [start, start + 1, start + 2].
   */
  const compute3YearWindow = useCallback((startYearOrPeriod) => {
    let start = currentYear;
    if (typeof startYearOrPeriod === "number") {
      start = startYearOrPeriod;
    } else if (typeof startYearOrPeriod === "string") {
      const parsed = parseInt(startYearOrPeriod.split("-")[0].trim(), 10);
      if (!isNaN(parsed)) start = parsed;
    }

    const end = start + 2;
    return {
      period: `${start}-${end}`,
      years: [start, start + 1, start + 2],
      start,
      end
    };
  }, [currentYear]);

  /**
   * Dynamically sets the active cycle and guarantees strict 3-year horizon alignment.
   */
  const setActiveCycle = useCallback((periodOrStart, customFrom = null) => {
    const startInput = customFrom !== null && customFrom !== undefined ? customFrom : periodOrStart;
    const { period, years, start, end } = compute3YearWindow(startInput);

    setActiveCycleState(period);
    setPlanningYears(years);
    setFromYear(start);
    setToYear(end);
  }, [compute3YearWindow]);

  /**
   * Updates agency branding, seals, and executive leadership titles dynamically.
   */
  const setAgencyBranding = useCallback((branding) => {
    if (!branding) return;
    if (branding.agency_name) setAgencyName(branding.agency_name);
    if (branding.agency_head_position) setAgencyHeadPosition(branding.agency_head_position);
    if (branding.agency_logo_url !== undefined) setAgencyLogoUrl(branding.agency_logo_url || null);
    if (branding.dict_logo_url !== undefined) setDictLogoUrl(branding.dict_logo_url || null);
    if (branding.bagong_pilipinas_logo_url !== undefined) setBagongPilipinasLogoUrl(branding.bagong_pilipinas_logo_url || null);
  }, []);

  /**
   * Fetches active cycle metadata, statutory period bounds, and agency seals from the backend.
   * Auto-computes the 3-year window directly from the server response.
   */
  const fetchActiveCycle = useCallback(async () => {
    setCycleLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/active-cycle`);
      if (res.ok) {
        const data = await res.json();
        if (data.issp_period || data.from_year) {
          const start = parseInt(data.from_year, 10) || 
                        parseInt(String(data.issp_period).split("-")[0], 10) || 
                        currentYear;

          const { period, years, end } = compute3YearWindow(start);
          setActiveCycleState(period);
          setPlanningYears(years);
          setFromYear(start);
          setToYear(end);
        }
        if (data.agency_name) {
          setAgencyName(data.agency_name);
        }
        if (data.agency_head_position) {
          setAgencyHeadPosition(data.agency_head_position);
        }
        setAgencyLogoUrl(data.agency_logo_url || null);
        setDictLogoUrl(data.dict_logo_url || null);
        setBagongPilipinasLogoUrl(data.bagong_pilipinas_logo_url || null);
      }
    } catch (e) {
      console.warn("Could not load active cycle dynamically:", e);
    } finally {
      setCycleLoading(false);
    }
  }, [compute3YearWindow, currentYear]);

  useEffect(() => {
    fetchActiveCycle();
  }, [fetchActiveCycle]);

  const cycleSpan = planningYears.length;

  return (
    <CycleContext.Provider
      value={{
        activeCycle,
        setActiveCycle,
        planningYears,
        setPlanningYears,
        fromYear,
        toYear,
        startYear: fromYear,
        endYear: toYear,
        cycleSpan,
        cycleLoading,
        agencyName,
        setAgencyName,
        agencyHeadPosition,
        setAgencyHeadPosition,
        agencyLogoUrl,
        dictLogoUrl,
        bagongPilipinasLogoUrl,
        setAgencyBranding,
        fetchActiveCycle,
      }}
    >
      {children}
    </CycleContext.Provider>
  );
}

export const useCycle = () => {
  const context = useContext(CycleContext);
  if (!context) {
    throw new Error("useCycle must be consumed within a CycleProvider boundary.");
  }
  return context;
};