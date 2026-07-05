// API Gateway: tek giriş kapısı. İstemciyi (wwwroot) servis eder,
// /api/* ve /hubs/* isteklerini ilgili mikroservise yönlendirir (WebSocket dahil).
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();

app.UseDefaultFiles();
// .glb/.gltf model dosyaları için MIME eşlemesi (yoksa 404 döner)
var contentTypes = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
contentTypes.Mappings[".glb"] = "model/gltf-binary";
contentTypes.Mappings[".gltf"] = "model/gltf+json";
app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = contentTypes });

app.MapGet("/health", () => Results.Ok(new { ok = true, service = "gateway" }));
app.MapReverseProxy();

app.Run();
