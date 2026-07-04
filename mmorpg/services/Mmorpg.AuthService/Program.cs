using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Mmorpg.AuthService.Data;
using Mmorpg.AuthService.Services;
using Mmorpg.Shared;

var builder = WebApplication.CreateBuilder(args);

var jwt = builder.Configuration.GetSection(JwtOptions.Section).Get<JwtOptions>()!;
builder.Services.AddSingleton(jwt);
builder.Services.AddSingleton<TokenService>();
builder.Services.AddDbContext<AuthDb>(o =>
    o.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=auth.db"));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o => o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidIssuer = jwt.Issuer,
        ValidAudience = jwt.Audience,
        IssuerSigningKey = new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(jwt.Key)),
        ValidateIssuerSigningKey = true,
    });
builder.Services.AddAuthorization();

var app = builder.Build();
using (var scope = app.Services.CreateScope())
    scope.ServiceProvider.GetRequiredService<AuthDb>().Database.EnsureCreated();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { ok = true, service = "auth" }));

app.MapPost("/api/auth/register", async (RegisterRequest req, AuthDb db, TokenService tokens) =>
{
    var username = req.Username.Trim();
    if (username.Length is < 3 or > 16 || !username.All(char.IsLetterOrDigit))
        return Results.BadRequest(new { error = "Kullanıcı adı 3-16 harf/rakam olmalı." });
    if (req.Password.Length < 6)
        return Results.BadRequest(new { error = "Şifre en az 6 karakter olmalı." });
    var exists = await db.Users.AnyAsync(u => u.Username.ToLower() == username.ToLower());
    if (exists)
        return Results.Conflict(new { error = "Bu kullanıcı adı alınmış." });

    var user = new User
    {
        Id = Guid.NewGuid(),
        Username = username,
        PasswordHash = PasswordHasher.Hash(req.Password),
        CreatedAt = DateTime.UtcNow,
    };
    db.Users.Add(user);
    await db.SaveChangesAsync();
    return Results.Ok(new AuthResponse(tokens.Create(user.Id, user.Username), user.Id, user.Username));
});

app.MapPost("/api/auth/login", async (LoginRequest req, AuthDb db, TokenService tokens) =>
{
    var user = await db.Users.FirstOrDefaultAsync(
        u => u.Username.ToLower() == req.Username.Trim().ToLower());
    if (user is null || !PasswordHasher.Verify(req.Password, user.PasswordHash))
        return Results.Json(new { error = "Kullanıcı adı ya da şifre hatalı." }, statusCode: 401);
    return Results.Ok(new AuthResponse(tokens.Create(user.Id, user.Username), user.Id, user.Username));
});

app.MapGet("/api/auth/me", (ClaimsPrincipal me) => Results.Ok(new
{
    userId = me.FindFirstValue(ClaimTypes.NameIdentifier),
    username = me.Identity!.Name,
})).RequireAuthorization();

// Servisler arası: kullanıcı adından kimlik çözme (ör. SocialService arkadaş isteği).
// Çağıran, oyuncunun kendi JWT'sini iletir; ayrı bir iç ağ anahtarı gerekmez.
app.MapGet("/api/auth/resolve", async (string username, AuthDb db) =>
{
    var user = await db.Users.FirstOrDefaultAsync(
        u => u.Username.ToLower() == username.Trim().ToLower());
    return user is null
        ? Results.NotFound(new { error = "Kullanıcı bulunamadı." })
        : Results.Ok(new ResolveUserResponse(user.Id, user.Username));
}).RequireAuthorization();

app.Run();
