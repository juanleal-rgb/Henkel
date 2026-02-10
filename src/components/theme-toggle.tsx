"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  variant?: "button" | "switch";
}

export function ThemeToggle({ variant = "button" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  if (variant === "switch") {
    return (
      <button
        onClick={toggleTheme}
        className={cn(
          "relative inline-flex h-8 w-16 items-center rounded-full transition-colors",
          theme === "dark" ? "bg-bg-elevated" : "bg-slate-200"
        )}
      >
        {/* Sun icon (light mode indicator) */}
        <Sun
          className={cn(
            "absolute left-2 h-4 w-4 transition-opacity",
            theme === "dark" ? "text-fg-muted opacity-40" : "text-fg-primary opacity-100"
          )}
        />
        {/* Moon icon (dark mode indicator) */}
        <Moon
          className={cn(
            "absolute right-2 h-4 w-4 transition-opacity",
            theme === "dark" ? "text-fg-primary opacity-100" : "text-slate-400 opacity-40"
          )}
        />
        {/* Toggle knob */}
        <span
          className={cn(
            "absolute inline-block h-6 w-6 transform rounded-full shadow-sm transition-transform",
            theme === "dark" ? "translate-x-9 bg-fg-muted" : "translate-x-1 bg-white"
          )}
        />
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
        "text-fg-secondary hover:bg-bg-hover hover:text-fg-primary"
      )}
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
