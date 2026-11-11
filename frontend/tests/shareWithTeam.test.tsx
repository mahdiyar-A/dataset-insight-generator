import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShareWithTeam from "@/components/ShareWithTeam";
import BackendAPI from "@/lib/BackendAPI";

/**
 * Sharing an analysis with a team. The server could do it from the start and
 * nothing on the site asked it to, so no shared workspace could be reached.
 */

let plan = "pro";
vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ token: "tok", user: { id: "me", plan } }) }));
vi.mock("@/app/contexts/SettingsContext", () => ({ useSettings: () => ({ lang: "en" }) }));

const team = (over = {}) => ({ id: "t1", name: "Analysts", isOwner: false, myRole: "editor", ...over });

let getTeams: ReturnType<typeof vi.fn>;
let share: ReturnType<typeof vi.fn>;

beforeEach(() => {
  plan = "pro";
  getTeams = vi.fn().mockResolvedValue([team()]);
  share = vi.fn().mockResolvedValue({ id: "w9", teamId: "t1", analysisId: "a1" });
  BackendAPI.getMyTeams = getTeams as unknown as typeof BackendAPI.getMyTeams;
  BackendAPI.shareAnalysis = share as unknown as typeof BackendAPI.shareAnalysis;
});

const open = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Share with a team" }));
  return user;
};

describe("sharing an analysis", () => {
  it("shares with the chosen team and links to the workspace", async () => {
    render(<ShareWithTeam analysisId="a1" />);
    const user = await open();

    await user.click(await screen.findByRole("button", { name: "Share" }));

    expect(share).toHaveBeenCalledWith("tok", "a1", "t1");
    const link = await screen.findByRole("link", { name: /Open the workspace/ });
    expect(link).toHaveAttribute("href", "/workspace/w9");
  });

  it("does not load teams until asked", () => {
    // Risk: every dashboard visit paying for a team lookup it never uses.
    render(<ShareWithTeam analysisId="a1" />);

    expect(getTeams).not.toHaveBeenCalled();
  });

  it("offers only teams the person may share into", async () => {
    // Viewers read and comment. The server refuses them; the page should not offer it.
    getTeams.mockResolvedValue([
      team({ id: "t1", name: "Readers", myRole: "viewer" }),
      team({ id: "t2", name: "Writers", myRole: "editor" }),
    ]);
    render(<ShareWithTeam analysisId="a1" />);
    const user = await open();

    expect(await screen.findByRole("option", { name: /Readers/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Share" }));

    expect(share).toHaveBeenCalledWith("tok", "a1", "t2");
  });

  it("says so when the person is only a viewer", async () => {
    getTeams.mockResolvedValue([team({ myRole: "viewer" })]);
    render(<ShareWithTeam analysisId="a1" />);
    await open();

    expect(await screen.findByText(/You're a viewer in your teams/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
  });

  it("points someone with no team to where one is made", async () => {
    getTeams.mockResolvedValue([]);
    render(<ShareWithTeam analysisId="a1" />);
    await open();

    expect(await screen.findByRole("link", { name: /Create a team/ })).toHaveAttribute("href", "/dashboard/team");
  });

  it("shows the server's reason when sharing is refused", async () => {
    share.mockRejectedValue(new Error("Viewers can read and comment."));
    render(<ShareWithTeam analysisId="a1" />);
    const user = await open();

    await user.click(await screen.findByRole("button", { name: "Share" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Viewers can read and comment.");
    expect(screen.queryByRole("link", { name: /Open the workspace/ })).not.toBeInTheDocument();
  });

  it("is not offered on the free plan", () => {
    plan = "free";
    const { container } = render(<ShareWithTeam analysisId="a1" />);

    expect(container).toBeEmptyDOMElement();
  });
});
