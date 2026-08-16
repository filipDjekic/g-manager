namespace GManager.Client.Domain;
public enum ClientMode { Locked, Login, Active, Offline }
public sealed record SessionSnapshot(Guid StationId,Guid? SessionId,DateTimeOffset? EndsAt,DateTimeOffset ServerTime,long CommandCursor,string StationStatus);
public sealed record ClientViewState(ClientMode Mode,string Connectivity,string Heading,Guid? SessionId,string? CustomerName,DateTimeOffset? EndsAt,TimeSpan ServerOffset)
{
 public static ClientViewState Locked(string connectivity="Povezivanje sa serverom")=>new(ClientMode.Locked,connectivity,"Stanica je zaključana",null,null,null,TimeSpan.Zero);
 public TimeSpan Remaining(DateTimeOffset localNow)=>EndsAt is null?TimeSpan.Zero:EndsAt.Value-(localNow+ServerOffset);
 public ClientViewState Apply(SessionSnapshot snapshot,DateTimeOffset receivedAt)=>this with{Mode=snapshot.SessionId is null?ClientMode.Locked:ClientMode.Login,Connectivity="Online",Heading=snapshot.SessionId is null?"Stanica je zaključana":"Prijavite se za nastavak",SessionId=snapshot.SessionId,CustomerName=null,EndsAt=snapshot.EndsAt,ServerOffset=snapshot.ServerTime-receivedAt};
 public ClientViewState Welcome(string name)=>this with{Mode=ClientMode.Active,Heading=$"Welcome, {name}",CustomerName=name};
 public ClientViewState Disconnected()=>this with{Mode=ClientMode.Offline,Connectivity="Server nije dostupan",Heading="Veza sa serverom je prekinuta"};
}
public sealed record LocalRequest(string Type,string RequestId,string? Email=null,string? Password=null,Guid? SessionId=null,string? ApplicationCode=null);
public sealed record ClientApplication(string Code,string Name,string Type);
public sealed record LocalResponse(bool Success,string? Error,ClientViewState State,IReadOnlyList<ClientApplication>? Applications=null);
