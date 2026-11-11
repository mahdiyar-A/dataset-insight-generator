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

    private static TeamsController InviteAs(Guid caller, FakeTeamRepository teams)
    {
        var user = User.CreateWithId(caller, "Ada", "ada@example.com", "supabase-auth");
        user.SetPlan("pro", null, "sub_1");
        return new TeamsController(teams, new FakeUserRepository { DefaultUser = user }, new NoOpEmailService(),
            new ConfigurationBuilder().Build(), NullLogger<TeamsController>.Instance)
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
}
