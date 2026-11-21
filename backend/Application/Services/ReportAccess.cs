using backend.Application.Interfaces;
using backend.Domain.Entities;

namespace backend.Application.Services;

public enum ReportRole
{
    None = 0,
    Read = 1,   // sees the report and its versions; comments on the team page
    Edit = 2,   // also saves, goes back to older versions
}

/// <summary>
/// Who may read and who may edit the report of an analysis.
///
///   The owner of the analysis               edits.
///   The owner of a team it is shared with   edits.
///   An editor in such a team                edits.
///   A viewer in such a team                 reads.
///
/// Someone the person who shared it set to "No access" for the PDF (or for
/// all files) in a team gets nothing through that team: the report is what
/// the PDF is built from. Being in two teams it is shared with gives the
/// better of the two.
///
/// The analysis returned is the owner's: files and pictures are stored under
/// the owner, whoever is editing.
/// </summary>
public class ReportAccess
{
    private readonly IAnalysisRepository  _analyses;
    private readonly IWorkspaceRepository _workspaces;
    private readonly ITeamRepository      _teams;

    public ReportAccess(IAnalysisRepository analyses, IWorkspaceRepository workspaces, ITeamRepository teams)
    {
        _analyses   = analyses;
        _workspaces = workspaces;
        _teams      = teams;
    }

    public async Task<(Analysis? Analysis, ReportRole Role)> ForAsync(Guid userId, Guid analysisId)
    {
        var own = await _analyses.GetByIdAsync(analysisId, userId);
        if (own != null) return (own, ReportRole.Edit);

        Analysis? analysis = null;
        var best = ReportRole.None;
        foreach (var workspace in await _workspaces.GetUserSharedWorkspacesAsync(userId))
        {
            if (workspace.AnalysisId != analysisId || best == ReportRole.Edit) continue;
            var role = await RoleInAsync(workspace, userId);
            if (role <= best) continue;

            // Shared by its owner: sharing checks the analysis is the sharer's.
            analysis ??= await _analyses.GetByIdAsync(workspace.AnalysisId, workspace.SharedBy);
            if (analysis != null) best = role;
        }
        return analysis == null ? (null, ReportRole.None) : (analysis, best);
    }

    private async Task<ReportRole> RoleInAsync(SharedWorkspace workspace, Guid userId)
    {
        var team = await _teams.GetTeamAsync(workspace.TeamId);
        if (team == null) return ReportRole.None;
        if (team.OwnerId == userId) return ReportRole.Edit;

        var member = (await _teams.GetMembersAsync(workspace.TeamId)).FirstOrDefault(m => m.UserId == userId);
        if (member == null) return ReportRole.None;

        var rules = (await _workspaces.GetPermissionsAsync(workspace.Id)).Where(p => p.UserId == userId).ToList();
        var rule  = rules.FirstOrDefault(p => p.FileType == "pdf") ?? rules.FirstOrDefault(p => p.FileType == "all");
        if (rule?.Permission == "none") return ReportRole.None;

        return member.Role is "owner" or "editor" ? ReportRole.Edit : ReportRole.Read;
    }
}
