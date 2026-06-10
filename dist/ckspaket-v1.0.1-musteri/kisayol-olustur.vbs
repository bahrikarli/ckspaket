' Masaustune CKS Paket kisayolu (buğday ikonu)
Option Explicit
Dim shell, fso, kok, sc, masaustu, ikon

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
kok = fso.GetParentFolderName(WScript.ScriptFullName)
masaustu = shell.SpecialFolders("Desktop")
ikon = kok & "\icon\bugday.ico"

Set sc = shell.CreateShortcut(masaustu & "\CKS Paket.lnk")
sc.TargetPath = kok & "\baslat.bat"
sc.WorkingDirectory = kok
sc.WindowStyle = 7
sc.Description = "CKS Paket — Ciftci Kayit Sistemi"
If fso.FileExists(ikon) Then sc.IconLocation = ikon & ",0"
sc.Save

Set sc = shell.CreateShortcut(kok & "\Baslat.lnk")
sc.TargetPath = kok & "\baslat.bat"
sc.WorkingDirectory = kok
sc.WindowStyle = 7
sc.Description = "CKS Paket — Ciftci Kayit Sistemi"
If fso.FileExists(ikon) Then sc.IconLocation = ikon & ",0"
sc.Save

WScript.Echo "Kisayollar olusturuldu: Masaustu + Baslat.lnk"
