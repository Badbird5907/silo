export interface SiloRouteInputValidationIssue {
  message: string;
  path?: PropertyKey[];
}

export class SiloRouteInputValidationError extends Error {
  readonly code = "INVALID_ROUTE_INPUT";
  readonly routeSlug: string;
  readonly issues: SiloRouteInputValidationIssue[];

  constructor(input: {
    routeSlug: string;
    issues: SiloRouteInputValidationIssue[];
  }) {
    super(`Invalid input for route "${input.routeSlug}"`);
    this.name = "SiloRouteInputValidationError";
    this.routeSlug = input.routeSlug;
    this.issues = input.issues;
  }
}
