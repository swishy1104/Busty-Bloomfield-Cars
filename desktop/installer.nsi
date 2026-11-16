; Bloomfield Drift Windows installer (NSIS 3). Built by build.sh: makensis -DVERSION=x.y.z -DSIZE_KB=n installer.nsi
; Installs per user (no admin prompt) into %LOCALAPPDATA%\Programs\Bloomfield Drift with Start Menu and Desktop shortcuts and an uninstaller.
!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef SIZE_KB
  !define SIZE_KB 15000
!endif

Name "Bloomfield Drift"
OutFile "dist/Bloomfield-Drift-Setup.exe"
Unicode True
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\Bloomfield Drift"
InstallDirRegKey HKCU "Software\Bloomfield Drift" "InstallDir"
SetCompressor /SOLID lzma
BrandingText "Bloomfield Drift ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Bloomfield Drift"
VIAddVersionKey "FileDescription" "Bloomfield Drift installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" ""

!define MUI_ICON "build/icon.ico"
!define MUI_UNICON "build/icon.ico"
!define MUI_WELCOMEPAGE_TITLE "Bloomfield Drift"
!define MUI_WELCOMEPAGE_TEXT "An open-world drifting game set in Bloomfield, Indiana.$\r$\n$\r$\nThe game runs in a window of the Microsoft Edge or Google Chrome already on this PC. It needs no internet connection.$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Bloomfield Drift.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Start Bloomfield Drift"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Bloomfield Drift (required)" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"
  !cd "build"
  File "Bloomfield Drift.exe"
  File "icon.ico"
  !cd ".."
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Bloomfield Drift"
  CreateShortcut "$SMPROGRAMS\Bloomfield Drift\Bloomfield Drift.lnk" "$INSTDIR\Bloomfield Drift.exe" "" "$INSTDIR\icon.ico"
  CreateShortcut "$SMPROGRAMS\Bloomfield Drift\Uninstall Bloomfield Drift.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Bloomfield Drift" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BloomfieldDrift" "DisplayName" "Bloomfield Drift"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BloomfieldDrift" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BloomfieldDrift" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BloomfieldDrift" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BloomfieldDrift" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BloomfieldDrift" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BloomfieldDrift" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BloomfieldDrift" "NoRepair" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BloomfieldDrift" "EstimatedSize" ${SIZE_KB}
SectionEnd

Section "Desktop shortcut" SecDesktop
  CreateShortcut "$DESKTOP\Bloomfield Drift.lnk" "$INSTDIR\Bloomfield Drift.exe" "" "$INSTDIR\icon.ico"
SectionEnd

LangString DESC_SecMain ${LANG_ENGLISH} "The game and its launcher."
LangString DESC_SecDesktop ${LANG_ENGLISH} "A shortcut on the desktop."
!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} $(DESC_SecMain)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} $(DESC_SecDesktop)
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "Uninstall"
  Delete "$INSTDIR\Bloomfield Drift.exe"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\Bloomfield Drift\Bloomfield Drift.lnk"
  Delete "$SMPROGRAMS\Bloomfield Drift\Uninstall Bloomfield Drift.lnk"
  RMDir "$SMPROGRAMS\Bloomfield Drift"
  Delete "$DESKTOP\Bloomfield Drift.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BloomfieldDrift"
  DeleteRegKey HKCU "Software\Bloomfield Drift"
SectionEnd
