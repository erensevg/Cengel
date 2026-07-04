using Microsoft.EntityFrameworkCore;

namespace Mmorpg.GameService.Data;

public class Character
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = "";
    public int Level { get; set; } = 1;
    public long Xp { get; set; }
    public long Yang { get; set; }
    public float PosX { get; set; }
    public float PosZ { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime LastSeenAt { get; set; }
    public Guid? EquippedItemId { get; set; }
}

public class InventoryItem
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public string ItemCode { get; set; } = "";
    public int Count { get; set; }
    public int SlotIndex { get; set; } = -1;   // çanta ızgarasındaki yeri (0-44)
}

public class GameDb(DbContextOptions<GameDb> options) : DbContext(options)
{
    public DbSet<Character> Characters => Set<Character>();
    public DbSet<InventoryItem> Items => Set<InventoryItem>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Character>().HasIndex(c => c.UserId).IsUnique();
        b.Entity<InventoryItem>().HasIndex(i => i.CharacterId);
    }
}
