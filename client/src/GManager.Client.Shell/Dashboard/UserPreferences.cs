using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;

namespace GManager.Client.Shell.Dashboard;

public sealed class UserPreferences : INotifyPropertyChanged
{
    bool neonTheme = true, animations = true, expiryWarning = true;
    bool notificationSound, interfaceSound, compactApplications, largeCountdown = true;
    double neonIntensity = 60;
    public event PropertyChangedEventHandler? PropertyChanged;
    public bool NeonTheme { get => neonTheme; set { if (Set(ref neonTheme, value)) Changed(nameof(DarkTheme)); } }
    [JsonIgnore]
    public bool DarkTheme { get => !NeonTheme; set => NeonTheme = !value; }
    public double NeonIntensity { get => neonIntensity; set => Set(ref neonIntensity, double.IsFinite(value) ? Math.Clamp(value, 0, 100) : 60); }
    public bool Animations { get => animations; set => Set(ref animations, value); }
    public bool ExpiryWarning { get => expiryWarning; set => Set(ref expiryWarning, value); }
    public bool NotificationSound { get => notificationSound; set => Set(ref notificationSound, value); }
    public bool InterfaceSound { get => interfaceSound; set => Set(ref interfaceSound, value); }
    public bool CompactApplications { get => compactApplications; set => Set(ref compactApplications, value); }
    public bool LargeCountdown { get => largeCountdown; set => Set(ref largeCountdown, value); }
    public HashSet<string> Favorites { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    bool Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value)) return false;
        field = value;
        Changed(name);
        return true;
    }
    void Changed(string? name) => PropertyChanged?.Invoke(this, new(name));
}
