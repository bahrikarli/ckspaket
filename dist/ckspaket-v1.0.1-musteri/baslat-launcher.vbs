' CKS Paket — arka planda sunucu + tarayici ac (gizli)
Option Explicit
Dim shell, fso, kok, port, logDosya, calisiyor, deneme, bat

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
kok = fso.GetParentFolderName(WScript.ScriptFullName)
port = "3030"
logDosya = kok & "\logs\server.log"
bat = kok & "\sunucu-gizli.bat"

If fso.FileExists(kok & "\.env") Then
  Dim envTxt, satirlar, s, p
  envTxt = fso.OpenTextFile(kok & "\.env", 1).ReadAll
  envTxt = Replace(envTxt, vbCrLf, vbLf)
  envTxt = Replace(envTxt, vbCr, vbLf)
  satirlar = Split(envTxt, vbLf)
  For Each s In satirlar
    s = Trim(s)
    If Len(s) > 5 And UCase(Left(s, 5)) = "PORT=" Then
      p = Trim(Mid(s, 6))
      If IsNumeric(p) Then port = p
      Exit For
    End If
  Next
End If

calisiyor = PortAcik(port)

If Not calisiyor Then
  If Not fso.FileExists(bat) Then
    HataGoster "sunucu-gizli.bat bulunamadi.", logDosya
    WScript.Quit 1
  End If
  shell.CurrentDirectory = kok
  Dim kod
  kod = shell.Run("cmd /c """ & bat & """", 0, True)
  If kod = 2 Then
    HataGoster "node_modules yok." & vbCrLf & "Once MUSTERI-KUR.bat calistirin.", logDosya
    WScript.Quit 1
  ElseIf kod = 3 Then
    HataGoster "Node.js bulunamadi." & vbCrLf & "https://nodejs.org LTS kurun.", logDosya
    WScript.Quit 1
  ElseIf kod <> 0 Then
    HataGoster "Sunucu baslatilamadi (kod " & kod & ").", logDosya
    WScript.Quit 1
  End If
  For deneme = 1 To 30
    WScript.Sleep 1000
    If PortAcik(port) Then
      calisiyor = True
      Exit For
    End If
  Next
End If

If calisiyor Then
  shell.Run "http://127.0.0.1:" & port, 1, False
Else
  HataGoster "Sunucu " & port & " portunda acilmadi." & vbCrLf & _
    "SQL ve .env ayarlarini kontrol edin." & vbCrLf & _
    "Detay: sunucu-test.bat calistirin.", logDosya
End If

Function PortAcik(p)
  Dim exec, cikti
  Set exec = shell.Exec("cmd /c netstat -ano | findstr /C:""" & p & """ | findstr LISTENING")
  Do While exec.Status = 0
    WScript.Sleep 100
  Loop
  cikti = exec.StdOut.ReadAll
  PortAcik = (Len(Trim(cikti)) > 0)
End Function

Sub HataGoster(mesaj, logYol)
  Dim ek
  ek = ""
  On Error Resume Next
  If fso.FileExists(logYol) Then
    Dim ts, satir, son
    Set ts = fso.OpenTextFile(logYol, 1)
    satir = ts.ReadAll
    ts.Close
    If Len(satir) > 0 Then
      son = satir
      If Len(son) > 600 Then son = Right(son, 600)
      ek = vbCrLf & vbCrLf & "--- log ---" & vbCrLf & son
    End If
  End If
  On Error GoTo 0
  MsgBox mesaj & ek, vbCritical, "CKS Paket"
End Sub
