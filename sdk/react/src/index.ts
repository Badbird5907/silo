import * as React from "react";

import type {
  UploadButtonProps,
  UploadButtonWithExternalUploadProps,
  UploadButtonWithHookProps,
} from "./components/upload-button";
import type {
  UploadDropzoneProps,
  UploadDropzoneWithExternalUploadProps,
  UploadDropzoneWithHookProps,
} from "./components/upload-dropzone";
import type {
  AnyFileRouterLike,
  RouterConfigLike,
  RouteSlug,
  UseStagedUploadOptions,
  UseUploadOptions,
} from "./types";
import { UploadButton as UploadButtonImpl } from "./components/upload-button";
import { UploadDropzone as UploadDropzoneImpl } from "./components/upload-dropzone";
import { useStagedUploadInternal, useUploadInternal } from "./use-upload";

export type {
  AnyFileRouterLike,
  RouteInputBySlug,
  RouteOutputBySlug,
  RouteSlug,
  SiloProgressEvent,
  SiloUploadErrorShape,
  UploadAccept,
  UploadCompletion,
  UseStagedUploadOptions,
  UseStagedUploadResult,
  UseUploadOptions,
  UseUploadResult,
} from "./types";
export { SiloUploadError } from "./types";
export type {
  ReactApiReferenceRouteSlug,
  ReactApiReferenceRouter,
  ReactUseStagedUploadOptions,
  ReactUseStagedUploadResult,
  ReactUseUploadOptions,
  ReactUseUploadResult,
} from "./api-reference";

export interface CreateSiloReactOptions {
  endpoint: string;
  fetch?: typeof fetch;
  routerConfig?: RouterConfigLike;
}

type UploadButtonHookComponentProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> = Omit<UploadButtonWithHookProps<TRouter, TEndpoint>, "useUpload">;

type UploadButtonExternalComponentProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> = Omit<UploadButtonWithExternalUploadProps<TRouter, TEndpoint>, "useUpload">;

type UploadButtonComponentProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> =
  | UploadButtonHookComponentProps<TRouter, TEndpoint>
  | UploadButtonExternalComponentProps<TRouter, TEndpoint>;

type UploadDropzoneHookComponentProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> = Omit<UploadDropzoneWithHookProps<TRouter, TEndpoint>, "useUpload">;

type UploadDropzoneExternalComponentProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> = Omit<
  UploadDropzoneWithExternalUploadProps<TRouter, TEndpoint>,
  "useUpload"
>;

type UploadDropzoneComponentProps<
  TRouter extends AnyFileRouterLike,
  TEndpoint extends RouteSlug<TRouter>,
> =
  | UploadDropzoneHookComponentProps<TRouter, TEndpoint>
  | UploadDropzoneExternalComponentProps<TRouter, TEndpoint>;

export function createSiloReact<TRouter extends AnyFileRouterLike>(
  options: CreateSiloReactOptions,
) {
  const RouterConfigContext = React.createContext<RouterConfigLike | null>(
    options.routerConfig ?? null,
  );

  function SiloRouterConfigProvider(props: {
    routerConfig: RouterConfigLike;
    children: React.ReactNode;
  }) {
    return React.createElement(
      RouterConfigContext.Provider,
      { value: props.routerConfig },
      props.children,
    );
  }

  function useUpload<TEndpoint extends RouteSlug<TRouter>>(
    uploadOptions: UseUploadOptions<TRouter, TEndpoint>,
  ) {
    return useUploadInternal<TRouter, TEndpoint>(
      {
        endpointUrl: options.endpoint,
        fetchImpl: options.fetch ?? fetch,
        initialRouterConfig: options.routerConfig,
      },
      RouterConfigContext,
      uploadOptions,
    );
  }

  function useStagedUpload<TEndpoint extends RouteSlug<TRouter>>(
    uploadOptions: UseStagedUploadOptions<TRouter, TEndpoint>,
  ) {
    return useStagedUploadInternal<TRouter, TEndpoint>(
      {
        endpointUrl: options.endpoint,
        fetchImpl: options.fetch ?? fetch,
        initialRouterConfig: options.routerConfig,
      },
      RouterConfigContext,
      uploadOptions,
    );
  }

  function UploadButton<TEndpoint extends RouteSlug<TRouter>>(
    props: UploadButtonHookComponentProps<TRouter, TEndpoint>,
  ): React.ReactElement;
  function UploadButton<TEndpoint extends RouteSlug<TRouter>>(
    props: UploadButtonExternalComponentProps<TRouter, TEndpoint>,
  ): React.ReactElement;
  function UploadButton<TEndpoint extends RouteSlug<TRouter>>(
    props: UploadButtonComponentProps<TRouter, TEndpoint>,
  ): React.ReactElement {
    const component = UploadButtonImpl as React.JSXElementConstructor<
      UploadButtonProps<TRouter, TEndpoint>
    >;
    return React.createElement(component, {
      ...props,
      useUpload,
    } as UploadButtonProps<TRouter, TEndpoint>);
  }

  function UploadDropzone<TEndpoint extends RouteSlug<TRouter>>(
    props: UploadDropzoneHookComponentProps<TRouter, TEndpoint>,
  ): React.ReactElement;
  function UploadDropzone<TEndpoint extends RouteSlug<TRouter>>(
    props: UploadDropzoneExternalComponentProps<TRouter, TEndpoint>,
  ): React.ReactElement;
  function UploadDropzone<TEndpoint extends RouteSlug<TRouter>>(
    props: UploadDropzoneComponentProps<TRouter, TEndpoint>,
  ): React.ReactElement {
    const component = UploadDropzoneImpl as React.JSXElementConstructor<
      UploadDropzoneProps<TRouter, TEndpoint>
    >;
    return React.createElement(component, {
      ...props,
      useUpload,
    } as UploadDropzoneProps<TRouter, TEndpoint>);
  }

  return {
    useUpload,
    useStagedUpload,
    UploadButton,
    UploadDropzone,
    SiloRouterConfigProvider,
  };
}
