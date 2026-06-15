' CKS Paket — sunucuyu gorunmez pencerede baslat (siyah CKSPaket penceresi acilmaz)
Dim fso, sh, kok, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
kok = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = kok
cmd = "cmd /c """ & kok & "\sunucu-arka.bat"""
sh.Run cmd, 0, False
