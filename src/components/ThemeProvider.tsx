"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "auto";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "auto",
  resolvedTheme: "dark",
  setTheme: () => {},
});

function getTimeBasedTheme(): "light" | "dark" {
  const hour = new Date().getHours();
  // Dark mode from 7 PM (19:00) to 6 AM (06:00)
  return hour >= 19 || hour < 6 ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("auto");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");
  const [mounted, setMounted] = useState(false);

  // Initialize theme from localStorage or default to auto
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("scamdunk-theme") as Theme | null;
    if (stored && ["light", "dark", "auto"].includes(stored)) {
      setThemeState(stored);
    }
    // Apply initial theme based on time
    const initial = stored === "light" || stored === "dark" ? stored : getTimeBasedTheme();
    setResolvedTheme(initial);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(initial);
  }, []);

  // Update resolved theme based on theme setting
  useEffect(() => {
    if (!mounted) return;

    let resolved: "light" | "dark";

    if (theme === "auto") {
      resolved = getTimeBasedTheme();
    } else {
      resolved = theme;
    }

    setResolvedTheme(resolved);

    // Apply theme to document
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
  }, [theme, mounted]);

  // Check time periodically when in auto mode
  useEffect(() => {
    if (theme !== "auto" || !mounted) return;

    const checkTime = () => {
      const newResolved = getTimeBasedTheme();
      if (newResolved !== resolvedTheme) {
        setResolvedTheme(newResolved);
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(newResolved);
      }
    };

    // Check every minute
    const interval = setInterval(checkTime, 60000);
    return () => clearInterval(interval);
  }, [theme, resolvedTheme, mounted]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("scamdunk-theme", newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
