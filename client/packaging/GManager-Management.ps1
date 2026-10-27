# Release signing is mandatory. Launch from a separate elevated Windows administrator session.
param()
. (Join-Path $PSScriptRoot 'client-management.ps1')
Assert-Administrator
$config=Read-ClientConfig
if($config.Client.Mode -ne 'Production'){throw 'Management panel zahteva instalirani produkcioni Client.'}
if([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -eq $config.Client.PlayerSid){throw 'Koristite zaseban Windows administratorski nalog, van sesije igrača.'}
$cli=Join-Path $PSScriptRoot 'gmanagerctl.ps1'
Assert-Signature $cli $config.Package.SigningSubject $config.Package.SigningThumbprint
Assert-Signature $PSCommandPath $config.Package.SigningSubject $config.Package.SigningThumbprint
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
[xml]$markup=@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
 Title="G-Manager · Client Management" Width="800" Height="720" MinWidth="640" MinHeight="560" WindowStartupLocation="CenterScreen" Background="#10121B" Foreground="#F1F4FA" FontFamily="Segoe UI">
 <Window.Resources>
  <Style TargetType="Button"><Setter Property="Background" Value="#1E2635"/><Setter Property="Foreground" Value="#F1F4FA"/><Setter Property="BorderBrush" Value="#2D3748"/><Setter Property="Padding" Value="16,10"/><Setter Property="Margin" Value="0,0,10,10"/><Setter Property="MinHeight" Value="44"/><Setter Property="Cursor" Value="Hand"/></Style>
  <Style TargetType="TextBlock"><Setter Property="TextWrapping" Value="Wrap"/></Style>
 </Window.Resources>
 <ScrollViewer VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Disabled"><Grid Margin="24"><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
  <StackPanel><TextBlock Text="G-MANAGER" Foreground="#00D9FF" FontSize="25" FontWeight="Bold"/><TextBlock Text="Client Management" FontSize="20" Margin="0,6,0,8"/><TextBlock Text="Lokalna Windows administracija · zaseban administratorski nalog" Foreground="#9BA5B8"/></StackPanel>
  <Border Grid.Row="1" Background="#171D2B" BorderBrush="#2D3748" BorderThickness="1" CornerRadius="12" Padding="16" Margin="0,18,0,18"><TextBlock x:Name="Status" FontSize="14"/></Border>
  <WrapPanel Grid.Row="2" x:Name="Actions">
   <Button x:Name="Update" Content="Update Client"/><Button x:Name="Restart" Content="Restart Client"/><Button x:Name="ExitShell" Content="Exit Client"/>
   <Button x:Name="Enable" Content="Enable Maintenance"/><Button x:Name="Disable" Content="Disable Maintenance"/>
   <Button x:Name="Diagnostics" Content="Diagnostics"/><Button x:Name="Uninstall" Content="Uninstall Client" Foreground="#FF9095"/>
  </WrapPanel>
  <StackPanel Grid.Row="3" Margin="0,0,0,14">
   <TextBlock Text="Održavanje traje 15 minuta i automatski vraća zaštitu. Exit zatvara Shell kroz maintenance; servis i recovery ostaju aktivni." Foreground="#9BA5B8"/>
   <CheckBox x:Name="Purge" Content="Pri deinstalaciji trajno obriši lokalni identitet i konfiguraciju" Foreground="#FF9095" Margin="0,12,0,6"/>
   <TextBox x:Name="PurgeText" IsEnabled="False" Height="30" MaxLength="6" Background="#1E2635" Foreground="#F1F4FA" BorderBrush="#2D3748" ToolTip="Za trajno brisanje unesite OBRISI" AutomationProperties.Name="Potvrda trajnog brisanja: unesite OBRISI"/>
  </StackPanel>
  <TextBox Grid.Row="4" x:Name="Output" MinHeight="120" IsReadOnly="True" AcceptsReturn="True" TextWrapping="Wrap" VerticalScrollBarVisibility="Auto" Background="#0D1220" Foreground="#9BA5B8" BorderBrush="#2D3748" Padding="12" AutomationProperties.Name="Rezultat administratorske operacije"/>
  <DockPanel Grid.Row="5" Margin="0,14,0,0"><TextBlock x:Name="Result" Text="Spremno." VerticalAlignment="Center"/><Button x:Name="Refresh" Content="Osveži status" HorizontalAlignment="Right" Margin="12,0,0,0"/></DockPanel>
 </Grid></ScrollViewer>
</Window>
'@
$reader=[Xml.XmlNodeReader]::new($markup)
$window=[Windows.Markup.XamlReader]::Load($reader)
$controls=@{}
foreach($name in @('Status','Actions','Output','Result','Update','Restart','ExitShell','Enable','Disable','Diagnostics','Uninstall','Refresh','Purge','PurgeText')){$controls[$name]=$window.FindName($name)}
$script:managementProcess=$null
$script:managementStdout=$null
$script:managementStderr=$null

function Update-ManagementStatus {
    try{
        $value=Read-ClientConfig
        $service=Get-Service GManagerClient -ErrorAction SilentlyContinue
        $serviceStatus=if($service){[string]$service.Status}else{'Nije instaliran'}
        $connection='Nepoznata';$mode='Nepoznato'
        # Reading health avoids blocking the WPF dispatcher while a pipe or backend is unavailable.
        $healthPath=Join-Path $script:ClientState 'health.json'
        if(Test-Path -LiteralPath $healthPath){
            $health=Get-Content -LiteralPath $healthPath -Raw|ConvertFrom-Json
            $connection=if([DateTimeOffset]::Parse($health.timestamp) -lt [DateTimeOffset]::UtcNow.AddSeconds(-30)){'Zastareo health signal'}elseif($health.errorCode -in @('BACKEND_UNAVAILABLE','BACKEND_TIMEOUT')){'Server nije dostupan'}elseif($health.PSObject.Properties.Name -contains 'serverConnected' -and $health.serverConnected -eq $true){'Povezan'}elseif($health.initialized){'Nepotvrđena veza; pokrenite Diagnostics'}else{'Inicijalizacija'}
        }
        $lease=Get-Maintenance
        $mode=if($lease){'Aktivno do '+(Get-Content -LiteralPath (Join-Path $script:ClientState 'maintenance.json') -Raw|ConvertFrom-Json).ExpiresAt}else{'Isključeno'}
        $enrolled=if(Test-Path -LiteralPath (Join-Path $script:ClientState 'identity.dpapi')){'Identitet sačuvan'}else{'Enrollment potreban'}
        $update='Nepoznato';$updatePath=Join-Path $script:ClientState 'update-status.json'
        if(Test-Path -LiteralPath $updatePath){$update=(Get-Content -LiteralPath $updatePath -Raw|ConvertFrom-Json).status}
        $controls.Status.Text="Installed version: $($value.Client.Version)`nService: $serviceStatus`nBackend: $connection`nEnrollment: $enrolled`nMaintenance: $mode`nUpdate: $update"
    }catch{$controls.Status.Text='Status nije dostupan. Pokrenite Diagnostics ili recovery CLI iz administratorske sesije.'}
}
function Start-ManagementAction([string]$Action) {
    if($script:managementProcess){return}
    if($Action -notin @('update','restart','exit','enable','disable','diagnostics','uninstall')){throw 'Nepodržana management akcija.'}
    $arguments='-NoProfile -NonInteractive -ExecutionPolicy AllSigned -File "'+$cli+'" '
    switch($Action){
        'enable'{$arguments+='maintenance enable -Minutes 15'}
        'disable'{$arguments+='maintenance disable'}
        'uninstall'{
            if($controls.Purge.IsChecked -and $controls.PurgeText.Text -cne 'OBRISI'){$controls.Result.Text='Za trajno brisanje unesite OBRISI.';return}
            $message=if($controls.Purge.IsChecked){'Trajno obrisati Client, lokalni identitet i konfiguraciju? Biće potreban novi enrollment.'}else{'Ukloniti Client i njegova Windows pravila? Lokalni identitet i konfiguracija ostaju sačuvani.'}
            if([Windows.MessageBox]::Show($window,$message+' Aktivna sesija igrača biće prekinuta.','Potvrda deinstalacije','YesNo','Warning','No') -ne 'Yes'){return}
            $arguments+='uninstall'
            if($controls.Purge.IsChecked){$arguments+=' -PurgeData -PurgeConfirmation OBRISI'}
        }
        default{$arguments+=$Action}
    }
    if($Action -in @('enable','restart','exit')){
        if([Windows.MessageBox]::Show($window,'Ova operacija odjavljuje Windows nalog igrača. Aktivnu gaming sesiju prvo završite u G-Manager aplikaciji; prekinuta sesija zahteva usaglašavanje sa serverom. Nastaviti?','Potvrda održavanja','YesNo','Warning','No') -ne 'Yes'){return}
    }
    try{
        $info=[Diagnostics.ProcessStartInfo]::new($script:PowerShell,$arguments)
        $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
        $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
        $script:managementProcess=[Diagnostics.Process]::Start($info)
        $script:managementStdout=$script:managementProcess.StandardOutput.ReadToEndAsync()
        $script:managementStderr=$script:managementProcess.StandardError.ReadToEndAsync()
        $controls.Actions.IsEnabled=$false;$controls.Purge.IsEnabled=$false;$controls.PurgeText.IsEnabled=$false
        $controls.Output.Text='';$controls.Result.Text='Operacija je u toku…'
    }catch{$controls.Result.Text='Operaciju nije moguće pokrenuti. Proverite instalaciju i digitalni potpis.';$script:managementProcess=$null}
}
foreach($entry in @{Update='update';Restart='restart';ExitShell='exit';Enable='enable';Disable='disable';Diagnostics='diagnostics';Uninstall='uninstall'}.GetEnumerator()){
    $action=$entry.Value
    $controls[$entry.Key].Add_Click({Start-ManagementAction $action}.GetNewClosure())
}
$controls.Purge.Add_Checked({$controls.PurgeText.IsEnabled=$true})
$controls.Purge.Add_Unchecked({$controls.PurgeText.IsEnabled=$false;$controls.PurgeText.Text=''})
$controls.Refresh.Add_Click({Update-ManagementStatus})
$timer=[Windows.Threading.DispatcherTimer]::new();$timer.Interval=[TimeSpan]::FromSeconds(1)
$timer.Add_Tick({
    if($script:managementProcess -and $script:managementProcess.HasExited -and $script:managementStdout.IsCompleted -and $script:managementStderr.IsCompleted){
        $code=$script:managementProcess.ExitCode
        # Child tools already emit user-facing messages; no exception dump is presented by this panel.
        $controls.Output.Text=$script:managementStdout.Result
        if($code -ne 0){$controls.Output.Text+="`nOperacija nije završena. Zaštićeni management audit i recovery CLI sadrže podatke za oporavak."}
        $controls.Result.Text=if($code -eq 0){'Operacija je završena.'}else{'Operacija nije uspela. Proverite status i recovery.'}
        $script:managementProcess.Dispose();$script:managementProcess=$null
        $controls.Actions.IsEnabled=$true;$controls.Purge.IsEnabled=$true;$controls.PurgeText.IsEnabled=[bool]$controls.Purge.IsChecked
        Update-ManagementStatus
    }
})
$window.Add_Closing({param($sender,$event) if($script:managementProcess){$event.Cancel=$true;$controls.Result.Text='Sačekajte završetak operacije pre zatvaranja panela.'}})
Update-ManagementStatus
$timer.Start()
try{[void]$window.ShowDialog()}finally{$timer.Stop()}
