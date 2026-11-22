import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";

/**
 * The signed-in pages in the landing page's look: two themes chosen by the
 * brightness setting, and a dashboard that says what each plan keeps.
 */

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) } },
}));

describe("the theme", () => {
  afterEach(() => {
    sessionStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  async function themeAfter(brightness: number | null) {
    const { SettingsProvider, useSettings } = await import("@/app/contexts/SettingsContext");
    function Grab({ to }: { to: number }) {
      const { setBrightness } = useSettings();
      return <button onClick={() => setBrightness(to)}>set</button>;
    }
    render(<SettingsProvider><Grab to={brightness ?? 0} /></SettingsProvider>);
    if (brightness !== null) fireEvent.click(screen.getByRole("button", { name: "set" }));
    return document.documentElement.dataset.theme;
  }

  it("is dark by default", async () => {
    expect(await themeAfter(null)).toBe("dark");
  });

  it("is light above 65, as on the landing page", async () => {
    expect(await themeAfter(66)).toBe("light");
  });

  it("is dark at 65 and below", async () => {
    expect(await themeAfter(65)).toBe("dark");
  });

  it("clears colours an older version set inline, which would beat the stylesheet", async () => {
    document.documentElement.style.setProperty("--bg", "#000");
    document.documentElement.style.setProperty("--text", "#fff");
    await themeAfter(90);
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--text")).toBe("");
  });
});

describe("settings offers two looks", () => {
  const setBrightness = vi.fn();
  let brightness = 10;

  beforeEach(() => {
    vi.resetModules();
    setBrightness.mockReset();
    vi.doMock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
    vi.doMock("@/app/contexts/SettingsContext", async () => {
      const real = await vi.importActual<typeof import("@/app/contexts/SettingsContext")>("@/app/contexts/SettingsContext");
      return { ...real, useSettings: () => ({ lang: "en", setLang: vi.fn(), brightness, setBrightness }) };
    });
  });

  afterEach(() => {
    vi.doUnmock("@/app/contexts/SettingsContext");
    vi.doUnmock("next/navigation");
  });

  it("marks the one in use and switches to the other", async () => {
    brightness = 10;
    const { default: SettingsPage } = await import("@/app/dashboard/settings/page");
    const { LIGHT_BRIGHTNESS } = await import("@/app/contexts/SettingsContext");
    render(<SettingsPage />);

    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("slider")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(setBrightness).toHaveBeenCalledWith(LIGHT_BRIGHTNESS);
  });

  it("shows light as in use above 65", async () => {
    brightness = 80;
    const { default: SettingsPage } = await import("@/app/dashboard/settings/page");
    render(<SettingsPage />);
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("the dashboard says what each plan keeps", () => {
  let plan = "free";
  const push = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    push.mockReset();
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
    vi.doMock("@/app/contexts/AuthContext", () => ({
      useAuth: () => ({ token: "tok", isLoading: false, user: { plan, firstName: "Sam" }, logout: vi.fn(), refreshUser: vi.fn() }),
    }));
    vi.doMock("@/app/contexts/SettingsContext", () => ({ useSettings: () => ({ lang: "en", brightness: 10 }) }));
    vi.doMock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push }) }));
    for (const c of ["UploadCard", "HistoryTape", "chartsCard", "downloadCard", "infoCards", "AnalysisChatCard", "ReportEditor"]) {
      vi.doMock(`@/components/${c}`, () => ({ default: () => null }));
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@/app/contexts/AuthContext");
    vi.doUnmock("@/app/contexts/SettingsContext");
    vi.doUnmock("next/navigation");
  });

  async function renderDashboard(history: object[]) {
    const { default: BackendAPI } = await import("@/lib/BackendAPI");
    const B = BackendAPI as unknown as Record<string, unknown>;
    B.getHistory = vi.fn().mockResolvedValue(history);
    B.getActiveAnalysis = vi.fn().mockResolvedValue(null);
    const { default: DashboardPage } = await import("@/app/dashboard/page");
    render(<DashboardPage />);
    await act(async () => {});
  }

  const done = (id: string) => ({ id, fileName: `${id}.csv`, status: "done" });

  it("free: 5 kept, 10 questions, team editing on Pro", async () => {
    plan = "free";
    await renderDashboard([done("a"), done("b"), done("c")]);

    const meters = screen.getByRole("region", { name: "What you have used" });
    expect(meters).toHaveTextContent("Analyses kept3 of 5");
    expect(meters).toHaveTextContent("Analysis 6 replaces the oldest.");
    expect(meters).toHaveTextContent("Questions a day10");
    expect(meters).toHaveTextContent("On Pro");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/, Sam\.$/);
    expect(screen.getByText("FREE PLAN")).toBeInTheDocument();
  });

  it("pro: 15 kept, 100 questions, team editing included", async () => {
    plan = "pro";
    await renderDashboard([done("a")]);

    const meters = screen.getByRole("region", { name: "What you have used" });
    expect(meters).toHaveTextContent("1 of 15");
    expect(meters).toHaveTextContent("Questions a day100");
    expect(meters).toHaveTextContent("Included");
    expect(screen.queryByText("See Pro")).toBeNull();
  });

  it("free accounts can reach the team page, since anyone can be invited to a team", async () => {
    plan = "free";
    await renderDashboard([]);

    fireEvent.click(screen.getByRole("button", { name: /^Team/ }));
    expect(push).toHaveBeenCalledWith("/dashboard/team");
  });
});
