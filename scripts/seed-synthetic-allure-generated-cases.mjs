const scenarios = [
  {
    id: "mfa-sign-in",
    name: "Multi-factor sign in",
    feature: "Authentication",
    story: "Security challenge",
    component: "auth",
    service: "identity",
    layer: "web",
    owner: "Platform QA",
    severity: "critical"
  },
  {
    id: "guest-checkout",
    name: "Guest checkout",
    feature: "Checkout",
    story: "Guest purchase",
    component: "checkout",
    service: "payments",
    layer: "web",
    owner: "Payments QA",
    severity: "blocker"
  },
  {
    id: "refund-request",
    name: "Refund request",
    feature: "Payments",
    story: "Refund workflow",
    component: "billing",
    service: "payments",
    layer: "api",
    owner: "Payments QA",
    severity: "critical"
  },
  {
    id: "product-discovery",
    name: "Product discovery",
    feature: "Catalog",
    story: "Search and filters",
    component: "catalog",
    service: "search",
    layer: "web",
    owner: "Catalog QA",
    severity: "normal"
  },
  {
    id: "inventory-sync",
    name: "Inventory synchronization",
    feature: "Inventory",
    story: "Stock refresh",
    component: "inventory",
    service: "warehouse",
    layer: "api",
    owner: "Catalog QA",
    severity: "normal"
  },
  {
    id: "profile-settings",
    name: "Profile settings",
    feature: "Profile",
    story: "Account preferences",
    component: "profile",
    service: "accounts",
    layer: "web",
    owner: "Accounts QA",
    severity: "normal"
  },
  {
    id: "push-notification",
    name: "Push notification",
    feature: "Notifications",
    story: "Device delivery",
    component: "notifications",
    service: "messaging",
    layer: "mobile",
    owner: "Mobile QA",
    severity: "normal"
  },
  {
    id: "deep-link",
    name: "Deep link routing",
    feature: "Navigation",
    story: "External link",
    component: "mobile-shell",
    service: "routing",
    layer: "mobile",
    owner: "Mobile QA",
    severity: "normal"
  },
  {
    id: "report-download",
    name: "Report download",
    feature: "Reports",
    story: "Export job",
    component: "reports",
    service: "analytics",
    layer: "api",
    owner: "Analytics QA",
    severity: "minor"
  },
  {
    id: "access-policy",
    name: "Access policy",
    feature: "Administration",
    story: "Role restrictions",
    component: "admin",
    service: "access-control",
    layer: "api",
    owner: "Security QA",
    severity: "critical"
  },
  {
    id: "desktop-import",
    name: "Desktop import",
    feature: "Desktop",
    story: "File ingestion",
    component: "desktop",
    service: "importer",
    layer: "desktop",
    owner: "Desktop QA",
    severity: "normal"
  },
  {
    id: "offline-recovery",
    name: "Offline recovery",
    feature: "Reliability",
    story: "Reconnect and retry",
    component: "sync",
    service: "gateway",
    layer: "mobile",
    owner: "Reliability QA",
    severity: "normal"
  }
];

const profiles = [
  { id: "primary-tenant", name: "primary tenant" },
  { id: "regional-tenant", name: "regional tenant" },
  { id: "new-account", name: "new account" },
  { id: "returning-account", name: "returning account" },
  { id: "large-payload", name: "large payload" },
  { id: "restricted-role", name: "restricted role" },
  { id: "slow-network", name: "slow network" },
  { id: "migration-cohort", name: "migration cohort" }
];

const outcomePalette = [
  "passed",
  "passed",
  "passed",
  "passed",
  "passed",
  "passed",
  "passed",
  "passed",
  "passed",
  "passed",
  "passed",
  "passed",
  "passed",
  "passed",
  "failed",
  "failed",
  "failed",
  "broken",
  "broken",
  "skipped"
];

export function buildGeneratedCases(existingCaseCount) {
  return scenarios
    .flatMap((scenario, scenarioIndex) =>
      profiles.map((profile, profileIndex) => {
        const ordinal = scenarioIndex * profiles.length + profileIndex + existingCaseCount + 1;
        const id = `${scenario.id}-${profile.id}`;
        const identifier = String(ordinal).padStart(3, "0");
        return {
          id,
          testCaseId: `SYN-GEN-${identifier}`,
          name: `Synthetic: ${scenario.name} — ${profile.name}`,
          fullName: `synthetic.${scenario.layer}.${scenario.component.replaceAll("-", "_")}.${scenario.id.replaceAll("-", "_")}.${profile.id.replaceAll("-", "_")}`,
          owner: scenario.owner,
          severity: scenario.severity,
          layer: scenario.layer,
          feature: scenario.feature,
          story: scenario.story,
          component: scenario.component,
          service: scenario.service,
          scenario: scenario.id,
          tms: `TMS-GEN-${identifier}`,
          testKey: `GEN-TC-${identifier}`,
          issue: `GEN-${1000 + ordinal}`,
          links: ["story", "tms", "spec"],
          tags: [scenario.layer, scenario.component, profile.id, "regression"],
          baseDuration: 900 + scenarioIndex * 180 + profileIndex * 145,
          statuses: Array.from(
            { length: 10 },
            (_, launchIndex) =>
              outcomePalette[(ordinal * 3 + launchIndex * 7) % outcomePalette.length]
          )
        };
      })
    )
    .slice(0, 100 - existingCaseCount);
}
