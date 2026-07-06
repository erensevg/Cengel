namespace Mmorpg.GameService.Domain;

public record DropDef(string Code, double Chance, int Max);

public record MobDef(
    string Code, string Name, bool Metin, int Level, int MaxHp, int Damage,
    float Speed, float AggroRange, float AttackRange, float AttackCooldown,
    int Xp, int YangMin, int YangMax, DropDef[] Drops, float RespawnSeconds, float Scale);

public record ItemDef(string Code, string Name, string Icon, string Desc,
    string Type = "malzeme", int Bonus = 0, int HealHp = 0, int HealMp = 0,
    int Defense = 0, int HpBonus = 0, long Price = 0);

public record NpcDef(string Id, string Name, string Role, string MapId, float X, float Z);

public record SpawnZone(string MapId, string MobCode, float X, float Z, float Radius, int Count);

public record SkillDef(string Code, string Name, string Icon, int ReqLevel, int Mana,
    float Cooldown, string Kind /* hit | aoe | buff */, float Power, float Radius,
    float BuffDuration, string Desc);

public record MapDef(string Id, string Name, int ReqLevel, string Theme,
    float PortalX, float PortalZ, string Desc);

public record QuestDef(string Code, string Title, string Kind /* kill | metin | level | map */,
    string TargetCode, int TargetCount, string StoryStart, string StoryDone,
    int RewardYang, int RewardXp, string? RewardItem, int RewardItemCount, int RewardSp);

/// <summary>Tek doğruluk kaynağı: tüm oyun tanımları. İstemciye /api/game/config ile iner.</summary>
public static class GameConfig
{
    public const float WorldHalf = 100f;
    public const float PlayerSpeed = 6.5f;
    public const float PlayerAttackRange = 2.6f;
    public const float PlayerAttackCooldown = 0.85f;
    public const int MaxLevel = 99;
    public const string StartMap = "dogu";
    public static readonly float[] SpawnPoint = [0f, -6f];

    public static long XpForLevel(int level) => (long)(50 * Math.Pow(level, 2.2));
    public static int MaxHpFor(int level) => 90 + 22 * level;
    public static int MaxMpFor(int level) => 40 + 12 * level;
    public static int BaseDamageFor(int level) => 8 + 4 * level;

    public static readonly MapDef[] Maps =
    [
        new("dogu", "Doğu Vadisi", 1, "vadi", 6f, -6f,
            "Ejder Tanrısı'nın kadim vadisi. Yeni savaşçıların yurdu."),
        new("col", "Kızıl Çöl", 5, "col", 6f, -6f,
            "Kavurucu kumların altında ateş metinleri uyuyor."),
        new("zirve", "Buz Zirvesi", 10, "zirve", 6f, -6f,
            "Buzun kalbinde, Ejder Tanrısı'nın son sırrı."),
    ];

    public static readonly ItemDef[] Items =
    [
        // malzemeler (tüccara satılır)
        new("domuz_derisi", "Kemik Parçası", "🦴", "İskeletlerden düşer, tüccara satılır.", Price: 8),
        new("kurt_postu", "Kara Kumaş", "🕸️", "İskelet savaşçıların pelerininden.", Price: 14),
        new("zehir_ignesi", "Çöl Zehri", "🐍", "Kum Haydutlarının silahlarından.", Price: 22),
        new("ayi_pencesi", "Şampiyon Nişanı", "🎖️", "İskelet Şampiyonlarından düşer.", Price: 35),
        new("metin_parcasi", "Metin Parçası", "💎", "Metin kristali — DEMİRCİDE + BASMAK İÇİN GEREKLİ.", Price: 150),
        new("buz_kristali", "Buz Kristali", "❄️", "Buz Zirvesi'nin donmuş gözyaşı.", Price: 80),
        // iksirler
        new("sifa_otu", "Şifa Otu", "🌿", "Çiğnenince canı tazeler.", "iksir", HealHp: 40, Price: 15),
        new("kucuk_hp_iksiri", "Küçük Can İksiri", "🧪", "Canı 80 tazeler.", "iksir", HealHp: 80, Price: 45),
        new("buyuk_hp_iksiri", "Büyük Can İksiri", "⚗️", "Canı 250 tazeler.", "iksir", HealHp: 250, Price: 130),
        new("kucuk_mp_iksiri", "Küçük Mana İksiri", "💧", "Manayı 50 tazeler.", "iksir", HealMp: 50, Price: 40),
        new("buyuk_mp_iksiri", "Büyük Mana İksiri", "🔮", "Manayı 150 tazeler.", "iksir", HealMp: 150, Price: 110),
        new("isinlanma_parsomeni", "Işınlanma Parşömeni", "📜",
            "Nerede olursan ol, ışınlanma kapısını açar.", "parsomen", Price: 320),
        // silahlar
        new("pasli_kilic", "Paslı Kılıç", "🗡️", "Eski ama iş görür.", "silah", 4, Price: 220),
        new("kurt_disi_kilic", "Kurt Dişi Kılıç", "⚔️", "Kurt sürüsünün laneti.", "silah", 9, Price: 700),
        new("akrep_hanceri", "Akrep Hançeri", "🔪", "Zehir gibi keser.", "silah", 14, Price: 1800),
        new("ayi_baltasi", "Ayı Baltası", "🪓", "Dağ gibi vurur.", "silah", 22, Price: 4500),
        new("metin_kilici", "Metin Kılıcı", "🌟", "Metin kristalinden dövüldü.", "silah", 32),
        new("buz_kilici", "Buz Kılıcı", "🧊", "Dokunduğunu dondurur.", "silah", 45),
        new("ejder_kilici", "EJDER KILICI", "🐉", "Efsane: Ejder Tanrısı'nın dişinden dövüldü.", "silah", 70),
        // zırhlar
        new("deri_zirh", "Deri Zırh", "🦺", "Sertleştirilmiş domuz derisi.", "zirh", Defense: 6, HpBonus: 20, Price: 300),
        new("plaka_zirh", "Plaka Zırh", "🛡️", "Dövme çelik plakalar.", "zirh", Defense: 14, HpBonus: 60, Price: 2400),
        new("ejder_zirhi", "Ejder Zırhı", "🐲", "Ejder pulundan; ateşe dayanıklı.", "zirh", Defense: 28, HpBonus: 150),
        // kalkanlar
        new("tahta_kalkan", "Tahta Kalkan", "🪵", "Basit ama güvenilir.", "kalkan", Defense: 4, Price: 180),
        new("demir_kalkan", "Demir Kalkan", "⚙️", "Ağır ve sağlam.", "kalkan", Defense: 10, Price: 1400),
        new("buz_kalkani", "Buz Kalkanı", "🧿", "Buz metininin kalbinden.", "kalkan", Defense: 20, HpBonus: 40),
        // takılar
        new("yesim_kupe", "Yeşim Küpe", "🟢", "Şans getirdiğine inanılır.", "kupe", 3, HpBonus: 15, Price: 850),
        new("ates_kupesi", "Ateş Küpesi", "🔥", "Çöl metininin közünden.", "kupe", 8, HpBonus: 30),
        new("kurt_disi_kolye", "Kurt Dişi Kolye", "🦷", "Sürünün gücünü taşır.", "kolye", 5, HpBonus: 20, Price: 950),
        new("ejderin_gozyasi", "EJDERİN GÖZYAŞI", "💠", "Efsane kolye: takanı Ejder korur.", "kolye", 20, Defense: 10, HpBonus: 100),
        new("deri_bileklik", "Deri Bileklik", "🟤", "Bileği sağlam tutar.", "bileklik", Defense: 2, HpBonus: 25, Price: 550),
        new("kadim_bileklik", "KADİM BİLEKLİK", "🌀", "Efsane: ilk savaşçıların yadigarı.", "bileklik", 10, Defense: 8, HpBonus: 60),
    ];

    public static readonly MobDef[] Mobs =
    [
        // — Doğu Vadisi —
        new("yaban_domuzu", "İskelet Er", false, 1, 60, 5, 2.4f, 6f, 1.7f, 1.6f,
            25, 5, 15,
            [new("domuz_derisi", .5, 2), new("sifa_otu", .15, 1),
             new("kucuk_hp_iksiri", .22, 2), new("pasli_kilic", .08, 1)], 12f, 1f),
        new("kurt", "İskelet Savaşçı", false, 3, 115, 9, 3.4f, 8f, 1.8f, 1.4f,
            48, 12, 28,
            [new("kurt_postu", .45, 1), new("kucuk_mp_iksiri", .18, 2),
             new("kucuk_hp_iksiri", .15, 1), new("kurt_disi_kilic", .06, 1)], 15f, 1.05f),
        new("metin_kaya", "Kaya Metini", true, 5, 950, 0, 0f, 0f, 0f, 0f,
            420, 180, 350,
            [new("metin_parcasi", 1, 2), new("buyuk_hp_iksiri", .6, 2),
             new("isinlanma_parsomeni", .5, 1), new("deri_zirh", .10, 1),
             new("tahta_kalkan", .10, 1), new("yesim_kupe", .04, 1),
             new("ejder_kilici", 1.0 / 3_000_000, 1),
             new("ejderin_gozyasi", 1.0 / 1_000_000, 1),
             new("kadim_bileklik", 1.0 / 250_000, 1)], 60f, 1f),
        // — Kızıl Çöl —
        new("col_akrebi", "Kum Haydudu", false, 6, 200, 15, 2.8f, 7f, 1.7f, 1.5f,
            90, 22, 48,
            [new("zehir_ignesi", .4, 2), new("kucuk_mp_iksiri", .2, 2),
             new("akrep_hanceri", .06, 1)], 18f, .95f),
        new("col_kurdu", "Kum Büyücüsü", false, 8, 290, 20, 3.6f, 8.5f, 1.8f, 1.3f,
            140, 35, 70,
            [new("kurt_postu", .35, 2), new("buyuk_hp_iksiri", .14, 1),
             new("kurt_disi_kilic", .05, 1)], 20f, 1.1f),
        new("dag_ayisi", "İskelet Şampiyonu", false, 10, 380, 26, 2.9f, 7.5f, 2f, 1.8f,
            190, 45, 95,
            [new("ayi_pencesi", .5, 2), new("buyuk_mp_iksiri", .12, 1),
             new("ayi_baltasi", .06, 1)], 25f, 1.35f),
        new("metin_ates", "Ateş Metini", true, 9, 1700, 0, 0f, 0f, 0f, 0f,
            950, 400, 700,
            [new("metin_parcasi", 1, 4), new("buyuk_hp_iksiri", .8, 3),
             new("isinlanma_parsomeni", .6, 1), new("metin_kilici", .3, 1),
             new("plaka_zirh", .09, 1), new("demir_kalkan", .09, 1),
             new("ates_kupesi", .05, 1), new("kurt_disi_kolye", .06, 1),
             new("ejder_kilici", 1.0 / 3_000_000, 1),
             new("ejderin_gozyasi", 1.0 / 1_000_000, 1),
             new("kadim_bileklik", 1.0 / 250_000, 1)], 90f, 1.2f),
        // — Buz Zirvesi —
        new("buz_kurdu", "Buz Hayaleti", false, 12, 480, 34, 3.7f, 9f, 1.8f, 1.3f,
            280, 60, 120,
            [new("buz_kristali", .5, 2), new("buyuk_hp_iksiri", .2, 2),
             new("buyuk_mp_iksiri", .15, 1)], 22f, 1.1f),
        new("kar_ayisi", "Buz Lordu", false, 15, 700, 46, 3f, 8f, 2.1f, 1.9f,
            420, 90, 180,
            [new("ayi_pencesi", .5, 3), new("buz_kristali", .4, 2),
             new("buz_kilici", .05, 1)], 30f, 1.5f),
        new("metin_buz", "Buz Metini", true, 14, 2800, 0, 0f, 0f, 0f, 0f,
            2200, 900, 1600,
            [new("metin_parcasi", 1, 6), new("buz_kristali", 1, 3),
             new("buz_kilici", .35, 1), new("isinlanma_parsomeni", .8, 2),
             new("ejder_zirhi", .07, 1), new("buz_kalkani", .07, 1),
             new("deri_bileklik", .10, 1),
             new("ejder_kilici", 1.0 / 3_000_000, 1),
             new("ejderin_gozyasi", 1.0 / 1_000_000, 1),
             new("kadim_bileklik", 1.0 / 250_000, 1)], 120f, 1.35f),
    ];

    public static readonly Dictionary<string, string> MetinGuard = new()
    {
        ["metin_kaya"] = "kurt",
        ["metin_ates"] = "col_kurdu",
        ["metin_buz"] = "buz_kurdu",
    };

    public static readonly SpawnZone[] Spawns =
    [
        new("dogu", "yaban_domuzu", -30f, -20f, 20f, 9),
        new("dogu", "yaban_domuzu", 15f, -35f, 14f, 5),
        new("dogu", "kurt", 40f, 30f, 22f, 8),
        new("dogu", "kurt", -45f, 40f, 18f, 5),
        new("dogu", "metin_kaya", 0f, 45f, 0f, 1),
        new("dogu", "metin_kaya", -62f, -58f, 0f, 1),
        new("dogu", "metin_kaya", 72f, 8f, 0f, 1),

        new("col", "col_akrebi", -35f, 20f, 24f, 10),
        new("col", "col_akrebi", 30f, -40f, 18f, 7),
        new("col", "col_kurdu", 45f, 35f, 22f, 8),
        new("col", "dag_ayisi", -55f, -50f, 18f, 5),
        new("col", "metin_ates", 0f, 50f, 0f, 1),
        new("col", "metin_ates", -70f, 10f, 0f, 1),
        new("col", "metin_ates", 60f, -65f, 0f, 1),

        new("zirve", "buz_kurdu", -30f, 25f, 22f, 9),
        new("zirve", "buz_kurdu", 35f, -30f, 20f, 7),
        new("zirve", "kar_ayisi", 55f, 40f, 18f, 5),
        new("zirve", "kar_ayisi", -60f, -45f, 16f, 4),
        new("zirve", "metin_buz", 0f, 55f, 0f, 1),
        new("zirve", "metin_buz", -70f, -20f, 0f, 1),
    ];

    public static readonly SkillDef[] Skills =
    [
        new("guclu_vurus", "Güçlü Vuruş", "💥", 5, 10, 6f, "hit", 2.5f, 0f, 0f,
            "Tek hedefe 2.5 kat hasar."),
        new("kasirga", "Kasırga Kesiği", "🌪️", 8, 25, 10f, "aoe", 1.8f, 4.5f, 0f,
            "Çevrendeki tüm düşmanlara 1.8 kat hasar."),
        new("savas_cigligi", "Savaş Çığlığı", "🔥", 12, 30, 20f, "buff", 1.3f, 0f, 15f,
            "15 saniye boyunca hasarın +%30."),
    ];

    public static readonly QuestDef[] Quests =
    [
        new("ilk_kan", "İlk Kan", "kill", "yaban_domuzu", 5,
            "Usta Chen: \"Demek Ejder Tanrısı'nın çağrısını duydun, evlat. Vadi eskisi gibi değil; metinler düştüğünden beri ölüler uyanıyor. Önce kılıcını savaşla tanıştır: 5 İskelet Er avla.\"",
            "Usta Chen: \"İyi iş. Ellerin titremiyor artık. Al şu iksirleri — daha karanlık işler bizi bekliyor.\"",
            100, 60, "kucuk_hp_iksiri", 3, 0),
        new("surunun_efendisi", "Kemik Devriyesi", "kill", "kurt", 8,
            "Usta Chen: \"İskelet Savaşçılar bölükler halinde köy sınırına iniyor. Bir şey onları komuta ediyor. 8 İskelet Savaşçı devir, belki kalıntılarında bir cevap buluruz.\"",
            "Usta Chen: \"Kemiklerinde kara bir toz var... Metin tozu. Korktuğum gibi: taşlar ölüleri diriltiyor.\"",
            250, 150, "kucuk_mp_iksiri", 3, 0),
        new("taslarin_fisiltisi", "Taşların Fısıltısı", "metin", "metin_kaya", 1,
            "Usta Chen: \"Gökten düşen o taşlar... İçlerinde bir fısıltı var, geceleri duyuyorum. Bir Kaya Metini kır ve kalbindeki kristali bana getir.\"",
            "Usta Chen: \"Bu kristal... nefes alıyor! Fısıltı sustu ama uzakta, çölde daha güçlü bir alev yanıyor. Önce güçlenmelisin.\"",
            400, 300, null, 0, 1),
        new("gucun_bedeli", "Gücün Bedeli", "level", "", 5,
            "Usta Chen: \"Ham güç yetmez, evlat. Seviye 5'e ulaş — o zaman sana atalarımızın savaş sanatlarını öğretebilirim. (K tuşuyla skill penceresini aç.)\"",
            "Usta Chen: \"Hazırsın. Al bu skill puanını; Güçlü Vuruş'u öğren ve düşmanlarına gerçek acıyı tattır.\"",
            200, 0, null, 0, 1),
        new("kizil_col", "Kızıl Çöl'e Yolculuk", "map", "col", 1,
            "Usta Chen: \"Fısıltının kaynağı çölde. Köyün doğusundaki Işınlanma Kapısı'na git (parlayan halka) ve Kızıl Çöl'e geç. Dikkatli ol — orada kum bile ısırır.\"",
            "Kavurucu bir rüzgar yüzünü yalıyor. Ufukta, alev alev yanan bir metin taşı gökyüzünü kızıla boyuyor.",
            300, 200, "kucuk_hp_iksiri", 2, 0),
        new("col_atesi", "Çölün Ateşi", "metin", "metin_ates", 1,
            "Usta Chen (parşömenle): \"O alevli taş, vadidekilerin anası. Onu kırarsan fısıltı zincirinin bir halkası kopar. Ateş Metini'ni yok et!\"",
            "Metin paramparça olurken içinden buz gibi bir çığlık yükseliyor... Kuzeye, zirveye doğru. Son halka orada.",
            800, 600, "buyuk_hp_iksiri", 2, 1),
        new("zirvedeki_sir", "Zirvedeki Sır", "metin", "metin_buz", 1,
            "Usta Chen: \"Buz Zirvesi... Ejder Tanrısı'nın uyuduğu yer. Fısıltıların kalbi olan Buz Metini orada. Onu kır ki vadi özgür kalsın. Yolun açık olsun, savaşçı.\"",
            "Buz Metini dağılırken zirveyi altın bir ışık kaplıyor. Ejder Tanrısı'nın sesi gökyüzünde yankılanıyor: \"Vadi sana borçlu, savaşçı.\" — İlk destan tamamlandı. Yenileri yolda...",
            2000, 1500, "buz_kilici", 1, 2),
    ];

    /// <summary>Köy NPC'leri (tüm haritalarda spawn yanında).</summary>
    public static readonly NpcDef[] Npcs =
    [
        new("demirci", "Demirci Kaya", "demirci", "dogu", -7f, -3f),
        new("tuccar", "Tüccar Hong", "tuccar", "dogu", -3f, 1f),
        new("demirci_col", "Demirci Kaya", "demirci", "col", -7f, -3f),
        new("tuccar_col", "Tüccar Hong", "tuccar", "col", -3f, 1f),
        new("demirci_zirve", "Demirci Kaya", "demirci", "zirve", -7f, -3f),
        new("tuccar_zirve", "Tüccar Hong", "tuccar", "zirve", -3f, 1f),
    ];

    /// <summary>+N başarı şansı (indeks = mevcut +). +9:%20, +10:%15, +11:%10.</summary>
    public static readonly double[] UpgradeChance =
        [1.0, 0.90, 0.80, 0.65, 0.55, 0.45, 0.35, 0.25, 0.20, 0.15, 0.10];
    public const int MaxPlus = 11;
    public static long UpgradeYangCost(int plus) => 200L * (plus + 1) * (plus + 1);
    public static int UpgradeShardCost(int plus) => 1 + plus / 3;

    /// <summary>+'ın stat çarpanı: her + %10.</summary>
    public static int Boost(int stat, int plus) =>
        (int)Math.Round(stat * (1 + 0.10 * plus));

    public static bool IsEquipType(string type) =>
        type is "silah" or "zirh" or "kalkan" or "kupe" or "kolye" or "bileklik";

    public static MobDef MobByCode(string code) => Mobs.First(m => m.Code == code);
    public static ItemDef? ItemByCode(string code) => Items.FirstOrDefault(i => i.Code == code);
    public static MapDef? MapById(string id) => Maps.FirstOrDefault(m => m.Id == id);
    public static SkillDef? SkillByCode(string code) => Skills.FirstOrDefault(s => s.Code == code);

    public static object ClientConfig() => new
    {
        worldHalf = WorldHalf,
        playerSpeed = PlayerSpeed,
        playerAttackRange = PlayerAttackRange,
        spawnPoint = SpawnPoint,
        maxLevel = MaxLevel,
        startMap = StartMap,
        mobs = Mobs,
        items = Items,
        skills = Skills,
        maps = Maps,
        npcs = Npcs,
        upgradeChance = UpgradeChance,
        maxPlus = MaxPlus,
        quests = Quests.Select(q => new
        {
            q.Code, q.Title, q.Kind, q.TargetCode, q.TargetCount,
            q.StoryStart, q.StoryDone,
        }),
        xpTable = Enumerable.Range(1, 60).Select(XpForLevel).ToArray(),
    };
}
