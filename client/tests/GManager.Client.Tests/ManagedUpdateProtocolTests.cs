using System.Net;
using System.Text.Json;
using GManager.Client.Protocol;
using Xunit;

namespace GManager.Client.Tests;
public sealed class ManagedUpdateProtocolTests
{
    [Theory] [InlineData(HttpStatusCode.NoContent)] [InlineData(HttpStatusCode.Conflict)]
    public async Task InstallationRequiresTheMachineScopedServerClaimAndHandlesAnEmptySuccess(HttpStatusCode result)
    {
        Guid id=Guid.NewGuid();
        using var handler=new ClaimHandler(result,id);using var http=new HttpClient(handler){BaseAddress=new Uri("https://isolated.example.test/")};
        var client=new MachineProtocolClient(http);
        if(result==HttpStatusCode.NoContent)await client.ClaimUpdateAsync("isolated-machine-bearer",id,TestContext.Current.CancellationToken);
        else await Assert.ThrowsAsync<MachineApiException>(()=>client.ClaimUpdateAsync("isolated-machine-bearer",id,TestContext.Current.CancellationToken));
        Assert.True(handler.Observed);
    }
    sealed class ClaimHandler(HttpStatusCode result,Guid id):HttpMessageHandler
    {
        public bool Observed;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct)
        {
            Assert.Equal("/api/v1/machine/client-update/claim",request.RequestUri!.AbsolutePath);
            Assert.Equal("Bearer",request.Headers.Authorization!.Scheme);
            using var body=JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
            Assert.Equal(id,body.RootElement.GetProperty("requestId").GetGuid());
            Assert.Single(body.RootElement.EnumerateObject());Observed=true;return new(result);
        }
    }
}
