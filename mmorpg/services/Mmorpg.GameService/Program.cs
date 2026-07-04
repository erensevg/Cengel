using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Mmorpg.GameService.Data;
using Mmorpg.GameService.Domain;
using Mmorpg.GameService.Hubs;
using Mmorpg.GameService.World;
using Mmorpg.Shared;

var builder = WebApplication.CreateBuilder(args);

var jwt = builder.Configuration.GetSection(JwtOptions.Section).Get<JwtOptions>()!;
builder.Services.AddDbContext<GameDb>(o =>
    o.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=game.db"));
builder.Services.AddSingleton<WorldState>();
builder.Services.AddSingleton<WorldService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<WorldService>());
builder.Services.AddSignalR();

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
        // SignalR (WebSocket) token'ı query string ile taşır
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
    scope.ServiceProvider.GetRequiredService<GameDb>().Database.EnsureCreated();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { ok = true, service = "game" }));
app.MapGet("/api/game/config", () => Results.Json(GameConfig.ClientConfig()));

app.MapGet("/api/game/leaderboard", async (GameDb db) =>
    Results.Ok(await db.Characters
        .OrderByDescending(c => c.Level).ThenByDescending(c => c.Xp)
        .Take(10)
        .Select(c => new { c.Name, c.Level, c.Xp, c.Yang })
        .ToListAsync()));

app.MapHub<GameHub>("/hubs/game");

app.Run();
