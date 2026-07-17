"use client";

import { useCRMStore } from "@/lib/store/crm-store";
import { X, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Toaster() {
  const toasts = useCRMStore((s) => s.toasts);
  const dismissToast = useCRMStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg animate-in slide-in-from-bottom-2",
            toast.type === "success"
              ? "bg-white border-green-200"
              : "bg-white border-red-200"
          )}
        >
          {toast.type === "success" ? (
            <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <p className="text-sm flex-1">{toast.message}</p>
          <button onClick={() => dismissToast(toast.id)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
