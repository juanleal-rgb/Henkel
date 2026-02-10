"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { useTheme } from "@/components/theme-provider";
import { Settings, X, Phone, Mail, Plus, Trash2, RotateCcw } from "lucide-react";

// Types for demo config
interface SupplierOverride {
  supplierNumber: string;
  name: string;
  phone: string;
  email: string;
}

// Demo Config Modal Component
function DemoConfigModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [overrides, setOverrides] = useState<SupplierOverride[]>([]);

  // Load saved values from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined" && isOpen) {
      const saved = localStorage.getItem("demo_supplier_overrides");
      if (saved) {
        try {
          setOverrides(JSON.parse(saved));
        } catch {
          setOverrides([]);
        }
      }
    }
  }, [isOpen]);

  const handleSave = () => {
    localStorage.setItem("demo_supplier_overrides", JSON.stringify(overrides));
    onClose();
  };

  const handleReset = () => {
    if (confirm("This will clear all supplier overrides. Continue?")) {
      localStorage.removeItem("demo_supplier_overrides");
      setOverrides([]);
    }
  };

  const addOverride = () => {
    setOverrides([...overrides, { supplierNumber: "", name: "", phone: "", email: "" }]);
  };

  const removeOverride = (index: number) => {
    setOverrides(overrides.filter((_, i) => i !== index));
  };

  const updateOverride = (index: number, field: keyof SupplierOverride, value: string) => {
    const updated = [...overrides];
    updated[index] = { ...updated[index], [field]: value };
    setOverrides(updated);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative mx-4 w-full max-w-xl overflow-hidden rounded-xl border border-border-subtle bg-bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.08]">
              <Settings className="h-5 w-5 text-white/80" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-fg-primary">Demo Configuration</h2>
              <p className="text-[12px] text-fg-muted">Configure supplier phone/email overrides</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-interactive-hover"
          >
            <X className="h-4 w-4 text-fg-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-5">
          <p className="text-[13px] text-fg-secondary">
            Add supplier overrides to redirect calls during demos. When a batch is processed, if the
            supplier number matches an override, the override phone/email will be used instead.
          </p>

          {/* Overrides List */}
          <div className="space-y-3">
            {overrides.map((override, index) => (
              <div
                key={index}
                className="space-y-3 rounded-lg border border-border-subtle bg-bg-base p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-fg-muted">
                    Override #{index + 1}
                  </span>
                  <button
                    onClick={() => removeOverride(index)}
                    className="flex h-6 w-6 items-center justify-center rounded text-fg-muted transition-colors hover:bg-interactive-hover hover:text-[var(--color-danger)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Supplier Number */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-fg-muted">
                      Supplier #
                    </label>
                    <input
                      type="text"
                      value={override.supplierNumber}
                      onChange={(e) => updateOverride(index, "supplierNumber", e.target.value)}
                      placeholder="e.g., 81096"
                      className="w-full rounded-lg border border-border-subtle bg-bg-surface px-3 py-2 text-[13px] text-fg-primary placeholder:text-fg-disabled focus:border-white/30 focus:outline-none"
                    />
                  </div>

                  {/* Name */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-fg-muted">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={override.name}
                      onChange={(e) => updateOverride(index, "name", e.target.value)}
                      placeholder="e.g., Avanti Suppliers"
                      className="w-full rounded-lg border border-border-subtle bg-bg-surface px-3 py-2 text-[13px] text-fg-primary placeholder:text-fg-disabled focus:border-white/30 focus:outline-none"
                    />
                  </div>

                  {/* Phone */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-fg-muted">Phone</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-disabled" />
                      <input
                        type="tel"
                        value={override.phone}
                        onChange={(e) => updateOverride(index, "phone", e.target.value)}
                        placeholder="+1 555 123 4567"
                        className="w-full rounded-lg border border-border-subtle bg-bg-surface py-2 pl-9 pr-3 text-[13px] text-fg-primary placeholder:text-fg-disabled focus:border-white/30 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-fg-muted">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-disabled" />
                      <input
                        type="email"
                        value={override.email}
                        onChange={(e) => updateOverride(index, "email", e.target.value)}
                        placeholder="test@happyrobot.ai"
                        className="w-full rounded-lg border border-border-subtle bg-bg-surface py-2 pl-9 pr-3 text-[13px] text-fg-primary placeholder:text-fg-disabled focus:border-white/30 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Add Button */}
            <button
              onClick={addOverride}
              className="hover:border-border-default flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border-subtle px-4 py-3 text-[13px] text-fg-muted transition-all hover:bg-interactive-hover hover:text-fg-primary"
            >
              <Plus className="h-4 w-4" />
              Add Supplier Override
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between border-t border-border-subtle px-6 py-4">
          <button
            onClick={handleReset}
            className="hover:bg-[var(--color-danger)]/10 flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium text-[var(--color-danger)] transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Demo
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-fg-secondary transition-colors hover:bg-interactive-hover"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-lg bg-white px-4 py-2 text-[13px] font-medium text-black transition-colors hover:bg-white/90"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Navigation items for Henkel PO Caller
const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "chart" },
  { href: "/suppliers", label: "Suppliers", icon: "users" },
];

// Simple SVG icons
function Icon({ name, className }: { name: string; className?: string }) {
  const icons: Record<string, JSX.Element> = {
    chart: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 16l4-4 4 4 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    users: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path
          d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    layers: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <polygon points="12 2 2 7 12 12 22 7 12 2" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="2 17 12 22 22 17" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="2 12 12 17 22 12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    file: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path
          d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="10 9 9 9 8 9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    alert: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path
          d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    settings: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
    chevronRight: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <polyline points="9 18 15 12 9 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    chevronLeft: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <polyline points="15 18 9 12 15 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  };

  return icons[name] || null;
}

function StatusIndicator({ status }: { status: "available" | "busy" | "away" }) {
  // Monochrome status via opacity - better contrast
  const statusStyles = {
    available: "bg-white/90",
    busy: "bg-white/55 border border-dashed border-white/40",
    away: "bg-white/65",
  };

  return (
    <span
      className={cn("h-2.5 w-2.5 rounded-full border-2 border-bg-surface", statusStyles[status])}
    />
  );
}

export function NavRail() {
  const pathname = usePathname();
  const { userStatus, sidebarExpanded, toggleSidebar } = useUIStore();
  const { theme } = useTheme();
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  // Determine which logo to use based on theme and expanded state
  const logoSrc = "/henkel/Henkel-Logo.svg.png";

  return (
    <>
      <nav
        className={cn(
          "flex h-screen flex-col border-r border-border-subtle bg-bg-surface transition-all duration-300",
          sidebarExpanded ? "w-56" : "w-nav-rail"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center border-b border-border-subtle px-3">
          <Link href="/dashboard" className="flex items-center">
            <Image
              src={logoSrc}
              alt="Henkel Railways"
              width={sidebarExpanded ? 140 : 32}
              height={32}
              className="object-contain"
              priority
            />
          </Link>
        </div>

        {/* Expand/Collapse toggle */}
        <button
          onClick={toggleSidebar}
          className="mx-2 mt-2 flex h-8 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-bg-hover hover:text-fg-primary"
          title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          <Icon name={sidebarExpanded ? "chevronLeft" : "chevronRight"} className="h-4 w-4" />
        </button>

        {/* Main navigation */}
        <div className="flex flex-1 flex-col gap-1 p-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-md transition-all duration-300",
                  sidebarExpanded ? "h-10 px-3" : "h-10 w-10 justify-center",
                  isActive
                    ? "bg-bg-active text-fg-primary"
                    : "hover-gradient-subtle text-fg-secondary hover:text-fg-primary"
                )}
                title={!sidebarExpanded ? item.label : undefined}
              >
                {/* Active indicator */}
                {isActive && <span className="absolute left-0 h-5 w-0.5 rounded-r bg-white/90" />}
                <Icon name={item.icon} className="relative z-10 h-5 w-5 shrink-0" />

                {/* Label (only when expanded) */}
                {sidebarExpanded && (
                  <span className="truncate text-sm font-medium">{item.label}</span>
                )}

                {/* Tooltip (only when collapsed) */}
                {!sidebarExpanded && (
                  <span className="absolute left-full ml-2 hidden rounded bg-bg-elevated px-2 py-1 text-caption text-fg-primary shadow-lg group-hover:block">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Bottom navigation */}
        <div className="flex flex-col gap-1 border-t border-border-subtle p-2">
          {/* Settings button - opens Demo Config Modal */}
          <button
            onClick={() => setIsConfigModalOpen(true)}
            className={cn(
              "group relative flex items-center gap-3 rounded-md transition-all duration-300",
              sidebarExpanded ? "h-10 px-3" : "h-10 w-10 justify-center",
              "hover-gradient-subtle text-fg-secondary hover:text-fg-primary"
            )}
            title={!sidebarExpanded ? "Settings" : undefined}
          >
            <Icon name="settings" className="relative z-10 h-5 w-5 shrink-0" />

            {/* Label (only when expanded) */}
            {sidebarExpanded && <span className="truncate text-sm font-medium">Settings</span>}

            {/* Tooltip (only when collapsed) */}
            {!sidebarExpanded && (
              <span className="absolute left-full ml-2 hidden rounded bg-bg-elevated px-2 py-1 text-caption text-fg-primary shadow-lg group-hover:block">
                Settings
              </span>
            )}
          </button>

          {/* User avatar with status */}
          <div
            className={cn(
              "group relative flex items-center gap-3",
              sidebarExpanded ? "h-10 px-3" : "h-10 w-10 justify-center"
            )}
          >
            <div className="relative shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-hover text-fg-secondary">
                <span className="text-caption font-medium">TN</span>
              </div>
              <span className="absolute -bottom-0.5 -right-0.5">
                <StatusIndicator status={userStatus} />
              </span>
            </div>

            {/* User name (only when expanded) */}
            {sidebarExpanded && <span className="truncate text-sm text-fg-secondary">Henkel</span>}

            {/* Tooltip (only when collapsed) */}
            {!sidebarExpanded && (
              <span className="absolute left-full ml-2 hidden rounded bg-bg-elevated px-2 py-1 text-caption text-fg-primary shadow-lg group-hover:block">
                Henkel
              </span>
            )}
          </div>
        </div>
      </nav>

      {/* Demo Configuration Modal */}
      <DemoConfigModal isOpen={isConfigModalOpen} onClose={() => setIsConfigModalOpen(false)} />
    </>
  );
}
