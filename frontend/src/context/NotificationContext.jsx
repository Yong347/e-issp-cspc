import React, { createContext, useContext, useState } from 'react';
const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([
    { id: 1, text: "Budget ceiling limit updated for CAS.", type: "warning" },
    { id: 2, text: "Proposal for Heavy Duty Printer approved.", type: "success" }
  ]);

  const addNotification = (text, type = "info") => {
    setNotifications(prev => [{ id: Date.now(), text, type }, ...prev]);
  };

  return (
    <NotificationContext.Provider value={{ notifications, addNotification }}>
      {children}
    </NotificationContext.Provider>
  );
}
export const useNotifications = () => useContext(NotificationContext);
