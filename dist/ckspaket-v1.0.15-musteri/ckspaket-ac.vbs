' CKS Paket — ag uzerinden tarayicida ac (pencere acilmaz)
Option Explicit
Dim sh, fso, kok, cfg, stream, satir, ip, port, url, parca

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
kok = fso.GetParentFolderName(WScript.ScriptFullName)

ip = "192.168.1.108"
port = "3030"

cfg = kok & "\ckspaket-ag-ayar.bat"
If fso.FileExists(cfg) Then
  Set stream = fso.OpenTextFile(cfg, 1, False)
  Do While Not stream.AtEndOfStream
    satir = Trim(stream.ReadLine)
    If InStr(1, satir, "CKS_SUNUCU_IP=", vbTextCompare) > 0 Then
      ip = Trim(Replace(Mid(satir, InStr(satir, "=") + 1), """", ""))
    ElseIf InStr(1, satir, "CKS_PORT=", vbTextCompare) > 0 Then
      port = Trim(Replace(Mid(satir, InStr(satir, "=") + 1), """", ""))
    End If
  Loop
  stream.Close
End If

url = "http://" & ip & ":" & port & "/"
sh.Run url, 1, False
