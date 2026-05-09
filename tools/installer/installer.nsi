; Example standalone NSIS script for Windows packaging.
; APP_NAME and APP_ARTIFACT_DIR can be overridden with /D parameters.

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "include.nsh"

!ifndef APP_NAME
  !define APP_NAME "3D Game"
!endif
!ifndef APP_EXE
  !define APP_EXE "3d-game.exe"
!endif
!ifndef APP_VERSION
  !define APP_VERSION "0.0.0"
!endif
!ifndef APP_ARTIFACT_DIR
  !define APP_ARTIFACT_DIR "..\..\dist\win-unpacked"
!endif

Name "${APP_NAME}"
OutFile "..\..\dist\${APP_NAME}-SampleInstaller-${APP_VERSION}.exe"
InstallDir "$PROGRAMFILES64\${APP_NAME}"
RequestExecutionLevel admin
Unicode true

; Customize installer icon here if needed:
; Icon "..\..\assets\icons\installer.ico"
; UninstallIcon "..\..\assets\icons\installer.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Section "Install"
  !insertmacro PreInstallHook

  SetOutPath "$INSTDIR"
  File /r "${APP_ARTIFACT_DIR}\*.*"

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"

  !insertmacro PostInstallHook
SectionEnd

Section "Uninstall"
  !insertmacro PreUninstallHook

  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR"

  !insertmacro PostUninstallHook
SectionEnd
