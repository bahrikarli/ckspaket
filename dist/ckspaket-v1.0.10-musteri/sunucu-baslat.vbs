' CKS Paket — sunucuyu gorunmez pencerede baslat (siyah CKSPaket penceresi acilmaz)
Dim fso, sh, kok, logDir, logFile, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
kok = fso.GetParentFolderName(WScript.ScriptFullName)
logDir = kok & "\logs"
logFile = logDir & "\server.log"
If Not fso.FolderExists(logDir) Then fso.CreateFolder logDir
sh.CurrentDirectory = kok
cmd = "cmd /c set CKSPAKET=1&& node """ & kok & "\server.js"" >> """ & logFile & """ 2>&1"
sh.Run cmd, 0, False
