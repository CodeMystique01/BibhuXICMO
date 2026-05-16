"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname } from "next/navigation";

type SidebarCtx = {
  mobileOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const Ctx = createContext<SidebarCtx>({
  mobileOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open on mobile.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <Ctx.Provider value={{ mobileOpen, open, close, toggle }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSidebar = () => useContext(Ctx);
