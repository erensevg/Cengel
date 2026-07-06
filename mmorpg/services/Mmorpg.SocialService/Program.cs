using System.Net.Http.Headers;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Mmorpg.Shared;
using Mmorpg.SocialService.Data;
using Mmorpg.SocialService.Hubs;

var builder = WebApplication.CreateBuilder(args);

var jwt = builder.Configuration.GetSection(JwtOptions.Section).Get<JwtOptions>()!;
builder.Services.AddDbContext<SocialDb>(o =>
{
    // Windows: SQL Server LocalDB (varsayılan). Linux/CI testi: USE_SQLITE=1
    if (Environment.GetEnvironmentVariable("USE_SQLITE") == "1")
        o.UseSqlite("Data Source=social.db");
    else
        o.UseSqlServer(builder.Configuration.GetConnectionString("Default")
            ?? "Server=(localdb)\\MSSQLLocalDB;Database=Cengel_Social;Trusted_Connection=True;TrustServerCertificate=True");
});
builder.Services.AddSingleton<Presence>();
builder.Services.AddSignalR();
builder.Services.AddHttpClient("auth", c =>
    c.BaseAddress = new Uri(builder.Configuration["Services:Auth"] ?? "http://localhost:5001"));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(jwt.Key)),
            ValidateIssuerSigningKey = true,
        };
        o.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) &&
                    ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                    ctx.Token = token;
                return Task.CompletedTask;
            },
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();
using (var scope = app.Services.CreateScope())
    scope.ServiceProvider.GetRequiredService<SocialDb>().Database.EnsureCreated();

app.UseAuthentication();
app.UseAuthorization();

static Guid Uid(ClaimsPrincipal me) => Guid.Parse(me.FindFirstValue(ClaimTypes.NameIdentifier)!);

app.MapGet("/health", () => Results.Ok(new { ok = true, service = "social" }));

// Arkadaş listesi (+çevrimiçi durumu)
app.MapGet("/api/social/friends", async (ClaimsPrincipal me, SocialDb db, Presence presence) =>
{
    var uid = Uid(me);
    var list = await db.Friendships
        .Where(f => f.Status == FriendshipStatus.Accepted &&
                    (f.RequesterId == uid || f.AddresseeId == uid))
        .ToListAsync();
    return Results.Ok(list.Select(f =>
    {
        var otherId = f.RequesterId == uid ? f.AddresseeId : f.RequesterId;
        var otherName = f.RequesterId == uid ? f.AddresseeName : f.RequesterName;
        return new FriendDto(otherId, otherName, presence.IsOnline(otherId));
    }));
}).RequireAuthorization();

// Bekleyen (gelen) istekler
app.MapGet("/api/social/friends/requests", async (ClaimsPrincipal me, SocialDb db) =>
{
    var uid = Uid(me);
    var list = await db.Friendships
        .Where(f => f.Status == FriendshipStatus.Pending && f.AddresseeId == uid)
        .OrderByDescending(f => f.CreatedAt)
        .ToListAsync();
    return Results.Ok(list.Select(f =>
        new FriendRequestDto(f.Id, f.RequesterId, f.RequesterName, f.CreatedAt)));
}).RequireAuthorization();

// Arkadaşlık isteği gönder (kullanıcı adı AuthService'ten çözülür — servisler arası çağrı)
app.MapPost("/api/social/friends/request",
    async (SendFriendRequest req, ClaimsPrincipal me, HttpContext http,
           SocialDb db, IHttpClientFactory factory, Presence presence,
           IHubContext<ChatHub> hub) =>
{
    var uid = Uid(me);
    var myName = me.Identity!.Name!;
    if (string.Equals(req.Username.Trim(), myName, StringComparison.OrdinalIgnoreCase))
        return Results.BadRequest(new { error = "Kendini arkadaş ekleyemezsin." });

    var client = factory.CreateClient("auth");
    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
        http.Request.Headers.Authorization.ToString().Replace("Bearer ", ""));
    var resp = await client.GetAsync(
        $"/api/auth/resolve?username={Uri.EscapeDataString(req.Username.Trim())}");
    if (!resp.IsSuccessStatusCode)
        return Results.NotFound(new { error = "Böyle bir oyuncu yok." });
    var target = (await resp.Content.ReadFromJsonAsync<ResolveUserResponse>())!;

    var exists = await db.Friendships.FirstOrDefaultAsync(f =>
        (f.RequesterId == uid && f.AddresseeId == target.UserId) ||
        (f.RequesterId == target.UserId && f.AddresseeId == uid));
    if (exists is not null)
        return Results.Conflict(new
        {
            error = exists.Status == FriendshipStatus.Accepted
                ? "Zaten arkadaşsınız." : "Zaten bekleyen bir istek var.",
        });

    var fr = new Friendship
    {
        Id = Guid.NewGuid(),
        RequesterId = uid, RequesterName = myName,
        AddresseeId = target.UserId, AddresseeName = target.Username,
        Status = FriendshipStatus.Pending, CreatedAt = DateTime.UtcNow,
    };
    db.Friendships.Add(fr);
    await db.SaveChangesAsync();

    // hedef çevrimiçiyse anlık bildir
    if (presence.Online.TryGetValue(target.UserId, out var conns))
        foreach (var c in conns.Conns.ToArray())
            await hub.Clients.Client(c).SendAsync("friendRequest",
                new FriendRequestDto(fr.Id, uid, myName, fr.CreatedAt));
    return Results.Ok(new { ok = true });
}).RequireAuthorization();

// İsteğe yanıt ver
app.MapPost("/api/social/friends/respond",
    async (RespondFriendRequest req, ClaimsPrincipal me, SocialDb db,
           Presence presence, IHubContext<ChatHub> hub) =>
{
    var uid = Uid(me);
    var fr = await db.Friendships.FindAsync(req.RequestId);
    if (fr is null || fr.AddresseeId != uid || fr.Status != FriendshipStatus.Pending)
        return Results.NotFound(new { error = "İstek bulunamadı." });

    if (req.Accept)
    {
        fr.Status = FriendshipStatus.Accepted;
        await db.SaveChangesAsync();
        if (presence.Online.TryGetValue(fr.RequesterId, out var conns))
            foreach (var c in conns.Conns.ToArray())
                await hub.Clients.Client(c).SendAsync("friendAccepted",
                    new { userId = uid, username = fr.AddresseeName });
    }
    else
    {
        db.Friendships.Remove(fr);
        await db.SaveChangesAsync();
    }
    return Results.Ok(new { ok = true });
}).RequireAuthorization();

app.MapHub<ChatHub>("/hubs/chat");

app.Run();
