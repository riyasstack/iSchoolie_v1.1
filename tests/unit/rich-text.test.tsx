// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createElement, type ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));

import { RichText } from "@/features/posts/rich-text";

afterEach(cleanup);

describe("RichText", () => {
  it("renders user text as text, never as HTML", () => {
    const { container } = render(createElement(RichText, { text: '<img src=x onerror="alert(1)"> hi' }));
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)"> hi');
  });
  it("links mentions, hashtags and URLs with safe attributes", () => {
    render(createElement(RichText, { text: "@maya_learns #robotics https://example.org" }));
    expect(screen.getByText("@maya_learns").getAttribute("href")).toBe("/maya_learns");
    expect(screen.getByText("#robotics").getAttribute("href")).toContain("/search?q=%23robotics");
    const ext = screen.getByText("example.org");
    expect(ext.getAttribute("rel")).toContain("noopener");
    expect(ext.getAttribute("target")).toBe("_blank");
  });
  it("sets dir=rtl for Arabic posts", () => {
    const { container } = render(createElement(RichText, { text: "تعلم البرمجة" }));
    expect(container.firstElementChild?.getAttribute("dir")).toBe("rtl");
  });
});
