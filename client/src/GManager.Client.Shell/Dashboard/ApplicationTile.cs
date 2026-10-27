using System.ComponentModel;
using System.Runtime.CompilerServices;
using GManager.Client.Domain;

namespace GManager.Client.Shell.Dashboard;

public sealed class ApplicationTile(ClientApplication application, bool favorite) : INotifyPropertyChanged
{
    bool favorite = favorite;
    public ClientApplication Application { get; } = application;
    public string Code => Application.Code;
    public string Name => Application.Name;
    public string Category => Application.Type switch { "GAME" => "Igra", "LAUNCHER" => "Platforma za igre", _ => "Aplikacija" };
    public bool IsFavorite { get => favorite; set { if (favorite == value) return; favorite = value; Changed(); } }
    public event PropertyChangedEventHandler? PropertyChanged;
    void Changed([CallerMemberName] string? name = null) => PropertyChanged?.Invoke(this, new(name));
}

public sealed record DashboardNotification(string Message, string Time, bool Warning);
