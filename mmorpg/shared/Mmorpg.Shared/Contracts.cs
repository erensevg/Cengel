namespace Mmorpg.Shared;

/// <summary>Tüm servislerin paylaştığı JWT ayarları (appsettings "Jwt" bölümü).</summary>
public class JwtOptions
{
    public const string Section = "Jwt";
    public string Issuer { get; set; } = "mmorpg";
    public string Audience { get; set; } = "mmorpg-client";
    /// <summary>Simetrik imza anahtarı — tüm servislerde aynı olmalı. Üretimde gizli tut!</summary>
    public string Key { get; set; } = "";
}

// ---- Auth sözleşmeleri ----
public record RegisterRequest(string Username, string Password);
public record LoginRequest(string Username, string Password);
public record AuthResponse(string Token, Guid UserId, string Username);
public record ResolveUserResponse(Guid UserId, string Username);

// ---- Social sözleşmeleri ----
public record FriendRequestDto(Guid Id, Guid FromUserId, string FromUsername, DateTime CreatedAt);
public record FriendDto(Guid UserId, string Username, bool Online);
public record SendFriendRequest(string Username);
public record RespondFriendRequest(Guid RequestId, bool Accept);

// ---- Game sözleşmeleri (istemciyle SignalR üzerinden konuşulan tipler) ----
public record MoveToMessage(float X, float Z);
