// frontend/src/context/ThemeContext.jsx
import React, { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // Safe initialization with localStorage or dark mode default fallback
  const [theme, setTheme] = useState(() => {
    try {
      const savedTheme = localStorage.getItem("theme");
      if (savedTheme === "light" || savedTheme === "dark") {
        return savedTheme;
      }
      // Standard preference check, default to dark to match the CSPC academic layout
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      return prefersDark ? "dark" : "dark"; 
    } catch (e) {
      return "dark";
    }
  });

  // Automatically apply the target theme class to the document root element
  useEffect(() => {
    try {
      const root = window.document.documentElement;
      if (theme === "dark") {
        root.classList.add("dark");
        root.style.colorScheme = "dark";
      } else {
        root.classList.remove("dark");
        root.style.colorScheme = "light";
      }
      localStorage.setItem("theme", theme);
    } catch (e) {
      console.error("Failed to persist theme state to storage:", e);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be consumed within a ThemeProvider boundary.");
  }
  return context;
}