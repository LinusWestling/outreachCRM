using Microsoft.EntityFrameworkCore;
using Outreach.Domain;

namespace Outreach.Infrastructure;

public sealed class OutreachDbContext(DbContextOptions<OutreachDbContext> options) : DbContext(options)
{
    public DbSet<Creator> Creators => Set<Creator>();
    public DbSet<CreatorAccount> CreatorAccounts => Set<CreatorAccount>();
    public DbSet<ContactLog> ContactLogs => Set<ContactLog>();
    public DbSet<ImportBatch> ImportBatches => Set<ImportBatch>();
    public DbSet<ImportRow> ImportRows => Set<ImportRow>();
    public DbSet<MessageTemplate> MessageTemplates => Set<MessageTemplate>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Creator>(entity =>
        {
            entity.Property(x => x.DisplayName).HasMaxLength(200);
            entity.Property(x => x.Email).HasMaxLength(320);
            entity.Property(x => x.ThreadsUrl).HasMaxLength(600);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(40);
            entity.Property(x => x.Priority).HasConversion<string>().HasMaxLength(20);
            entity.Property(x => x.ProspectReadyAt);
            entity.HasMany(x => x.Accounts).WithOne(x => x.Creator).HasForeignKey(x => x.CreatorId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.ContactLogs).WithOne(x => x.Creator).HasForeignKey(x => x.CreatorId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.NextFollowUpAt);
        });

        modelBuilder.Entity<CreatorAccount>(entity =>
        {
            entity.Property(x => x.Platform).HasConversion<string>().HasMaxLength(20);
            entity.Property(x => x.Handle).HasMaxLength(160);
            entity.Property(x => x.NormalizedHandle).HasMaxLength(160);
            entity.Property(x => x.ProfileUrl).HasMaxLength(600);
            entity.Property(x => x.RawFollowerCount).HasMaxLength(40);
            entity.Property(x => x.SourceName).HasMaxLength(260);
            entity.HasIndex(x => new { x.Platform, x.NormalizedHandle }).IsUnique();
        });

        modelBuilder.Entity<ContactLog>(entity =>
        {
            entity.Property(x => x.Type).HasConversion<string>().HasMaxLength(30);
            entity.Property(x => x.Channel).HasConversion<string>().HasMaxLength(30);
            entity.Property(x => x.Outcome).HasMaxLength(120);
            entity.Property(x => x.MessageSubject).HasMaxLength(240);
            entity.HasOne(x => x.MessageTemplate).WithMany(x => x.ContactLogs).HasForeignKey(x => x.MessageTemplateId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(x => x.OccurredAt);
        });

        modelBuilder.Entity<ImportBatch>(entity =>
        {
            entity.Property(x => x.SourceName).HasMaxLength(260);
            entity.Property(x => x.SourceType).HasMaxLength(40);
            entity.HasMany(x => x.Rows).WithOne(x => x.ImportBatch).HasForeignKey(x => x.ImportBatchId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ImportRow>(entity =>
        {
            entity.Property(x => x.Action).HasConversion<string>().HasMaxLength(30);
            entity.Property(x => x.IssueMessage).HasMaxLength(600);
            entity.HasOne(x => x.MatchedCreator).WithMany().HasForeignKey(x => x.MatchedCreatorId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<MessageTemplate>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(160);
            entity.Property(x => x.Kind).HasConversion<string>().HasMaxLength(20);
            entity.Property(x => x.Platform).HasConversion<string>().HasMaxLength(20);
            entity.Property(x => x.Subject).HasMaxLength(240);
            entity.Property(x => x.GenerationRules);
        });
    }
}
