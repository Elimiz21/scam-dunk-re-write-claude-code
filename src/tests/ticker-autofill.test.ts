import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardScanEntry } from "@/components/dashboard/DashboardScanEntry";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

test("dashboard ticker starts empty and is protected from credential autofill until focus", () => {
  const html = renderToStaticMarkup(createElement(DashboardScanEntry));
  const input = html.match(/<input\b[^>]*>/)?.[0];
  expect(input).toContain('value=""');
  expect(input).toContain('type="search"');
  expect(input).toContain('name="stock-ticker"');
  expect(input).toContain('autoComplete="off"');
  expect(input).toContain('readonly=""');
  expect(input).not.toContain('disabled');
});
