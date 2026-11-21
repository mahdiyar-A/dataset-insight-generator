using backend.Application.Services;
using backend.Controllers;
using backend.Domain.Entities;
using backend.Hubs;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;
using System.Security.Claims;

namespace backend.Tests.Unit;

/// <summary>
/// The live channel for an open report: only someone who may read the report
/// can watch it, and someone who loses the report (removed from the team, or
/// the team deleted) stops receiving what happens to it at once.
/// </summary>
[TestFixture]
public class ReportHubTests
{
    private FakeAnalysisRepository  _analyses   = null!;
    private FakeWorkspaceRepository _workspaces = null!;
    private FakeTeamRepository      _teams      = null!;
    private ReportAccess            _access     = null!;
    private StubReportHubContext    _context    = null!;

    private Guid _owner, _editor, _viewer, _outsider;
    private Team _team = null!;
    private Analysis _shared = null!, _editorsOwn = null!;

    [SetUp]
    public void SetUp()
    {
        _owner = Guid.NewGuid(); _editor = Guid.NewGuid(); _viewer = Guid.NewGuid(); _outsider = Guid.NewGuid();
        _analyses = new FakeAnalysisRepository();
        _shared = new Analysis(_owner, "orders.csv", 10);
        _editorsOwn = new Analysis(_editor, "mine.csv", 10);
        _analyses.Store.Add(_shared);
        _analyses.Store.Add(_editorsOwn);

        _team = new Team(_owner, "Analysts");
        _teams = new FakeTeamRepository { Team = _team };
        foreach (var (user, role) in new[] { (_owner, "owner"), (_editor, "editor"), (_viewer, "viewer") })
        {
            _teams.Members.Add(user);
            _teams.MemberRows.Add(new TeamMember(_team.Id, user, role));
        }
        _workspaces = new FakeWorkspaceRepository
        {
            Workspace = new SharedWorkspace(_team.Id, _shared.Id, _owner),
            InTeam    = u => _teams.Members.Contains(u),
        };
        _access  = new ReportAccess(_analyses, _workspaces, _teams);
        _context = new StubReportHubContext();
        ClearWatchers();
    }

    [TearDown]
    public void TearDown() => ClearWatchers();

    private static void ClearWatchers()
    {
        var field = typeof(ReportHub).GetField("Watchers",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
        var dict = field?.GetValue(null);
        dict?.GetType().GetMethod("Clear")?.Invoke(dict, null);
    }

    private (ReportHub Hub, StubGroupManager Groups) HubAs(Guid user, string connectionId)
    {
        var groups = new StubGroupManager();
        var hub = new ReportHub(_access)
        {
            Context = new StubHubCallerContext(new ClaimsPrincipal(new ClaimsIdentity(
                new[] { new Claim("sub", user.ToString()) }, "test")), connectionId),
            Clients = new StubHubCallerClients(),
            Groups  = groups,
        };
        return (hub, groups);
    }

    private LiveAccess Live() => new(new StubHubContext(), _context, _workspaces, _teams, _access,
                                     NullLogger<LiveAccess>.Instance);

    // ── Watching ─────────────────────────────────────────────────────────────

    [Test]
    public async Task An_editor_watches_the_shared_report_and_is_told_they_may_edit()
    {
        var (hub, groups) = HubAs(_editor, "c1");

        (await hub.WatchReport(_shared.Id.ToString())).Should().BeTrue();

        groups.Added.Should().ContainSingle().Which.Should().Be(new GroupAdd("c1", ReportHub.Group(_shared.Id)));
        ReportHub.Watching(_editor).Should().Equal(_shared.Id);
    }

    [Test]
    public async Task A_viewer_watches_it_read_only()
    {
        var (hub, _) = HubAs(_viewer, "c1");

        (await hub.WatchReport(_shared.Id.ToString())).Should().BeFalse();
    }

    [Test]
    public async Task Someone_who_may_not_read_the_report_cannot_watch_it()
    {
        var (hub, groups) = HubAs(_outsider, "c1");

        var act = () => hub.WatchReport(_shared.Id.ToString());

        await act.Should().ThrowAsync<HubException>();
        groups.Added.Should().BeEmpty();
        ReportHub.Watching(_outsider).Should().BeEmpty();
    }

    [Test]
    public async Task A_closed_page_stops_watching()
    {
        var (hub, groups) = HubAs(_editor, "c1");
        await hub.WatchReport(_shared.Id.ToString());

        await hub.UnwatchReport(_shared.Id.ToString());
        ReportHub.Watching(_editor).Should().BeEmpty();
        groups.Removed.Should().ContainSingle();

        await hub.WatchReport(_shared.Id.ToString());
        await hub.OnDisconnectedAsync(null);
        ReportHub.Watching(_editor).Should().BeEmpty();
    }

    // ── Losing the report ────────────────────────────────────────────────────

    [Test]
    public async Task Someone_removed_from_the_team_stops_receiving_the_shared_report_but_keeps_their_own()
    {
        var (hub, _) = HubAs(_editor, "c1");
        await hub.WatchReport(_shared.Id.ToString());
        await hub.WatchReport(_editorsOwn.Id.ToString());

        await _teams.RemoveMemberAsync(_team.Id, _editor);
        await Live().RevokedAsync(_team.Id, _editor);

        ReportHub.Watching(_editor).Should().Equal(_editorsOwn.Id);
        _context.GroupList.Removed.Should().ContainSingle()
            .Which.Should().Be(new GroupAdd("c1", ReportHub.Group(_shared.Id)));
        _context.Everyone.AllClients.Sent.Should().ContainSingle()
            .Which.Method.Should().Be("ReportAccessRemoved");
    }

    [Test]
    public async Task Someone_who_still_reads_it_another_way_keeps_watching()
    {
        // The owner of the analysis leaves the team they shared it with: it is still theirs.
        var (hub, _) = HubAs(_owner, "c1");
        await hub.WatchReport(_shared.Id.ToString());

        await Live().RevokedAsync(_team.Id, _owner);

        ReportHub.Watching(_owner).Should().Equal(_shared.Id);
        _context.Everyone.AllClients.Sent.Should().BeEmpty();
    }

    [Test]
    public async Task Deleting_the_team_ends_everyones_live_access_to_what_it_shared()
    {
        var (editorHub, _) = HubAs(_editor, "c1");
        var (viewerHub, _) = HubAs(_viewer, "c2");
        await editorHub.WatchReport(_shared.Id.ToString());
        await viewerHub.WatchReport(_shared.Id.ToString());
        var live = Live();

        var snapshot = await live.BeforeDeleteAsync(_team.Id);
        await _teams.DeleteTeamAsync(_team.Id, _owner);
        await live.DeletedAsync(snapshot);

        snapshot.Members.Should().BeEquivalentTo(new[] { _owner, _editor, _viewer });
        ReportHub.Watching(_editor).Should().BeEmpty();
        ReportHub.Watching(_viewer).Should().BeEmpty();
    }

    [Test]
    public async Task Deleting_a_team_reads_who_was_in_it_before_deleting_it()
    {
        var live = new FakeLiveAccess
        {
            SnapshotOf = id => new TeamSnapshot(id, _teams.MemberRows.Select(m => m.UserId).ToList(),
                                                Array.Empty<SharedWorkspace>()),
        };
        var controller = new TeamsController(_teams, new FakeUserRepository(), new NoOpEmailService(),
            new ConfigurationBuilder().Build(), NullLogger<TeamsController>.Instance, new ChatQuota(), live)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("sub", _owner.ToString()) }, "test")),
                },
            },
        };

        (await controller.Delete(_team.Id)).Should().BeOfType<NoContentResult>();

        _teams.DeletedTeams.Should().Equal(_team.Id);
        live.Deleted.Should().ContainSingle()
            .Which.Members.Should().BeEquivalentTo(new[] { _owner, _editor, _viewer },
                "who was in the team is read before the team is gone");
    }
}

/// <summary>What LiveAccess holds to reach the report hub's clients.</summary>
internal class StubReportHubContext : IHubContext<ReportHub>
{
    public StubHubCallerClients Everyone  { get; } = new();
    public StubGroupManager     GroupList { get; } = new();

    public IHubClients   Clients => Everyone;
    public IGroupManager Groups  => GroupList;
}
