' Launches the app by running electron.exe directly (skipping npm/cmd/node as
' wrapper processes). electron.exe is a GUI-subsystem binary, so it never
' allocates a console window on its own — nothing else to hide.
' This also means closing the app window (which triggers app.quit() in
' main.js) fully ends the one process tree, no leftover wrapper process.
Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")
strPath = objFSO.GetParentFolderName(WScript.ScriptFullName)
electronExe = strPath & "\node_modules\electron\dist\electron.exe"

If Not objFSO.FileExists(electronExe) Then
  MsgBox "Dependencies aren't installed yet. Run start.bat once first.", vbExclamation, "Tarkov Battlepass Tracker"
  WScript.Quit
End If

objShell.Run """" & electronExe & """ """ & strPath & """", 0, False
