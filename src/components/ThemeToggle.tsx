"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "./ThemeProvider";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [showMenu, setShowMenu] = useState(false);

  const options = [
    { value: "light" as const, icon: Sun, label: "Light" },
    { value: "dark" as const, icon: Moon, label: "Dark" },
    { value: "auto" as const, icon: Monitor, label: "Auto" },
  ];

  const currentOption = options.find((o) => o.value === theme) || options[2];
  const Icon = currentOption.icon;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setShowMenu(!showMenu)}
        className="h-9 w-9 rounded-xl"
        title={`Theme: ${currentOption.label}`}
      >
        <Icon className="h-4 w-4" />
      </Button>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 top-full mt-2 p-1 rounded-xl bg-card border border-border shadow-lg z-50 animate-fade-in min-w-[120px]">
            {options.map((option) => {
              const OptionIcon = option.icon;
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    setTheme(option.value);
                    setShowMenu(false);
                  }}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-smooth",
                    theme === option.value
                      ? "bg-secondary"
                      : "hover:bg-secondary"
                  )}
                >
                  <OptionIcon className="h-4 w-4" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
