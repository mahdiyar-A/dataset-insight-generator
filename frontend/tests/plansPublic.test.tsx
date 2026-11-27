import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

/**
 * The Plans page is public. Someone who is not signed in has no plan, so it
 * must not tell them they are on one, and both cards have to lead somewhere.
 */

const auth = vi.hoisted(() => ({ token: null as string | null, user: null, isLoading: false }));

vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("@/lib/BackendAPI", () => ({
  default: { getPlans: vi.fn(() => new Promise(() => {})), subscribePro: vi.fn(), openBillingPortal: vi.fn() },
}));

import PlansPage from "@/app/plans/page";

afterEach(() => {
  auth.token = null;
  auth.isLoading = false;
});

describe("the Plans page", () => {
  it("offers a signed-out visitor an account on both cards, not a current plan", () => {
    render(<PlansPage />);
    expect(screen.queryByText(/current plan/i)).toBeNull();
    expect(screen.getByRole("link", { name: "Create a free account" })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: "Start free, upgrade anytime" })).toHaveAttribute("href", "/register");
  });

  it("makes no claim about which plan is popular, and leaves the payment company out", () => {
    const { container } = render(<PlansPage />);
    expect(container.textContent).not.toMatch(/popular/i);
    expect(container.textContent).not.toMatch(/Stripe/);
    expect(container.textContent).toContain("Cancel Pro anytime.");
  });

  it("shows no buttons until it knows who is looking", () => {
    auth.isLoading = true;
    render(<PlansPage />);
    expect(screen.queryByRole("link", { name: /free/i })).toBeNull();
    expect(screen.queryByText(/current plan/i)).toBeNull();
  });

  it("tells a signed-in Free member which plan they are on", () => {
    auth.token = "t";
    render(<PlansPage />);
    expect(screen.getByText(/Your current plan/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upgrade to Pro" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create a free account" })).toBeNull();
  });

  it("draws its marks instead of typing them", () => {
    const { container } = render(<PlansPage />);
    expect(container.textContent).not.toMatch(/[✓✗]/u);
  });
});
