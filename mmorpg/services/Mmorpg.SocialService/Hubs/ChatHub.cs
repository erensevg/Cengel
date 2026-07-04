using System.Collections.Concurrent;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Mmorpg.SocialService.Data;

namespace Mmorpg.SocialService.Hubs;

/// <summary>Çevrimiçi kullanıcı kaydı (userId -> bağlantılar + ad).</summary>
public class Presence
{
    public readonly ConcurrentDictionary<Guid, (string Name, HashSet<string> Conns)> Online = new();

    public bool IsOnline(Guid userId) => Online.ContainsKey(userId);

    public Guid? FindByName(string name) =>
        Online.FirstOrDefault(kv =>
            kv.Value.Name.Equals(name, StringComparison.OrdinalIgnoreCase)) is { Key: var id, Value.Name: not null and not "" }
            ? id : null;
}

[Authorize]
public class ChatHub(Presence presence, SocialDb db) : Hub
{
    private Guid UserId => Guid.Parse(Context.User!.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private string Username => Context.User!.Identity!.Name!;

    public override async Task OnConnectedAsync()
    {
        var entry = presence.Online.AddOrUpdate(UserId,
            _ => (Username, [Context.ConnectionId]),
            (_, cur) => { lock (cur.Conns) cur.Conns.Add(Context.ConnectionId); return cur; });
        if (entry.Conns.Count == 1)
            await NotifyFriendsAsync("friendOnline");
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (presence.Online.TryGetValue(UserId, out var cur))
        {
            bool empty;
            lock (cur.Conns) { cur.Conns.Remove(Context.ConnectionId); empty = cur.Conns.Count == 0; }
            if (empty)
            {
                presence.Online.TryRemove(UserId, out _);
                await NotifyFriendsAsync("friendOffline");
            }
        }
        await base.OnDisconnectedAsync(exception);
    }

    private async Task NotifyFriendsAsync(string evt)
    {
        var friends = await db.Friendships
            .Where(f => f.Status == FriendshipStatus.Accepted &&
                        (f.RequesterId == UserId || f.AddresseeId == UserId))
            .ToListAsync();
        foreach (var f in friends)
        {
            var otherId = f.RequesterId == UserId ? f.AddresseeId : f.RequesterId;
            if (presence.Online.TryGetValue(otherId, out var other))
                foreach (var conn in other.Conns.ToArray())
                    await Clients.Client(conn).SendAsync(evt, new { userId = UserId, username = Username });
        }
    }

    public async Task SendGlobal(string text)
    {
        text = (text ?? "").Trim();
        if (text.Length is 0 or > 240) return;
        await Clients.All.SendAsync("chat", new
        {
            ch = "global", from = Username, text, ts = DateTime.UtcNow,
        });
    }

    public async Task SendWhisper(string toUsername, string text)
    {
        text = (text ?? "").Trim();
        if (text.Length is 0 or > 240) return;
        var targetId = presence.FindByName(toUsername.Trim());
        if (targetId is null)
        {
            await Clients.Caller.SendAsync("chat", new
            {
                ch = "sys", from = "Sistem",
                text = $"{toUsername} çevrimiçi değil.", ts = DateTime.UtcNow,
            });
            return;
        }
        var payload = new
        {
            ch = "pm", from = Username,
            to = presence.Online[targetId.Value].Name, text, ts = DateTime.UtcNow,
        };
        foreach (var conn in presence.Online[targetId.Value].Conns.ToArray())
            await Clients.Client(conn).SendAsync("chat", payload);
        await Clients.Caller.SendAsync("chat", payload);
    }
}
