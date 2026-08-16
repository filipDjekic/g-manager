using System.Security.Cryptography;using System.Text.Json;using GManager.Client.Protocol;using NSec.Cryptography;
namespace GManager.Client.Service;
public sealed record StoredIdentity(Guid IdentityId,Guid StationId,long KeyVersion,byte[] PrivateKey);
public sealed class ProtectedIdentityStore {
 readonly string directory=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"GManager","Client");
 string IdentityPath=>Path.Combine(directory,"identity.dpapi");public string SnapshotPath=>Path.Combine(directory,"snapshot.json");public string PolicySnapshotPath=>Path.Combine(directory,"station-policy.json");
 public StoredIdentity? Load(){if(!File.Exists(IdentityPath))return null;var bytes=ProtectedData.Unprotect(File.ReadAllBytes(IdentityPath),null,DataProtectionScope.LocalMachine);return JsonSerializer.Deserialize<StoredIdentity>(bytes);}
 public void Save(StoredIdentity value){Directory.CreateDirectory(directory);var clear=JsonSerializer.SerializeToUtf8Bytes(value);var encrypted=ProtectedData.Protect(clear,null,DataProtectionScope.LocalMachine);AtomicWrite(IdentityPath,encrypted);CryptographicOperations.ZeroMemory(clear);}
 public void SaveSnapshot(object value){Directory.CreateDirectory(directory);AtomicWrite(SnapshotPath,JsonSerializer.SerializeToUtf8Bytes(value));}
 public T? LoadSnapshot<T>()=>File.Exists(SnapshotPath)?JsonSerializer.Deserialize<T>(File.ReadAllBytes(SnapshotPath)):default;
 public void SavePolicy<T>(T value){Directory.CreateDirectory(directory);AtomicWrite(PolicySnapshotPath,JsonSerializer.SerializeToUtf8Bytes(value));}
 public T? LoadPolicy<T>()=>File.Exists(PolicySnapshotPath)?JsonSerializer.Deserialize<T>(File.ReadAllBytes(PolicySnapshotPath)):default;
 static void AtomicWrite(string path,byte[] bytes){var temp=path+".tmp";File.WriteAllBytes(temp,bytes);File.Move(temp,path,true);}
}
public sealed class Ed25519Signer: IChallengeSigner,IDisposable {static readonly SignatureAlgorithm Algorithm=SignatureAlgorithm.Ed25519;readonly Key key;public Ed25519Signer(byte[]? raw=null){key=raw is null?Key.Create(Algorithm,new KeyCreationParameters{ExportPolicy=KeyExportPolicies.AllowPlaintextExport}):Key.Import(Algorithm,raw,KeyBlobFormat.RawPrivateKey,new KeyCreationParameters{ExportPolicy=KeyExportPolicies.AllowPlaintextExport});}public byte[] Export()=>key.Export(KeyBlobFormat.RawPrivateKey);public string PublicKeyBase64=>Convert.ToBase64String(key.PublicKey.Export(KeyBlobFormat.PkixPublicKey));public string Sign(string value)=>Convert.ToBase64String(Algorithm.Sign(key,System.Text.Encoding.UTF8.GetBytes(value))).TrimEnd('=').Replace('+','-').Replace('/','_');public void Dispose()=>key.Dispose();}
