; NSIS Installer Hooks for Pester
; Uses Tauri's hook system to customize the default installer

!macro NSIS_HOOK_POSTINSTALL
  ; Open thank you page after installation
  ExecShell "open" "https://www.suvangs.tech"
!macroend
