import { describe, expect, it } from "vitest";

import { defaultDashboardWidgets } from "./DashboardReferenceModel.js";
import { widgetUnavailableReason } from "./DashboardReferenceQuery.js";

describe("dashboard widget capabilities", () => {
  const metric = defaultDashboardWidgets[0]!;

  it("accepts the supported status metric and rejects silently ignored filters", () => {
    expect(widgetUnavailableReason(metric)).toBeUndefined();
    expect(
      widgetUnavailableReason({ ...metric, thql: "from results where branch = main" })
    ).toContain("не поддерживается");
    expect(widgetUnavailableReason({ ...metric, thql: "from results surprise" })).toContain(
      "неподдерживаемое выражение"
    );
    expect(widgetUnavailableReason({ ...metric, thql: "from results where" })).toContain(
      "Укажите условие"
    );
  });

  it("does not present missing history or retry data as a computed value", () => {
    expect(widgetUnavailableReason({ ...metric, kind: "line" })).toContain("история");
    expect(widgetUnavailableReason({ ...metric, metric: "Количество ретраев" })).toContain(
      "повторных попыток"
    );
  });
});
