' Eski baslat.bat uyumlulugu — baslat.bat calistir
Dim sh, fso, kok
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
kok = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "cmd /c """ & kok & "\baslat.bat""", 0, False
