; Custom NSIS installer header script for Zameen Khata
!macro customInstall
  ; Create registry entry for proper uninstall in Control Panel
  WriteRegStr HKCU "Software\ZameenKhata" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\ZameenKhata" "Version" "1.0.0"
!macroend

!macro customUninstall
  DeleteRegKey HKCU "Software\ZameenKhata"
!macroend
