// frontend/src/context/NotificationContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user, token } = useAuth();
  
  // Badge Counters
  const [actionCount, setActionCount] = useState(0);
  const [returnedCount, setReturnedCount] = useState(0);
  const [pendingProposalsCount, setPendingProposalsCount] = useState(0);
  const [pendingSystemsCount, setPendingSystemsCount] = useState(0);

  // Notification Feeds
  const [recentNotifications, setRecentNotifications] = useState([]);
  const [recentRemarks, setRecentRemarks] = useState([]);
  const [readNotificationIds, setReadNotificationIds] = useState(() => {
    try {
      const saved = sessionStorage.getItem('read_notif_ids');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Transient Toast State
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Resolve API Base URL without trailing slash
  const rawUrl = 
    import.meta.env?.VITE_API_URL || 
    import.meta.env?.VITE_API_BASE_URL || 
    "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;

  // Resolve Active Authentication Token & Role strictly from active authenticated session
  const authToken = user?.token || token || null;
  const userRole = user?.role 
    ? String(user.role).toUpperCase() 
    : (user?.role_tag ? String(user.role_tag).toUpperCase() : null);
  const departmentId = user?.department_id ?? null;

  // Reset counters and feeds when user logs out
  useEffect(() => {
    if (!user) {
      setActionCount(0);
      setReturnedCount(0);
      setPendingProposalsCount(0);
      setPendingSystemsCount(0);
      setRecentNotifications([]);
      setRecentRemarks([]);
    }
  }, [user]);

  // -------------------------------------------------------------
  // TOAST MANAGEMENT HELPERS
  // -------------------------------------------------------------
  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(({ message, type = 'info', duration = 4000, title = null }) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type, duration, title }]);
    
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    return id;
  }, [removeToast]);

  const showToast = useCallback((msg, type = 'info', title = null) => {
    if (typeof msg === 'object' && msg !== null) {
      return addToast(msg);
    }
    return addToast({ message: String(msg || ''), type, title });
  }, [addToast]);

  const toast = useMemo(() => ({
    success: (msg, title) => showToast(msg, 'success', title),
    error: (msg, title) => showToast(msg, 'error', title),
    info: (msg, title) => showToast(msg, 'info', title),
    warning: (msg, title) => showToast(msg, 'warning', title),
  }), [showToast]);

  // -------------------------------------------------------------
  // NOTIFICATION READ / DISMISS HANDLERS
  // -------------------------------------------------------------
  const markAsRead = useCallback((id) => {
    setReadNotificationIds((prev) => {
      const next = new Set(prev);
      next.add(String(id));
      try {
        sessionStorage.setItem('read_notif_ids', JSON.stringify([...next]));
      } catch {
        // Ignore storage errors in restricted contexts
      }
      return next;
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    const allIds = [
      ...recentNotifications.map(n => String(n.id)),
      ...recentRemarks.map(r => String(r.id))
    ];
    setReadNotificationIds((prev) => {
      const next = new Set([...prev, ...allIds]);
      try {
        sessionStorage.setItem('read_notif_ids', JSON.stringify([...next]));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, [recentNotifications, recentRemarks]);

  const dismissNotification = useCallback((id) => {
    setRecentNotifications((prev) => prev.filter((n) => String(n.id) !== String(id)));
    setRecentRemarks((prev) => prev.filter((r) => String(r.id) !== String(id)));
    markAsRead(id);
  }, [markAsRead]);

  const clearNotifications = useCallback(() => {
    setRecentNotifications([]);
    setRecentRemarks([]);
  }, []);

  // -------------------------------------------------------------
  // FETCH NOTIFICATIONS PIPELINE
  // -------------------------------------------------------------
  const fetchNotifications = useCallback(async () => {
    // Abort if unauthenticated, role is not yet determined, or user object is null
    if (!authToken || !userRole || !user) return;
    
    setLoading(true);
    const headers = { 
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json"
    };

    try {
      if (userRole === 'ROLE_DEPT_USER') {
        // Guard against calling department endpoints if department_id is not assigned yet
        if (!departmentId) {
          setLoading(false);
          return;
        }

        // 1. Department Action Items Summary
        try {
          const summaryRes = await fetch(`${apiUrl}/api/dept/action-items/summary`, { credentials: 'include', headers });
          if (summaryRes.ok) {
            const sData = await summaryRes.json();
            setActionCount(Number(sData.unread_actions || sData.pending_actions || 0));
            setReturnedCount(Number(sData.returned_proposals || 0));
          }
        } catch (err) {
          console.debug("Department summary fetch skipped:", err);
        }

        // 2. Department Activity & Remarks Feed
        try {
          const notifRes = await fetch(`${apiUrl}/api/dept/notifications?days=14`, { credentials: 'include', headers });
          if (notifRes.ok) {
            const nData = await notifRes.json();
            const items = Array.isArray(nData) ? nData : [];
            setRecentNotifications(items.filter(i => i.type !== 'comment'));
            setRecentRemarks(items.filter(i => i.type === 'comment'));
          }
        } catch (err) {
          console.debug("Department activity fetch skipped:", err);
        }

      } else if (userRole === 'ROLE_MIS_ADMIN') {
        // 1. Real-time COA Audit Trail Events
        try {
          const auditRes = await fetch(`${apiUrl}/api/admin/audit-logs?limit=15`, { credentials: 'include', headers });
          if (auditRes.ok) {
            const aData = await auditRes.json();
            const logs = Array.isArray(aData) ? aData : [];
            
            setRecentNotifications(logs.map(l => {
              const actionText = String(l.action || 'AUDIT_LOG').replace(/_/g, ' ');
              let detailText = 'System Audit Trail Event';

              if (l.new_value && typeof l.new_value === 'object') {
                const parts = [];
                if (l.new_value.item_name) parts.push(l.new_value.item_name);
                if (l.new_value.system_name) parts.push(l.new_value.system_name);
                if (l.new_value.reason) parts.push(l.new_value.reason);
                if (parts.length > 0) {
                  detailText = parts.join(' — ');
                } else {
                  detailText = Object.entries(l.new_value)
                    .slice(0, 2)
                    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                    .join(' | ');
                }
              }

              // Context-Aware Target Route
              let targetPath = '/admin/audit';
              const actionUpper = String(l.action || '').toUpperCase();
              const moduleUpper = String(l.module || '').toUpperCase();

              if (l.proposal_id || moduleUpper === 'PROPOSALS') {
                targetPath = '/admin/queue';
              } else if (actionUpper.includes('SYSTEM') || moduleUpper === 'SYSTEMS') {
                targetPath = '/admin/systems';
              } else if (actionUpper.includes('PROJECT') || moduleUpper === 'PROJECTS') {
                targetPath = '/admin/projects';
              } else if (actionUpper.includes('CEILING') || moduleUpper === 'BUDGET') {
                targetPath = '/admin/budget';
              } else if (actionUpper.includes('USER') || moduleUpper === 'AUTH') {
                targetPath = '/admin/users';
              }

              return {
                id: String(l.id),
                title: actionText,
                description: detailText,
                type: moduleUpper === 'AUTHENTICATION' ? 'security' : moduleUpper === 'PROPOSALS' ? 'status_change' : 'governance',
                timestamp: l.timestamp,
                ref_id: l.proposal_id || '',
                url_path: targetPath,
                is_read: readNotificationIds.has(String(l.id))
              };
            }));
          }
        } catch (err) {
          console.debug("Admin audit log sync skipped:", err);
        }

        // 2. Pending Proposals Count (Part IV.A Queue)
        let pendingProps = 0;
        try {
          const propRes = await fetch(`${apiUrl}/api/admin/proposals?status_filter=Submitted&limit=1`, { credentials: 'include', headers });
          if (propRes.ok) {
            const pData = await propRes.json();
            pendingProps = pData.total !== undefined ? Number(pData.total) : (Array.isArray(pData?.data) ? pData.data.length : (Array.isArray(pData) ? pData.length : 0));
            setPendingProposalsCount(pendingProps);
          }
        } catch (err) {
          console.debug("Pending proposals count skipped:", err);
        }

        // 3. Pending Information Systems Intake (Part II.C / III.D)
        let pendingSys = 0;
        try {
          const sysRes = await fetch(`${apiUrl}/api/admin/information-systems?submission_status=Submitted`, { credentials: 'include', headers });
          if (sysRes.ok) {
            const sData = await sysRes.json();
            pendingSys = Array.isArray(sData) ? sData.length : 0;
            setPendingSystemsCount(pendingSys);
          }
        } catch (err) {
          console.debug("Pending systems count skipped:", err);
        }

        // Consolidated Master Admin Action Badge
        setActionCount(pendingProps + pendingSys);

      } else if (userRole === 'ROLE_SUPPLY_USER') {
        // Supply User Flow: Monitor approved items requiring canvas verification
        try {
          const canvasRes = await fetch(`${apiUrl}/api/admin/proposals/approved-canvas`, { credentials: 'include', headers });
          if (canvasRes.ok) {
            const cData = await canvasRes.json();
            const items = Array.isArray(cData) ? cData : [];
            setActionCount(items.length);
          } else {
            setActionCount(0);
          }
        } catch (err) {
          console.debug("Supply verification sync skipped:", err);
        }
      }
    } catch (error) {
      console.warn("Notification sync pipeline warning:", error);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, authToken, userRole, user, departmentId, readNotificationIds]);

  // Periodic Polling (Every 30 Seconds)
  useEffect(() => {
    if (authToken && userRole) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchNotifications, authToken, userRole]);

  // Calculate Unread Notifications
  const unreadCount = useMemo(() => {
    return recentNotifications.filter(n => !readNotificationIds.has(String(n.id))).length;
  }, [recentNotifications, readNotificationIds]);

  return (
    <NotificationContext.Provider
      value={{
        actionCount,
        returnedCount,
        pendingProposalsCount,
        pendingSystemsCount,
        recentNotifications,
        recentRemarks,
        unreadCount,
        readNotificationIds,
        loading,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        dismissNotification,
        clearNotifications,
        toasts,
        showToast,
        toast,
        addToast,
        removeToast
      }}
    >
      {children}

      {/* Floating System Toast Container */}
      {toasts.length > 0 && (
        <aside 
          aria-label="System Notifications"
          className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none transition-all"
        >
          {toasts.map((t) => {
            const isSuccess = t.type === 'success';
            const isError = t.type === 'error';
            const isWarning = t.type === 'warning';

            return (
              <div
                key={t.id}
                role="status"
                aria-live="polite"
                className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl shadow-lg border backdrop-blur-md text-xs transition-all duration-300 animate-slideUp ${
                  isSuccess
                    ? 'bg-emerald-50/95 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
                    : isError
                    ? 'bg-rose-50/95 dark:bg-rose-950/90 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-100'
                    : isWarning
                    ? 'bg-amber-50/95 dark:bg-amber-950/90 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100'
                    : 'bg-blue-50/95 dark:bg-blue-950/90 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  {isSuccess && (
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {isError && (
                    <svg className="w-4 h-4 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  {isWarning && (
                    <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                  {!isSuccess && !isError && !isWarning && (
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>

                <div className="flex-1 space-y-0.5">
                  {t.title && <div className="font-bold tracking-tight">{t.title}</div>}
                  <div className="leading-relaxed opacity-90">{t.message}</div>
                </div>

                <button
                  type="button"
                  onClick={() => removeToast(t.id)}
                  className="shrink-0 p-1 opacity-60 hover:opacity-100 transition-opacity rounded-lg cursor-pointer"
                  aria-label="Close notification"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </aside>
      )}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    return { 
      actionCount: 0, 
      returnedCount: 0, 
      pendingProposalsCount: 0,
      pendingSystemsCount: 0,
      recentNotifications: [], 
      recentRemarks: [], 
      unreadCount: 0,
      readNotificationIds: new Set(),
      loading: false, 
      fetchNotifications: async () => {},
      markAsRead: () => {},
      markAllAsRead: () => {},
      dismissNotification: () => {},
      clearNotifications: () => {},
      toasts: [],
      showToast: () => {},
      toast: {
        success: () => {},
        error: () => {},
        info: () => {},
        warning: () => {},
      },
      addToast: () => {},
      removeToast: () => {},
    };
  }
  return context;
};