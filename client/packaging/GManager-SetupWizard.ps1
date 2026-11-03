param([string]$PackageDirectory=$PSScriptRoot)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
if(!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
    [Windows.MessageBox]::Show('Pokrenite GManager-Setup.cmd kroz Run as administrator iz zasebnog administratorskog naloga.','G-Manager Setup')|Out-Null;exit 1
}
$signature=Get-AuthenticodeSignature -LiteralPath $PSCommandPath
if($signature.Status -ne 'Valid' -or !$signature.SignerCertificate){throw 'Setup nema pouzdan digitalni potpis.'}
$publisher=$signature.SignerCertificate
foreach($name in @('client-management.ps1','GManager-Setup.ps1')){
    $trusted=Get-AuthenticodeSignature -LiteralPath (Join-Path $PackageDirectory $name)
    if($trusted.Status -ne 'Valid' -or $trusted.SignerCertificate.Thumbprint -ine $publisher.Thumbprint){throw 'Setup komponente nemaju isti pouzdan potpis.'}
}
. (Join-Path $PackageDirectory 'client-management.ps1')
[xml]$layout=@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" Title="G-Manager Setup" Width="720" Height="730" WindowStartupLocation="CenterScreen">
 <ScrollViewer VerticalScrollBarVisibility="Auto"><StackPanel Margin="28">
  <TextBlock FontSize="28" FontWeight="Bold" Text="Dobro došli u G-Manager"/>
  <TextBlock Margin="0,10,0,16" TextWrapping="Wrap" Text="Povežite ovaj računar sa svojom igraonicom. Pripremite standardni Windows nalog igrača i jednokratni kod iz web aplikacije. Setup proverava mogućnosti Windows-a i bezbedno vraća prethodno stanje ako instalacija ne uspe."/>
  <TextBlock Name="Publisher" TextWrapping="Wrap"/>
  <TextBlock Margin="0,14,0,4" Text="HTTPS adresa vašeg G-Manager servera"/><TextBox Name="Server" Height="30"/>
  <Button Name="Check" Content="Proveri server i izdavača" Margin="0,10,0,10" Height="34"/>
  <TextBlock Name="Identity" TextWrapping="Wrap"/>
  <TextBlock Margin="0,14,0,4" Text="Postojeći standardni Windows nalog igrača"/><TextBox Name="Player" Height="30"/>
  <TextBlock Margin="0,14,0,4" Text="Jednokratni enrollment kod"/><PasswordBox Name="Enrollment" Height="30"/>
  <CheckBox Name="Confirm" Margin="0,16,0,10"><TextBlock TextWrapping="Wrap" Text="Potvrđujem adresu svog servera i prikazanog izdavača. Instaliram na namenskom gaming računaru, iz zasebnog administratorskog naloga."/></CheckBox>
  <Button Name="Install" Content="Proveri računar i instaliraj" Height="42" IsEnabled="False"/>
  <TextBox Name="Progress" Margin="0,14,0,0" Height="190" IsReadOnly="True" TextWrapping="Wrap" VerticalScrollBarVisibility="Auto"/>
  <TextBlock Name="Result" Margin="0,12,0,0" TextWrapping="Wrap" FontWeight="Bold"/>
 </StackPanel></ScrollViewer>
</Window>
'@
$window=[Windows.Markup.XamlReader]::Load([Xml.XmlNodeReader]::new($layout))
$server=$window.FindName('Server');$player=$window.FindName('Player');$enrollment=$window.FindName('Enrollment')
$check=$window.FindName('Check');$install=$window.FindName('Install');$confirm=$window.FindName('Confirm')
$progress=$window.FindName('Progress');$identity=$window.FindName('Identity');$result=$window.FindName('Result')
$window.FindName('Publisher').Text='Izdavač: '+$publisher.Subject
$script:metadata=$null;$script:verifiedUrl=$null;$script:worker=$null;$script:invocation=$null;$script:enrollmentSecret=$null;$script:informationCount=0
$check.Add_Click({
    try{
        $install.IsEnabled=$false;$script:metadata=$null
        $uri=Assert-Https $server.Text.Trim();if(!$uri.AbsoluteUri.EndsWith('/')){$uri=[uri]($uri.AbsoluteUri+'/')}
        $data=Get-HttpsJson ([uri]::new($uri,'api/v1/stations/client-package').AbsoluteUri)
        if($data.status -ne 'RELEASED' -or $data.signingSubject -cne $publisher.Subject -or $data.signingThumbprint -ine $publisher.Thumbprint){throw 'Server nema produkcioni paket ovog pouzdanog izdavača.'}
        if(!$data.policySigningKeyId -or [Convert]::FromBase64String($data.policySigningPublicKey).Length -ne 44){throw 'Server nema ispravan javni policy ključ. Obratite se administratoru servera.'}
        $script:metadata=$data;$script:verifiedUrl=$uri.AbsoluteUri
        $identity.Text="TLS provera uspešna. Client $($data.version). Izdavač: $($data.signingSubject). Policy key ID: $($data.policySigningKeyId)."
        $install.IsEnabled=$true;$result.Text=''
    }catch{$identity.Text=$_.Exception.Message}
})
$server.Add_TextChanged({$install.IsEnabled=$false;$script:metadata=$null})
$timer=[Windows.Threading.DispatcherTimer]::new();$timer.Interval=[TimeSpan]::FromMilliseconds(400)
$timer.Add_Tick({
    if(!$script:worker){return}
    while($script:informationCount -lt $script:worker.Streams.Information.Count){
        $progress.AppendText([string]$script:worker.Streams.Information[$script:informationCount].MessageData+"`r`n");$script:informationCount++
    }
    $progress.ScrollToEnd()
    if($script:invocation.IsCompleted){
        $timer.Stop()
        try{
            [void]$script:worker.EndInvoke($script:invocation)
            if($script:worker.HadErrors){throw 'Instalacija nije uspela. Pregledajte zaštićeni recovery zapis i pokrenite repair iz recovery direktorijuma ako je potrebno.'}
            $result.Text='Instalacija je završena. Servis je povezan i lokalna zaštita je potvrđena. Fizičku proveru zaključavanja izvršite pre prijema kupaca.'
        }catch{$result.Text='Instalacija nije završena: '+$_.Exception.Message}
        finally{$script:worker.Dispose();$script:worker=$null;if($script:enrollmentSecret){$script:enrollmentSecret.Dispose();$script:enrollmentSecret=$null};$check.IsEnabled=$true;$server.IsEnabled=$true;$player.IsEnabled=$true;$enrollment.IsEnabled=$true}
    }
})
$install.Add_Click({
    try{
        if(!$confirm.IsChecked -or !$script:metadata -or !$player.Text.Trim()){throw 'Potvrdite server i izdavača i unesite standardni Windows nalog igrača.'}
        $script:enrollmentSecret=$enrollment.SecurePassword;$enrollment.Clear()
        $script:worker=[PowerShell]::Create()
        [void]$script:worker.AddCommand((Join-Path $PackageDirectory 'GManager-Setup.ps1')).AddParameter('PackageDirectory',$PackageDirectory).AddParameter('BackendUrl',$script:verifiedUrl).AddParameter('PlayerAccount',$player.Text.Trim()).AddParameter('PolicySigningPublicKey',$script:metadata.policySigningPublicKey).AddParameter('PolicySigningKeyId',$script:metadata.policySigningKeyId).AddParameter('SigningSubject',$publisher.Subject).AddParameter('SigningThumbprint',$publisher.Thumbprint).AddParameter('EnrollmentToken',$script:enrollmentSecret)
        $install.IsEnabled=$false;$check.IsEnabled=$false;$server.IsEnabled=$false;$player.IsEnabled=$false;$enrollment.IsEnabled=$false
        $progress.Text='Provera Windows mogućnosti i potpisa; instalacija i povezivanje…'+"`r`n"
        $script:informationCount=0;$script:invocation=$script:worker.BeginInvoke();$timer.Start()
    }catch{$result.Text=$_.Exception.Message}
})
$window.Add_Closing({param($sender,$event)if($script:worker -and !$script:invocation.IsCompleted){$event.Cancel=$true;$result.Text='Sačekajte završetak instalacije ili kontrolisanog rollback-a.'}})
[void]$window.ShowDialog()
