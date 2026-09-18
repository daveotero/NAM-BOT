param([long]$WindowHandle, [string]$PointsJson)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ShellHitTest {
  [DllImport("user32.dll")]
  public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr wParam,
    IntPtr lParam, uint flags, uint timeout, out IntPtr result);
}
'@
[void][ShellHitTest]::SetThreadDpiAwarenessContext([IntPtr](-4))
$results = foreach ($point in ($PointsJson | ConvertFrom-Json)) {
  $packed = ([long]$point.x -band 65535) -bor (([long]$point.y -band 65535) -shl 16)
  $hit = [IntPtr]::Zero
  $sent = [ShellHitTest]::SendMessageTimeout([IntPtr]$WindowHandle, 0x84, [IntPtr]::Zero, [IntPtr]$packed, 2, 2000, [ref]$hit)
  if ($sent -eq [IntPtr]::Zero) { throw 'Native window hit test timed out' }
  @{ name = $point.name; hit = $hit.ToInt64() }
}
ConvertTo-Json -InputObject @($results) -Compress
