param([long]$WindowHandle)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct PropertyKey {
  public Guid format;
  public uint id;
}

[StructLayout(LayoutKind.Explicit, Size = 24)]
public struct PropertyValue {
  [FieldOffset(0)] public ushort type;
  [FieldOffset(8)] public IntPtr text;
}

[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface WindowPropertyStore {
  void GetCount(out uint count);
  void GetAt(uint index, out PropertyKey key);
  void GetValue(ref PropertyKey key, out PropertyValue value);
  void SetValue(ref PropertyKey key, ref PropertyValue value);
  void Commit();
}

public static class WindowAppDetails {
  [DllImport("shell32.dll", PreserveSig = false)]
  private static extern void SHGetPropertyStoreForWindow(IntPtr window, ref Guid iid,
    [MarshalAs(UnmanagedType.Interface)] out WindowPropertyStore store);
  [DllImport("ole32.dll")]
  private static extern int PropVariantClear(ref PropertyValue value);

  public static string Read(long handle, uint id) {
    var iid = typeof(WindowPropertyStore).GUID;
    WindowPropertyStore store;
    SHGetPropertyStoreForWindow(new IntPtr(handle), ref iid, out store);
    try {
      var key = new PropertyKey { format = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), id = id };
      PropertyValue value;
      store.GetValue(ref key, out value);
      try {
        if (value.type != 31) throw new InvalidOperationException("Expected a Windows string property, got " + value.type);
        return Marshal.PtrToStringUni(value.text);
      } finally { PropVariantClear(ref value); }
    } finally { Marshal.ReleaseComObject(store); }
  }
}
'@
@{
  appId = [WindowAppDetails]::Read($WindowHandle, 5)
  relaunchDisplayName = [WindowAppDetails]::Read($WindowHandle, 4)
  relaunchCommand = [WindowAppDetails]::Read($WindowHandle, 2)
  relaunchIcon = [WindowAppDetails]::Read($WindowHandle, 3)
} | ConvertTo-Json -Compress
