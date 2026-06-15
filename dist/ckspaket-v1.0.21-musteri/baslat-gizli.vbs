' CKS Paket — baslat.bat'i gizli pencerede calistir (cift tik icin)
CreateObject("WScript.Shell").Run "cmd /c """ & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\baslat.bat""", 0, False
