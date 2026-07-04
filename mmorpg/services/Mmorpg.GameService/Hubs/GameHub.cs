using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Mmorpg.GameService.Data;
using Mmorpg.GameService.Domain;
using Mmorpg.GameService.World;

namespace Mmorpg.GameService.Hubs;

[Authorize]
public class GameHub(WorldState world, WorldService worldService, GameDb db) : Hub
{
    private Guid UserId => Guid.Parse(Context.User!.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private string Username => Context.User!.Identity!.Name!;

    /// <summary>Dünyaya katıl: karakteri yükle/oluştur, dünyaya ekle.</summary>
    public async Task<object> JoinWorld()
    {
        if (world.Players.Values.Any(p => p.UserId == UserId))
            return new { error = "Bu hesap zaten oyunda." };

        var ch = await db.Characters.FirstOrDefaultAsync(c => c.UserId == UserId);
        if (ch is null)
        {
            ch = new Character
            {
                Id = Guid.NewGuid(), UserId = UserId, Name = Username,
                Level = 1, Xp = 0, Yang = 0,
                PosX = GameConfig.SpawnPoint[0], PosZ = GameConfig.SpawnPoint[1],
                CreatedAt = DateTime.UtcNow, LastSeenAt = DateTime.UtcNow,
            };
            db.Characters.Add(ch);
            await db.SaveChangesAsync();
        }

        var p = new PlayerState
        {
            ConnectionId = Context.ConnectionId,
            UserId = UserId, CharacterId = ch.Id, Name = ch.Name,
            Level = ch.Level, Xp = ch.Xp, Yang = ch.Yang,
            X = ch.PosX, Z = ch.PosZ,
            MaxHp = GameConfig.MaxHpFor(ch.Level),
            Hp = GameConfig.MaxHpFor(ch.Level),
        };
        world.Players[Context.ConnectionId] = p;
        await Groups.AddToGroupAsync(Context.ConnectionId, "world");
        await Clients.Group("world").SendAsync("notice",
            new { text = $"✦ {p.Name} dünyaya katıldı." });
        worldService.SendStats(p);
        return new
        {
            self = new { id = p.CharacterId, name = p.Name, x = p.X, z = p.Z },
            world = world.Snapshot(),
        };
    }

    public Task MoveTo(float x, float z)
    {
        if (world.Players.TryGetValue(Context.ConnectionId, out var p) && !p.Dead)
        {
            p.TargetX = Math.Clamp(x, -GameConfig.WorldHalf, GameConfig.WorldHalf);
            p.TargetZ = Math.Clamp(z, -GameConfig.WorldHalf, GameConfig.WorldHalf);
            p.AttackMobId = null;   // elle yürüyüş saldırıyı keser
        }
        return Task.CompletedTask;
    }

    public Task Attack(long mobId)
    {
        if (world.Players.TryGetValue(Context.ConnectionId, out var p) && !p.Dead &&
            world.Mobs.TryGetValue(mobId, out var mob) && !mob.Dead)
        {
            p.AttackMobId = mobId;
        }
        return Task.CompletedTask;
    }

    public Task StopAttack()
    {
        if (world.Players.TryGetValue(Context.ConnectionId, out var p))
            p.AttackMobId = null;
        return Task.CompletedTask;
    }

    public Task Respawn()
    {
        if (world.Players.TryGetValue(Context.ConnectionId, out var p) && p.Dead)
        {
            p.Dead = false;
            p.MaxHp = GameConfig.MaxHpFor(p.Level);
            p.Hp = p.MaxHp;
            p.X = GameConfig.SpawnPoint[0]; p.Z = GameConfig.SpawnPoint[1];
            worldService.SendStats(p);
        }
        return Task.CompletedTask;
    }

    public async Task<object> GetInventory()
    {
        var p = world.Players.GetValueOrDefault(Context.ConnectionId);
        if (p is null) return Array.Empty<object>();
        var items = await db.Items.Where(i => i.CharacterId == p.CharacterId).ToListAsync();
        return items.Select(i => new
        {
            code = i.ItemCode,
            name = GameConfig.Items.FirstOrDefault(d => d.Code == i.ItemCode)?.Name ?? i.ItemCode,
            icon = GameConfig.Items.FirstOrDefault(d => d.Code == i.ItemCode)?.Icon ?? "❔",
            count = i.Count,
        }).ToList<object>();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (world.Players.TryRemove(Context.ConnectionId, out var p))
        {
            p.Dirty = true;
            await worldService.SaveDirtyAsync();
            await Clients.Group("world").SendAsync("playerLeft", new { id = p.CharacterId });
        }
        await base.OnDisconnectedAsync(exception);
    }
}
