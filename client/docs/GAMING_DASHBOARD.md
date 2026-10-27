# Gaming dashboard

The WPF Shell mounts `Views/DashboardView` only for an active, identified, unexpired session. `MainWindow` remains the IPC boundary: the dashboard emits an application code or a logout request, and the Shell sends the existing `launch` or `logout` command. Both layers check the current approved list and UI state; the Service remains responsible for authorization, leases, signed policy and Windows enforcement.

The existing Shell dispatcher timer updates the local clock and the existing monotonic/server-offset countdown. All timer displays receive that same remaining value. Status responses started before an action are discarded after that action, so a delayed poll cannot restore an older login/session screen. Application cards are rebuilt only when the approved list or profile changes. Search and favorite filtering run locally on that list.

`ClientViewState.ServerConnected` is optional display telemetry. The Service observes successful backend responses, transport failures and timeouts and projects this value into local IPC responses. It never uses this field for authorization, lease decisions or enforcement. Missing telemetry is shown as an unconfirmed connection, including when talking to an older Service.

## Data limitations

The local contract does not expose the session start, total duration, backend station name/location, stable customer ID or application image assets. The UI identifies the Windows computer using `Environment.MachineName`, explicitly marks unavailable start data, uses category icons and shows an indeterminate striped timer rail without a percentage. It does not infer a start time from login or client startup.

## Local preferences

Preferences and favorites are stored beneath `%LOCALAPPDATA%\GManager\Client\UiProfiles` (production) or `%LOCALAPPDATA%\GManager\Development\UiProfiles` (development). A normalized login email is hashed in memory to choose an account profile; the configuration contains only appearance/audio/notification settings and approved application codes. Email addresses, passwords, tokens, executable paths and session permissions are not stored.

If the Shell attaches to an already active session without observing its login, preferences are scoped to the session ID. Names are never used as account identifiers. Profile loading is asynchronous and guarded against late responses from a previous session. Writes are debounced, serialized and replaced atomically; failures leave the current UI usable. Logout flushes pending settings and removes the previous user's view state. A saved favorite can never add an application to the approved list.

The Dark/Neon Dark choice and neon intensity control dashboard lighting and surfaces; animations affect page transitions only. Application density, countdown size, expiry alerts, notification sounds and interface sounds take effect locally and do not change station policy or session duration.

## Validation

Build `src/GManager.Client.Shell/GManager.Client.Shell.csproj` and `src/GManager.Client.Service/GManager.Client.Service.csproj` with the .NET 10 SDK. The new XAML dictionaries and view use the WPF SDK's default `Page` compilation and are embedded in the Shell assembly, including after publish. No external images, fonts or UI packages are required.

At 1920×1080 the standard application grid uses four columns. Smaller layouts reduce the column count and scroll the page; at logical widths below 1150 pixels the right rail is hidden and its session details remain available through Information. The sidebar and status bar remain present. Production fullscreen, topmost and close restrictions are unchanged.
