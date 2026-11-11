using System.Security.Claims;
using System.Text.Json;
using backend.Application.Services;
using backend.Controllers;
using backend.Domain.Entities;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;

namespace backend.Tests.Unit;

/// <summary>
/// The invite form offered Viewer and Editor and nothing read the choice: a
/// viewer could invite people, even as editors. Viewers read and comment;
/// editors also invite and share; the owner does everything.
/// </summary>
[TestFixture]
public class TeamRoleTests
{
    private static readonly Guid Owner = Guid.NewGuid();

    private static (FakeTeamRepository teams, Team team) TeamWith(params (Guid user, string role)[] members)
    {
        var team  = new Team(Owner, "Analysts");
        var teams = new FakeTeamRepository { Team = team };
        teams.Members.Add(Owner);
        teams.MemberRows.Add(new TeamMember(team.Id, Owner, "owner"));
        foreach (var (user, role) in members)
        {
            teams.Members.Add(user);
            teams.MemberRows.Add(new TeamMember(team.Id, user, role));
        }
        return (teams, team);
    }

    private static User Account(Guid id, string email, string plan = "pro")
    {
        var user = User.CreateWithId(id, email.Split('@')[0], email, "supabase-auth");
        if (plan != "free") user.SetPlan(plan, null, "sub_1");
        return user;
    }

    /// <summary>
    /// The controller as one signed-in person sees it. Nobody else has an
    /// account unless <paramref name="byEmail"/> says so.
    /// </summary>
    private static TeamsController As(
        Guid caller, FakeTeamRepository teams, ChatQuota? quota = null,
        NoOpEmailService? email = null, Func<string, User?>? byEmail = null,
        FakeLiveAccess? live = null, string callerEmail = "ada@example.com")
    {
        var users = new FakeUserRepository
        {
            DefaultUser = Account(caller, callerEmail),
            ByEmail     = byEmail ?? (_ => null),
        };
        return new TeamsController(teams, users, email ?? new NoOpEmailService(),
            new ConfigurationBuilder().Build(), NullLogger<TeamsController>.Instance,
            quota ?? new ChatQuota(), live ?? new FakeLiveAccess())
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("sub", caller.ToString()) }, "test")),
                },
            },
        };
    }

    private static string Field(IActionResult result, string name) =>
        JsonSerializer.SerializeToElement(((ObjectResult)result).Value).GetProperty(name).GetString() ?? "";

    [TestCase("editor", true)]
    [TestCase("viewer", false)]
    public async Task OnlyEditorsAndTheOwnerContribute(string role, bool allowed)
    {
        var member = Guid.NewGuid();
        var (teams, team) = TeamWith((member, role));

        (await teams.CanContributeAsync(team.Id, member)).Should().Be(allowed);
        (await teams.CanContributeAsync(team.Id, Owner)).Should().BeTrue();
        (await teams.CanContributeAsync(team.Id, Guid.NewGuid())).Should().BeFalse("not in the team at all");
    }

    [Test]
    public async Task TheOwnerKeepsTheirRightsWhateverTheirMemberRowSays()
    {
        var (teams, team) = TeamWith();
        teams.MemberRows.Clear();
        teams.MemberRows.Add(new TeamMember(team.Id, Owner, "viewer"));

        (await teams.CanContributeAsync(team.Id, Owner)).Should().BeTrue();
    }

    [Test]
    public async Task AViewerCannotInvite()
    {
        var viewer = Guid.NewGuid();
        var (teams, team) = TeamWith((viewer, "viewer"));

        var result = await As(viewer, teams).Invite(team.Id, new InviteRequest("bob@example.com", "editor"));

        result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(403);
        teams.CreatedInvites.Should().BeEmpty();
    }

    [Test]
    public async Task AnEditorCanInvite()
    {
        var editor = Guid.NewGuid();
        var (teams, team) = TeamWith((editor, "editor"));

        var result = await As(editor, teams).Invite(team.Id, new InviteRequest("bob@example.com", "viewer"));

        result.Should().BeOfType<OkObjectResult>();
        teams.CreatedInvites.Should().ContainSingle().Which.Role.Should().Be("viewer");
    }

    // ── Invitation emails are limited ────────────────────────────────────────

    [Test]
    public async Task InvitationsStopAtTheDailyLimit()
    {
        // Risk: every invite is an email from DIG's address, on the allowance
        // sign-up and password-reset emails need too, and there was no limit.
        var (teams, team) = TeamWith();
        var quota = new ChatQuota();

        for (var i = 0; i < TeamsController.InvitesPerDay; i++)
        {
            (await As(Owner, teams, quota).Invite(team.Id, new InviteRequest($"p{i}@example.com")))
                .Should().BeOfType<OkObjectResult>();
            // Withdrawn straight away, so it is the day's limit that stops the
            // last one and not the size of the team.
            teams.RevokedInvites.Add(teams.CreatedInvites.Last().Id);
        }

        var refused = await As(Owner, teams, quota).Invite(team.Id, new InviteRequest("one-more@example.com"));

        refused.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(429);
        teams.CreatedInvites.Should().HaveCount(TeamsController.InvitesPerDay);
    }

    [TestCase("not-an-address")]
    [TestCase("a@b@c.com")]
    [TestCase("Bob <bob@example.com>")]
    public async Task SomethingThatIsNotAnAddressSendsNothing(string email)
    {
        var (teams, team) = TeamWith();

        var result = await As(Owner, teams).Invite(team.Id, new InviteRequest(email));

        result.Should().BeOfType<BadRequestObjectResult>();
        teams.CreatedInvites.Should().BeEmpty();
    }

    // ── A team holds five people ─────────────────────────────────────────────

    [Test]
    public async Task ATeamStopsAtFivePeopleCountingInvitationsNotYetAnswered()
    {
        // Nothing limited a team's size. Unanswered invitations hold a seat:
        // otherwise ten could go out and the sixth to accept would be refused.
        var (teams, team) = TeamWith((Guid.NewGuid(), "editor"), (Guid.NewGuid(), "viewer"));
        var quota = new ChatQuota();

        (await As(Owner, teams, quota).Invite(team.Id, new InviteRequest("four@example.com"))).Should().BeOfType<OkObjectResult>();
        (await As(Owner, teams, quota).Invite(team.Id, new InviteRequest("five@example.com"))).Should().BeOfType<OkObjectResult>();
        var sixth = await As(Owner, teams, quota).Invite(team.Id, new InviteRequest("six@example.com"));

        sixth.Should().BeOfType<ConflictObjectResult>();
        Field(sixth, "error").Should().Be("TEAM_FULL");
        teams.CreatedInvites.Should().HaveCount(2);
        quota.Remaining($"invite:{Owner}", TeamsController.InvitesPerDay)
            .Should().Be(TeamsController.InvitesPerDay - 2, "a refused invitation uses none of the day's allowance");
    }

    [Test]
    public async Task RevokingAnInvitationFreesItsSeat()
    {
        var (teams, team) = TeamWith((Guid.NewGuid(), "editor"), (Guid.NewGuid(), "viewer"), (Guid.NewGuid(), "viewer"));
        (await As(Owner, teams).Invite(team.Id, new InviteRequest("five@example.com"))).Should().BeOfType<OkObjectResult>();
        (await As(Owner, teams).Invite(team.Id, new InviteRequest("six@example.com"))).Should().BeOfType<ConflictObjectResult>();

        await As(Owner, teams).RevokeInvite(team.Id, teams.CreatedInvites.Single().Id);

        (await As(Owner, teams).Invite(team.Id, new InviteRequest("six@example.com"))).Should().BeOfType<OkObjectResult>();
    }

    [Test]
    public async Task AFullTeamTurnsAwayAnInvitationSentBeforeTheLimit()
    {
        var newcomer = Guid.NewGuid();
        var (teams, team) = TeamWith(
            (Guid.NewGuid(), "editor"), (Guid.NewGuid(), "viewer"), (Guid.NewGuid(), "viewer"), (Guid.NewGuid(), "viewer"));
        var invite = new TeamInvite(team.Id, "new@example.com", "viewer", Owner);
        teams.CreatedInvites.Add(invite);

        var result = await As(newcomer, teams, callerEmail: "new@example.com").Accept(invite.Token);

        result.Should().BeOfType<ConflictObjectResult>();
        teams.Members.Should().NotContain(newcomer);
    }

    // ── Who is being invited ─────────────────────────────────────────────────

    [Test]
    public async Task SomeoneAlreadyInTheTeamIsNotInvitedAgain()
    {
        var member = Guid.NewGuid();
        var (teams, team) = TeamWith((member, "viewer"));
        var email = new NoOpEmailService();

        var result = await As(Owner, teams, email: email, byEmail: _ => Account(member, "bob@example.com"))
            .Invite(team.Id, new InviteRequest("bob@example.com"));

        result.Should().BeOfType<ConflictObjectResult>();
        Field(result, "error").Should().Be("ALREADY_MEMBER");
        email.SentInvites.Should().BeEmpty();
    }

    [Test]
    public async Task TheSameAddressIsNotInvitedTwice()
    {
        // Each click used to send another email and add another pending row.
        var (teams, team) = TeamWith();
        var email = new NoOpEmailService();
        await As(Owner, teams, email: email).Invite(team.Id, new InviteRequest("bob@example.com"));

        var again = await As(Owner, teams, email: email).Invite(team.Id, new InviteRequest("Bob@Example.com"));

        again.Should().BeOfType<ConflictObjectResult>();
        Field(again, "error").Should().Be("ALREADY_INVITED");
        email.SentInvites.Should().ContainSingle();
    }

    [TestCase(null,   "no_account")]
    [TestCase("free", "needs_pro")]
    [TestCase("pro",  "ready")]
    public async Task TheReplySaysWhatTheInvitedPersonStillNeeds(string? plan, string expected)
    {
        // The invitation went to any address without a look at who it was, so
        // an owner could not tell why someone never turned up in the team.
        var (teams, team) = TeamWith();
        User? Lookup(string address) => plan == null ? null : Account(Guid.NewGuid(), address, plan);

        var result = await As(Owner, teams, byEmail: Lookup).Invite(team.Id, new InviteRequest("bob@example.com"));

        result.Should().BeOfType<OkObjectResult>();
        Field(result, "inviteeStatus").Should().Be(expected);
        teams.CreatedInvites.Should().ContainSingle("the invitation goes out whatever they still need");
    }

    [Test]
    public async Task AnInvitationThatCouldNotBeEmailedIsNotReportedAsSent()
    {
        // The failure was logged and the page was told "Invitation sent".
        var (teams, team) = TeamWith();
        var quota = new ChatQuota();
        var email = new NoOpEmailService { ThrowOnInvite = true };

        var result = await As(Owner, teams, quota, email).Invite(team.Id, new InviteRequest("bob@example.com"));

        result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(502);
        Field(result, "message").Should().NotContainAny("smtp", "SMTP", "dig-mailer");
        (await teams.GetPendingInvitesAsync(team.Id)).Should().BeEmpty("an invitation nobody received holds no seat");
        quota.Remaining($"invite:{Owner}", TeamsController.InvitesPerDay).Should().Be(TeamsController.InvitesPerDay);
    }

    // ── Accepting ────────────────────────────────────────────────────────────

    [Test]
    public async Task AcceptingAddsTheMemberAndTellsTheLiveChannel()
    {
        var newcomer = Guid.NewGuid();
        var (teams, team) = TeamWith();
        var invite = new TeamInvite(team.Id, "new@example.com", "editor", Owner);
        teams.CreatedInvites.Add(invite);
        var live = new FakeLiveAccess();

        var result = await As(newcomer, teams, live: live, callerEmail: "new@example.com").Accept(invite.Token);

        result.Should().BeOfType<OkObjectResult>();
        teams.MemberRows.Should().Contain(m => m.UserId == newcomer && m.Role == "editor");
        live.GrantedTo.Should().Contain(newcomer, "an earlier refusal on the live channel must not outlast joining");
    }

    // ── Changing a role ──────────────────────────────────────────────────────

    [Test]
    public async Task TheOwnerChangesAMembersRole()
    {
        var member = Guid.NewGuid();
        var (teams, team) = TeamWith((member, "viewer"));

        var result = await As(Owner, teams).UpdateRole(team.Id, member, new UpdateRoleRequest("editor"));

        result.Should().BeOfType<OkObjectResult>();
        (await teams.CanContributeAsync(team.Id, member)).Should().BeTrue();
    }

    [Test]
    public async Task OnlyTheOwnerChangesRoles()
    {
        var editor = Guid.NewGuid();
        var viewer = Guid.NewGuid();
        var (teams, team) = TeamWith((editor, "editor"), (viewer, "viewer"));

        var result = await As(editor, teams).UpdateRole(team.Id, viewer, new UpdateRoleRequest("editor"));

        result.Should().BeOfType<ForbidResult>();
        teams.RoleChanges.Should().BeEmpty();
    }

    [Test]
    public async Task TheOwnersOwnRoleIsFixed()
    {
        var (teams, team) = TeamWith();

        var result = await As(Owner, teams).UpdateRole(team.Id, Owner, new UpdateRoleRequest("viewer"));

        result.Should().BeOfType<BadRequestObjectResult>();
        teams.RoleChanges.Should().BeEmpty();
    }

    [TestCase("owner")]
    [TestCase("admin")]
    [TestCase("")]
    public async Task ARoleThatDoesNotExistIsRefusedNotTurnedIntoViewer(string role)
    {
        // Anything unknown was quietly saved as "viewer": a slip could demote someone.
        var member = Guid.NewGuid();
        var (teams, team) = TeamWith((member, "editor"));

        var result = await As(Owner, teams).UpdateRole(team.Id, member, new UpdateRoleRequest(role));

        result.Should().BeOfType<BadRequestObjectResult>();
        teams.RoleChanges.Should().BeEmpty();
    }

    [Test]
    public async Task ARoleIsOnlyChangedForSomeoneInTheTeam()
    {
        var (teams, team) = TeamWith();

        var result = await As(Owner, teams).UpdateRole(team.Id, Guid.NewGuid(), new UpdateRoleRequest("editor"));

        result.Should().BeOfType<NotFoundObjectResult>();
        teams.RoleChanges.Should().BeEmpty();
    }

    // ── Removing a member ────────────────────────────────────────────────────

    [Test]
    public async Task RemovingAMemberEndsTheirLiveAccess()
    {
        // The live channel remembers who is a member. It was never told about a
        // removal, so the person kept receiving comments and cursors.
        var member = Guid.NewGuid();
        var (teams, team) = TeamWith((member, "editor"));
        var live = new FakeLiveAccess();

        var result = await As(Owner, teams, live: live).RemoveMember(team.Id, member);

        result.Should().BeOfType<NoContentResult>();
        teams.Members.Should().NotContain(member);
        live.RevokedFrom.Should().ContainSingle().Which.Should().Be((team.Id, member));
    }
}
