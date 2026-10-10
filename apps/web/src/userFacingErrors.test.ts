import { describe, expect, it } from "vitest";

import { PermissionDeniedHttpError } from "./apiPermissions.js";
import { UserFacingRequestError, readJsonForUi, toUserErrorMessage } from "./userFacingErrors.js";

describe("user-facing errors", () => {
  it("maps request failures without exposing HTTP status or endpoint details", () => {
    const message = toUserErrorMessage(
      new UserFacingRequestError("http", 500),
      "Не удалось сохранить изменения."
    );

    expect(message).toBe("Сервис временно недоступен. Попробуйте позже.");
    expect(message).not.toMatch(/500|\/api\/|Exception/);
  });

  it("never displays unexpected exception messages", () => {
    expect(
      toUserErrorMessage(
        new Error("TypeError: /api/v1/auth/login returned 401"),
        "Не удалось выполнить вход. Попробуйте ещё раз."
      )
    ).toBe("Не удалось выполнить вход. Попробуйте ещё раз.");
  });

  it("does not trust permission text supplied by a server response", () => {
    const error = new PermissionDeniedHttpError({
      error: "permission_denied",
      message: "InternalException at /api/v1/projects/example returned 403",
      reason: "permission_denied"
    });

    expect(toUserErrorMessage(error, "Не удалось загрузить данные.")).toBe("Доступ закрыт");
    expect(error.message).toBe("Доступ закрыт");
  });

  it("preserves cancellation while reading a response", async () => {
    const cancelled = new DOMException("The operation was aborted", "AbortError");
    const response = { json: () => Promise.reject(cancelled) } as Response;

    await expect(readJsonForUi(response)).rejects.toBe(cancelled);
  });
});
