' Masaustune ag CKS Paket kisayolu (cift tik = tarayici acilir)
Option Explicit
Dim shell, fso, kok, sc, masaustu, ikon, hedef

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
kok = fso.GetParentFolderName(WScript.ScriptFullName)
masaustu = shell.SpecialFolders("Desktop")
hedef = kok & "\ckspaket-ac.vbs"
ikon = kok & "\icon\bugday.ico"

Set sc = shell.CreateShortcut(masaustu & "\CKS Paket.lnk")
sc.TargetPath = "wscript.exe"
sc.Arguments = "//nologo """ & hedef & """"
sc.WorkingDirectory = kok
sc.WindowStyle = 1
sc.Description = "CKS Paket — Ciftci Kayit Sistemi (ag)"
If fso.FileExists(ikon) Then
  sc.IconLocation = ikon & ",0"
Else
  sc.IconLocation = "%SystemRoot%\System32\imageres.dll,109"
End If
sc.Save

Set sc = shell.CreateShortcut(kok & "\CKS Paket.lnk")
sc.TargetPath = "wscript.exe"
sc.Arguments = "//nologo """ & hedef & """"
sc.WorkingDirectory = kok
sc.WindowStyle = 1
sc.Description = "CKS Paket — Ciftci Kayit Sistemi (ag)"
If fso.FileExists(ikon) Then
  sc.IconLocation = ikon & ",0"
Else
  sc.IconLocation = "%SystemRoot%\System32\imageres.dll,109"
End If
sc.Save

WScript.Echo "Ag kisayolu olusturuldu:" & vbCrLf & masaustu & "\CKS Paket.lnk"
