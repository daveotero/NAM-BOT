!macro customInstall
  ; Refresh Windows shell to ensure proper app registration
  System::Call 'shell32::SHChangeNotify(i 0x8000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  System::Call 'shell32::SHChangeNotify(i 0x8000000, i 0, p 0, p 0)'
!macroend