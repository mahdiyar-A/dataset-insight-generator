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
/// The invite page said only "you've been invited to a team" (QA item 41):
/// not which team, by whom, or as what. It now asks first, and only the
/// account the invitation was sent to is told.
/// </summary>
[TestFixture]
public class InvitePageTests
{
    private static readonly Guid Owner = Guid.NewGuid();

    private static (FakeTeamRepository teams, TeamInvite invite) Invited(string email = "new@example.com")
    {
        var team    = new Team(Owner, "Analysts");
        var teams   = new FakeTeamRepository { Team = team };
        teams.Members.Add(Owner);
        var invite  = new TeamInvite(team.Id, email, "editor", Owner);
        teams.CreatedInvites.Add(invite);
        return (teams, invite);
    }

    private static TeamsController As(Guid caller, string email, string plan, FakeTeamRepository teams)
    {
        var me = User.CreateWithId(caller, email.Split('@')[0], email, "supabase-auth");
        if (plan != "free") me.SetPlan(plan, null, "sub_1");
        var users = new FakeUserRepository { DefaultUser = me };
        users.Names[Owner] = "ada";
        return new TeamsController(teams, users, new NoOpEmailService(), new ConfigurationBuilder().Build(),
            NullLogger<TeamsController>.Instance, new ChatQuota(), new FakeLiveAccess())
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

    private static JsonElement Body(IActionResult result) =>
        JsonSerializer.SerializeToElement(((ObjectResult)result).Value);

    [Test]
    public async Task The_invited_person_sees_the_team_the_inviter_and_the_role()
    {
        var (teams, invite) = Invited();

        var body = Body(await As(Guid.NewGuid(), "new@example.com", "free", teams).Peek(invite.Token));

        body.GetProperty("forThisAccount").GetBoolean().Should().BeTrue();
        body.GetProperty("teamName").GetString().Should().Be("Analysts");
        body.GetProperty("invitedBy").GetString().Should().Be("ada");
        body.GetProperty("role").GetString().Should().Be("editor");
        body.GetProperty("needsPro").GetBoolean().Should().BeTrue();
        body.GetProperty("status").GetString().Should().Be("pending");
    }

    [Test]
    public async Task Someone_else_holding_the_link_learns_nothing_about_the_team()
    {
        var (teams, invite) = Invited();

        var body = Body(await As(Guid.NewGuid(), "other@example.com", "pro", teams).Peek(invite.Token));

        body.GetProperty("forThisAccount").GetBoolean().Should().BeFalse();
        body.TryGetProperty("teamName", out _).Should().BeFalse();
        body.GetProperty("sentTo").GetString().Should().Be("n***@example.com");
    }

    [Test]
    public async Task Accepting_from_the_wrong_account_says_which_address_to_use()
    {
        var (teams, invite) = Invited();

        var result = await As(Guid.NewGuid(), "other@example.com", "pro", teams).Accept(invite.Token);

        ((ObjectResult)result).StatusCode.Should().Be(403);
        Body(result).GetProperty("error").GetString().Should().Be("WRONG_ACCOUNT");
        Body(result).GetProperty("message").GetString().Should().Contain("n***@example.com");
    }

    [Test]
    public async Task A_bad_link_has_words_not_a_code()
    {
        var (teams, _) = Invited();

        var result = await As(Guid.NewGuid(), "new@example.com", "pro", teams).Peek("nope");

        result.Should().BeOfType<NotFoundObjectResult>();
        Body(result).GetProperty("message").GetString().Should().Contain("isn't valid");
    }
}
