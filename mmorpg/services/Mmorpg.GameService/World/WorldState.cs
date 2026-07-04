using System.Collections.Concurrent;
using Mmorpg.GameService.Domain;

namespace Mmorpg.GameService.World;

public class PlayerState
{
    public required string ConnectionId { get; init; }
    public required Guid UserId { get; init; }
    public required Guid CharacterId { get; init; }
    public required string Name { get; init; }
    public int Level;
    public long Xp;
    public long Yang;
    public float X, Z;
    public int Hp, MaxHp;
    public bool Dead;
    public float? TargetX, TargetZ;          // tıkla-yürü hedefi
    public long? AttackMobId;                // otomatik saldırı hedefi
    public double LastAttackAt;
    public double LastHitAt;                 // görsel için
    public bool Dirty;                       // DB'ye yazılacak değişiklik var
    public int WeaponBonus;                  // kuşanılan silahın katkısı

    public int Damage => GameConfig.BaseDamageFor(Level) + WeaponBonus;
    public long XpNext => GameConfig.XpForLevel(Level + 1);
}

public class MobState
{
    public long Id;
    public required MobDef Def;
    public float X, Z;
    public float SpawnX, SpawnZ;
    public int Hp;
    public bool Dead;
    public double RespawnAt;
    public string? TargetConnId;             // kovaladığı oyuncu
    public double LastAttackAt;
    public readonly HashSet<int> MetinThresholdsHit = [];  // 66/33 bekçi çağrıları
    public bool Summoned;                    // metin bekçisi: ölünce yeniden doğmaz
}

/// <summary>Bellekteki canlı dünya. Tek harita, tek süreç (yatay ölçek için ROADMAP'e bak).</summary>
public class WorldState
{
    public readonly ConcurrentDictionary<string, PlayerState> Players = new(); // connId ->
    public readonly ConcurrentDictionary<long, MobState> Mobs = new();
    private long _nextMobId = 1;

    public WorldState()
    {
        var rng = new Random(42);
        foreach (var zone in GameConfig.Spawns)
            for (var i = 0; i < zone.Count; i++)
            {
                var a = rng.NextDouble() * Math.PI * 2;
                var r = zone.Radius * Math.Sqrt(rng.NextDouble());
                var x = zone.X + (float)(Math.Cos(a) * r);
                var z = zone.Z + (float)(Math.Sin(a) * r);
                SpawnMob(zone.MobCode, x, z, summoned: false);
            }
    }

    public MobState SpawnMob(string code, float x, float z, bool summoned)
    {
        var def = GameConfig.MobByCode(code);
        var mob = new MobState
        {
            Id = Interlocked.Increment(ref _nextMobId),
            Def = def, X = x, Z = z, SpawnX = x, SpawnZ = z,
            Hp = def.MaxHp, Summoned = summoned,
        };
        Mobs[mob.Id] = mob;
        return mob;
    }

    /// <summary>İstemciye giden kompakt dünya anlık görüntüsü.</summary>
    public object Snapshot() => new
    {
        players = Players.Values.Select(p => new
        {
            id = p.CharacterId, name = p.Name, x = p.X, z = p.Z,
            hp = p.Hp, maxHp = p.MaxHp, level = p.Level, dead = p.Dead,
            moving = p.TargetX.HasValue,
        }),
        mobs = Mobs.Values.Where(m => !m.Dead).Select(m => new
        {
            id = m.Id, code = m.Def.Code, x = m.X, z = m.Z,
            hp = m.Hp, maxHp = m.Def.MaxHp,
        }),
    };
}
