using System.Security.Claims;
using System.Text.Json;
using backend.Controllers;
using backend.Domain.Entities;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;

namespace backend.Tests.Unit;

/// <summary>
/// Comments and file access inside a shared workspace.
///
/// Three things looked as if they worked and did not. Resolve was offered to
/// everyone and only counted for the comment's author. Saving an edit returned
/// a message where the page expected the comment, so nothing changed on screen.
/// And who may see which file could be set through the API by one person only,
/// with no check that the person named was in the team.
/// </summary>
[TestFixture]
public class WorkspaceCommentTests
{
    private Guid _owner, _sharer, _author, _reader, _outsider;
    private Team _team = null!;
    private SharedWorkspace _workspace = null!;
    private FakeTeamRepository _teams = null!;
    private FakeWorkspaceRepository _workspaces = null!;

    [SetUp]
    public void SetUp()
    {
        _owner = Guid.NewGuid(); _sharer = Guid.NewGuid(); _author = Guid.NewGuid();
        _reader = Guid.NewGuid(); _outsider = Guid.NewGuid();

        _team  = new Team(_owner, "Analysts");
        _teams = new FakeTeamRepository { Team = _team };
        foreach (var (user, role) in new[] { (_owner, "owner"), (_sharer, "editor"), (_author, "viewer"), (_reader, "viewer") })
        {
            _teams.Members.Add(user);
            _teams.MemberRows.Add(new TeamMember(_team.Id, user, role));
        }

        _workspace  = new SharedWorkspace(_team.Id, Guid.NewGuid(), _sharer);
        _workspaces = new FakeWorkspaceRepository { Workspace = _workspace };
    }

    private WorkspaceController As(Guid caller) =>
        new(_workspaces, _teams, new FakeAnalysisRepository(), new FakeUserRepository(),
            NullLogger<WorkspaceController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("sub", caller.ToString()) }, "test")),
                },
            },
        };

    private Annotation CommentBy(Guid user, string words = "Is this figure right?", Guid? workspace = null)
    {
        var comment = new Annotation(workspace ?? _workspace.Id, user, "pdf", words);
        _workspaces.Annotations.Add(comment);
        return comment;
    }

    private static JsonElement Body(IActionResult result) =>
        JsonSerializer.SerializeToElement(((ObjectResult)result).Value);

    // ── Resolve ──────────────────────────────────────────────────────────────

    [Test]
    public async Task AnyoneInTheTeamCanCloseAThread()
    {
        var comment = CommentBy(_author);

        var result = await As(_reader).Resolve(_workspace.Id, comment.Id);

        result.Should().BeOfType<OkObjectResult>();
        comment.ResolvedAt.Should().NotBeNull("it used to stay open unless the author clicked");
    }

    [Test]
    public async Task SomeoneOutsideTheTeamCannotCloseOne()
    {
        var comment = CommentBy(_author);

        var result = await As(_outsider).Resolve(_workspace.Id, comment.Id);

        result.Should().BeOfType<ForbidResult>();
        comment.ResolvedAt.Should().BeNull();
    }

    [Test]
    public async Task ACommentFromAnotherWorkspaceIsNotTouched()
    {
        // Risk: now that the author is not checked, the workspace has to be.
        // Otherwise membership of one team would close threads in any other.
        var elsewhere = CommentBy(_author, workspace: Guid.NewGuid());

        var result = await As(_reader).Resolve(_workspace.Id, elsewhere.Id);

        result.Should().BeOfType<NotFoundObjectResult>();
        elsewhere.ResolvedAt.Should().BeNull();
    }

    // ── Edit ─────────────────────────────────────────────────────────────────

    [Test]
    public async Task SavingAnEditReturnsTheComment()
    {
        var comment = CommentBy(_author);

        var result = await As(_author).EditAnnotation(_workspace.Id, comment.Id, new EditAnnotationRequest("  Checked: it is.  "));

        result.Should().BeOfType<OkObjectResult>();
        var body = Body(result);
        body.GetProperty("Id").GetGuid().Should().Be(comment.Id, "the page finds the comment to update by its id");
        body.GetProperty("Content").GetString().Should().Be("Checked: it is.");
    }

    [Test]
    public async Task SomeoneElsesCommentCannotBeEdited()
    {
        var comment = CommentBy(_author, "Original words");

        var result = await As(_reader).EditAnnotation(_workspace.Id, comment.Id, new EditAnnotationRequest("Changed"));

        result.Should().BeOfType<NotFoundObjectResult>();
        comment.Content.Should().Be("Original words");
    }

    [TestCase("")]
    [TestCase("   ")]
    public async Task AnEditCannotEmptyAComment(string words)
    {
        var comment = CommentBy(_author, "Original words");

        var result = await As(_author).EditAnnotation(_workspace.Id, comment.Id, new EditAnnotationRequest(words));

        result.Should().BeOfType<BadRequestObjectResult>();
        comment.Content.Should().Be("Original words");
    }

    // ── Who sees which file ──────────────────────────────────────────────────

    [Test]
    public async Task TheTeamOwnerAndThePersonWhoSharedSetAccess()
    {
        (await As(_owner).SetPermission(_workspace.Id, new SetPermissionRequest(_reader.ToString(), "pdf", "none")))
            .Should().BeOfType<OkObjectResult>();
        (await As(_sharer).SetPermission(_workspace.Id, new SetPermissionRequest(_reader.ToString(), "word", "none")))
            .Should().BeOfType<OkObjectResult>();

        _workspaces.Permissions.Select(p => (p.UserId, p.FileType, p.Permission))
            .Should().BeEquivalentTo(new[] { (_reader, "pdf", "none"), (_reader, "word", "none") });
    }

    [Test]
    public async Task AnotherMemberCannotSetAccess()
    {
        var result = await As(_author).SetPermission(_workspace.Id,
            new SetPermissionRequest(_reader.ToString(), "pdf", "none"));

        result.Should().BeOfType<ForbidResult>();
        _workspaces.Permissions.Should().BeEmpty();
    }

    [Test]
    public async Task AccessIsOnlySetForPeopleInTheTeam()
    {
        var result = await As(_owner).SetPermission(_workspace.Id,
            new SetPermissionRequest(_outsider.ToString(), "pdf", "view"));

        result.Should().BeOfType<BadRequestObjectResult>();
        _workspaces.Permissions.Should().BeEmpty();
    }

    [Test]
    public async Task TheOwnerAndTheSharerCannotBeLockedOut()
    {
        // Risk: the two people who manage access shutting each other out of
        // a file one of them shared.
        (await As(_sharer).SetPermission(_workspace.Id, new SetPermissionRequest(_owner.ToString(), "pdf", "none")))
            .Should().BeOfType<BadRequestObjectResult>();
        (await As(_owner).SetPermission(_workspace.Id, new SetPermissionRequest(_sharer.ToString(), "pdf", "none")))
            .Should().BeOfType<BadRequestObjectResult>();

        _workspaces.Permissions.Should().BeEmpty();
    }

    [Test]
    public async Task TheWorkspaceTellsThePageWhoMayManageAccess()
    {
        Body(await As(_owner).Get(_workspace.Id)).GetProperty("canManagePermissions").GetBoolean().Should().BeTrue();
        Body(await As(_sharer).Get(_workspace.Id)).GetProperty("canManagePermissions").GetBoolean().Should().BeTrue();
        Body(await As(_reader).Get(_workspace.Id)).GetProperty("canManagePermissions").GetBoolean().Should().BeFalse();
    }
}
