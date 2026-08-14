import { hashPassword } from "./passwordHash.js";
import type { AppStore, UserRecord } from "./store.js";

type UserSeedStore = Pick<AppStore, "users">;

type DemoPasswordHashes = {
  admin: string;
  user: string;
};

let cachedDemoPasswordHashes: DemoPasswordHashes | undefined;

export function seedDefaultUsers(store: UserSeedStore): void {
  if (store.users.size > 0) {
    return;
  }
  if (process.env.NODE_ENV === "production") {
    seedBootstrapAdmin(store);
    return;
  }
  if (process.env.TESTHISTORY_SEED_DEMO_USERS === "false") {
    return;
  }

  const now = new Date().toISOString();
  const passwordHashes = getDemoPasswordHashes();
  const users: UserRecord[] = [
    {
      createdAt: now,
      email: "admin",
      id: "default-admin",
      name: "Admin",
      passwordHash: passwordHashes.admin,
      role: "admin",
      status: "active",
      updatedAt: now
    },
    {
      createdAt: now,
      email: "user",
      id: "default-user",
      name: "User",
      passwordHash: passwordHashes.user,
      role: "user",
      status: "active",
      updatedAt: now
    }
  ];

  for (const user of users) {
    store.users.set(user.id, user);
  }
}

function getDemoPasswordHashes(): DemoPasswordHashes {
  cachedDemoPasswordHashes ??= {
    admin: hashPassword("admin"),
    user: hashPassword("user")
  };
  return cachedDemoPasswordHashes;
}

function seedBootstrapAdmin(store: UserSeedStore): void {
  const email = process.env.TESTHISTORY_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.TESTHISTORY_BOOTSTRAP_ADMIN_PASSWORD;
  if (
    email === undefined ||
    email.length === 0 ||
    password === undefined ||
    password.length === 0
  ) {
    return;
  }
  if (password.length < 12) {
    throw new Error("TESTHISTORY_BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters");
  }

  const now = new Date().toISOString();
  store.users.set("bootstrap-admin", {
    createdAt: now,
    email,
    id: "bootstrap-admin",
    name: process.env.TESTHISTORY_BOOTSTRAP_ADMIN_NAME?.trim() || "Administrator",
    passwordHash: hashPassword(password),
    role: "admin",
    status: "active",
    updatedAt: now
  });
}
