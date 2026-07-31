import type { ReactNode } from "react";
import { ChatDockProvider } from "@/lib/chatDock";
import SessionRail from "./SessionRail";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    // The provider wraps both, because the rail holds the assistant's toggle
    // and the page holds its panel — siblings that have to agree on one bit of
    // state.
    <ChatDockProvider>
      {/* min-h-dvh, not min-h-screen: `100vh` on iOS Safari counts the
          collapsing address bar, so a vh-based minimum forces a scrollbar on a
          page that fits. */}
      <div className="flex min-h-dvh">
        <div className="flex-1 min-w-0">{children}</div>
        <SessionRail />
      </div>
    </ChatDockProvider>
  );
}
