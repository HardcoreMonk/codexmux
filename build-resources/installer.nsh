!macro customInstall
  ${if} ${Silent}
  ${andIf} ${isUpdated}
    !insertmacro quitSuccess
  ${endif}
!macroend
