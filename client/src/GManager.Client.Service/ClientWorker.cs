using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
using GManager.Client.Domain;
namespace GManager.Client.Service;

public sealed class ClientWorker(ClientRuntime runtime, ClientEnvironment environment, ILogger<ClientWorker> logger) : BackgroundService
{
    const int ErrorPipeLocal=229;
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetNamedPipeClientComputerName(SafePipeHandle pipe,StringBuilder name,uint length);
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await runtime.Recover(ct);
        using var lifetime=CancellationTokenSource.CreateLinkedTokenSource(ct);
        var tasks=new[]{RunPipe(false,lifetime.Token),RunPipe(true,lifetime.Token),RefreshLoop(lifetime.Token),DeadlineLoop(lifetime.Token)};
        try { await Task.WhenAny(tasks); lifetime.Cancel(); await Task.WhenAll(tasks); }
        finally { runtime.Shutdown(); }
    }
    async Task RefreshLoop(CancellationToken ct)
    {
        using var timer=new PeriodicTimer(TimeSpan.FromSeconds(10));
        do { await runtime.Refresh(ct); } while(await timer.WaitForNextTickAsync(ct));
    }
    async Task DeadlineLoop(CancellationToken ct)
    {
        using var timer=new PeriodicTimer(TimeSpan.FromSeconds(1));
        while(await timer.WaitForNextTickAsync(ct)) runtime.Tick();
    }
    async Task RunPipe(bool admin,CancellationToken ct)
    {
        while(!ct.IsCancellationRequested)
        {
            try
            {
                await using var pipe=LocalPipeAcl.Create(environment,admin);
                await pipe.WaitForConnectionAsync(ct);
                var computer=new StringBuilder(256);
                if(GetNamedPipeClientComputerName(pipe.SafePipeHandle,computer,(uint)computer.Capacity))
                {
                    if(!computer.ToString().TrimStart('\\').Equals(Environment.MachineName,StringComparison.OrdinalIgnoreCase)) continue;
                }
                else if(Marshal.GetLastPInvokeError()!=ErrorPipeLocal) continue;
                using var timeout=CancellationTokenSource.CreateLinkedTokenSource(ct); timeout.CancelAfter(TimeSpan.FromSeconds(15));
                using var reader=new StreamReader(pipe,new UTF8Encoding(false),false,4096,true);
                using var writer=new StreamWriter(pipe,new UTF8Encoding(false),4096,true) { AutoFlush=true };
                string line=await PipeLine.Read(reader,timeout.Token);
                bool authorized=false;
                string? caller=null;
                pipe.RunAsClient(()=> { using var identity=WindowsIdentity.GetCurrent(); caller=identity.User?.Value; authorized=new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator); });
                var request=JsonSerializer.Deserialize<LocalRequest>(line);
                if(request is null) continue;
                bool playerCaller;
                using(var self=WindowsIdentity.GetCurrent()) playerCaller=caller==(environment.Development?self.User!.Value:environment.PlayerSid);
                if(!admin) authorized=request.Type=="status" || authorized || playerCaller;
                var response=authorized ? await runtime.Handle(request,admin,timeout.Token) : new LocalResponse(false,"Potrebna je administratorska autorizacija kroz UAC.",runtime.State);
                if(request.Type=="status" && !playerCaller && !admin) response=response with { State=response.State with { CustomerName=null,SessionId=null,Heading=response.State.Mode==ClientMode.Active?"Aktivna gaming sesija":response.State.Heading } };
                await writer.WriteLineAsync(JsonSerializer.Serialize(response).AsMemory(),timeout.Token);
            }
            catch(OperationCanceledException) when(ct.IsCancellationRequested) { return; }
            catch(Exception ex) { logger.LogWarning("Local IPC failed: {Type}",ex.GetType().Name); }
        }
    }
}
public static class LocalPipeAcl
{
    public static NamedPipeServerStream Create(ClientEnvironment environment,bool admin)
    {
        var security=new PipeSecurity();
        security.SetAccessRuleProtection(true,false);
        security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null),PipeAccessRights.FullControl,AccessControlType.Allow));
        security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid,null),PipeAccessRights.FullControl,AccessControlType.Allow));
        if(environment.Development) security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User!,PipeAccessRights.FullControl,AccessControlType.Allow));
        else if(!admin) security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.BuiltinUsersSid,null),PipeAccessRights.ReadWrite,AccessControlType.Allow));
        return NamedPipeServerStreamAcl.Create(environment.PipeName+(admin?".Admin":""),PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous|PipeOptions.FirstPipeInstance,4096,4096,security);
    }
}
internal static class PipeLine
{
    public static async Task<string> Read(StreamReader reader,CancellationToken ct)
    {
        var line=new StringBuilder(); var buffer=new char[1];
        while(await reader.ReadAsync(buffer.AsMemory(),ct)!=0) { if(buffer[0]=='\n') return line.ToString(); if(line.Length>=16384) throw new InvalidDataException("IPC message too large"); line.Append(buffer[0]); }
        throw new EndOfStreamException();
    }
}
