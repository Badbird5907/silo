import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const version = process.argv[2];

if (!version) {
  throw new Error("Missing version argument. Usage: pnpm sdk:set-version <version>");
}

const semverPattern =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (!semverPattern.test(version)) {
  throw new Error(
    `Invalid version "${version}". Expected a semver value like 1.2.3 or 1.2.3-beta.1`,
  );
}

const rootDir = process.cwd();

const publishablePackages = [
  "@silo-storage/shared",
  "@silo-storage/mime-types",
  "@silo-storage/sdk-core",
  "@silo-storage/sdk-server",
  "@silo-storage/sdk-react",
  "@silo-storage/sdk-next",
  "@silo-storage/sdk-tanstack-start",
] as const;

const packagePaths = [
  "packages/shared/package.json",
  "packages/mime-types/package.json",
  "sdk/core/package.json",
  "sdk/server/package.json",
  "sdk/react/package.json",
  "sdk/next/package.json",
  "sdk/tanstack-start/package.json",
] as const;

type PublishablePackage = (typeof publishablePackages)[number];

type PackageJson = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [key: string]: unknown;
};

function updateDependencyMap(
  dependencies: Record<string, string> | undefined,
  nextVersion: string,
) {
  if (!dependencies) return;

  for (const packageName of publishablePackages) {
    if (dependencies[packageName]) {
      dependencies[packageName] = nextVersion;
    }
  }
}

for (const relativePath of packagePaths) {
  const absolutePath = join(rootDir, relativePath);
  const packageJson = JSON.parse(
    readFileSync(absolutePath, "utf8"),
  ) as PackageJson;

  if (
    !packageJson.name ||
    !publishablePackages.includes(packageJson.name as PublishablePackage)
  ) {
    throw new Error(`Unexpected package at ${relativePath}`);
  }

  packageJson.version = version;
  updateDependencyMap(packageJson.dependencies, version);
  updateDependencyMap(packageJson.devDependencies, version);
  updateDependencyMap(packageJson.peerDependencies, version);

  writeFileSync(absolutePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  console.log(`Updated ${packageJson.name} -> ${version}`);
}
