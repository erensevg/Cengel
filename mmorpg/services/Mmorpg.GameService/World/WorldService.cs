using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Mmorpg.GameService.Data;
using Mmorpg.GameService.Domain;
using Mmorpg.GameService.Hubs;

namespace Mmorpg.GameService.World;

/// <summary>Sunucu otoriter oyun döngüsü: hareket, mob AI, dövüş, skill,
/// XP/level, görev zinciri ve dinamik dünya olayları.</summary>
public class WorldService(
    WorldState world,
    IHubContext<GameHub> hub,
    IServiceScopeFactory scopes,
    ILogger<WorldService> log) : BackgroundService
{
    private const double TickSeconds = 0.15;
    private static readonly Random Rng = new();
    private double _lastSave;
    private double _nextEventAt = Now + 120;

    private static double Now => Environment.TickCount64 / 1000.0;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        log.LogInformation("Dünya döngüsü başladı ({Maps} harita)", world.Maps.Count);
        var last = Now;
        while (!ct.IsCancellationRequested)
        {
            var now = Now;
            var dt = (float)Math.Min(now - last, 0.5);
            last = now;
            try
            {
                foreach (var map in world.Maps.Values)
                {
                    TickPlayers(map, dt, now);
                    TickMobs(map, dt, now);
                    if (!map.Players.IsEmpty)
                        await hub.Clients.Group(WorldState.Group(map.Id))
                            .SendAsync("world", world.Snapshot(map.Id), ct);
                }
                if (now >= _nextEventAt) { _nextEventAt = now + 150 + Rng.Next(90); WorldEvent(); }
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

    /* ================= oyuncular ================= */
    private void TickPlayers(MapState map, float dt, double now)
    {
        foreach (var p in map.Players.Values)
        {
            if (p.Dead) continue;

            // mana yenilenmesi
            p.MpRegenAcc += dt * (1.5f + p.Level * 0.15f);
            if (p.Mp >= p.MaxMp) p.MpRegenAcc = 0;   // doluyken birikmesin
            else if (p.MpRegenAcc >= 1f)
            {
                var add = (int)p.MpRegenAcc;
                p.MpRegenAcc -= add;
                var before = p.Mp;
                p.Mp = Math.Min(p.MaxMp, p.Mp + add);
                if (p.Mp != before && (p.Mp == p.MaxMp || Rng.NextDouble() < 0.12))
                    SendStats(p);   // arada bir güncelle, spam olmasın
            }

            if (p.AttackMobId is { } mobId)
            {
                if (!map.Mobs.TryGetValue(mobId, out var mob) || mob.Dead)
                {
                    p.AttackMobId = null;
                }
                else
                {
                    var dist = Dist(p.X, p.Z, mob.X, mob.Z);
                    if (dist > GameConfig.PlayerAttackRange)
                    {
                        p.TargetX = mob.X; p.TargetZ = mob.Z;
                    }
                    else
                    {
                        p.TargetX = p.TargetZ = null;
                        if (now - p.LastAttackAt >= GameConfig.PlayerAttackCooldown)
                        {
                            p.LastAttackAt = now;
                            HitMob(p, map, mob, now, p.Damage);
                        }
                    }
                }
            }
            else if (p.AttackPlayerConn is { } oppConn && p.DuelWith is { } duelId)
            {
                if (!map.Players.TryGetValue(oppConn, out var opp) || opp.Dead ||
                    opp.CharacterId != duelId || opp.DuelWith != p.CharacterId)
                {
                    p.AttackPlayerConn = null;
                }
                else
                {
                    var dist = Dist(p.X, p.Z, opp.X, opp.Z);
                    if (dist > GameConfig.PlayerAttackRange)
                    {
                        p.TargetX = opp.X; p.TargetZ = opp.Z;
                    }
                    else
                    {
                        p.TargetX = p.TargetZ = null;
                        if (now - p.LastAttackAt >= GameConfig.PlayerAttackCooldown)
                        {
                            p.LastAttackAt = now;
                            HitPlayer(p, map, opp, now);
                        }
                    }
                }
            }

            if (p.TargetX is { } tx && p.TargetZ is { } tz)
            {
                var dx = tx - p.X; var dz = tz - p.Z;
                var d = MathF.Sqrt(dx * dx + dz * dz);
                var step = p.Speed * dt;
                if (d <= step) { p.X = tx; p.Z = tz; p.TargetX = p.TargetZ = null; }
                else { p.X += dx / d * step; p.Z += dz / d * step; }
                p.X = Math.Clamp(p.X, -GameConfig.WorldHalf, GameConfig.WorldHalf);
                p.Z = Math.Clamp(p.Z, -GameConfig.WorldHalf, GameConfig.WorldHalf);
                p.Dirty = true;
            }
        }
    }

    /* ================= moblar ================= */
    private void TickMobs(MapState map, float dt, double now)
    {
        foreach (var mob in map.Mobs.Values)
        {
            var def = mob.Def;
            if (mob.Dead)
            {
                if (mob.Summoned) { map.Mobs.TryRemove(mob.Id, out _); continue; }
                if (now >= mob.RespawnAt)
                {
                    mob.Dead = false; mob.Hp = def.MaxHp;
                    mob.X = mob.SpawnX; mob.Z = mob.SpawnZ;
                    mob.TargetConnId = null; mob.MetinThresholdsHit.Clear();
                }
                continue;
            }
            if (def.Metin) continue;

            PlayerState? target = null;
            if (mob.TargetConnId is not null)
                map.Players.TryGetValue(mob.TargetConnId, out target);
            if (target is null || target.Dead)
            {
                mob.TargetConnId = null;
                var best = float.MaxValue;
                foreach (var p in map.Players.Values)
                {
                    if (p.Dead) continue;
                    var d = Dist(mob.X, mob.Z, p.X, p.Z);
                    if (d < def.AggroRange && d < best) { best = d; target = p; }
                }
                if (target is not null) mob.TargetConnId = target.ConnectionId;
            }

            if (target is null)
            {
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

            if (!mob.Summoned &&
                Dist(mob.X, mob.Z, mob.SpawnX, mob.SpawnZ) > def.AggroRange * 3f)
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
                var dmg = Math.Max(1, Vary(def.Damage) * 100 / (100 + target.Defense));
                target.Hp -= dmg; target.Dirty = true;
                _ = Group(map).SendAsync("dmg",
                    new { tt = "pl", id = target.CharacterId, a = dmg, crit = false, from = def.Name });
                if (target.Hp <= 0)
                {
                    target.Hp = 0; target.Dead = true;
                    target.AttackMobId = null; target.TargetX = target.TargetZ = null;
                    mob.TargetConnId = null;
                    // ölüm cezası: seviyenin %1'i kadar XP kaybı (seviye düşmez)
                    var penalty = GameConfig.DeathXpPenalty(target.Level);
                    var floor = GameConfig.XpForLevel(target.Level);
                    target.Xp = Math.Max(floor, target.Xp - penalty);
                    target.Dirty = true;
                    _ = hub.Clients.Client(target.ConnectionId)
                        .SendAsync("youDied", new { by = def.Name, xpLost = penalty });
                    _ = Group(map).SendAsync("notice",
                        new { text = $"☠ {target.Name}, {def.Name} tarafından öldürüldü! (-{penalty} XP)" });
                    SendStats(target);
                }
                else SendStats(target);
            }
        }
    }

    /* ================= vuruş & ödüller ================= */
    private void HitMob(PlayerState p, MapState map, MobState mob, double now,
                        int rawDamage, bool fromSkill = false)
    {
        var crit = !fromSkill && Rng.NextDouble() < 0.10;
        var dmg = Vary(rawDamage);
        if (crit) dmg = (int)(dmg * 1.6);
        mob.Hp -= dmg;
        _ = Group(map).SendAsync("dmg",
            new { tt = "mob", id = mob.Id, a = dmg, crit = crit || fromSkill, from = p.Name });

        if (mob.Def.Metin && GameConfig.MetinGuard.TryGetValue(mob.Def.Code, out var guard))
        {
            foreach (var th in (int[])[66, 33])
                if (mob.Hp <= mob.Def.MaxHp * th / 100 && mob.MetinThresholdsHit.Add(th))
                {
                    for (var i = 0; i < 2; i++)
                    {
                        var a = Rng.NextDouble() * Math.PI * 2;
                        var g = world.SpawnMob(map.Id, guard,
                            mob.X + (float)Math.Cos(a) * 2.5f,
                            mob.Z + (float)Math.Sin(a) * 2.5f, summoned: true);
                        g.TargetConnId = p.ConnectionId;
                    }
                    _ = Group(map).SendAsync("notice",
                        new { text = $"⚠ {mob.Def.Name} bekçilerini çağırdı!" });
                }
        }

        if (mob.Hp > 0) return;

        mob.Hp = 0; mob.Dead = true;
        mob.RespawnAt = now + mob.Def.RespawnSeconds;
        mob.TargetConnId = null;
        _ = Group(map).SendAsync("mobDead",
            new { id = mob.Id, code = mob.Def.Code, by = p.Name });

        var yang = Rng.Next(mob.Def.YangMin, mob.Def.YangMax + 1);
        p.Yang += yang;
        var drops = new List<(string code, int count)>();
        foreach (var d in mob.Def.Drops)
            if (Rng.NextDouble() < d.Chance)
            {
                drops.Add((d.Code, Rng.Next(1, d.Max + 1)));
                if (d.Chance < 0.001)   // efsane drop: tüm dünyaya duyur
                {
                    var itemName = GameConfig.ItemByCode(d.Code)?.Name ?? d.Code;
                    Broadcast($"🌟🌟 {p.Name}, {itemName} DÜŞÜRDÜ!! " +
                              $"({GameConfig.MapById(map.Id)!.Name})");
                }
            }

        // binek malzemeleri — canavarlardan zor düşer (merkezî tablo)
        if (!mob.Def.Metin)
        {
            if (Rng.NextDouble() < GameConfig.MedallionDropChance(mob.Def))
                drops.Add(("at_madalyonu", 1));
            // kıvılcım: çöl yılanı/akrebi binde bir; kum patronu/metini daha cömert
            var sparkChance = mob.Def.Code switch
            {
                "col_yilani" or "col_akrebi" => 0.001,
                "kum_firavunu" => 0.03,
                _ => 0.0,
            };
            if (sparkChance > 0 && Rng.NextDouble() < sparkChance)
                drops.Add(("kivilcim", 1));
        }

        GainXp(p, mob.Def.Xp);
        p.Dirty = true;
        _ = PersistLootAsync(p, drops);
        _ = hub.Clients.Client(p.ConnectionId).SendAsync("loot", new
        {
            yang,
            items = drops.Select(d => new
            {
                code = d.code,
                name = GameConfig.ItemByCode(d.code)?.Name ?? d.code,
                count = d.count,
            }),
        });
        AdvanceQuest(p, mob.Def.Metin ? "metin" : "kill", mob.Def.Code, 1);
        SendStats(p);
    }

    /* ================= PvP düello ================= */
    private void HitPlayer(PlayerState atk, MapState map, PlayerState tgt, double now)
    {
        var crit = Rng.NextDouble() < 0.10;
        var dmg = Math.Max(1, Vary(atk.Damage) * 100 / (100 + tgt.Defense));
        if (crit) dmg = (int)(dmg * 1.6);
        tgt.Hp -= dmg; tgt.Dirty = true;
        _ = Group(map).SendAsync("dmg",
            new { tt = "pl", id = tgt.CharacterId, a = dmg, crit, from = atk.Name });
        if (tgt.Hp <= 0)
        {
            tgt.Hp = 1;   // düelloda ölüm yok — 1 canla kalır
            EndDuel(atk, tgt, winnerName: atk.Name);
        }
        else SendStats(tgt);
    }

    /// <summary>Düelloyu bitir: her iki tarafı temizle, sonucu duyur.</summary>
    public void EndDuel(PlayerState a, PlayerState b, string? winnerName)
    {
        foreach (var pl in new[] { a, b })
        {
            pl.DuelWith = null; pl.DuelOppConn = null;
            pl.AttackPlayerConn = null; pl.TargetX = pl.TargetZ = null;
        }
        SendStats(a); SendStats(b);
        var map = world.Maps[a.MapId];
        if (winnerName is not null)
            _ = Group(map).SendAsync("notice",
                new { text = $"⚔️ Düello bitti — {winnerName} kazandı!" });
        foreach (var pl in new[] { a, b })
            _ = hub.Clients.Client(pl.ConnectionId).SendAsync("duelEnd",
                new { winner = winnerName });
    }

    public void GainXp(PlayerState p, int amount)
    {
        p.Xp += amount;
        var leveled = false;
        while (p.Level < GameConfig.MaxLevel && p.Xp >= GameConfig.XpForLevel(p.Level + 1))
        {
            p.Level++;
            p.SkillPoints++;      // her seviye 1 skill puanı
            leveled = true;
        }
        if (leveled)
        {
            p.MaxHp = GameConfig.MaxHpFor(p.Level) + p.HpBonus;
            p.Hp = p.MaxHp;
            p.MaxMp = GameConfig.MaxMpFor(p.Level);
            p.Mp = p.MaxMp;
            _ = Group(world.Maps[p.MapId]).SendAsync("levelUp",
                new { id = p.CharacterId, name = p.Name, level = p.Level });
            AdvanceQuest(p, "level", "", p.Level);
        }
    }

    /* ================= skill ================= */
    public object CastSkill(PlayerState p, string code, long? targetMobId)
    {
        var def = GameConfig.SkillByCode(code);
        if (def is null || !p.Skills.TryGetValue(code, out var deg))
            return new { error = "Bu skill'i öğrenmedin. (K penceresi)" };
        var now = Now;
        if (p.Cooldowns.TryGetValue(code, out var readyAt) && now < readyAt)
            return new { error = $"{def.Name} hazır değil ({readyAt - now:0.0}sn)" };
        if (p.Mp < def.Mana) return new { error = "Yeterli manan yok." };
        if (p.Dead) return new { error = "Ölüsün." };

        var map = world.Maps[p.MapId];
        var power = def.Power * (1 + 0.1f * (deg - 1));
        var targets = new List<long>();

        if (def.Kind == "hit")
        {
            if (targetMobId is not { } tid || !map.Mobs.TryGetValue(tid, out var mob) || mob.Dead)
                return new { error = "Hedef seç." };
            if (Dist(p.X, p.Z, mob.X, mob.Z) > GameConfig.PlayerAttackRange + 3.5f)
                return new { error = "Hedef çok uzak." };
            p.Mp -= def.Mana;
            p.Cooldowns[code] = now + def.Cooldown;
            HitMob(p, map, mob, now, (int)(p.Damage * power), fromSkill: true);
            targets.Add(tid);
        }
        else if (def.Kind == "aoe")
        {
            p.Mp -= def.Mana;
            p.Cooldowns[code] = now + def.Cooldown;
            foreach (var mob in map.Mobs.Values)
            {
                if (mob.Dead) continue;
                if (Dist(p.X, p.Z, mob.X, mob.Z) <= def.Radius)
                {
                    HitMob(p, map, mob, now, (int)(p.Damage * power), fromSkill: true);
                    targets.Add(mob.Id);
                }
            }
        }
        else // buff
        {
            p.Mp -= def.Mana;
            p.Cooldowns[code] = now + def.Cooldown;
            p.BuffUntil = now + def.BuffDuration;
            p.BuffMult = power;
        }

        _ = Group(map).SendAsync("skillFx",
            new { caster = p.CharacterId, code, x = p.X, z = p.Z, targets });
        SendStats(p);
        return new { ok = true, cooldown = def.Cooldown };
    }

    /* ================= görev zinciri ================= */
    public void AdvanceQuest(PlayerState p, string kind, string code, int value)
    {
        if (p.QuestIndex >= GameConfig.Quests.Length) return;
        var q = GameConfig.Quests[p.QuestIndex];
        if (q.Kind != kind) return;
        if (q.TargetCode != "" && q.TargetCode != code) return;

        p.QuestProgress = kind is "level" ? value : p.QuestProgress + value;
        var done = p.QuestProgress >= q.TargetCount;
        if (done)
        {
            p.QuestIndex++;
            p.QuestProgress = 0;
            p.Yang += q.RewardYang;
            p.SkillPoints += q.RewardSp;
            if (q.RewardItem is not null)
                _ = PersistLootAsync(p, [(q.RewardItem, q.RewardItemCount)]);
            var next = p.QuestIndex < GameConfig.Quests.Length
                ? GameConfig.Quests[p.QuestIndex] : null;
            _ = hub.Clients.Client(p.ConnectionId).SendAsync("questDone", new
            {
                code = q.Code, title = q.Title, story = q.StoryDone,
                rewardYang = q.RewardYang, rewardXp = q.RewardXp,
                rewardItem = q.RewardItem is null ? null
                    : GameConfig.ItemByCode(q.RewardItem)?.Name,
                rewardItemCount = q.RewardItemCount, rewardSp = q.RewardSp,
                next = next is null ? null : new
                {
                    code = next.Code, title = next.Title, story = next.StoryStart,
                    target = next.TargetCount,
                },
            });
            _ = Group(world.Maps[p.MapId]).SendAsync("notice",
                new { text = $"📜 {p.Name}, \"{q.Title}\" görevini tamamladı!" });
            _ = PersistQuestAsync(p, q.Code);
            if (q.RewardXp > 0) GainXp(p, q.RewardXp);
            SendStats(p);
            // yeni görev seviye türündense mevcut seviyeyle hemen denetle
            if (next is { Kind: "level" }) AdvanceQuest(p, "level", "", p.Level);
        }
        else
        {
            _ = hub.Clients.Client(p.ConnectionId).SendAsync("questProgress",
                new { code = q.Code, progress = p.QuestProgress, target = q.TargetCount });
        }
        p.Dirty = true;
    }

    /* ================= dinamik dünya olayı ================= */
    private void WorldEvent()
    {
        var busy = world.Maps.Values.Where(m => !m.Players.IsEmpty).ToList();
        if (busy.Count == 0) return;
        var map = busy[Rng.Next(busy.Count)];
        var mapName = GameConfig.MapById(map.Id)!.Name;
        if (Rng.NextDouble() < 0.5)
        {
            // kadim metin: haritanın metinini rastgele noktaya diker
            var metin = GameConfig.Spawns.First(s => s.MapId == map.Id &&
                GameConfig.MobByCode(s.MobCode).Metin).MobCode;
            var x = (float)(Rng.NextDouble() * 120 - 60);
            var z = (float)(Rng.NextDouble() * 120 - 60);
            world.SpawnMob(map.Id, metin, x, z, summoned: true);
            Broadcast($"⚡ Kadim bir metin belirdi: {mapName}! Onu ilk kıran efsane olur.");
        }
        else
        {
            var victims = map.Players.Values.Where(p => !p.Dead).ToList();
            if (victims.Count == 0) return;
            var v = victims[Rng.Next(victims.Count)];
            var basic = GameConfig.Spawns.First(s => s.MapId == map.Id &&
                !GameConfig.MobByCode(s.MobCode).Metin).MobCode;
            for (var i = 0; i < 4; i++)
            {
                var a = Rng.NextDouble() * Math.PI * 2;
                var g = world.SpawnMob(map.Id, basic,
                    v.X + (float)Math.Cos(a) * 5f, v.Z + (float)Math.Sin(a) * 5f, summoned: true);
                g.TargetConnId = v.ConnectionId;
            }
            Broadcast($"🌊 {mapName}'nde canavar dalgası! Hedef: {v.Name}");
        }
    }

    private void Broadcast(string text)
    {
        foreach (var m in world.Maps.Values)
            if (!m.Players.IsEmpty)
                _ = Group(m).SendAsync("notice", new { text });
    }

    /* ================= yardımcılar / kalıcılık ================= */
    private IClientProxy Group(MapState map) => hub.Clients.Group(WorldState.Group(map.Id));

    /// <summary>Kuşanılı ekipmandan saldırı/savunma/HP bonusu + parlama kademesi.</summary>
    public static void RecalcStats(PlayerState p,
        IEnumerable<(string Code, int Plus)> equipped)
    {
        int atk = 0, def = 0, hp = 0, maxPlus = -1;
        foreach (var (code, plus) in equipped)
        {
            var d = GameConfig.ItemByCode(code);
            if (d is null) continue;
            atk += GameConfig.Boost(d.Bonus, plus);
            def += GameConfig.Boost(d.Defense, plus);
            hp += GameConfig.Boost(d.HpBonus, plus);
            maxPlus = Math.Max(maxPlus, plus);
        }
        p.AttackBonus = atk;
        p.Defense = def;
        p.HpBonus = hp;
        p.GlowTier = maxPlus >= 11 ? 3 : maxPlus >= 10 ? 2 : maxPlus >= 9 ? 1 : 0;
        var newMax = GameConfig.MaxHpFor(p.Level) + hp;
        if (p.MaxHp != newMax)
        {
            p.Hp = Math.Min(newMax, Math.Max(1, p.Hp));
            p.MaxHp = newMax;
            p.Hp = Math.Min(p.Hp, p.MaxHp);
        }
    }

    public void SendStats(PlayerState p) =>
        _ = hub.Clients.Client(p.ConnectionId).SendAsync("stats", new
        {
            level = p.Level, xp = p.Xp, xpNext = p.XpNext,
            hp = p.Hp, maxHp = p.MaxHp, mp = p.Mp, maxMp = p.MaxMp,
            damage = p.Damage, yang = p.Yang, defense = p.Defense,
            skillPoints = p.SkillPoints, buff = p.BuffActive,
            hasHorse = p.HasHorse, horseArmored = p.HorseArmored, mounted = p.Mounted,
        });

    public async Task PersistLootAsync(PlayerState p, List<(string code, int count)> drops)
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
                var def = GameConfig.ItemByCode(code)!;
                var row = GameConfig.IsEquipType(def.Type) ? null
                    : rows.FirstOrDefault(i => i.ItemCode == code);
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

    private async Task PersistQuestAsync(PlayerState p, string questCode)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<GameDb>();
            var row = await db.Quests.FirstOrDefaultAsync(
                q => q.CharacterId == p.CharacterId && q.Code == questCode);
            if (row is null)
                db.Quests.Add(new CharacterQuest
                {
                    Id = Guid.NewGuid(), CharacterId = p.CharacterId,
                    Code = questCode, Progress = 0, Completed = true,
                });
            else row.Completed = true;
            await db.SaveChangesAsync();
        }
        catch (Exception e) { log.LogError(e, "Görev kaydı hatası"); }
    }

    public async Task SaveDirtyAsync(bool force = false)
    {
        var dirty = world.Maps.Values.SelectMany(m => m.Players.Values)
            .Where(p => p.Dirty || force).ToList();
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
                ch.PosX = p.X; ch.PosZ = p.Z; ch.MapId = p.MapId;
                ch.SkillPoints = p.SkillPoints;
                ch.HasHorse = p.HasHorse; ch.HorseArmored = p.HorseArmored;
                ch.LastSeenAt = DateTime.UtcNow;
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
