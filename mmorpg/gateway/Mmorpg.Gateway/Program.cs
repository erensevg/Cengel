// API Gateway: tek giriş kapısı. İstemciyi (wwwroot) servis eder,
// /api/* ve /hubs/* isteklerini ilgili mikroservise yönlendirir (WebSocket dahil).
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/health", () => Results.Ok(new { ok = true, service = "gateway" }));
app.MapReverseProxy();

app.Run();
