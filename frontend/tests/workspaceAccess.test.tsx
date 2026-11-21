import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkspacePage from "@/app/workspace/[id]/page";
import BackendAPI from "@/lib/BackendAPI";

/**
 * Inside a shared workspace: who may open which file, what an edited comment
 * looks like once saved, and what a person removed from the team sees.
 */

// The live connection, reduced to the handlers the page registers on it.
const handlers: Record<string, (payload: unknown) => void> = {};
const hub = {
  on: (event: string, handler: (payload: unknown) => void) => { handlers[event] = handler; },
  onreconnected: vi.fn(),
  start: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  invoke: vi.fn(async () => {}),
};

vi.mock("@microsoft/signalr", () => {
  class HubConnectionBuilder {
    withUrl() { return this; }
    withAutomaticReconnect() { return this; }
    configureLogging() { return this; }
    build() { return hub; }
  }
  return { HubConnectionBuilder, LogLevel: { Warning: 3 } };
});
// One router for the whole file, as Next gives a page. The page reloads the
// workspace when its router changes, so a new object on every render would
// reload it after every change and put the server's copy back over an edit.
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }));
const params = vi.hoisted(() => ({ id: "w1" }));
vi.mock("next/navigation", () => ({ useRouter: () => router, useParams: () => params }));
vi.mock("@/app/contexts/AuthContext", () => ({
  useAuth: () => ({ token: "tok", user: { id: "sharer", plan: "pro" }, isLoading: false }),
}));
// The report editor under the PDF reads the language setting.
vi.mock("@/app/contexts/SettingsContext", () => ({ useSettings: () => ({ lang: "en" }) }));

const comment = (over = {}) => ({
  id: "c1", userId: "sharer", fileType: "pdf", content: "Is this right?",
  createdAt: "2026-11-10T00:00:00Z", replies: [], ...over,
});
const workspace = (over = {}) => ({
  id: "w1", teamId: "t1", analysisId: "a1", sharedBy: "sharer",
  analysis: { id: "a1", fileName: "sales.xlsx", hasPdf: true, hasWord: true },
  myPermissions: {}, canManagePermissions: true, annotations: [comment()], ...over,
});
const teammates = [
  { userId: "owner",  role: "owner",  userName: "Olu" },
  { userId: "sharer", role: "editor", userName: "Sam" },
  { userId: "reader", role: "viewer", userName: "Rae" },
];

let rules: object[];
const setPermission = vi.fn();
const editAnnotation = vi.fn();

beforeEach(() => {
  rules = [];
  setPermission.mockReset().mockResolvedValue({ message: "Permission updated" });
  editAnnotation.mockReset();
  hub.stop.mockClear();

  const api = BackendAPI as unknown as Record<string, unknown>;
  api.getWorkspace            = vi.fn(async () => workspace());
  api.getTeamMembers          = vi.fn(async () => teammates);
  api.getWorkspacePermissions = vi.fn(async () => rules);
  api.setPermission           = setPermission;
  api.editAnnotation          = editAnnotation;
  // The report under the PDF: made before reports could be edited, so it says so and nothing more.
  api.getReport               = vi.fn(async () => ({ editable: false }));
});

const openPdf = async () => {
  const user = userEvent.setup();
  await user.click(await screen.findByText("PDF Report"));
  return user;
};

describe("who can open a file", () => {
  it("is set per person by whoever manages the workspace", async () => {
    render(<WorkspacePage />);
    const user = await openPdf();

    await user.selectOptions(await screen.findByLabelText("Access to PDF Report for Rae"), "none");

    expect(setPermission).toHaveBeenCalledWith("tok", "w1", "reader", "pdf", "none");
    expect(screen.getByLabelText("Access to PDF Report for Rae")).toHaveValue("none");
  });

  it("never lists the owner or the person who shared it", async () => {
    // They always have access, and the server refuses a rule against either.
    render(<WorkspacePage />);
    await openPdf();

    await screen.findByLabelText("Access to PDF Report for Rae");
    expect(screen.queryByLabelText(/for Olu$/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/for Sam$/)).not.toBeInTheDocument();
  });

  it("shows a rule already set, for this file or for every file", async () => {
    rules = [{ userId: "reader", fileType: "all", permission: "none" }];
    render(<WorkspacePage />);
    await openPdf();

    expect(await screen.findByLabelText("Access to PDF Report for Rae")).toHaveValue("none");
  });

  it("is not shown to an ordinary member", async () => {
    (BackendAPI as unknown as Record<string, unknown>).getWorkspace =
      vi.fn(async () => workspace({ canManagePermissions: false }));
    render(<WorkspacePage />);
    await openPdf();

    expect(screen.queryByText(/Who can open/)).not.toBeInTheDocument();
    expect(BackendAPI.getTeamMembers).not.toHaveBeenCalled();
  });
});

describe("editing a comment", () => {
  it("shows the new words as soon as it is saved", async () => {
    // The server answered "Annotation updated" and the page took that for the
    // comment, so the old words stayed on screen until a reload.
    editAnnotation.mockResolvedValue(comment({ content: "Checked: it is." }));
    render(<WorkspacePage />);
    const user = await openPdf();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Checked: it is.")).toBeInTheDocument();
    expect(screen.queryByText("Is this right?")).not.toBeInTheDocument();
  });
});

describe("being removed from the team", () => {
  it("closes the workspace and says why", async () => {
    render(<WorkspacePage />);
    await screen.findByText("PDF Report");

    act(() => handlers.AccessRemoved({ workspaceId: "w1" }));

    expect(await screen.findByText("You no longer have access to this workspace.")).toBeInTheDocument();
    expect(screen.queryByText("PDF Report")).not.toBeInTheDocument();
    expect(hub.stop).toHaveBeenCalled();
  });
});

describe("the report under the PDF", () => {
  const report = (canEdit: boolean) => ({
    editable: true, canEdit, version: 1, warnings: [], pictures: {},
    versions: [{ version: 1, kind: "written", restoredFrom: null, createdAt: "2026-11-21T10:00:00Z",
                 byDig: true, byYou: false, byName: null }],
    document: {
      schema: 1,
      text: { reportTitle: "Sales in 2025", introduction: "", executiveSummary: "", conclusion: "",
              dataQualitySection: "", assumptions: "" },
      insights: [{ id: "i1", title: "North leads", body: "North sold 120.", basedOn: [] }],
      charts: [], questionAnswers: [], facts: { rowCount: 10, language: "en" },
    },
  });

  it("is open for an editor to change, and the PDF has no Viewer badge", async () => {
    (BackendAPI as unknown as Record<string, unknown>).getReport = vi.fn(async () => report(true));
    render(<WorkspacePage />);
    await openPdf();

    const title = await screen.findByRole("textbox", { name: "Report title" });
    expect(title).not.toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.queryByText("👁 Viewer")).not.toBeInTheDocument();
  });

  it("is open to read, not change, for a viewer", async () => {
    (BackendAPI as unknown as Record<string, unknown>).getReport = vi.fn(async () => report(false));
    render(<WorkspacePage />);
    await openPdf();

    expect(await screen.findByRole("textbox", { name: "Report title" })).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});
