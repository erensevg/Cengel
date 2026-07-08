using System.Collections.Concurrent;
using Mmorpg.GameService.Domain;

namespace Mmorpg.GameService.World;

public class PlayerState
{
    public required string ConnectionId { get; init; }
    public required Guid UserId { get; init; }
    public required Guid CharacterId { get; init; }
    public required string Name { get; init; }
    public string ClassType = "savasci";
    public string MapId = GameConfig.StartMap;
    public int Level;
    public long Xp;
    public long Yang;
    public float X, Z;
    public int Hp, MaxHp;
    public int Mp, MaxMp;
    public float MpRegenAcc;
    public bool Dead;
    public float? TargetX, TargetZ;
    public long? AttackMobId;
    public double LastAttackAt;
    public bool Dirty;
    public int AttackBonus;                  // kuşanılı ekipman toplamı (+'lı)
    public int Defense;
    public int HpBonus;
    public int GlowTier;                     // 0 yok, 1:+9, 2:+10, 3:+11
    public int SkillPoints;
    public readonly Dictionary<string, int> Skills = new();       // code -> derece
    public readonly Dictionary<string, double> Cooldowns = new(); // code -> hazır olacağı an
    public double BuffUntil;
    public float BuffMult = 1f;
    public int QuestIndex;      // kaçıncı görevde (tamamlanan sayısı)
    public int QuestProgress;
    public bool HasHorse;       // at satın alındı mı
    public bool HorseArmored;   // at zırhlandı mı (kıvılcım)
    public bool Mounted;        // şu an ata binili mi
    // PvP düello
    public Guid? DuelWith;         // rakip karakter id (düello aktif)
    public string? DuelOppConn;    // rakip bağlantı id
    public Guid? DuelPendingFrom;  // düello isteği gönderen karakter id
    public string? DuelPendingConn;
    public string? AttackPlayerConn; // saldırdığı oyuncunun bağlantı id'si (düelloda)

    /// <summary>Hareket hızı — ata binince hızlanır (zırhlıysa biraz daha).</summary>
    public float Speed => Mounted
        ? GameConfig.PlayerSpeed * (HorseArmored ? 1.9f : 1.6f)
        : GameConfig.PlayerSpeed;

    public int Damage
    {
        get
        {
            var d = GameConfig.BaseDamageFor(Level, ClassType) + AttackBonus;
            return BuffActive ? (int)(d * BuffMult) : d;
        }
    }
    public bool BuffActive => Environment.TickCount64 / 1000.0 < BuffUntil;
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
    public string? TargetConnId;
    public double LastAttackAt;
    public readonly HashSet<int> MetinThresholdsHit = [];
    public bool Summoned;       // dünya olayı / bekçi: ölünce yeniden doğmaz
}

public class MapState
{
    public required string Id;
    public readonly ConcurrentDictionary<string, PlayerState> Players = new();
    public readonly ConcurrentDictionary<long, MobState> Mobs = new();
}

/// <summary>Bellekteki canlı dünya: harita başına oyuncular + moblar.</summary>
public class WorldState
{
    public readonly Dictionary<string, MapState> Maps = new();
    private long _nextMobId;

    public WorldState()
    {
        var rng = new Random(42);
        foreach (var map in GameConfig.Maps)
            Maps[map.Id] = new MapState { Id = map.Id };
        foreach (var zone in GameConfig.Spawns)
            for (var i = 0; i < zone.Count; i++)
            {
                var a = rng.NextDouble() * Math.PI * 2;
                var r = zone.Radius * Math.Sqrt(rng.NextDouble());
                SpawnMob(zone.MapId, zone.MobCode,
                    zone.X + (float)(Math.Cos(a) * r),
                    zone.Z + (float)(Math.Sin(a) * r), summoned: false);
            }
    }

    public MobState SpawnMob(string mapId, string code, float x, float z, bool summoned)
    {
        var def = GameConfig.MobByCode(code);
        var mob = new MobState
        {
            Id = Interlocked.Increment(ref _nextMobId),
            Def = def, X = x, Z = z, SpawnX = x, SpawnZ = z,
            Hp = def.MaxHp, Summoned = summoned,
        };
        Maps[mapId].Mobs[mob.Id] = mob;
        return mob;
    }

    public PlayerState? FindPlayer(string connId)
    {
        foreach (var map in Maps.Values)
            if (map.Players.TryGetValue(connId, out var p)) return p;
        return null;
    }

    public bool UserOnline(Guid userId) =>
        Maps.Values.Any(m => m.Players.Values.Any(p => p.UserId == userId));

    public static string Group(string mapId) => $"map:{mapId}";

    public object Snapshot(string mapId)
    {
        var map = Maps[mapId];
        return new
        {
            mapId,
            players = map.Players.Values.Select(p => new
            {
                id = p.CharacterId, name = p.Name, cls = p.ClassType, x = p.X, z = p.Z,
                hp = p.Hp, maxHp = p.MaxHp, level = p.Level, dead = p.Dead,
                moving = p.TargetX.HasValue, buff = p.BuffActive, glow = p.GlowTier,
                mounted = p.Mounted, horseArmored = p.HorseArmored,
            }),
            mobs = map.Mobs.Values.Where(m => !m.Dead).Select(m => new
            {
                id = m.Id, code = m.Def.Code, x = m.X, z = m.Z,
                hp = m.Hp, maxHp = m.Def.MaxHp,
            }),
        };
    }
}
