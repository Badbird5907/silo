export function getOrganizationBySlugInput(orgSlug?: string) {
  return { slug: orgSlug ?? "" };
}

export function isOrganizationBySlugEnabled(orgSlug?: string) {
  return !!orgSlug;
}

export function getOrganizationBySlugQueryOptions<TQueryOptions>(
  getBySlugQueryOptions: (
    input: ReturnType<typeof getOrganizationBySlugInput>,
    options: { enabled: boolean },
  ) => TQueryOptions,
  orgSlug?: string,
) {
  return getBySlugQueryOptions(getOrganizationBySlugInput(orgSlug), {
    enabled: isOrganizationBySlugEnabled(orgSlug),
  });
}
