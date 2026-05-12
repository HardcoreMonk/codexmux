!macro customCheckAppRunning
  ; The internal updater closes codexmux before running the installer. Skipping
  ; electron-builder's process-name scan avoids stale Windows tasklist entries
  ; blocking silent installs in long-lived automation sessions.
!macroend

!macro customInstall
  ${if} ${Silent}
  ${andIf} ${isUpdated}
    !insertmacro quitSuccess
  ${endif}
!macroend
