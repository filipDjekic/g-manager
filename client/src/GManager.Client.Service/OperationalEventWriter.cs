using System.Text.Json;
namespace GManager.Client.Service;
public sealed class OperationalEventWriter {
 readonly string path=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"GManager","Client","operational.jsonl");readonly object gate=new();
 public void Write(string eventCode,string state){var record=JsonSerializer.Serialize(new{timestamp=DateTimeOffset.UtcNow,eventCode,state});lock(gate){Directory.CreateDirectory(Path.GetDirectoryName(path)!);File.AppendAllText(path,record+Environment.NewLine);}}
}
