import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DownloadCard from "@/components/downloadCard";
import BackendAPI from "@/lib/BackendAPI";

/**
 * The report's exports. Word and PowerPoint were built and stored for Pro users,
 * but the dashboard never offered a way to download them.
 */

vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ token: "tok" }) }));
vi.mock("@/app/contexts/SettingsContext", () => ({ useSettings: () => ({ lang: "en" }) }));

const dataset = (over = {}) => ({
  id: "a1", fileName: "sales.xlsx", reportFileName: "sales_report.pdf",
  hasPdfReport: true, hasCleanedCsv: true, hasWordReport: false, hasPptx: false, ...over,
});

let getUrl: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getUrl = vi.fn().mockResolvedValue({ url: "https://signed.example/file", fileName: "" });
  BackendAPI.getDownloadUrl = getUrl as unknown as typeof BackendAPI.getDownloadUrl;
});

describe("Word and PowerPoint", () => {
  it("are offered when the analysis made them", () => {
    render(<DownloadCard dataset={dataset({ hasWordReport: true, hasPptx: true })} />);

    expect(screen.getByRole("button", { name: /Word Report/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PowerPoint/ })).toBeInTheDocument();
  });

  it("are not offered otherwise", () => {
    render(<DownloadCard dataset={dataset()} />);

    expect(screen.queryByRole("button", { name: /Word Report/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /PowerPoint/ })).not.toBeInTheDocument();
  });

  it.each([
    ["Word Report", "word"],
    ["PowerPoint", "pptx"],
  ])("%s asks the server for the %s file", async (label, type) => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<DownloadCard dataset={dataset({ hasWordReport: true, hasPptx: true })} />);

    await userEvent.setup().click(screen.getByRole("button", { name: new RegExp(label) }));

    expect(getUrl).toHaveBeenCalledWith("tok", "a1", type);
    await waitFor(() => expect(click).toHaveBeenCalled());
  });
});

describe("the cleaned file", () => {
  it("falls back to a .csv name whatever was uploaded", async () => {
    // Risk: "cleaned_sales.xlsx" would be a CSV that Excel refuses to open.
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    render(<DownloadCard dataset={dataset()} />);

    await userEvent.setup().click(screen.getByRole("button", { name: /Cleaned CSV/ }));

    await waitFor(() => expect(names).toEqual(["cleaned_sales.csv"]));
  });
});
