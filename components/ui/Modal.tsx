"use client";
import { useEffect } from "react";

interface Props {
  title:    string;
  onClose:  () => void;
  children: React.ReactNode;
  wide?:    boolean;
}

export default function Modal({ title, onClose, children, wide }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`card p-6 w-full ${wide ? "max-w-2xl" : "max-w-md"} shadow-2xl animate-fade-up`}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-base font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-lg leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
