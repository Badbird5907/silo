export interface SiloUploadErrorShape {
  code: string;
  message: string;
  cause?: unknown;
}

export class SiloUploadError extends Error implements SiloUploadErrorShape {
  code: string;
  cause?: unknown;

  constructor(input: SiloUploadErrorShape) {
    super(input.message);
    this.name = "SiloUploadError";
    this.code = input.code;
    this.cause = input.cause;
  }
}

export interface SiloProgressEvent {
  file: File;
  fileIndex: number;
  loaded: number;
  total: number;
  percent: number;
  aggregateLoaded: number;
  aggregateTotal: number;
  aggregatePercent: number;
}

export type UploadAccept =
  | string
  | (() => Promise<string> | string)
  | string[]
  | (() => Promise<string[]> | string[]);

export type AnyFileRouterLike = Record<
  string,
  {
    routeConfig?: unknown;
    onUploadComplete(args: unknown): unknown;
    readonly "~types"?: {
      input: unknown;
      output: unknown;
    };
  }
>;

export type RouteSlug<TRouter extends AnyFileRouterLike> = keyof TRouter &
  string;

export type RouteOutputBySlug<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> = Awaited<ReturnType<TRouter[TEndpoint]["onUploadComplete"]>>;

export type RouteInputBySlug<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> = TRouter[TEndpoint] extends {
  readonly "~types"?: {
    input: infer TInput;
  };
}
  ? TInput
  : unknown;

export interface UploadCompletion<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> {
  fileKeyId: string;
  routeSlug: TEndpoint;
  accessKey?: string;
  uploadUrl?: string;
  uploadMethod?: "resumable" | "put";
  result: RouteOutputBySlug<TRouter, TEndpoint>;
}

export interface UseUploadResult<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> {
  isIdle: boolean;
  isUploading: boolean;
  currentUploadingFile: File | null;
  progress: {
    aggregatePercent: number;
    aggregateLoaded: number;
    aggregateTotal: number;
    byFile: Record<string, number>;
  };
  error: SiloUploadError | null;
  result: UploadCompletion<TRouter, TEndpoint>[] | null;
  accept?: UploadAccept;
  uploadFiles: (
    files: File[],
    options?: UploadRequestOptions<TRouter, TEndpoint>,
  ) => Promise<UploadCompletion<TRouter, TEndpoint>[]>;
  uploadFile: (
    file: File,
    options?: UploadRequestOptions<TRouter, TEndpoint>,
  ) => Promise<UploadCompletion<TRouter, TEndpoint>>;
  beginUpload: (
    options?: OpenFilePickerOptions & UploadRequestOptions<TRouter, TEndpoint>,
  ) => Promise<UploadCompletion<TRouter, TEndpoint>[]>;
  abort: () => void;
  reset: () => void;
}

export interface UseUploadOptions<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> {
  endpoint: TEndpoint;
  accept?: UploadAccept;
  concurrency?: number;
  onUploadBegin?: (file: File, fileIndex: number) => void;
  onUploadProgress?: (event: SiloProgressEvent) => void;
  onComplete?: (result: UploadCompletion<TRouter, TEndpoint>[]) => void;
  onError?: (error: SiloUploadError) => void;
  onUploadAborted?: () => void;
  onFileDialogCancel?: () => void;
}

export interface OpenFilePickerOptions {
  multiple?: boolean;
  accept?: UploadAccept;
}

export interface UploadRequestOptions<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> {
  input?: RouteInputBySlug<TRouter, TEndpoint>;
  expiresIn?: number;
  protocol?: "http" | "https";
  uploadMethod?: "resumable" | "put";
  awaitTimeoutMs?: number;
  concurrency?: number;
}

export interface UseStagedUploadOptions<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
>
  extends
    UseUploadOptions<TRouter, TEndpoint>,
    UploadRequestOptions<TRouter, TEndpoint>,
    OpenFilePickerOptions {
  clearOnUploadComplete?: boolean;
}

export interface UseStagedUploadResult<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> {
  files: File[];
  isUploading: boolean;
  uploadProgress: number;
  error: SiloUploadError | null;
  result: UploadCompletion<TRouter, TEndpoint>[] | null;
  accept?: UploadAccept;
  openFilePicker: (options?: OpenFilePickerOptions) => Promise<File[]>;
  removeFile: (fileOrIndex: File | number) => void;
  clearFiles: () => void;
  upload: (
    options?: UploadRequestOptions<TRouter, TEndpoint>,
  ) => Promise<UploadCompletion<TRouter, TEndpoint>[]>;
  abort: () => void;
  reset: () => void;
}

export type RouterConfigLike = Record<string, unknown>;
