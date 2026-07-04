using Microsoft.EntityFrameworkCore;

namespace Mmorpg.SocialService.Data;

public enum FriendshipStatus { Pending = 0, Accepted = 1 }

public class Friendship
{
    public Guid Id { get; set; }
    public Guid RequesterId { get; set; }
    public string RequesterName { get; set; } = "";
    public Guid AddresseeId { get; set; }
    public string AddresseeName { get; set; } = "";
    public FriendshipStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class SocialDb(DbContextOptions<SocialDb> options) : DbContext(options)
{
    public DbSet<Friendship> Friendships => Set<Friendship>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Friendship>().HasIndex(f => new { f.RequesterId, f.AddresseeId }).IsUnique();
        b.Entity<Friendship>().HasIndex(f => f.AddresseeId);
    }
}
