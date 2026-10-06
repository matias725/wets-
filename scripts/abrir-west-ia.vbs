' Abre WEST IA: inicia el programa en segundo plano (web + vigilante de la
' carpeta SAP) y abre el navegador. Con el argumento /inicio solo inicia el
' programa, sin abrir el navegador (se usa al encender el computador).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
proyecto = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = proyecto

If WScript.Arguments.Count = 0 Then
  ' acceso del escritorio: deja el programa vigilado en segundo plano y abre la web
  sh.Run "wscript.exe """ & WScript.ScriptFullName & """ /inicio", 0, False
  WScript.Sleep 1500
  sh.Run "http://localhost:4310"
  WScript.Quit
End If

' Vigila el programa: si se cierra por un error, lo vuelve a abrir (hasta 50 veces).
' Si ya estaba abierto, el programa termina solo con código 0 y no se duplica.
For i = 1 To 50
  codigo = sh.Run("""C:\Program Files\nodejs\node.exe"" scripts\servidor.mjs", 0, True)
  If codigo = 0 Then Exit For
  WScript.Sleep 3000
Next
