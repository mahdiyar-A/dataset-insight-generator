using backend.Application.Interfaces;
using backend.Domain.Entities;
using backend.Hubs;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;
using System.Security.Claims;

namespace backend.Tests.Unit;

/// <summary>
/// Tests for CollaborationHub authorization.
///
/// The vulnerability
/// -----------------
/// The hub carried [Authorize], which only proves the caller is signed in. It
/// performed no check that the caller belonged to the workspace they named. Any
/// authenticated user could call JoinWorkspace("&lt;someone-else's-guid&gt;"), be
/// added to that SignalR group, and receive every annotation, cursor position
/// and presence event broadcast inside it — plus inject annotation payloads of
/// their own into other people's live feeds.
///
/// WorkspaceController checks membership on every REST route
/// (_teams.IsMemberAsync). The hub bypassed all of it, so the real-time channel
/// was a way around the REST authorization entirely.
///
/// These are unit tests against the hub class directly. Driving a SignalR
/// connection end-to-end would need a real WebSocket client and would test the
/// transport rather than the authorization rule.
/// </summary>
[TestFixture]
public class CollaborationHubTests
{
    private StubWorkspaceRepository _workspaces = null!;
    private StubTeamRepository      _teams      = null!;
    private CollaborationHub        _hub        = null!;

    private Guid _teamId;
    private Guid _workspaceId;
    private Guid _memberId;
    private Guid _outsiderId;

    [SetUp]
    public void SetUp()
    {
        _teamId      = Guid.NewGuid();
        _workspaceId = Guid.NewGuid();
        _memberId    = Guid.NewGuid();
        _outsiderId  = Guid.NewGuid();

        var workspace = new SharedWorkspace(_teamId, Guid.NewGuid(), _memberId);
        typeof(SharedWorkspace).GetProperty(nameof(SharedWorkspace.Id))!
            .SetValue(workspace, _workspaceId);

        _workspaces = new StubWorkspaceRepository { Workspace = workspace };
        _teams      = new StubTeamRepository { MemberIds = { _memberId } };

        _hub = new CollaborationHub(_workspaces, _teams,
            NullLogger<CollaborationHub>.Instance);

        // Static caches persist across hub instances by design (membership is
        // cached process-wide). Clear between tests so one test's grant does not
        // authorize the next test's outsider.
        ClearStaticCaches();
    }

    [TearDown]
    public void TearDown()
    {
        _hub?.Dispose();
        ClearStaticCaches();
    }

    private static void ClearStaticCaches()
    {
        foreach (var name in new[] { "_connections", "_membershipCache" })
        {
            var field = typeof(CollaborationHub).GetField(name,
                System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
            var dict = field?.GetValue(null);
            dict?.GetType().GetMethod("Clear")?.Invoke(dict, null);
        }
    }

    private void SignInAs(Guid userId, string email = "user@example.com")
    {
        var identity = new ClaimsIdentity(new[]
        {
            new Claim("sub", userId.ToString()),
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim(ClaimTypes.Email, email),
        }, "TestScheme");

        _hub.Context = new StubHubCallerContext(
            new ClaimsPrincipal(identity), Guid.NewGuid().ToString());
        _hub.Clients = new StubHubCallerClients();
        _hub.Groups  = new StubGroupManager();
    }

    // ── The vulnerability ────────────────────────────────────────────────────

    [Test]
    public async Task JoinWorkspace_ByNonMember_IsRejected()
    {
        // Risk: this is the hole. A signed-in stranger joining a workspace group
        // receives every annotation and cursor event broadcast inside it.
        SignInAs(_outsiderId);

        var act = async () => await _hub.JoinWorkspace(_workspaceId.ToString());

        await act.Should().ThrowAsync<HubException>()
            .WithMessage("*Not a member*");
    }

    [Test]
    public async Task JoinWorkspace_ByNonMember_DoesNotAddThemToTheGroup()
    {
        // Risk: throwing after the group add would still leak every subsequent
        // broadcast to the outsider.
        SignInAs(_outsiderId);
        var groups = (StubGroupManager)_hub.Groups;

        try { await _hub.JoinWorkspace(_workspaceId.ToString()); }
        catch (HubException) { /* expected */ }

        groups.Added.Should().BeEmpty("the outsider must never enter the group");
    }

    [Test]
    public async Task JoinWorkspace_ByMember_Succeeds()
    {
        SignInAs(_memberId);
        var groups = (StubGroupManager)_hub.Groups;

        await _hub.JoinWorkspace(_workspaceId.ToString());

        groups.Added.Should().ContainSingle()
            .Which.GroupName.Should().Be(_workspaceId.ToString());
    }

    [Test]
    public async Task JoinWorkspace_ForNonexistentWorkspace_IsRejected()
    {
        // Risk: a null workspace must fail closed, not fall through to allowed.
        _workspaces.Workspace = null;
        SignInAs(_memberId);

        var act = async () => await _hub.JoinWorkspace(Guid.NewGuid().ToString());

        await act.Should().ThrowAsync<HubException>();
    }

    [Test]
    public async Task JoinWorkspace_WithMalformedId_IsRejected()
    {
        // Risk: a non-GUID must be rejected rather than throwing an unhandled
        // FormatException out of the hub pipeline.
        SignInAs(_memberId);

        var act = async () => await _hub.JoinWorkspace("not-a-guid");

        await act.Should().ThrowAsync<HubException>();
    }

    // ── Broadcast methods must check too ─────────────────────────────────────
    //
    // A client can invoke any hub method with any workspace id at any time —
    // there is no requirement to have called JoinWorkspace first. Checking only
    // on join would leave every broadcast method open.

    [Test]
    public async Task BroadcastAnnotation_ByNonMember_IsRejected()
    {
        // Risk: injecting annotation payloads into a workspace the caller cannot
        // read. They are never persisted, but every collaborator sees them until
        // the next reload.
        SignInAs(_outsiderId);

        var act = async () => await _hub.BroadcastAnnotation(
            _workspaceId.ToString(), new { content = "injected" });

        await act.Should().ThrowAsync<HubException>();
    }

    [Test]
    public async Task BroadcastAnnotationDeleted_ByNonMember_IsRejected()
    {
        // Risk: an outsider could make annotations vanish from collaborators'
        // screens without touching the database — confusing and unattributable.
        SignInAs(_outsiderId);

        var act = async () => await _hub.BroadcastAnnotationDeleted(
            _workspaceId.ToString(), Guid.NewGuid().ToString());

        await act.Should().ThrowAsync<HubException>();
    }

    [Test]
    public async Task BroadcastAnnotationResolved_ByNonMember_IsRejected()
    {
        SignInAs(_outsiderId);

        var act = async () => await _hub.BroadcastAnnotationResolved(
            _workspaceId.ToString(), Guid.NewGuid().ToString());

        await act.Should().ThrowAsync<HubException>();
    }

    [Test]
    public async Task BroadcastAnnotationEdit_ByNonMember_IsRejected()
    {
        SignInAs(_outsiderId);

        var act = async () => await _hub.BroadcastAnnotationEdit(
            _workspaceId.ToString(), new { content = "tampered" });

        await act.Should().ThrowAsync<HubException>();
    }

    [Test]
    public async Task MoveCursor_ByNonMember_IsRejected()
    {
        // Risk: cursor events reveal that someone is present and which file they
        // are on — a presence side-channel into a private workspace.
        SignInAs(_outsiderId);

        var act = async () => await _hub.MoveCursor(
            _workspaceId.ToString(), "pdf", 10, 20);

        await act.Should().ThrowAsync<HubException>();
    }

    // ── Membership cache correctness ─────────────────────────────────────────

    [Test]
    public async Task MembershipCheckIsCached_ButDeniesOutsidersIndependently()
    {
        // Risk: a cache keyed only by workspace id — rather than by
        // (user, workspace) — would let one member's successful check authorize
        // every other caller for that workspace.
        SignInAs(_memberId);
        await _hub.JoinWorkspace(_workspaceId.ToString());

        SignInAs(_outsiderId);
        var act = async () => await _hub.JoinWorkspace(_workspaceId.ToString());

        await act.Should().ThrowAsync<HubException>(
            "a member's cached grant must not authorize a different user");
    }

    [Test]
    public async Task RepeatedCallsByAMemberHitTheCacheNotTheDatabase()
    {
        // Cursor events fire at pointer-move rate; a database round-trip per
        // event would not be viable.
        SignInAs(_memberId);
        await _hub.JoinWorkspace(_workspaceId.ToString());

        var lookupsAfterJoin = _workspaces.GetWorkspaceCallCount;

        await _hub.MoveCursor(_workspaceId.ToString(), "pdf", 1, 2);
        await _hub.MoveCursor(_workspaceId.ToString(), "pdf", 3, 4);
        await _hub.MoveCursor(_workspaceId.ToString(), "pdf", 5, 6);

        _workspaces.GetWorkspaceCallCount.Should().Be(lookupsAfterJoin,
            "membership should be resolved once, not per event");
    }

    // ── Presence ─────────────────────────────────────────────────────────────

    [Test]
    public async Task JoinWorkspace_SendsExistingRosterToTheJoiner()
    {
        // Risk: UserJoined only fires for arrivals after you. Without an explicit
        // roster on join, the second person into a workspace sees it as empty
        // and believes they are working alone.
        SignInAs(_memberId, "first@example.com");
        await _hub.JoinWorkspace(_workspaceId.ToString());

        var secondMember = Guid.NewGuid();
        _teams.MemberIds.Add(secondMember);
        SignInAs(secondMember, "second@example.com");
        var clients = (StubHubCallerClients)_hub.Clients;

        await _hub.JoinWorkspace(_workspaceId.ToString());

        clients.Caller.Sent.Should().ContainSingle(m => m.Method == "Presence",
            "the joiner must be told who is already here");
    }
}

// ── Stubs ────────────────────────────────────────────────────────────────────

internal class StubWorkspaceRepository : IWorkspaceRepository
{
    public SharedWorkspace? Workspace { get; set; }
    public int GetWorkspaceCallCount { get; private set; }

    public Task<SharedWorkspace?> GetWorkspaceAsync(Guid workspaceId)
    {
        GetWorkspaceCallCount++;
        return Task.FromResult(Workspace);
    }

    public Task<List<SharedWorkspace>> GetTeamWorkspacesAsync(Guid teamId) => Task.FromResult(new List<SharedWorkspace>());
    public Task<List<SharedWorkspace>> GetUserSharedWorkspacesAsync(Guid userId) => Task.FromResult(new List<SharedWorkspace>());
    public Task<SharedWorkspace> ShareAnalysisAsync(SharedWorkspace workspace) => Task.FromResult(workspace);
    public Task UnshareAsync(Guid workspaceId, Guid requestingUserId) => Task.CompletedTask;
    public Task<List<WorkspaceFilePermission>> GetPermissionsAsync(Guid workspaceId) => Task.FromResult(new List<WorkspaceFilePermission>());
    public Task SetPermissionAsync(WorkspaceFilePermission permission) => Task.CompletedTask;
    public Task RemovePermissionAsync(Guid workspaceId, Guid userId, string fileType) => Task.CompletedTask;
    public Task<List<Annotation>> GetAnnotationsAsync(Guid workspaceId, string? fileType = null) => Task.FromResult(new List<Annotation>());
    public Task<Annotation> AddAnnotationAsync(Annotation annotation) => Task.FromResult(annotation);
    public Task EditAnnotationAsync(Guid annotationId, Guid userId, string content) => Task.CompletedTask;
    public Task ResolveAnnotationAsync(Guid annotationId, Guid userId) => Task.CompletedTask;
    public Task DeleteAnnotationAsync(Guid annotationId, Guid userId) => Task.CompletedTask;
}

internal class StubTeamRepository : ITeamRepository
{
    public HashSet<Guid> MemberIds { get; } = new();

    public Task<bool> IsMemberAsync(Guid teamId, Guid userId) =>
        Task.FromResult(MemberIds.Contains(userId));

    public Task<Team?> GetTeamAsync(Guid teamId) => Task.FromResult<Team?>(null);
    public Task<List<Team>> GetUserTeamsAsync(Guid userId) => Task.FromResult(new List<Team>());
    public Task<Team> CreateTeamAsync(Team team) => Task.FromResult(team);
    public Task UpdateTeamAsync(Team team) => Task.CompletedTask;
    public Task DeleteTeamAsync(Guid teamId, Guid ownerId) => Task.CompletedTask;
    public Task<List<TeamMember>> GetMembersAsync(Guid teamId) => Task.FromResult(new List<TeamMember>());
    public Task AddMemberAsync(TeamMember member) => Task.CompletedTask;
    public Task UpdateMemberRoleAsync(Guid teamId, Guid userId, string role) => Task.CompletedTask;
    public Task RemoveMemberAsync(Guid teamId, Guid userId) => Task.CompletedTask;
    public Task<TeamInvite?> GetInviteByTokenAsync(string token) => Task.FromResult<TeamInvite?>(null);
    public Task<List<TeamInvite>> GetPendingInvitesAsync(Guid teamId) => Task.FromResult(new List<TeamInvite>());
    public Task<TeamInvite> CreateInviteAsync(TeamInvite invite) => Task.FromResult(invite);
    public Task AcceptInviteAsync(string token) => Task.CompletedTask;
    public Task RevokeInviteAsync(Guid inviteId, Guid teamId) => Task.CompletedTask;
}

internal record SentMessage(string Method, object?[] Args);

internal class StubClientProxy : IClientProxy
{
    public List<SentMessage> Sent { get; } = new();

    public Task SendCoreAsync(string method, object?[] args, CancellationToken ct = default)
    {
        Sent.Add(new SentMessage(method, args));
        return Task.CompletedTask;
    }
}

internal class StubHubCallerClients : IHubCallerClients
{
    public StubClientProxy Caller { get; } = new();
    public StubClientProxy Others { get; } = new();
    public StubClientProxy AllClients { get; } = new();

    IClientProxy IHubClients<IClientProxy>.All => AllClients;
    IClientProxy IHubCallerClients<IClientProxy>.Caller => Caller;
    IClientProxy IHubCallerClients<IClientProxy>.Others => Others;

    public IClientProxy AllExcept(IReadOnlyList<string> excluded) => AllClients;
    public IClientProxy Client(string connectionId) => AllClients;
    public IClientProxy Clients(IReadOnlyList<string> connectionIds) => AllClients;
    public IClientProxy Group(string groupName) => AllClients;
    public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excluded) => Others;
    public IClientProxy Groups(IReadOnlyList<string> groupNames) => AllClients;
    public IClientProxy OthersInGroup(string groupName) => Others;
    public IClientProxy User(string userId) => AllClients;
    public IClientProxy Users(IReadOnlyList<string> userIds) => AllClients;
}

internal record GroupAdd(string ConnectionId, string GroupName);

internal class StubGroupManager : IGroupManager
{
    public List<GroupAdd> Added   { get; } = new();
    public List<GroupAdd> Removed { get; } = new();

    public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken ct = default)
    {
        Added.Add(new GroupAdd(connectionId, groupName));
        return Task.CompletedTask;
    }

    public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken ct = default)
    {
        Removed.Add(new GroupAdd(connectionId, groupName));
        return Task.CompletedTask;
    }
}

internal class StubHubCallerContext : HubCallerContext
{
    public StubHubCallerContext(ClaimsPrincipal user, string connectionId)
    {
        User = user;
        ConnectionId = connectionId;
    }

    public override string ConnectionId { get; }
    public override string? UserIdentifier => User?.FindFirst("sub")?.Value;
    public override ClaimsPrincipal? User { get; }
    public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
    public override IFeatureCollection Features { get; } = new Microsoft.AspNetCore.Http.Features.FeatureCollection();
    public override CancellationToken ConnectionAborted => CancellationToken.None;
    public override void Abort() { }
}
