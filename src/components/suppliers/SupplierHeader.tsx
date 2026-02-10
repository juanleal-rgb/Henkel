"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  Mail,
  User,
  Building2,
  Copy,
  Check,
  Hash,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SupplierData } from "./supplier-types";

/** Supplier override structure from localStorage */
interface SupplierOverride {
  supplierNumber: string;
  name?: string;
  phone: string;
  email: string;
}

interface SupplierHeaderProps {
  supplier: SupplierData;
  className?: string;
}

export function SupplierHeader({ supplier, className }: SupplierHeaderProps) {
  const router = useRouter();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [demoOverride, setDemoOverride] = useState<SupplierOverride | null>(null);

  // Check for demo overrides in localStorage
  useEffect(() => {
    try {
      const overrides: SupplierOverride[] = JSON.parse(
        localStorage.getItem("demo_supplier_overrides") || "[]"
      );
      const override = overrides.find((s) => s.supplierNumber === supplier.supplierNumber);
      setDemoOverride(override || null);
    } catch {
      setDemoOverride(null);
    }
  }, [supplier.supplierNumber]);

  // Use demo override values when available
  const displayPhone = demoOverride?.phone || supplier.phone;
  const displayEmail = demoOverride?.email || supplier.email;

  const copyToClipboard = useCallback(async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, []);

  return (
    <div className={cn("rounded-xl border border-border-subtle bg-bg-surface p-6", className)}>
      {/* Back button and title row */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-interactive-hover hover:text-fg-primary"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-[24px] font-semibold text-fg-primary">{supplier.name}</h1>
            <div className="mt-1 flex items-center gap-3">
              <span className="flex items-center gap-1.5 rounded-full bg-interactive-hover px-2.5 py-0.5 text-[12px] font-medium text-fg-secondary">
                <Hash className="h-3 w-3" />
                {supplier.supplierNumber}
              </span>
              {supplier.facility && (
                <span className="flex items-center gap-1.5 text-[12px] text-fg-muted">
                  <Building2 className="h-3 w-3" />
                  {supplier.facility}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contact info row */}
      <div className="flex flex-wrap items-center gap-4 border-t border-border-subtle pt-4">
        {/* Demo mode indicator */}
        {demoOverride && (
          <div className="bg-[var(--color-warning)]/10 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--color-warning)]">
            <FlaskConical className="h-3 w-3" />
            Demo Override
          </div>
        )}

        {/* Phone */}
        {displayPhone && (
          <button
            onClick={() => copyToClipboard(displayPhone, "phone")}
            className={cn(
              "group flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-interactive-active",
              demoOverride?.phone ? "bg-[var(--color-warning)]/5" : "bg-interactive-hover"
            )}
          >
            <Phone className="h-4 w-4 text-fg-muted" />
            <span className="font-mono text-[14px] text-fg-primary">{displayPhone}</span>
            {copiedField === "phone" ? (
              <Check className="h-3.5 w-3.5 text-[var(--color-success)]" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-fg-disabled opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </button>
        )}

        {/* Email */}
        {displayEmail && (
          <button
            onClick={() => copyToClipboard(displayEmail, "email")}
            className={cn(
              "group flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-interactive-active",
              demoOverride?.email ? "bg-[var(--color-warning)]/5" : "bg-interactive-hover"
            )}
          >
            <Mail className="h-4 w-4 text-fg-muted" />
            <span className="text-[14px] text-fg-primary">{displayEmail}</span>
            {copiedField === "email" ? (
              <Check className="h-3.5 w-3.5 text-[var(--color-success)]" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-fg-disabled opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </button>
        )}

        {/* Contact Name */}
        {supplier.contactName && (
          <div className="flex items-center gap-2 px-3 py-2 text-fg-secondary">
            <User className="h-4 w-4 text-fg-muted" />
            <span className="text-[14px]">{supplier.contactName}</span>
          </div>
        )}
      </div>

      {/* Notes */}
      {supplier.notes && (
        <div className="bg-interactive-hover/50 mt-4 rounded-lg px-4 py-3">
          <p className="text-[13px] leading-relaxed text-fg-secondary">{supplier.notes}</p>
        </div>
      )}
    </div>
  );
}
