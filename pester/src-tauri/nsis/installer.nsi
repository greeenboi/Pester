; NSIS Custom Installer Script for Pester
; This script adds custom functionality to the NSIS installer

!include "MUI2.nsh"

; Custom finish page
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Open thank you page"
!define MUI_FINISHPAGE_RUN_FUNCTION "OpenThankYouPage"

; Function to open the thank you page in default browser
Function OpenThankYouPage
  ExecShell "open" "https://www.suvangs.tech"
FunctionEnd

; Custom installer texts
!define MUI_TEXT_WELCOME_INFO_TITLE "Welcome to Pester Setup"
!define MUI_TEXT_WELCOME_INFO_TEXT "This wizard will guide you through the installation of Pester.$\n$\nPester is a fast and simple messaging application.$\n$\nDeveloped by Suvan GS$\n$\nIt is recommended that you close all other applications before starting Setup. This will make it possible to update relevant system files without having to reboot your computer.$\n$\nClick Next to continue."

; License page customization
!define MUI_TEXT_LICENSE_TITLE "License Agreement"
!define MUI_TEXT_LICENSE_SUBTITLE "Please review the license terms before installing Pester."

; Finish page customization
!define MUI_FINISHPAGE_TITLE "Completing the Pester Setup Wizard"
!define MUI_FINISHPAGE_TEXT "Pester has been installed on your computer.$\n$\nClick Finish to close this wizard.$\n$\nThank you for installing Pester!"
!define MUI_FINISHPAGE_LINK "Visit the Pester GitHub repository"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/greeenboi/Pester"

; Branding
BrandingText "Pester by Suvan GS"

; Publisher information
VIProductVersion "0.1.0.0"
VIAddVersionKey "ProductName" "Pester"
VIAddVersionKey "ProductVersion" "0.1.0"
VIAddVersionKey "CompanyName" "Suvan GS"
VIAddVersionKey "LegalCopyright" "Copyright © 2026 Suvan GS"
VIAddVersionKey "FileDescription" "Pester - Fast & simple messaging app"
VIAddVersionKey "FileVersion" "0.1.0"
