using System.Security.Claims;
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

    private static TeamsController InviteAs(Guid caller, FakeTeamRepository teams, ChatQuota? quota = null)
    {
        var user = User.CreateWithId(caller, "Ada", "ada@example.com", "supabase-auth");
        user.SetPlan("pro", null, "sub_1");
        return new TeamsController(teams, new FakeUserRepository { DefaultUser = user }, new NoOpEmailService(),
            new ConfigurationBuilder().Build(), NullLogger<TeamsController>.Instance, quota ?? new ChatQuota())
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

    [Test]
    public async Task AViewerCannotInvite()
    {
        var viewer = Guid.NewGuid();
        var (teams, team) = TeamWith((viewer, "viewer"));

        var result = await InviteAs(viewer, teams).Invite(team.Id, new InviteRequest("bob@example.com", "editor"));

        result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(403);
        teams.CreatedInvites.Should().BeEmpty();
    }

    [Test]
    public async Task AnEditorCanInvite()
    {
        var editor = Guid.NewGuid();
        var (teams, team) = TeamWith((editor, "editor"));

        var result = await InviteAs(editor, teams).Invite(team.Id, new InviteRequest("bob@example.com", "viewer"));

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
            (await InviteAs(Owner, teams, quota).Invite(team.Id, new InviteRequest($"p{i}@example.com")))
                .Should().BeOfType<OkObjectResult>();

        var refused = await InviteAs(Owner, teams, quota).Invite(team.Id, new InviteRequest("one-more@example.com"));

        refused.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(429);
        teams.CreatedInvites.Should().HaveCount(TeamsController.InvitesPerDay);
    }

    [TestCase("not-an-address")]
    [TestCase("a@b@c.com")]
    [TestCase("Bob <bob@example.com>")]
    public async Task SomethingThatIsNotAnAddressSendsNothing(string email)
    {
        var (teams, team) = TeamWith();

        var result = await InviteAs(Owner, teams).Invite(team.Id, new InviteRequest(email));

        result.Should().BeOfType<BadRequestObjectResult>();
        teams.CreatedInvites.Should().BeEmpty();
    }
}
