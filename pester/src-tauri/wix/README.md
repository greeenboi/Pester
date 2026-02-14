# WiX Custom Actions

This directory contains WiX custom action fragments that extend the Windows installer functionality.

## custom-action.wxs

This file contains a custom action that opens the thank you page (https://www.suvangs.tech) in the user's default browser after the installation completes successfully.

The action runs in both the InstallExecuteSequence and InstallUISequence to ensure it works in both silent and UI-driven installations.

### How it works:
- Uses the built-in `WixShellExec` action to open URLs
- Runs after `InstallFinalize` to ensure installation is complete
- Only runs on fresh installs (`NOT Installed` condition)
- Impersonates the user to ensure browser opens with correct permissions
- Uses `Return="ignore"` to not fail installation if browser opening fails
