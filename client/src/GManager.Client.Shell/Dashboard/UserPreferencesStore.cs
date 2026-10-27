using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace GManager.Client.Shell.Dashboard;

/// <summary>Contains UI preferences and application codes only; never credentials or session authority.</summary>
public sealed class UserPreferencesStore
{
    readonly string directory;
    readonly SemaphoreSlim writes = new(1, 1);
    static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    public UserPreferencesStore(bool development)
    {
        directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "GManager", development ? "Development" : "Client", "UiProfiles");
    }

    public static string AccountKey(string email) => Convert.ToHexString(SHA256.HashData(
        Encoding.UTF8.GetBytes("account:" + email.Trim().ToUpperInvariant())));

    string FileName(string key) => Path.Combine(directory, Convert.ToHexString(
        SHA256.HashData(Encoding.UTF8.GetBytes(key))) + ".json");

    public async Task<UserPreferences> LoadAsync(string key)
    {
        try
        {
            string path = FileName(key);
            if (!File.Exists(path)) return new();
            // UI configuration is untrusted and must not cause unbounded allocation.
            if (new FileInfo(path).Length > 131072) return new();
            var value = JsonSerializer.Deserialize<UserPreferences>(await File.ReadAllTextAsync(path), Json) ?? new();
            value.Favorites = (value.Favorites ?? []).Where(x => !string.IsNullOrWhiteSpace(x) && x.Length <= 256)
                .Take(1024).ToHashSet(StringComparer.OrdinalIgnoreCase);
            return value;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException or ArgumentException)
        { return new(); }
    }

    // Serialize on the dispatcher before the first await; later UI edits cannot mutate this snapshot.
    public Task SaveAsync(string key, UserPreferences value) => SaveSnapshotAsync(FileName(key), JsonSerializer.Serialize(value, Json));

    async Task SaveSnapshotAsync(string path, string json)
    {
        await writes.WaitAsync();
        string temporary = path + ".tmp";
        try
        {
            Directory.CreateDirectory(directory);
            await File.WriteAllTextAsync(temporary, json);
            File.Move(temporary, path, true);
        }
        finally { writes.Release(); }
    }
}
