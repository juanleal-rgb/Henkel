"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import gsap from "gsap";
import {
  LayoutDashboard,
  Users,
  Settings,
  ChevronRight,
  ChevronDown,
  LogOut,
  RotateCcw,
  type LucideIcon,
  Sun,
  Moon,
  X,
  Phone,
  Mail,
  Plus,
  Trash2,
  Search,
  Package,
  DollarSign,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast, Toaster } from "@/components/ui/toaster";

// Sidebar dimensions
const SIDEBAR_COLLAPSED = 72;
const SIDEBAR_EXPANDED = 200;

// Navigation items for Trinity PO Caller
const navItems: {
  href: string;
  icon: LucideIcon;
  label: string;
}[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/suppliers", icon: Users, label: "Suppliers" },
];

// Types for demo config
interface SupplierOverride {
  supplierNumber: string;
  name: string;
  phone: string;
  email: string;
  poCount?: number;
  totalValue?: number;
}

interface SupplierSearchResult {
  id: string;
  supplierNumber: string;
  name: string;
  poCount: number;
  totalValue: number;
}

// Collapsible Override Card Component
function OverrideCard({
  override,
  index,
  isExpanded,
  onToggle,
  onRemove,
  onUpdate,
  isOnly,
}: {
  override: SupplierOverride;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onUpdate: (field: keyof SupplierOverride, value: string) => void;
  isOnly: boolean;
}) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-base">
      {/* Header - always visible */}
      <div
        className={cn(
          "flex cursor-pointer items-center justify-between px-4 py-3 transition-colors",
          !isOnly && "hover:bg-interactive-hover"
        )}
        onClick={isOnly ? undefined : onToggle}
      >
        <div className="flex items-center gap-3">
          {!isOnly && (
            <ChevronDown
              className={cn(
                "h-4 w-4 text-fg-muted transition-transform",
                isExpanded && "rotate-180"
              )}
            />
          )}
          <div>
            <span className="text-[13px] font-medium text-fg-primary">
              {override.name || `Supplier #${override.supplierNumber || "..."}`}
            </span>
            {override.supplierNumber && (
              <span className="ml-2 text-[11px] text-fg-muted">#{override.supplierNumber}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {override.poCount !== undefined && (
            <div className="flex items-center gap-1 text-[11px] text-fg-muted">
              <Package className="h-3 w-3" />
              {override.poCount} POs
            </div>
          )}
          {override.totalValue !== undefined && (
            <div className="flex items-center gap-1 text-[11px] text-fg-muted">
              <DollarSign className="h-3 w-3" />
              {formatCurrency(override.totalValue)}
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-fg-muted transition-colors hover:bg-white/10 hover:text-white/70"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expandable content */}
      {(isExpanded || isOnly) && (
        <div className="space-y-3 border-t border-border-subtle px-4 py-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-fg-muted">Phone Override</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-disabled" />
                <input
                  type="tel"
                  value={override.phone}
                  onChange={(e) => onUpdate("phone", e.target.value)}
                  placeholder="+1 555 123 4567"
                  className="w-full rounded-lg border border-border-subtle bg-bg-surface py-2 pl-9 pr-3 text-[13px] text-fg-primary placeholder:text-fg-disabled focus:border-white/30 focus:outline-none"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-fg-muted">Email Override</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-disabled" />
                <input
                  type="email"
                  value={override.email}
                  onChange={(e) => onUpdate("email", e.target.value)}
                  placeholder="test@happyrobot.ai"
                  className="w-full rounded-lg border border-border-subtle bg-bg-surface py-2 pl-9 pr-3 text-[13px] text-fg-primary placeholder:text-fg-disabled focus:border-white/30 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Demo Config Modal Component
function DemoConfigModal({
  isOpen,
  onClose,
  onReset,
  isResetting,
}: {
  isOpen: boolean;
  onClose: () => void;
  onReset: () => void;
  isResetting: boolean;
}) {
  const [overrides, setOverrides] = useState<SupplierOverride[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SupplierSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [hasSuppliers, setHasSuppliers] = useState<boolean | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { success: showSuccessToast } = useToast();

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
      // Reset search state
      setSearchQuery("");
      setSearchResults([]);
      setShowResults(false);
      setExpandedIndex(null);

      // Check if there are any suppliers in the database
      fetch("/api/suppliers?limit=1")
        .then((res) => res.json())
        .then((data) => setHasSuppliers(data.data && data.data.length > 0))
        .catch(() => setHasSuppliers(false));
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Debounced supplier search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/suppliers?search=${encodeURIComponent(searchQuery)}&limit=5`
        );
        if (response.ok) {
          const json = await response.json();
          const suppliers = json.data?.suppliers || json.data || [];
          setSearchResults(
            suppliers.map(
              (s: {
                id: string;
                supplierNumber: string;
                name: string;
                totalValue?: number;
                poStats?: { total: number };
              }) => ({
                id: s.id,
                supplierNumber: s.supplierNumber,
                name: s.name,
                poCount: s.poStats?.total || 0,
                totalValue: s.totalValue || 0,
              })
            )
          );
          setShowResults(true);
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const handleSave = () => {
    localStorage.setItem("demo_supplier_overrides", JSON.stringify(overrides));
    onClose();
    showSuccessToast("Supplier overrides configured");
  };

  const selectSupplier = (supplier: SupplierSearchResult) => {
    // Check if already added
    if (overrides.some((o) => o.supplierNumber === supplier.supplierNumber)) {
      setSearchQuery("");
      setShowResults(false);
      return;
    }

    const newOverride: SupplierOverride = {
      supplierNumber: supplier.supplierNumber,
      name: supplier.name,
      phone: "",
      email: "",
      poCount: supplier.poCount,
      totalValue: supplier.totalValue,
    };

    // Collapse existing overrides and add new one expanded
    setOverrides([...overrides, newOverride]);
    setExpandedIndex(overrides.length); // Expand the new one
    setSearchQuery("");
    setShowResults(false);
  };

  const removeOverride = (index: number) => {
    setOverrides(overrides.filter((_, i) => i !== index));
    if (expandedIndex === index) {
      setExpandedIndex(null);
    } else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1);
    }
  };

  const updateOverride = (index: number, field: keyof SupplierOverride, value: string) => {
    const updated = [...overrides];
    updated[index] = { ...updated[index], [field]: value };
    setOverrides(updated);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-xl overflow-hidden rounded-xl border border-border-subtle bg-bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.08]">
              <Settings className="h-5 w-5 text-white/80" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-fg-primary">Demo Configuration</h2>
              <p className="text-[12px] text-fg-muted">Override supplier contact info for demos</p>
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
          {/* Supplier Search */}
          <div className="space-y-2">
            <label className="block text-[12px] font-medium text-fg-secondary">
              Search Supplier to Add Override
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by supplier name or number..."
                className="w-full rounded-lg border border-border-subtle bg-bg-base py-2.5 pl-10 pr-3 text-[13px] text-fg-primary placeholder:text-fg-disabled focus:border-white/30 focus:outline-none"
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
                </div>
              )}
            </div>

            {/* Search Results Dropdown */}
            {showResults && searchResults.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-base">
                {searchResults.map((supplier) => {
                  const isAlreadyAdded = overrides.some(
                    (o) => o.supplierNumber === supplier.supplierNumber
                  );
                  return (
                    <button
                      key={supplier.id}
                      onClick={() => selectSupplier(supplier)}
                      disabled={isAlreadyAdded}
                      className={cn(
                        "flex w-full items-center justify-between px-4 py-3 text-left transition-colors",
                        isAlreadyAdded
                          ? "bg-bg-muted cursor-not-allowed opacity-50"
                          : "hover:bg-interactive-hover"
                      )}
                    >
                      <div>
                        <div className="text-[13px] font-medium text-fg-primary">
                          {supplier.name}
                        </div>
                        <div className="text-[11px] text-fg-muted">#{supplier.supplierNumber}</div>
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-fg-muted">
                        <span className="flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          {supplier.poCount} POs
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: "USD",
                            minimumFractionDigits: 0,
                          }).format(supplier.totalValue)}
                        </span>
                        {isAlreadyAdded && <span className="text-white/80">Added</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {showResults &&
              searchResults.length === 0 &&
              !isSearching &&
              searchQuery.length >= 2 && (
                <div className="rounded-lg border border-border-subtle bg-bg-base px-4 py-3 text-center text-[13px] text-fg-muted">
                  No suppliers found matching &quot;{searchQuery}&quot;
                </div>
              )}
          </div>

          {/* Overrides List */}
          {overrides.length > 0 && (
            <div className="space-y-2">
              <label className="block text-[12px] font-medium text-fg-secondary">
                Configured Overrides ({overrides.length})
              </label>
              <div className="space-y-2">
                {overrides.map((override, index) => (
                  <OverrideCard
                    key={`${override.supplierNumber}-${index}`}
                    override={override}
                    index={index}
                    isExpanded={expandedIndex === index}
                    onToggle={() => setExpandedIndex(expandedIndex === index ? null : index)}
                    onRemove={() => removeOverride(index)}
                    onUpdate={(field, value) => updateOverride(index, field, value)}
                    isOnly={overrides.length === 1}
                  />
                ))}
              </div>
            </div>
          )}

          {overrides.length === 0 && (
            <div className="rounded-lg border border-dashed border-border-subtle bg-bg-base px-4 py-8 text-center">
              {hasSuppliers === false ? (
                <div className="space-y-2">
                  <p className="text-[13px] font-medium text-fg-secondary">No suppliers found</p>
                  <p className="text-[12px] text-fg-muted">
                    Upload a PO file first to populate suppliers, then configure overrides here.
                  </p>
                </div>
              ) : (
                <p className="text-[13px] text-fg-muted">
                  Search and select suppliers above to configure demo overrides
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between border-t border-border-subtle px-6 py-4">
          <button
            onClick={onReset}
            disabled={isResetting}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-medium text-danger transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              borderColor: "rgba(239, 68, 68, 0.35)",
            }}
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isResetting ? "animate-spin" : ""}`} />
            {isResetting ? "Resetting..." : "Reset Demo"}
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-fg-secondary transition-colors hover:bg-interactive-hover"
            >
              Cancel
            </button>
            {(() => {
              const hasIncomplete = overrides.some((o) => !o.phone.trim() || !o.email.trim());
              const isDisabled = overrides.length === 0 || hasIncomplete;
              const button = (
                <button
                  onClick={handleSave}
                  disabled={isDisabled}
                  className={cn(
                    "rounded-lg px-4 py-2 text-[13px] font-medium transition-colors",
                    isDisabled
                      ? "bg-bg-muted cursor-default text-fg-disabled"
                      : "bg-white text-black hover:bg-white/90"
                  )}
                >
                  Save Overrides
                </button>
              );

              if (isDisabled && overrides.length > 0) {
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>{button}</span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="border-border-subtle bg-bg-elevated px-3 py-2"
                    >
                      <p className="text-[12px] text-fg-secondary">
                        Fill in phone and email for all overrides
                      </p>
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return button;
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Reset all data back to initial state
  const handleReset = useCallback(async () => {
    if (isResetting) return;

    setIsResetting(true);
    try {
      const response = await fetch("/api/reset", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to reset data");
      }

      // Force full page reload to refresh all data
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("Error resetting data:", err);
    } finally {
      setIsResetting(false);
    }
  }, [isResetting]);

  // Get user initials from session
  const userName = session?.user?.name || "User";
  const userInitials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  // Refs for GSAP animations
  const sidebarRef = useRef<HTMLElement>(null);
  const logoTextRef = useRef<HTMLDivElement>(null);
  const navLabelsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const chevronRefs = useRef<(SVGSVGElement | null)[]>([]);
  const userInfoRef = useRef<HTMLDivElement>(null);
  const footerTextRef = useRef<HTMLDivElement>(null);
  const footerLogoRef = useRef<HTMLDivElement>(null);

  const isCollapsed = !isHovered;

  // GSAP animation for sidebar expansion/collapse
  const animateSidebar = useCallback((expanded: boolean) => {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    // Sidebar width
    tl.to(
      sidebarRef.current,
      {
        width: expanded ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED,
        duration: 0.4,
      },
      0
    );

    // Logo text fade
    if (logoTextRef.current) {
      tl.to(
        logoTextRef.current,
        {
          opacity: expanded ? 1 : 0,
          x: expanded ? 0 : -20,
          duration: 0.3,
          pointerEvents: expanded ? "auto" : "none",
        },
        expanded ? 0.1 : 0
      );
    }

    // Nav labels fade with stagger
    navLabelsRef.current.forEach((label, index) => {
      if (label) {
        tl.to(
          label,
          {
            opacity: expanded ? 1 : 0,
            x: expanded ? 0 : -10,
            duration: 0.25,
          },
          expanded ? 0.05 + index * 0.03 : index * 0.02
        );
      }
    });

    // Chevron icons
    chevronRefs.current.forEach((chevron, index) => {
      if (chevron) {
        tl.to(
          chevron,
          {
            opacity: expanded ? 1 : 0,
            x: expanded ? 0 : -5,
            duration: 0.2,
          },
          expanded ? 0.15 + index * 0.02 : index * 0.02
        );
      }
    });

    // User info
    if (userInfoRef.current) {
      tl.to(
        userInfoRef.current,
        {
          opacity: expanded ? 1 : 0,
          x: expanded ? 0 : -10,
          duration: 0.25,
        },
        expanded ? 0.1 : 0
      );
    }

    // Footer text
    if (footerTextRef.current) {
      tl.to(
        footerTextRef.current,
        {
          opacity: expanded ? 1 : 0,
          y: expanded ? 0 : 5,
          duration: 0.2,
        },
        expanded ? 0.15 : 0
      );
    }

    // Footer logo size
    if (footerLogoRef.current) {
      tl.to(
        footerLogoRef.current,
        {
          scale: expanded ? 1 : 0.7,
          duration: 0.3,
        },
        0.1
      );
    }
  }, []);

  // Run animation when hover state changes
  useEffect(() => {
    animateSidebar(isHovered);
    // Dispatch event to close dropdowns when sidebar expands
    if (isHovered) {
      window.dispatchEvent(new CustomEvent("sidebar-expanded"));
    }
  }, [isHovered, animateSidebar]);

  // Initial setup
  useEffect(() => {
    // Set initial collapsed state without animation
    gsap.set(sidebarRef.current, { width: SIDEBAR_COLLAPSED });
    gsap.set(logoTextRef.current, { opacity: 0, x: -20 });
    navLabelsRef.current.forEach((label) => {
      if (label) gsap.set(label, { opacity: 0, x: -10 });
    });
    chevronRefs.current.forEach((chevron) => {
      if (chevron) gsap.set(chevron, { opacity: 0, x: -5 });
    });
    if (userInfoRef.current) gsap.set(userInfoRef.current, { opacity: 0, x: -10 });
    if (footerTextRef.current) gsap.set(footerTextRef.current, { opacity: 0, y: 5 });
    if (footerLogoRef.current) gsap.set(footerLogoRef.current, { scale: 0.7 });
  }, []);

  // Store label refs
  const setNavLabelRef = (index: number) => (el: HTMLSpanElement | null) => {
    navLabelsRef.current[index] = el;
  };

  // Store chevron refs
  const setChevronRef = (index: number) => (el: SVGSVGElement | null) => {
    chevronRefs.current[index] = el;
  };

  return (
    <div className="flex h-screen w-full min-w-0 max-w-[100vw] overflow-hidden bg-bg-base">
      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          "fixed left-0 top-0 z-40 h-screen",
          "bg-bg-surface/95 backdrop-blur-xl",
          "border-r border-border-subtle",
          "flex flex-col overflow-hidden"
        )}
        style={{ width: SIDEBAR_COLLAPSED }}
      >
        {/* Logo */}
        <div className="flex h-16 items-center overflow-hidden border-b border-border-subtle px-4">
          {/* Small logo (collapsed) */}
          {isCollapsed && (
            <div className="flex shrink-0 items-center justify-center">
              <Image
                src={
                  theme === "light"
                    ? "/trinity/TRN-small-black.png"
                    : "/trinity/TRN-small-white.png"
                }
                alt="Trinity"
                width={32}
                height={32}
                className="object-contain"
              />
            </div>
          )}
          {/* Expanded logo */}
          {!isCollapsed && (
            <div ref={logoTextRef} className="whitespace-nowrap" style={{ opacity: 0 }}>
              <Image
                src={
                  theme === "light"
                    ? "/trinity/TRN-expanded-black.png"
                    : "/trinity/TRN-expanded-white.png"
                }
                alt="Trinity Industries"
                width={140}
                height={32}
                className="object-contain"
              />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-4">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

            const navLink = (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 overflow-hidden rounded-lg",
                  "px-3 py-2.5 transition-all duration-200",
                  isActive
                    ? theme === "light"
                      ? "bg-black text-white hover:bg-black/90"
                      : "bg-white text-black hover:bg-white/90"
                    : "text-fg-secondary hover:bg-interactive-hover hover:text-fg-primary"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 shrink-0 transition-colors",
                    isActive
                      ? theme === "light"
                        ? "text-white"
                        : "text-black"
                      : "text-fg-muted group-hover:text-white/80"
                  )}
                />

                <span
                  ref={setNavLabelRef(index)}
                  className={cn(
                    "whitespace-nowrap text-[14px] font-medium",
                    isActive ? (theme === "light" ? "text-white" : "text-black") : ""
                  )}
                  style={{ opacity: isCollapsed ? 0 : 1 }}
                >
                  {item.label}
                </span>

                {isActive && !isCollapsed && (
                  <ChevronRight
                    ref={setChevronRef(index)}
                    className={cn(
                      "ml-auto h-4 w-4 shrink-0",
                      theme === "light" ? "text-white/50" : "text-black/50"
                    )}
                  />
                )}
              </Link>
            );

            if (isCollapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                  <TooltipContent
                    side="right"
                    sideOffset={12}
                    className="border-border-subtle bg-bg-elevated text-fg-primary"
                  >
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return navLink;
          })}
        </nav>

        {/* Bottom section */}
        <div className="flex flex-col">
          {/* Settings - opens Demo Config Modal */}
          <div className="border-t border-border-subtle px-3 py-2">
            {isCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIsConfigModalOpen(true)}
                    className="group flex w-full items-center justify-center gap-3 overflow-hidden rounded-lg px-3 py-2.5 text-fg-secondary transition-all duration-200 hover:bg-interactive-hover hover:text-fg-primary"
                  >
                    <Settings className="h-5 w-5 shrink-0 text-fg-muted transition-colors group-hover:text-white/80" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  sideOffset={12}
                  className="border-border-subtle bg-bg-elevated text-fg-primary"
                >
                  Settings
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={() => setIsConfigModalOpen(true)}
                className="group flex w-full items-center gap-3 overflow-hidden rounded-lg px-3 py-2.5 text-fg-secondary transition-all duration-200 hover:bg-interactive-hover hover:text-fg-primary"
              >
                <Settings className="h-5 w-5 shrink-0 text-fg-muted transition-colors group-hover:text-white/80" />
                <span className="whitespace-nowrap text-[14px]">Settings</span>
              </button>
            )}
          </div>

          {/* Theme Toggle */}
          <div className="border-t border-border-subtle px-3 py-2">
            {isCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="flex w-full items-center justify-center rounded-lg p-2.5 text-fg-muted transition-all hover:bg-interactive-hover hover:text-fg-primary"
                  >
                    {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  sideOffset={12}
                  className="border-border-subtle bg-bg-elevated text-fg-primary"
                >
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-fg-secondary transition-all hover:bg-interactive-hover hover:text-fg-primary"
              >
                {theme === "dark" ? (
                  <Sun className="h-5 w-5 text-fg-muted" />
                ) : (
                  <Moon className="h-5 w-5 text-fg-muted" />
                )}
                <span className="text-[14px]">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
              </button>
            )}
          </div>

          {/* User Section - Expands on hover to show logout */}
          <div className="group border-t border-border-subtle px-3 py-3" ref={userMenuRef}>
            {isCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex w-full cursor-pointer justify-center">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-interactive-hover text-fg-secondary transition-all hover:bg-interactive-active">
                      <span className="text-[12px] font-medium">{userInitials}</span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  sideOffset={12}
                  className="border-border-subtle bg-bg-elevated text-fg-primary"
                >
                  <div className="font-medium">{userName}</div>
                  <div className="text-[11px] text-fg-muted">{session?.user?.role || "Admin"}</div>
                </TooltipContent>
              </Tooltip>
            ) : (
              <div
                className="group/user flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-lg px-2 py-2 transition-all hover:bg-interactive-hover"
                onClick={handleLogout}
              >
                <div className="shrink-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-interactive-hover text-fg-secondary transition-all group-hover/user:bg-white/10 group-hover/user:text-white/80">
                    <span className="text-[12px] font-medium group-hover/user:hidden">
                      {userInitials}
                    </span>
                    <LogOut className="hidden h-4 w-4 group-hover/user:block" />
                  </div>
                </div>
                <div
                  ref={userInfoRef}
                  className="min-w-0 flex-1 whitespace-nowrap text-left"
                  style={{ opacity: 0 }}
                >
                  {/* Default: Name and role */}
                  <div className="group-hover/user:hidden">
                    <div className="truncate text-[14px] font-medium text-fg-primary">
                      {userName}
                    </div>
                    <div className="text-[11px] text-fg-muted">
                      {session?.user?.role || "Admin"}
                    </div>
                  </div>
                  {/* Hover: Logout text */}
                  <div className="hidden group-hover/user:block">
                    <div className="text-[14px] font-medium text-white/80">Sign out</div>
                    <div className="text-[11px] text-white/40">Click to logout</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Powered by Footer */}
          <div className="border-t border-border-subtle px-4 py-3">
            <div className="flex h-14 flex-col items-center justify-center">
              {isCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-center">
                      <Image
                        src={
                          theme === "light"
                            ? "/happyrobot/Footer-logo-black.svg"
                            : "/happyrobot/Footer-logo-white.svg"
                        }
                        alt="HappyRobot AI"
                        width={32}
                        height={32}
                        className="cursor-pointer object-contain opacity-40 transition-opacity hover:opacity-60"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    sideOffset={12}
                    className="border-border-subtle bg-bg-elevated text-fg-primary"
                  >
                    Powered by HappyRobot AI
                  </TooltipContent>
                </Tooltip>
              ) : (
                <>
                  <div
                    ref={footerTextRef}
                    className="mb-1 whitespace-nowrap text-[10px] uppercase tracking-[0.15em] text-fg-disabled"
                    style={{ opacity: 0 }}
                  >
                    Powered by
                  </div>
                  <div ref={footerLogoRef}>
                    <Image
                      src={
                        theme === "light"
                          ? "/happyrobot/Footer-expand-happyrobot-blacl.png"
                          : "/happyrobot/Footer-expand-happyrobot_white.png"
                      }
                      alt="HappyRobot AI"
                      width={110}
                      height={24}
                      className="object-contain opacity-40 transition-opacity hover:opacity-60"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className="flex h-screen w-full min-w-0 flex-col overflow-hidden"
        style={{ marginLeft: SIDEBAR_COLLAPSED, maxWidth: `calc(100vw - ${SIDEBAR_COLLAPSED}px)` }}
      >
        {children}
      </main>

      {/* Demo Configuration Modal */}
      <DemoConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        onReset={handleReset}
        isResetting={isResetting}
      />

      {/* Toast notifications */}
      <Toaster />
    </div>
  );
}
