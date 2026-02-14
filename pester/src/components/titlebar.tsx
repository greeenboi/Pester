import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "@/components/ui/button";
import { Minus, Moon, Sun, X } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

interface TitlebarProps {
  title?: string;
  children?: React.ReactNode;
}

export function Titlebar({ title = "pester", children }: TitlebarProps) {
  const appWindow = getCurrentWindow();
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between h-8 px-2 bg-card border-b select-none shrink-0"
    >
      <div className="flex items-center gap-2 pointer-events-none">
        <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
          {title}
        </span>
      </div>
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={toggleTheme}
          className="hover:bg-muted"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? (
            <Sun className="size-3" />
          ) : (
            <Moon className="size-3" />
          )}
        </Button>
        {children}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => appWindow.minimize()}
          className="hover:bg-muted"
        >
          <Minus className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => appWindow.hide()}
          className="hover:bg-destructive hover:text-white"
        >
          <X className="size-3" />
        </Button>
      </div>
    </div>
  );
}
