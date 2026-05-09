!ifndef APP_NAME
  !define APP_NAME "3D Game"
!endif

!macro PreInstallHook
  DetailPrint "Running pre-install hook for ${APP_NAME}"
  ; Add custom pre-install steps here.
!macroend

!macro PostInstallHook
  DetailPrint "Running post-install hook for ${APP_NAME}"
  ; Add custom post-install steps here.
!macroend

!macro PreUninstallHook
  DetailPrint "Running pre-uninstall hook for ${APP_NAME}"
  ; Add custom pre-uninstall steps here.
!macroend

!macro PostUninstallHook
  DetailPrint "Running post-uninstall hook for ${APP_NAME}"
  ; Add custom post-uninstall steps here.
!macroend
