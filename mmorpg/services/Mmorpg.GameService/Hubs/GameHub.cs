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
    private PlayerState? Me => world.FindPlayer(Context.ConnectionId);

    /// <summary>Dünyaya katıl: karakteri yükle/oluştur, haritasına ekle.</summary>
    public async Task<object> JoinWorld()
    {
        if (world.UserOnline(UserId))
            return new { error = "Bu hesap zaten oyunda." };

        var ch = await db.Characters.FirstOrDefaultAsync(c => c.UserId == UserId);
        if (ch is null)
        {
            ch = new Character
            {
                Id = Guid.NewGuid(), UserId = UserId, Name = Username,
                Level = 1, Xp = 0, Yang = 0, MapId = GameConfig.StartMap,
                PosX = GameConfig.SpawnPoint[0], PosZ = GameConfig.SpawnPoint[1],
                CreatedAt = DateTime.UtcNow, LastSeenAt = DateTime.UtcNow,
            };
            db.Characters.Add(ch);
            // başlangıç paketi: 5 küçük can + 5 küçük mana iksiri
            db.Items.AddRange(
                new InventoryItem { Id = Guid.NewGuid(), CharacterId = ch.Id,
                    ItemCode = "kucuk_hp_iksiri", Count = 5, SlotIndex = 0 },
                new InventoryItem { Id = Guid.NewGuid(), CharacterId = ch.Id,
                    ItemCode = "kucuk_mp_iksiri", Count = 5, SlotIndex = 1 });
            await db.SaveChangesAsync();
        }
        if (GameConfig.MapById(ch.MapId) is null) ch.MapId = GameConfig.StartMap;

        var p = new PlayerState
        {
            ConnectionId = Context.ConnectionId,
            UserId = UserId, CharacterId = ch.Id, Name = ch.Name,
            Level = ch.Level, Xp = ch.Xp, Yang = ch.Yang,
            X = ch.PosX, Z = ch.PosZ, MapId = ch.MapId,
            MaxHp = GameConfig.MaxHpFor(ch.Level),
            Hp = GameConfig.MaxHpFor(ch.Level),
            MaxMp = GameConfig.MaxMpFor(ch.Level),
            Mp = GameConfig.MaxMpFor(ch.Level),
            SkillPoints = ch.SkillPoints,
        };
        if (ch.EquippedItemId is { } eqId)
        {
            var eq = await db.Items.FirstOrDefaultAsync(i => i.Id == eqId);
            p.WeaponBonus = (eq is null ? null : GameConfig.ItemByCode(eq.ItemCode))?.Bonus ?? 0;
        }
        foreach (var s in await db.Skills.Where(s => s.CharacterId == ch.Id).ToListAsync())
            p.Skills[s.Code] = s.Level;
        var doneQuests = await db.Quests
            .Where(q => q.CharacterId == ch.Id && q.Completed).CountAsync();
        p.QuestIndex = Math.Min(doneQuests, GameConfig.Quests.Length);

        world.Maps[p.MapId].Players[Context.ConnectionId] = p;
        await Groups.AddToGroupAsync(Context.ConnectionId, WorldState.Group(p.MapId));
        await Clients.Group(WorldState.Group(p.MapId)).SendAsync("notice",
            new { text = $"✦ {p.Name} dünyaya katıldı." });
        worldService.SendStats(p);

        var quest = p.QuestIndex < GameConfig.Quests.Length
            ? GameConfig.Quests[p.QuestIndex] : null;
        return new
        {
            self = new { id = p.CharacterId, name = p.Name, x = p.X, z = p.Z, mapId = p.MapId },
            world = world.Snapshot(p.MapId),
            skills = p.Skills,
            quest = quest is null ? null : new
            {
                code = quest.Code, title = quest.Title, story = quest.StoryStart,
                progress = p.QuestProgress, target = quest.TargetCount,
                isFirst = p.QuestIndex == 0,
            },
        };
    }

    public Task MoveTo(float x, float z)
    {
        if (Me is { Dead: false } p)
        {
            p.TargetX = Math.Clamp(x, -GameConfig.WorldHalf, GameConfig.WorldHalf);
            p.TargetZ = Math.Clamp(z, -GameConfig.WorldHalf, GameConfig.WorldHalf);
            p.AttackMobId = null;
        }
        return Task.CompletedTask;
    }

    public Task Attack(long mobId)
    {
        if (Me is { Dead: false } p &&
            world.Maps[p.MapId].Mobs.TryGetValue(mobId, out var mob) && !mob.Dead)
            p.AttackMobId = mobId;
        return Task.CompletedTask;
    }

    public Task StopAttack()
    {
        if (Me is { } p) p.AttackMobId = null;
        return Task.CompletedTask;
    }

    public Task Respawn()
    {
        if (Me is { Dead: true } p)
        {
            p.Dead = false;
            p.MaxHp = GameConfig.MaxHpFor(p.Level);
            p.Hp = p.MaxHp;
            p.Mp = p.MaxMp;
            p.X = GameConfig.SpawnPoint[0]; p.Z = GameConfig.SpawnPoint[1];
            worldService.SendStats(p);
        }
        return Task.CompletedTask;
    }

    /* ---------------- iksir / eşya kullanımı ---------------- */
    public async Task<object> UseItem(Guid itemId)
    {
        if (Me is not { } p || p.Dead) return new { error = "Şu an kullanamazsın." };
        var item = await db.Items.FirstOrDefaultAsync(
            i => i.Id == itemId && i.CharacterId == p.CharacterId);
        var def = item is null ? null : GameConfig.ItemByCode(item.ItemCode);
        if (item is null || def is null) return new { error = "Eşya bulunamadı." };

        if (def.Type == "parsomen")
            return new { scroll = true };   // istemci ışınlanma penceresini açar

        if (def.HealHp == 0 && def.HealMp == 0)
            return new { error = "Bu eşya kullanılamaz." };
        if (def.HealHp > 0 && p.Hp >= p.MaxHp && def.HealMp == 0)
            return new { error = "Canın zaten dolu." };
        if (def.HealMp > 0 && p.Mp >= p.MaxMp && def.HealHp == 0)
            return new { error = "Manan zaten dolu." };

        p.Hp = Math.Min(p.MaxHp, p.Hp + def.HealHp);
        p.Mp = Math.Min(p.MaxMp, p.Mp + def.HealMp);
        item.Count--;
        if (item.Count <= 0) db.Items.Remove(item);
        await db.SaveChangesAsync();
        worldService.SendStats(p);
        return new { ok = true, name = def.Name, hp = def.HealHp, mp = def.HealMp };
    }

    /// <summary>Envanterden Işınlanma Parşömeni tüket (uzaktan ışınlanma için).</summary>
    private async Task<bool> ConsumeScrollAsync(PlayerState p)
    {
        var scroll = await db.Items.FirstOrDefaultAsync(i =>
            i.CharacterId == p.CharacterId && i.ItemCode == "isinlanma_parsomeni");
        if (scroll is null) return false;
        scroll.Count--;
        if (scroll.Count <= 0) db.Items.Remove(scroll);
        await db.SaveChangesAsync();
        return true;
    }

    /* ---------------- ışınlanma ---------------- */
    public async Task<object> Teleport(string mapId, bool viaScroll)
    {
        if (Me is not { } p || p.Dead) return new { error = "Şu an ışınlanamazsın." };
        var target = GameConfig.MapById(mapId);
        if (target is null) return new { error = "Böyle bir harita yok." };
        if (mapId == p.MapId) return new { error = "Zaten oradasın." };
        if (p.Level < target.ReqLevel)
            return new { error = $"{target.Name} için seviye {target.ReqLevel} gerek." };

        if (viaScroll)
        {
            if (!await ConsumeScrollAsync(p))
                return new { error = "Işınlanma Parşömenin yok." };
        }
        else
        {
            var cur = GameConfig.MapById(p.MapId)!;
            var d = MathF.Sqrt((p.X - cur.PortalX) * (p.X - cur.PortalX) +
                               (p.Z - cur.PortalZ) * (p.Z - cur.PortalZ));
            if (d > 6f) return new { error = "Işınlanma Kapısı'na yaklaş." };
        }

        var oldMap = p.MapId;
        world.Maps[oldMap].Players.TryRemove(Context.ConnectionId, out _);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, WorldState.Group(oldMap));
        await Clients.Group(WorldState.Group(oldMap)).SendAsync("playerLeft",
            new { id = p.CharacterId });

        p.MapId = mapId;
        p.X = GameConfig.SpawnPoint[0]; p.Z = GameConfig.SpawnPoint[1];
        p.TargetX = p.TargetZ = null; p.AttackMobId = null;
        p.Dirty = true;
        world.Maps[mapId].Players[Context.ConnectionId] = p;
        await Groups.AddToGroupAsync(Context.ConnectionId, WorldState.Group(mapId));
        await Clients.Group(WorldState.Group(mapId)).SendAsync("notice",
            new { text = $"✦ {p.Name}, {target.Name}'ne geldi." });
        worldService.AdvanceQuest(p, "map", mapId, 1);
        return new
        {
            ok = true, mapId, mapName = target.Name,
            world = world.Snapshot(mapId),
            self = new { x = p.X, z = p.Z },
        };
    }

    /* ---------------- skill ---------------- */
    public async Task<object> LearnSkill(string code)
    {
        if (Me is not { } p) return new { error = "Oyunda değilsin." };
        var def = GameConfig.SkillByCode(code);
        if (def is null) return new { error = "Böyle bir skill yok." };
        if (p.Skills.ContainsKey(code)) return new { error = "Zaten öğrendin." };
        if (p.Level < def.ReqLevel)
            return new { error = $"{def.Name} için seviye {def.ReqLevel} gerek." };
        if (p.SkillPoints < 1) return new { error = "Skill puanın yok." };

        p.SkillPoints--;
        p.Skills[code] = 1;
        p.Dirty = true;
        db.Skills.Add(new CharacterSkill
        {
            Id = Guid.NewGuid(), CharacterId = p.CharacterId, Code = code, Level = 1,
        });
        await db.SaveChangesAsync();
        worldService.SendStats(p);
        return new { ok = true, name = def.Name };
    }

    public async Task<object> UpgradeSkill(string code)
    {
        if (Me is not { } p) return new { error = "Oyunda değilsin." };
        if (!p.Skills.TryGetValue(code, out var lvl)) return new { error = "Önce öğren." };
        if (lvl >= 10) return new { error = "Skill zaten ustalıkta (10)." };
        if (p.SkillPoints < 1) return new { error = "Skill puanın yok." };

        p.SkillPoints--;
        p.Skills[code] = lvl + 1;
        p.Dirty = true;
        var row = await db.Skills.FirstOrDefaultAsync(
            s => s.CharacterId == p.CharacterId && s.Code == code);
        if (row is not null) { row.Level = lvl + 1; await db.SaveChangesAsync(); }
        worldService.SendStats(p);
        return new { ok = true, level = lvl + 1 };
    }

    public Task<object> CastSkill(string code, long? targetMobId) =>
        Task.FromResult(Me is not { } p
            ? new { error = "Oyunda değilsin." }
            : worldService.CastSkill(p, code, targetMobId));

    public object GetSkills() =>
        Me is not { } p ? new { } : new { skills = p.Skills, points = p.SkillPoints };

    /* ---------------- envanter ---------------- */
    public async Task<object> GetInventory()
    {
        if (Me is not { } p) return new { items = Array.Empty<object>(), equippedId = (Guid?)null };
        var ch = await db.Characters.FindAsync(p.CharacterId);
        var items = await db.Items.Where(i => i.CharacterId == p.CharacterId).ToListAsync();
        return new
        {
            equippedId = ch?.EquippedItemId,
            items = items.Select(i =>
            {
                var def = GameConfig.ItemByCode(i.ItemCode);
                return new
                {
                    id = i.Id, code = i.ItemCode, slot = i.SlotIndex, count = i.Count,
                    name = def?.Name ?? i.ItemCode, icon = def?.Icon ?? "❔",
                    desc = def?.Desc ?? "", type = def?.Type ?? "malzeme",
                    bonus = def?.Bonus ?? 0, healHp = def?.HealHp ?? 0, healMp = def?.HealMp ?? 0,
                };
            }).ToList(),
        };
    }

    public async Task MoveItem(Guid itemId, int slot)
    {
        if (slot is < 0 or > 44 || Me is not { } p) return;
        var item = await db.Items.FirstOrDefaultAsync(
            i => i.Id == itemId && i.CharacterId == p.CharacterId);
        if (item is null) return;
        var other = await db.Items.FirstOrDefaultAsync(
            i => i.CharacterId == p.CharacterId && i.SlotIndex == slot);
        if (other is not null) other.SlotIndex = item.SlotIndex;
        item.SlotIndex = slot;
        await db.SaveChangesAsync();
    }

    public async Task<object> Equip(Guid itemId)
    {
        if (Me is not { } p) return new { error = "oyunda değilsin" };
        var item = await db.Items.FirstOrDefaultAsync(
            i => i.Id == itemId && i.CharacterId == p.CharacterId);
        var def = item is null ? null : GameConfig.ItemByCode(item.ItemCode);
        if (def is null || def.Type != "silah") return new { error = "Bu eşya kuşanılamaz." };
        var ch = await db.Characters.FindAsync(p.CharacterId);
        ch!.EquippedItemId = item!.Id;
        await db.SaveChangesAsync();
        p.WeaponBonus = def.Bonus;
        worldService.SendStats(p);
        return new { ok = true, name = def.Name, bonus = def.Bonus };
    }

    public async Task Unequip()
    {
        if (Me is not { } p) return;
        var ch = await db.Characters.FindAsync(p.CharacterId);
        if (ch is null) return;
        ch.EquippedItemId = null;
        await db.SaveChangesAsync();
        p.WeaponBonus = 0;
        worldService.SendStats(p);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (Me is { } p)
        {
            world.Maps[p.MapId].Players.TryRemove(Context.ConnectionId, out _);
            p.Dirty = true;
            await worldService.SaveDirtyAsync();
            await Clients.Group(WorldState.Group(p.MapId)).SendAsync("playerLeft",
                new { id = p.CharacterId });
        }
        await base.OnDisconnectedAsync(exception);
    }
}
