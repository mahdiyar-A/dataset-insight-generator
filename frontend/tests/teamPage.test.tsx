import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TeamPage from "@/app/dashboard/team/page";
import BackendAPI from "@/lib/BackendAPI";

/**
 * The team page. The owner could not change a role here, nothing said how many
 * people a team holds, and analyses shared with the team were listed nowhere.
 */

const push = vi.fn();
let me = { id: "owner", plan: "pro" };

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push }) }));
vi.mock("@/app/contexts/AuthContext", () => ({
  useAuth: () => ({ token: "tok", user: me, isLoading: false }),
}));

const team = (over = {}) => ({
  id: "t1", name: "Analysts", ownerId: "owner", inviteCode: "abc", isOwner: true,
  myRole: "owner", memberCount: 2, maxMembers: 5, ...over,
});
const member = (userId: string, role: string) => ({ userId, role, userName: userId, email: `${userId}@example.com`, plan: "pro" });
const invite = (email: string) => ({ id: `i-${email}`, email, role: "viewer", createdAt: "2026-11-10T00:00:00Z", isPending: true });

let members: ReturnType<typeof member>[];
let invites: ReturnType<typeof invite>[];
let shared: object[];
const updateRole = vi.fn();
const sendInvite = vi.fn();

beforeEach(() => {
  me = { id: "owner", plan: "pro" };
  members = [member("owner", "owner"), member("bo", "viewer")];
  invites = [];
  shared = [];
  push.mockReset();
  updateRole.mockReset().mockResolvedValue({ message: "Role updated" });
  sendInvite.mockReset().mockResolvedValue({
    message: "Invitation sent to cy@example.com. They have a DIG account on the Free plan, and will need Pro to join.",
  });

  const api = BackendAPI as unknown as Record<string, unknown>;
  api.getMyTeams        = vi.fn(async () => [team({ isOwner: me.id === "owner", myRole: me.id === "owner" ? "owner" : "editor" })]);
  api.getTeamMembers    = vi.fn(async () => members);
  api.getPendingInvites = vi.fn(async () => invites);
  api.getMyWorkspaces   = vi.fn(async () => shared);
  api.updateMemberRole  = updateRole;
  api.inviteMember      = sendInvite;
});

describe("roles", () => {
  it("lets the owner change a member's role", async () => {
    render(<TeamPage />);

    await userEvent.setup().selectOptions(await screen.findByLabelText("Role for bo"), "editor");

    expect(updateRole).toHaveBeenCalledWith("tok", "t1", "bo", "editor");
  });

  it("does not offer the control to anyone else", async () => {
    me = { id: "bo", plan: "pro" };
    members = [member("owner", "owner"), member("bo", "editor"), member("cy", "viewer")];
    render(<TeamPage />);

    await screen.findByText("cy");
    expect(screen.queryByLabelText(/^Role for/)).not.toBeInTheDocument();
  });

  it("leaves the owner's own role alone", async () => {
    render(<TeamPage />);

    await screen.findByLabelText("Role for bo");
    expect(screen.queryByLabelText("Role for owner")).not.toBeInTheDocument();
  });
});

describe("seats", () => {
  it("counts invitations not yet answered", async () => {
    invites = [invite("cy@example.com")];
    render(<TeamPage />);

    expect(await screen.findByText(/3 of 5 seats used/)).toHaveTextContent("1 waiting on an invitation");
  });

  it("stops offering invitations when the team is full", async () => {
    members = [member("owner", "owner"), member("bo", "viewer"), member("cy", "viewer"), member("di", "editor")];
    invites = [invite("ed@example.com")];
    render(<TeamPage />);

    expect(await screen.findByText(/This team is full/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Email address…")).not.toBeInTheDocument();
  });

  it("says what the invited person still needs", async () => {
    // The reply was thrown away, so an owner never learned why someone had not joined.
    render(<TeamPage />);
    const user = userEvent.setup();

    await user.type(await screen.findByPlaceholderText("Email address…"), "cy@example.com");
    await user.click(screen.getByRole("button", { name: "Send invite" }));

    expect(sendInvite).toHaveBeenCalledWith("tok", "t1", "cy@example.com", "viewer");
    expect(await screen.findByRole("status")).toHaveTextContent("will need Pro to join");
  });
});

describe("what is shared with the team", () => {
  it("lists it and opens the workspace", async () => {
    shared = [
      { id: "w1", teamId: "t1", fileName: "sales.xlsx", sharedAt: "2026-11-10T00:00:00Z", canUnshare: true },
      { id: "w2", teamId: "other", fileName: "elsewhere.csv", sharedAt: "2026-11-10T00:00:00Z", canUnshare: false },
    ];
    render(<TeamPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Shared" }));

    expect(screen.getByText("sales.xlsx")).toBeInTheDocument();
    expect(screen.queryByText("elsewhere.csv")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/workspace/w1"));
  });
});
