using Microsoft.EntityFrameworkCore;

namespace Mmorpg.GameService.Data;

public class Character
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = "";
    public string ClassType { get; set; } = "savasci";   // savasci/ninja/buyucu/tritas
    public int Level { get; set; } = 1;
    public long Xp { get; set; }
    public long Yang { get; set; }
    public float PosX { get; set; }
    public float PosZ { get; set; }
    public string MapId { get; set; } = "dogu";
    public int SkillPoints { get; set; }
    public bool HasHorse { get; set; }
    public bool HorseArmored { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime LastSeenAt { get; set; }
}

public class InventoryItem
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public string ItemCode { get; set; } = "";
    public int Count { get; set; }
    public int SlotIndex { get; set; } = -1;   // çanta ızgarasındaki yeri (0-44)
    public int Plus { get; set; }              // yükseltme (+0..+11)
    public bool Equipped { get; set; }
}

public class CharacterSkill
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public string Code { get; set; } = "";
    public int Level { get; set; } = 1;        // 1-10
}

public class CharacterQuest
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public string Code { get; set; } = "";
    public int Progress { get; set; }
    public bool Completed { get; set; }
}

public class GameDb(DbContextOptions<GameDb> options) : DbContext(options)
{
    public DbSet<Character> Characters => Set<Character>();
    public DbSet<InventoryItem> Items => Set<InventoryItem>();
    public DbSet<CharacterSkill> Skills => Set<CharacterSkill>();
    public DbSet<CharacterQuest> Quests => Set<CharacterQuest>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Character>().HasIndex(c => c.UserId).IsUnique();
        b.Entity<InventoryItem>().HasIndex(i => i.CharacterId);
        b.Entity<CharacterSkill>().HasIndex(s => new { s.CharacterId, s.Code }).IsUnique();
        b.Entity<CharacterQuest>().HasIndex(q => new { q.CharacterId, q.Code }).IsUnique();
    }
}
