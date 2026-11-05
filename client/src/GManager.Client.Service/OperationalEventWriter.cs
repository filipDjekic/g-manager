using GManager.Client.Protocol;using System.Security.Cryptography;using System.Text.Json;
namespace GManager.Client.Service;
public sealed class OperationalEventWriter(ClientEnvironment environment) : IMachineProtocolDiagnostics {
 public void ApiFailed(MachineApiFailure failure) {
  if(!environment.Development)return;
  var record=JsonSerializer.Serialize(new{timestamp=failure.Timestamp,eventCode="DEVELOPMENT_API_FAILURE",
   method=failure.Method,path=failure.Path,statusCode=failure.StatusCode,phase=failure.Phase,errorCode=failure.ErrorCode,message=failure.Message});
  try{Append(record);}catch(IOException){}catch(UnauthorizedAccessException){}
 }
 internal const string CryptographicPhaseKey="GManager.Development.CryptographicPhase";
 internal const string CurrentVersionKey="GManager.Development.CurrentConfigurationVersion";
 internal const string ReceivedVersionKey="GManager.Development.ReceivedConfigurationVersion";
 readonly string path=Path.Combine(environment.StateDirectory,"operational.jsonl");readonly object gate=new();
 public void Write(string eventCode,string state){var record=JsonSerializer.Serialize(new{timestamp=DateTimeOffset.UtcNow,eventCode,state});Append(record);}
 internal static void MarkCryptographicPhase(CryptographicException exception,CryptographicFailurePhase phase){if(!exception.Data.Contains(CryptographicPhaseKey))exception.Data[CryptographicPhaseKey]=phase;}
 internal void WriteDevelopmentCryptographicFailure(string operation,CryptographicFailurePhase phase,CryptographicException exception){
  if(!environment.Development)return;
  if(exception.Data[CryptographicPhaseKey] is CryptographicFailurePhase precisePhase)phase=precisePhase;
  // Verification exceptions carry validation/cryptography messages, never request/envelope data.
  // Do not serialize the exception, its Data/InnerException, credentials or signed objects.
  string message=exception.Message;
  if(message.Length>512)message=message[..512];
  var record=JsonSerializer.Serialize(new{timestamp=DateTimeOffset.UtcNow,eventCode="DEVELOPMENT_CRYPTOGRAPHIC_FAILURE",operation,phase=phase.ToString(),message,hresult=exception.HResult,
   currentConfigurationVersion=exception.Data[CurrentVersionKey] as long?,receivedConfigurationVersion=exception.Data[ReceivedVersionKey] as long?});
  // A diagnostic write must not replace the original failure or prevent the existing local lock.
  try{Append(record);}catch(IOException){}catch(UnauthorizedAccessException){}
 }
 void Append(string record){lock(gate){Directory.CreateDirectory(Path.GetDirectoryName(path)!);File.AppendAllText(path,record+Environment.NewLine);}}
}
internal enum CryptographicFailurePhase { Recovery,Authentication,ConfigurationSignature,ConfigurationScope,ConfigurationVersion,ApplicationValidation,SessionLeaseVerification,LocalPolicyUpdate,LocalAction }
