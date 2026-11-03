using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
namespace GManager.Client.Service;

/// <summary>Closes only logons owned by the configured player SID. Never deletes profiles or game saves.</summary>
internal static class WindowsSessionPrivacy
{
    [DllImport("wtsapi32.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool WTSLogoffSession(IntPtr server,int sessionId,[MarshalAs(UnmanagedType.Bool)] bool wait);
    public static void LogOffPlayer(string playerSid)
    {
        var sessions=new HashSet<int>();
        foreach(var process in Process.GetProcesses()) using(process) {
            try { if(process.SessionId>0 && WindowsProcessOwner.IsPlayer(process,playerSid)) sessions.Add(process.SessionId); }
            catch(InvalidOperationException) { }
        }
        foreach(int sessionId in sessions)
            if(!WTSLogoffSession(IntPtr.Zero,sessionId,true)) throw new InvalidOperationException("Windows player logoff failed; privacy review is required",new Win32Exception(Marshal.GetLastWin32Error()));
    }
}
