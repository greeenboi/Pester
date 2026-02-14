import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "@/components/theme-provider";

// Attach Tauri logs to console in dev mode
if (import.meta.env.DEV) {
  import("@tauri-apps/plugin-log").then(({ attachConsole }) => {
    attachConsole().catch((err) => {
      console.error("Failed to attach console logger:", err);
    });
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="pester-ui-theme">
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
