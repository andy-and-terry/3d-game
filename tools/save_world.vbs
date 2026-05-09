' =============================================================
' save_world.vbs
' Helper script: read all files from a world directory,
' base64-encode them, and write a .world payload JSON file.
'
' Called by save_world.bat with two arguments:
'   Arg 1 — source world directory path
'   Arg 2 — output .world file path
'
' The .world file is plain JSON compatible with the game's
' worlds:import IPC handler (same format as exportWorld).
' =============================================================

Option Explicit

Dim fso, worldDir, outPath, shell
Dim metaJson, filesObj, payload
Dim folder, file, fileStream
Dim b64Data

' ---- validate arguments ----
If WScript.Arguments.Count < 2 Then
    WScript.Echo "[ERROR] Usage: save_world.vbs <worldDir> <outputPath>"
    WScript.Quit 1
End If

worldDir = WScript.Arguments(0)
outPath  = WScript.Arguments(1)

Set fso = CreateObject("Scripting.FileSystemObject")

If Not fso.FolderExists(worldDir) Then
    WScript.Echo "[ERROR] World directory not found: " & worldDir
    WScript.Quit 1
End If

' ---- read meta.json ----
Dim metaPath
metaPath = fso.BuildPath(worldDir, "meta.json")
If Not fso.FileExists(metaPath) Then
    WScript.Echo "[ERROR] meta.json not found in: " & worldDir
    WScript.Quit 1
End If

Dim tsRead
Set tsRead = fso.OpenTextFile(metaPath, 1, False)  ' 1 = ForReading
metaJson   = tsRead.ReadAll()
tsRead.Close

' ---- iterate files and base64-encode each ----
' Build a simple JSON manually (no external JSON lib required)
Dim filesJson
filesJson = ""

Set folder = fso.GetFolder(worldDir)
Dim first
first = True

For Each file In folder.Files
    Dim fileName
    fileName = fso.GetFileName(file.Path)

    ' Read file as binary
    Dim adoStream
    Set adoStream = CreateObject("ADODB.Stream")
    adoStream.Type = 1  ' adTypeBinary
    adoStream.Open
    adoStream.LoadFromFile file.Path
    Dim byteData
    byteData = adoStream.Read
    adoStream.Close

    ' Base64-encode via XML DOM
    Dim xmlNode
    Set xmlNode = CreateObject("MSXML2.DOMDocument").createElement("b64")
    xmlNode.DataType = "bin.base64"
    xmlNode.nodeTypedValue = byteData
    b64Data = xmlNode.Text

    ' Remove whitespace inserted by MSXML
    b64Data = Join(Split(b64Data, Chr(10)), "")
    b64Data = Join(Split(b64Data, Chr(13)), "")
    b64Data = Join(Split(b64Data, " "), "")

    If Not first Then filesJson = filesJson & ","
    filesJson = filesJson & """" & JsonEscape(fileName) & """:""" & b64Data & """"
    first = False
Next

' ---- assemble payload ----
' Wrap raw metaJson as-is inside the meta field, files as base64 map
payload = "{""meta"":" & metaJson & ",""files"":{" & filesJson & "}}"

' ---- write output file ----
Dim tsWrite
Set tsWrite = fso.CreateTextFile(outPath, True)  ' True = overwrite
tsWrite.Write payload
tsWrite.Close

WScript.Echo "[OK] Written: " & outPath
WScript.Quit 0

' ---- helper: escape a string for JSON ----
Function JsonEscape(s)
    s = Replace(s, "\",  "\\")
    s = Replace(s, """", "\""")
    s = Replace(s, Chr(8),  "\b")
    s = Replace(s, Chr(9),  "\t")
    s = Replace(s, Chr(10), "\n")
    s = Replace(s, Chr(12), "\f")
    s = Replace(s, Chr(13), "\r")
    JsonEscape = s
End Function
