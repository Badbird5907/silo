import type {
  UseStagedUploadOptions,
  UseStagedUploadResult,
  UseUploadOptions,
  UseUploadResult,
} from "./types";

export type ReactApiReferenceRouter = Record<
  string,
  {
    routeConfig?: unknown;
    onUploadComplete(args: unknown): {
      fileKeyId: string;
    };
  }
>;

export type ReactApiReferenceRouteSlug = keyof ReactApiReferenceRouter;

export type ReactUseUploadOptions = UseUploadOptions<
  ReactApiReferenceRouter,
  ReactApiReferenceRouteSlug
>;

export type ReactUseUploadResult = UseUploadResult<
  ReactApiReferenceRouter,
  ReactApiReferenceRouteSlug
>;

export type ReactUseStagedUploadOptions = UseStagedUploadOptions<
  ReactApiReferenceRouter,
  ReactApiReferenceRouteSlug
>;

export type ReactUseStagedUploadResult = UseStagedUploadResult<
  ReactApiReferenceRouter,
  ReactApiReferenceRouteSlug
>;
