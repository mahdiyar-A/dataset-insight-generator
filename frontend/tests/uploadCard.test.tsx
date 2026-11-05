import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import UploadCard from "@/components/UploadCard";
import BackendAPI from "@/lib/BackendAPI";

/**
 * Choosing a file. The card used to accept only .csv, and read every file as
 * text to count its rows, which is nonsense for Excel or Parquet.
 */

vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ token: "tok" }) }));
vi.mock("@/app/contexts/SettingsContext", () => ({ useSettings: () => ({ lang: "en" }) }));

const serverRead = (over = {}) => ({
  fileName: "sales.parquet", fileSizeBytes: 2048, rowCount: 1200, columnCount: 3,
  status: "ready", isPending: true, format: "parquet", formatLabel: "Parquet",
  headers: ["date", "region", "revenue"],
  preview: [["2026-01-01", "North", "120.5"], ["2026-01-02", "South", null]],
  notes: ["Read sheet Sales."], ...over,
});

let upload: ReturnType<typeof vi.fn>;
let guestUpload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  upload = vi.fn().mockResolvedValue(serverRead());
  guestUpload = vi.fn().mockResolvedValue(serverRead());
  BackendAPI.uploadDataset = upload as unknown as typeof BackendAPI.uploadDataset;
  BackendAPI.guestUpload = guestUpload as unknown as typeof BackendAPI.guestUpload;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function choose(container: HTMLElement, file: File) {
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
}

const named = (name: string, content = "PAR1 binary") => new File([content], name);

describe("the picker", () => {
  it("offers every supported format", () => {
    const { container } = render(<UploadCard onUploadSuccess={() => {}} resetKey={0} />);

    const accept = container.querySelector('input[type="file"]')!.getAttribute("accept")!;

    expect(accept).toContain(".parquet");
    expect(accept).toContain(".xlsx");
    expect(accept).toContain(".sav");
  });
});

describe("a supported file", () => {
  it("shows what the server read for a format the browser can't open", async () => {
    const onUploadSuccess = vi.fn();
    const { container } = render(<UploadCard onUploadSuccess={onUploadSuccess} resetKey={0} />);

    choose(container, named("sales.parquet"));

    expect(await screen.findByText("region")).toBeInTheDocument();
    expect(screen.getByText("1,200")).toBeInTheDocument();
    expect(screen.getByText(/Parquet ·/)).toHaveTextContent("First 2 rows · 3 of 3 cols shown");
    expect(screen.getByText("Read sheet Sales.")).toBeInTheDocument();
    expect(onUploadSuccess).toHaveBeenCalledWith(expect.objectContaining({ rowCount: 1200 }));
  });

  it("does not try to read a binary file as text", async () => {
    const file = named("sales.parquet");
    const text = vi.spyOn(file, "text");
    const { container } = render(<UploadCard onUploadSuccess={() => {}} resetKey={0} />);

    choose(container, file);

    await screen.findByText("region");
    expect(text).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledWith("tok", file, 0, 0);
  });

  it("previews a CSV at once, then trusts the server's reading", async () => {
    let finish: (v: unknown) => void = () => {};
    upload.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { container } = render(<UploadCard onUploadSuccess={() => {}} resetKey={0} />);

    choose(container, named("data.csv", 'name,city\nAda,London\n'));

    expect(await screen.findByText("Ada")).toBeInTheDocument();

    finish(serverRead({ headers: ["name", "city"], preview: [["Ada Lovelace", "London, UK"]], rowCount: 1, columnCount: 2 }));

    expect(await screen.findByText("London, UK")).toBeInTheDocument();
  });

  it("still works when the server could not read it", async () => {
    upload.mockResolvedValue({ fileName: "data.csv", rowCount: 1, columnCount: 2, headers: [], preview: [] });
    const { container } = render(<UploadCard onUploadSuccess={() => {}} resetKey={0} />);

    choose(container, named("data.csv", "a,b\n1,2\n"));

    expect(await screen.findByText("Upload complete.")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "a" })).toBeInTheDocument();
  });

  it("goes through the guest route for guests", async () => {
    const { container } = render(
      <UploadCard onUploadSuccess={() => {}} resetKey={0} guestMode guestSessionId="s1" />);
    const file = named("survey.sav");

    choose(container, file);

    await screen.findByText("region");
    expect(guestUpload).toHaveBeenCalledWith(file, "s1", 0, 0);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("a refused file", () => {
  it("is turned away here, naming the format, without touching what was uploaded", async () => {
    const onUploadFailed = vi.fn();
    const { container } = render(
      <UploadCard onUploadSuccess={() => {}} onUploadFailed={onUploadFailed} resetKey={0} />);

    choose(container, named("report.pdf"));

    expect(await screen.findByRole("alert")).toHaveTextContent(".pdf files can't be analysed");
    expect(upload).not.toHaveBeenCalled();
    expect(onUploadFailed).not.toHaveBeenCalled();
  });

  it("is too large", async () => {
    const big = named("big.csv");
    Object.defineProperty(big, "size", { value: 51 * 1024 * 1024 });
    const { container } = render(<UploadCard onUploadSuccess={() => {}} resetKey={0} />);

    choose(container, big);

    expect(await screen.findByRole("alert")).toHaveTextContent("50 MB");
    expect(upload).not.toHaveBeenCalled();
  });

  it("shows the server's reason, clears the preview and tells the dashboard", async () => {
    upload.mockRejectedValue(new Error("This zip is password-protected."));
    const onUploadFailed = vi.fn();
    const { container } = render(
      <UploadCard onUploadSuccess={() => {}} onUploadFailed={onUploadFailed} resetKey={0} />);

    choose(container, named("data.csv", "a,b\n1,2\n"));

    expect(await screen.findByText("This zip is password-protected.")).toBeInTheDocument();
    await waitFor(() => expect(onUploadFailed).toHaveBeenCalledOnce());
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("ignores a second file while the first is uploading", async () => {
    upload.mockReturnValue(new Promise(() => {}));
    const { container } = render(<UploadCard onUploadSuccess={() => {}} resetKey={0} />);

    choose(container, named("one.parquet"));
    choose(container, named("two.parquet"));

    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
  });
});

describe("drag and drop", () => {
  it("uses the current callbacks, not the first render's", async () => {
    // Risk: onDrop used to be memoized, so a late prop change never reached it.
    upload.mockRejectedValue(new Error("Nope."));
    const stale = vi.fn();
    const current = vi.fn();
    const { container, rerender } = render(
      <UploadCard onUploadSuccess={() => {}} onUploadFailed={stale} resetKey={0} />);
    rerender(<UploadCard onUploadSuccess={() => {}} onUploadFailed={current} resetKey={0} />);

    fireEvent.drop(container.querySelector(".upload-dropzone")!, {
      dataTransfer: { files: [named("a.parquet")] },
    });

    await waitFor(() => expect(current).toHaveBeenCalledOnce());
    expect(stale).not.toHaveBeenCalled();
  });
});
