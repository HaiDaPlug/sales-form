import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DateField } from "@/components/sales-wizard/DateField";
import { TimeField } from "@/components/sales-wizard/TimeField";

/**
 * Server rendering only — the popovers open on interaction, which needs a DOM
 * this project deliberately does not test in. What is checked here is the
 * closed state a step actually renders: the trigger, its label, and the value
 * as the seller reads it.
 */
describe("DateField", () => {
  it("shows the stored date in Swedish rather than as an ISO string", () => {
    const markup = renderToStaticMarkup(
      createElement(DateField, { label: "Datum", value: "2026-08-19", onChange: () => {} })
    );

    expect(markup).toContain("ons 19 aug 2026");
    expect(markup).not.toContain("2026-08-19");
  });

  it("prompts when no date is chosen", () => {
    const markup = renderToStaticMarkup(createElement(DateField, { label: "Datum", value: "", onChange: () => {} }));

    expect(markup).toContain("Välj datum");
    expect(markup).toContain("is-empty");
  });
});

describe("TimeField", () => {
  it("renders the stored time in an editable input", () => {
    const markup = renderToStaticMarkup(createElement(TimeField, { label: "Tid", value: "10:30", onChange: () => {} }));

    expect(markup).toContain('value="10:30"');
    expect(markup).toContain('aria-label="Tid"');
  });
});
