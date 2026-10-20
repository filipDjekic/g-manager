using System.Security.Cryptography;using System.Text.Json;using GManager.Client.Protocol;using NSec.Cryptography;
namespace GManager.Client.Service;
public sealed record StoredIdentity(Guid IdentityId,Guid StationId,long KeyVersion,byte[] PrivateKey);
public sealed class ProtectedIdentityStore(ClientEnvironment environment) {
 readonly string directory=environment.StateDirectory;
 string IdentityPath=>Path.Combine(directory,"identity.dpapi");public string SnapshotPath=>Path.Combine(directory,"snapshot.json");public string PolicySnapshotPath=>Path.Combine(directory,"station-policy.json");
 DataProtectionScope Scope=>environment.Development?DataProtectionScope.CurrentUser:DataProtectionScope.LocalMachine;
 public StoredIdentity? Load(){if(!File.Exists(IdentityPath))return null;var bytes=ProtectedData.Unprotect(File.ReadAllBytes(IdentityPath),null,Scope);try{return JsonSerializer.Deserialize<StoredIdentity>(bytes);}finally{CryptographicOperations.ZeroMemory(bytes);}}
 public void Save(StoredIdentity value){Directory.CreateDirectory(directory);var clear=JsonSerializer.SerializeToUtf8Bytes(value);try{var encrypted=ProtectedData.Protect(clear,null,Scope);AtomicWrite(IdentityPath,encrypted);}finally{CryptographicOperations.ZeroMemory(clear);}}
 public void SaveSnapshot(object value){Directory.CreateDirectory(directory);AtomicWrite(SnapshotPath,JsonSerializer.SerializeToUtf8Bytes(value));}
 public T? LoadSnapshot<T>()=>File.Exists(SnapshotPath)?JsonSerializer.Deserialize<T>(File.ReadAllBytes(SnapshotPath)):default;
 public void SavePolicy<T>(T value){Directory.CreateDirectory(directory);AtomicWrite(PolicySnapshotPath,JsonSerializer.SerializeToUtf8Bytes(value));}
 public T? LoadPolicy<T>()=>File.Exists(PolicySnapshotPath)?JsonSerializer.Deserialize<T>(File.ReadAllBytes(PolicySnapshotPath)):default;
 public static void AtomicWrite(string path,byte[] bytes){var temp=path+".tmp";using(var file=new FileStream(temp,FileMode.Create,FileAccess.Write,FileShare.None,4096,FileOptions.WriteThrough)){file.Write(bytes);file.Flush(true);}for(int attempt=0;;attempt++){try{File.Move(temp,path,true);break;}catch(IOException)when(attempt<9){Thread.Sleep(25);}}}
}
public sealed class Ed25519Signer: IChallengeSigner,IDisposable {static readonly SignatureAlgorithm Algorithm=SignatureAlgorithm.Ed25519;readonly Key key;public Ed25519Signer(byte[]? raw=null){key=raw is null?Key.Create(Algorithm,new KeyCreationParameters{ExportPolicy=KeyExportPolicies.AllowPlaintextExport}):Key.Import(Algorithm,raw,KeyBlobFormat.RawPrivateKey,new KeyCreationParameters{ExportPolicy=KeyExportPolicies.AllowPlaintextExport});}public byte[] Export()=>key.Export(KeyBlobFormat.RawPrivateKey);public string PublicKeyBase64=>Convert.ToBase64String(key.PublicKey.Export(KeyBlobFormat.PkixPublicKey));public string Sign(string value)=>Convert.ToBase64String(Algorithm.Sign(key,System.Text.Encoding.UTF8.GetBytes(value))).TrimEnd('=').Replace('+','-').Replace('/','_');public void Dispose()=>key.Dispose();}
