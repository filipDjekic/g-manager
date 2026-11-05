using System.IO;
using System.Security.Principal;
using System.Windows;
namespace GManager.Client.Shell;
public partial class App : Application
{
    FileStream? instance;
    protected override void OnStartup(StartupEventArgs e)
    {
        if (e.Args.Contains("--development",StringComparer.OrdinalIgnoreCase))
        {
            string directory=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"GManager","Development");
            Directory.CreateDirectory(directory);
            try { instance=new FileStream(Path.Combine(directory,"shell.instance"),FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None); }
            catch(IOException) { Shutdown(); return; }
        }
        base.OnStartup(e);
    }
    protected override void OnExit(ExitEventArgs e) { instance?.Dispose(); base.OnExit(e); }
}
