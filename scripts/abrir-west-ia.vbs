' Abre WEST IA: inicia el programa en segundo plano (web + vigilante de la
' carpeta SAP) y abre el navegador. Con el argumento /inicio solo inicia el
' programa, sin abrir el navegador (se usa al encender el computador).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
proyecto = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = proyecto
' Si ya está abierto, el programa se cierra solo (no se duplica).
sh.Run """C:\Program Files\nodejs\node.exe"" scripts\servidor.mjs", 0, False
If WScript.Arguments.Count = 0 Then
  WScript.Sleep 1500
  sh.Run "http://localhost:4310"
End If
