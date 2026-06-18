' CKS Paket — guncelleme bat'ini bagimsiz process olarak calistir (arayuz tetiklemesi)
Dim fso, sh, kok, bat
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
kok = fso.GetParentFolderName(WScript.ScriptFullName)
bat = kok & "\ckspaket-musteri-guncelle.bat"
If Not fso.FileExists(bat) Then
  WScript.Quit 1
End If
sh.CurrentDirectory = kok
' 0 = gizli pencere (arayuzde ilerleme cubugu gosterilir)
sh.Run "cmd /c """ & bat & """", 0, False
