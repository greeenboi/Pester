# NSIS Custom Installer Configuration

This directory contains NSIS (Nullsoft Scriptable Install System) custom configuration for the Windows installer.

## installer.nsi

This file contains custom NSIS script that extends the default Tauri NSIS installer with:

### Branding & Metadata
- **Publisher**: Suvan GS
- **Copyright**: Copyright © 2026 Suvan GS
- **Product Name**: Pester
- **Description**: Fast & simple messaging app
- **Homepage**: https://github.com/greeenboi/Pester

### Custom Functionality
- **Finish Page Action**: Opens https://www.suvangs.tech in the user's default browser after installation
- **Custom Welcome Text**: Personalized welcome message with app description
- **License Display**: Shows MIT license during installation
- **Branding Text**: Shows "Pester by Suvan GS" at the bottom of installer
- **GitHub Link**: Adds a clickable link to the GitHub repository on the finish page

### Visual Customization
- Uses app icon for installer icon, header image, and sidebar
- Consistent branding throughout the installation process
- Clean, professional appearance

### Installation Settings
- **Install Mode**: Per-user installation (no admin rights required)
- **Start Menu Folder**: Creates shortcuts in "Pester" folder
- **Compression**: Ultra compression for smaller installer size
- **Language**: English only

## How It Works

The custom NSIS script is merged with Tauri's default NSIS template during the build process. The custom additions:

1. Add version information to the installer executable
2. Customize all installer page texts
3. Add a finish page option to open the thank you page
4. Include branding throughout the installer

## Building

When you run `bun tauri build`, Tauri will:
1. Generate the default NSIS installer template
2. Merge your custom `installer.nsi` script
3. Compile the installer with NSIS
4. Output the `.exe` installer with all customizations

The resulting installer will have all the branding, licensing, and custom actions configured here.
