' tools\save_world.vbs
'
' Decodes a Base-64 string and writes the raw bytes to a binary file.
'
' Arguments:
'   WScript.Arguments(0) – Base64-encoded world payload
'   WScript.Arguments(1) – Output file path (e.g. worlds\mySave.world)
'
' Called by save_world.bat via:
'   cscript //nologo save_world.vbs <base64> <outputpath>

Option Explicit

If WScript.Arguments.Count < 2 Then
    WScript.StdErr.WriteLine "Usage: save_world.vbs <base64_string> <output_file>"
    WScript.Quit 1
End If

Dim strBase64 : strBase64 = WScript.Arguments(0)
Dim strOutput : strOutput = WScript.Arguments(1)

' ── Decode Base64 using MSXML2.DOMDocument ────────────────────────────────────
' MSXML's Base64 decode is built into every modern Windows installation
' and requires no extra components.

Dim oXML  : Set oXML  = CreateObject("MSXML2.DOMDocument")
Dim oNode : Set oNode = oXML.createElement("b64")
oNode.dataType = "bin.base64"
oNode.text     = strBase64

Dim arrBytes : arrBytes = oNode.nodeTypedValue  ' VT_ARRAY|VT_UI1

Set oNode = Nothing
Set oXML  = Nothing

' ── Write raw bytes to file using ADODB.Stream ───────────────────────────────
Dim oStream : Set oStream = CreateObject("ADODB.Stream")
oStream.Type   = 1   ' adTypeBinary
oStream.Open
oStream.Write arrBytes
oStream.SaveToFile strOutput, 2   ' adSaveCreateOverWrite
oStream.Close
Set oStream = Nothing

WScript.StdOut.WriteLine "[save_world.vbs] Written: " & strOutput
WScript.Quit 0
