' Runs auto-deploy.bat with no visible window.
' Without this the scheduled task would flash a console on screen every
' minute, which is exactly the kind of thing that gets an automation
' switched off after a day.
Dim shell, here, bat
Set shell = CreateObject("WScript.Shell")
here = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
bat = here & "auto-deploy.bat"
shell.Run """" & bat & """", 0, False
