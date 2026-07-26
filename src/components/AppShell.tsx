import type { ReactNode } from "react";
import SessionRail from "./SessionRail";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="flex-1 min-w-0">{children}</div>
      <SessionRail />
    </div>
  );
}
