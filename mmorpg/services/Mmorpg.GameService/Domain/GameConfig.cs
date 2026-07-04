namespace Mmorpg.GameService.Domain;

public record DropDef(string Code, double Chance, int Max);

public record MobDef(
    string Code, string Name, bool Metin, int Level, int MaxHp, int Damage,
    float Speed, float AggroRange, float AttackRange, float AttackCooldown,
    int Xp, int YangMin, int YangMax, DropDef[] Drops, float RespawnSeconds, float Scale);

public record ItemDef(string Code, string Name, string Icon, string Desc);

public record SpawnZone(string MobCode, float X, float Z, float Radius, int Count);

/// <summary>Tek doğruluk kaynağı: mob/item/spawn/xp tanımları.
/// İstemciye /api/game/config ile aynen iner.</summary>
public static class GameConfig
{
    public const float WorldHalf = 100f;      // dünya [-100, 100] karesi
    public const float PlayerSpeed = 6.5f;
    public const float PlayerAttackRange = 2.6f;
    public const float PlayerAttackCooldown = 0.85f;
    public const int MaxLevel = 99;
    public static readonly float[] SpawnPoint = [0f, -6f];

    public static long XpForLevel(int level) => (long)(50 * Math.Pow(level, 2.2));
    public static int MaxHpFor(int level) => 90 + 22 * level;
    public static int BaseDamageFor(int level) => 8 + 4 * level;

    public static readonly ItemDef[] Items =
    [
        new("domuz_derisi", "Domuz Derisi", "🐗", "Yaban domuzundan düşer, tüccara satılır."),
        new("kurt_postu", "Kurt Postu", "🐺", "Kalın kış postu."),
        new("zehir_ignesi", "Zehir İğnesi", "🦂", "Akrep kuyruğundan; simyada kullanılır."),
        new("ayi_pencesi", "Ayı Pençesi", "🐻", "Güç iksirlerinin ham maddesi."),
        new("metin_parcasi", "Metin Parçası", "💎", "Metin taşının kalbinden nadir kristal."),
        new("sifa_otu", "Şifa Otu", "🌿", "Canını tazeler (ileride kullanılabilir)."),
    ];

    public static readonly MobDef[] Mobs =
    [
        new("yaban_domuzu", "Yaban Domuzu", false, 1, 60, 5, 2.4f, 6f, 1.7f, 1.6f,
            25, 5, 15, [new("domuz_derisi", 0.5, 2), new("sifa_otu", 0.15, 1)], 12f, 1f),
        new("kurt", "Kurt", false, 3, 115, 9, 3.4f, 8f, 1.8f, 1.4f,
            48, 12, 28, [new("kurt_postu", 0.45, 1), new("sifa_otu", 0.15, 1)], 15f, 1.05f),
        new("col_akrebi", "Çöl Akrebi", false, 5, 180, 14, 2.8f, 7f, 1.7f, 1.5f,
            80, 20, 45, [new("zehir_ignesi", 0.4, 2)], 18f, 0.95f),
        new("dag_ayisi", "Dağ Ayısı", false, 8, 320, 22, 2.9f, 7.5f, 2.0f, 1.8f,
            150, 40, 80, [new("ayi_pencesi", 0.5, 2), new("sifa_otu", 0.2, 1)], 25f, 1.35f),
        // Metin taşları: sabit, saldırmaz; vurulunca çevreye bekçi çağırır, kırılınca bol ödül.
        new("metin_kaya", "Kaya Metini", true, 5, 950, 0, 0f, 0f, 0f, 0f,
            420, 180, 350, [new("metin_parcasi", 1.0, 2), new("sifa_otu", 0.6, 2)], 60f, 1f),
        new("metin_ates", "Ateş Metini", true, 9, 1700, 0, 0f, 0f, 0f, 0f,
            950, 400, 700, [new("metin_parcasi", 1.0, 4)], 90f, 1.2f),
    ];

    /// <summary>Metin vurulduğunda hangi bekçiler çağrılır.</summary>
    public static readonly Dictionary<string, string> MetinGuard = new()
    {
        ["metin_kaya"] = "kurt",
        ["metin_ates"] = "dag_ayisi",
    };

    public static readonly SpawnZone[] Spawns =
    [
        new("yaban_domuzu", -30f, -20f, 20f, 9),
        new("yaban_domuzu", 15f, -35f, 14f, 5),
        new("kurt", 40f, 30f, 22f, 8),
        new("col_akrebi", -50f, 50f, 20f, 7),
        new("dag_ayisi", 62f, -52f, 18f, 5),
        new("metin_kaya", 0f, 45f, 0f, 1),
        new("metin_kaya", -62f, -58f, 0f, 1),
        new("metin_kaya", 72f, 8f, 0f, 1),
        new("metin_ates", 45f, -72f, 0f, 1),
        new("metin_ates", -76f, 22f, 0f, 1),
    ];

    public static MobDef MobByCode(string code) => Mobs.First(m => m.Code == code);

    /// <summary>İstemciye inen konfig nesnesi.</summary>
    public static object ClientConfig() => new
    {
        worldHalf = WorldHalf,
        playerSpeed = PlayerSpeed,
        playerAttackRange = PlayerAttackRange,
        spawnPoint = SpawnPoint,
        maxLevel = MaxLevel,
        mobs = Mobs,
        items = Items,
        xpTable = Enumerable.Range(1, 40).Select(XpForLevel).ToArray(),
    };
}
