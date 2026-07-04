using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Mmorpg.GameService.Data;
using Mmorpg.GameService.Domain;
using Mmorpg.GameService.Hubs;

namespace Mmorpg.GameService.World;

/// <summary>Sunucu otoriter oyun döngüsü: hareket, mob AI, dövüş, XP/level, drop.</summary>
public class WorldService(
    WorldState world,
    IHubContext<GameHub> hub,
    IServiceScopeFactory scopes,
    ILogger<WorldService> log) : BackgroundService
{
    private const double TickSeconds = 0.15;
    private static readonly Random Rng = new();
    private double _lastSave;

    private static double Now => Environment.TickCount64 / 1000.0;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        log.LogInformation("Dünya döngüsü başladı ({Mobs} mob)", world.Mobs.Count);
        var last = Now;
        while (!ct.IsCancellationRequested)
        {
            var now = Now;
            var dt = (float)Math.Min(now - last, 0.5);
            last = now;
            try
            {
                TickPlayers(dt, now);
                TickMobs(dt, now);
                await hub.Clients.Group("world").SendAsync("world", world.Snapshot(), ct);
                if (now - _lastSave > 10) { _lastSave = now; await SaveDirtyAsync(); }
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogError(e, "Dünya tick hatası");
            }
            await Task.Delay(TimeSpan.FromSeconds(TickSeconds), ct);
        }
        await SaveDirtyAsync(force: true);
    }

    private void TickPlayers(float dt, double now)
    {
        foreach (var p in world.Players.Values)
        {
            if (p.Dead) continue;

            // saldırı hedefi varsa ona doğru yürü / vur
            if (p.AttackMobId is { } mobId)
            {
                if (!world.Mobs.TryGetValue(mobId, out var mob) || mob.Dead)
                {
                    p.AttackMobId = null;
                }
                else
                {
                    var dist = Dist(p.X, p.Z, mob.X, mob.Z);
                    if (dist > GameConfig.PlayerAttackRange)
                    {
                        p.TargetX = mob.X; p.TargetZ = mob.Z;   // hedefe yürü
                    }
                    else
                    {
                        p.TargetX = p.TargetZ = null;
                        if (now - p.LastAttackAt >= GameConfig.PlayerAttackCooldown)
                        {
                            p.LastAttackAt = now;
                            HitMob(p, mob, now);
                        }
                    }
                }
            }

            // hareket
            if (p.TargetX is { } tx && p.TargetZ is { } tz)
            {
                var dx = tx - p.X; var dz = tz - p.Z;
                var d = MathF.Sqrt(dx * dx + dz * dz);
                var step = GameConfig.PlayerSpeed * dt;
                if (d <= step) { p.X = tx; p.Z = tz; p.TargetX = p.TargetZ = null; }
                else { p.X += dx / d * step; p.Z += dz / d * step; }
                p.X = Math.Clamp(p.X, -GameConfig.WorldHalf, GameConfig.WorldHalf);
                p.Z = Math.Clamp(p.Z, -GameConfig.WorldHalf, GameConfig.WorldHalf);
                p.Dirty = true;
            }
        }
    }

    private void TickMobs(float dt, double now)
    {
        foreach (var mob in world.Mobs.Values)
        {
            var def = mob.Def;
            if (mob.Dead)
            {
                if (mob.Summoned) { world.Mobs.TryRemove(mob.Id, out _); continue; }
                if (now >= mob.RespawnAt)
                {
                    mob.Dead = false; mob.Hp = def.MaxHp;
                    mob.X = mob.SpawnX; mob.Z = mob.SpawnZ;
                    mob.TargetConnId = null; mob.MetinThresholdsHit.Clear();
                }
                continue;
            }
            if (def.Metin) continue;   // metinler kımıldamaz, saldırmaz

            // hedef seçimi: menzildeki en yakın canlı oyuncu
            PlayerState? target = null;
            if (mob.TargetConnId is not null)
                world.Players.TryGetValue(mob.TargetConnId, out target);
            if (target is null || target.Dead)
            {
                mob.TargetConnId = null;
                var best = float.MaxValue;
                foreach (var p in world.Players.Values)
                {
                    if (p.Dead) continue;
                    var d = Dist(mob.X, mob.Z, p.X, p.Z);
                    if (d < def.AggroRange && d < best) { best = d; target = p; }
                }
                if (target is not null) mob.TargetConnId = target.ConnectionId;
            }

            if (target is null)
            {
                // spawn noktasına dön, tam iyileş
                var backd = Dist(mob.X, mob.Z, mob.SpawnX, mob.SpawnZ);
                if (backd > 0.5f)
                {
                    var step = def.Speed * dt;
                    mob.X += (mob.SpawnX - mob.X) / backd * step;
                    mob.Z += (mob.SpawnZ - mob.Z) / backd * step;
                }
                else if (mob.Hp < def.MaxHp) mob.Hp = def.MaxHp;
                continue;
            }

            // tasma: spawn'dan çok uzaklaşmasın
            if (Dist(mob.X, mob.Z, mob.SpawnX, mob.SpawnZ) > def.AggroRange * 3f)
            {
                mob.TargetConnId = null;
                continue;
            }

            var distT = Dist(mob.X, mob.Z, target.X, target.Z);
            if (distT > def.AttackRange)
            {
                var step = def.Speed * dt;
                mob.X += (target.X - mob.X) / distT * step;
                mob.Z += (target.Z - mob.Z) / distT * step;
            }
            else if (now - mob.LastAttackAt >= def.AttackCooldown)
            {
                mob.LastAttackAt = now;
                var dmg = Vary(def.Damage);
                target.Hp -= dmg; target.Dirty = true;
                _ = hub.Clients.Group("world").SendAsync("dmg",
                    new { tt = "pl", id = target.CharacterId, a = dmg, crit = false, from = def.Name });
                if (target.Hp <= 0)
                {
                    target.Hp = 0; target.Dead = true;
                    target.AttackMobId = null; target.TargetX = target.TargetZ = null;
                    mob.TargetConnId = null;
                    _ = hub.Clients.Client(target.ConnectionId).SendAsync("youDied",
                        new { by = def.Name });
                    _ = hub.Clients.Group("world").SendAsync("notice",
                        new { text = $"☠ {target.Name}, {def.Name} tarafından öldürüldü!" });
                }
            }
        }
    }

    private void HitMob(PlayerState p, MobState mob, double now)
    {
        var crit = Rng.NextDouble() < 0.10;
        var dmg = Vary(p.Damage);
        if (crit) dmg = (int)(dmg * 1.6);
        mob.Hp -= dmg;
        p.LastHitAt = now;
        _ = hub.Clients.Group("world").SendAsync("dmg",
            new { tt = "mob", id = mob.Id, a = dmg, crit, from = p.Name });

        // metin bekçileri: %66 ve %33 eşiklerinde çağır
        if (mob.Def.Metin && GameConfig.MetinGuard.TryGetValue(mob.Def.Code, out var guard))
        {
            foreach (var th in (int[])[66, 33])
                if (mob.Hp <= mob.Def.MaxHp * th / 100 && mob.MetinThresholdsHit.Add(th))
                {
                    for (var i = 0; i < 2; i++)
                    {
                        var a = Rng.NextDouble() * Math.PI * 2;
                        var g = world.SpawnMob(guard,
                            mob.X + (float)Math.Cos(a) * 2.5f, mob.Z + (float)Math.Sin(a) * 2.5f,
                            summoned: true);
                        g.TargetConnId = p.ConnectionId;
                    }
                    _ = hub.Clients.Group("world").SendAsync("notice",
                        new { text = $"⚠ {mob.Def.Name} bekçilerini çağırdı!" });
                }
        }

        if (mob.Hp > 0) return;

        // ---- mob öldü: ödüller ----
        mob.Hp = 0; mob.Dead = true;
        mob.RespawnAt = now + mob.Def.RespawnSeconds;
        mob.TargetConnId = null;
        _ = hub.Clients.Group("world").SendAsync("mobDead",
            new { id = mob.Id, code = mob.Def.Code, by = p.Name });

        var yang = Rng.Next(mob.Def.YangMin, mob.Def.YangMax + 1);
        p.Yang += yang;
        var drops = new List<(string code, int count)>();
        foreach (var d in mob.Def.Drops)
            if (Rng.NextDouble() < d.Chance)
                drops.Add((d.Code, Rng.Next(1, d.Max + 1)));

        GainXp(p, mob.Def.Xp);
        p.Dirty = true;
        _ = PersistLootAsync(p, drops);
        _ = hub.Clients.Client(p.ConnectionId).SendAsync("loot", new
        {
            yang,
            items = drops.Select(d => new
            {
                code = d.code,
                name = GameConfig.Items.First(i => i.Code == d.code).Name,
                count = d.count,
            }),
        });
        SendStats(p);
    }

    private void GainXp(PlayerState p, int amount)
    {
        p.Xp += amount;
        var leveled = false;
        while (p.Level < GameConfig.MaxLevel && p.Xp >= GameConfig.XpForLevel(p.Level + 1))
        {
            p.Level++;
            leveled = true;
        }
        if (leveled)
        {
            p.MaxHp = GameConfig.MaxHpFor(p.Level);
            p.Hp = p.MaxHp;   // level atlayınca tam can
            _ = hub.Clients.Group("world").SendAsync("levelUp",
                new { id = p.CharacterId, name = p.Name, level = p.Level });
        }
    }

    public void SendStats(PlayerState p) =>
        _ = hub.Clients.Client(p.ConnectionId).SendAsync("stats", new
        {
            level = p.Level, xp = p.Xp, xpNext = p.XpNext,
            hp = p.Hp, maxHp = p.MaxHp, damage = p.Damage, yang = p.Yang,
        });

    private async Task PersistLootAsync(PlayerState p, List<(string code, int count)> drops)
    {
        if (drops.Count == 0) return;
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<GameDb>();
            var rows = await db.Items.Where(i => i.CharacterId == p.CharacterId).ToListAsync();
            var usedSlots = rows.Select(r => r.SlotIndex).ToHashSet();
            int FreeSlot() { for (var s = 0; s < 45; s++) if (usedSlots.Add(s)) return s; return -1; }
            foreach (var (code, count) in drops)
            {
                var def = GameConfig.Items.First(i => i.Code == code);
                var row = def.Type == "malzeme"
                    ? rows.FirstOrDefault(i => i.ItemCode == code)
                    : null;   // silahlar yığınlanmaz, her biri ayrı satır
                if (row is null)
                {
                    row = new InventoryItem
                    {
                        Id = Guid.NewGuid(), CharacterId = p.CharacterId,
                        ItemCode = code, Count = count, SlotIndex = FreeSlot(),
                    };
                    db.Items.Add(row);
                    rows.Add(row);
                }
                else row.Count += count;
            }
            await db.SaveChangesAsync();
        }
        catch (Exception e) { log.LogError(e, "Drop kaydı hatası"); }
    }

    public async Task SaveDirtyAsync(bool force = false)
    {
        var dirty = world.Players.Values.Where(p => p.Dirty || force).ToList();
        if (dirty.Count == 0) return;
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<GameDb>();
            foreach (var p in dirty)
            {
                var ch = await db.Characters.FindAsync(p.CharacterId);
                if (ch is null) continue;
                ch.Level = p.Level; ch.Xp = p.Xp; ch.Yang = p.Yang;
                ch.PosX = p.X; ch.PosZ = p.Z; ch.LastSeenAt = DateTime.UtcNow;
                p.Dirty = false;
            }
            await db.SaveChangesAsync();
        }
        catch (Exception e) { log.LogError(e, "Karakter kaydı hatası"); }
    }

    private static float Dist(float ax, float az, float bx, float bz)
    {
        var dx = ax - bx; var dz = az - bz;
        return MathF.Sqrt(dx * dx + dz * dz);
    }

    private static int Vary(int baseVal) =>
        Math.Max(1, (int)(baseVal * (0.8 + Rng.NextDouble() * 0.4)));
}
