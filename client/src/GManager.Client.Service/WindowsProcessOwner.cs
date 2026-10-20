using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;
namespace GManager.Client.Service;

internal static class WindowsProcessOwner
{
    [DllImport("kernel32.dll",SetLastError=true)] static extern SafeProcessHandle OpenProcess(uint access,bool inherit,int processId);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out SafeAccessTokenHandle token);
    public static bool IsPlayer(Process process,string sid)
    {
        using var handle=OpenProcess(0x1000,false,process.Id);
        if(handle.IsInvalid || !OpenProcessToken(handle.DangerousGetHandle(),8,out var token)) return false;
        using(token) using(var identity=new WindowsIdentity(token.DangerousGetHandle())) return identity.User?.Value == sid;
    }
}
