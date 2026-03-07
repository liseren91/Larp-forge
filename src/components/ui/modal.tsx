"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex min-h-full items-start justify-center p-4 sm:p-6">
        <div
          className={cn(
            "relative my-8 flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl sm:max-h-[calc(100vh-3rem)]",
            className
          )}
        >
          <div className="mb-4 flex items-center justify-between">
            {title && <h2 className="text-lg font-semibold">{title}</h2>}
            <button
              onClick={onClose}
              className="ml-auto rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto pr-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
