import { describe, expect, it } from "vitest";

import { SiloRouteInputValidationError } from "./errors";

describe("SiloRouteInputValidationError", () => {
  it("captures routeSlug and issues, with a derived message", () => {
    const issues = [
      { message: "Required", path: ["name"] },
      { message: "Must be a number", path: ["age"] },
    ];
    const err = new SiloRouteInputValidationError({
      routeSlug: "createUser",
      issues,
    });

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SiloRouteInputValidationError");
    expect(err.code).toBe("INVALID_ROUTE_INPUT");
    expect(err.routeSlug).toBe("createUser");
    expect(err.issues).toBe(issues);
    expect(err.message).toBe('Invalid input for route "createUser"');
  });

  it("accepts an empty issues array", () => {
    const err = new SiloRouteInputValidationError({
      routeSlug: "x",
      issues: [],
    });
    expect(err.issues).toEqual([]);
  });
});
