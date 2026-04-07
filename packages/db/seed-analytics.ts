
import { db } from "./src/client";
import {
  usageDaily,
  usageEvents,
} from "./src/schema";

async function seed() {
  console.log("Fetching projects and environments...");

  const allProjects = await db.query.projects.findMany({
    with: {
      environments: true,
    },
  });

  if (allProjects.length === 0) {
    console.log("No projects found. Please create a project first.");
    process.exit(1);
  }

  console.log(`Found ${allProjects.length} project(s)`);

  const now = new Date();
  const days = 7;

  for (const project of allProjects) {
    if (!project.parentOrganizationId) {
      console.log(`Skipping project ${project.name} - no organization`);
      continue;
    }

    const environments = project.environments;
    if (environments.length === 0) {
      console.log(`Skipping project ${project.name} - no environments`);
      continue;
    }

    console.log(
      `Seeding data for project: ${project.name} (${environments.length} environments)`,
    );

    for (const env of environments) {
      console.log(`  Environment: ${env.name}`);
      let storageBytes = Math.floor(
        Math.random() * 5_000_000_000 + 100_000_000,
      );

      for (let daysAgo = days; daysAgo >= 0; daysAgo--) {
        const date = new Date(now);
        date.setDate(date.getDate() - daysAgo);
        date.setHours(0, 0, 0, 0);
        const dateStr = date.toISOString().split("T")[0]!;

        // Generate random stats with some variation
        // More activity on weekdays, less on weekends
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const activityMultiplier = isWeekend ? 0.3 : 1;

        const uploadsStarted = Math.floor(
          Math.random() * 50 * activityMultiplier + 10,
        );
        const uploadsFailed = Math.floor(
          Math.random() * 3 * activityMultiplier,
        );
        const uploadsCompleted = uploadsStarted - uploadsFailed;
        const downloads = Math.floor(
          Math.random() * 200 * activityMultiplier + 20,
        );

        // Random file sizes between 100KB and 50MB
        const avgUploadSize = Math.floor(Math.random() * 50_000_000 + 100_000);
        const avgDownloadSize = Math.floor(
          Math.random() * 20_000_000 + 100_000,
        );

        const bytesUploaded = uploadsCompleted * avgUploadSize;
        const bytesDownloaded = downloads * avgDownloadSize;
        const bytesDeleted = Math.floor(
          Math.random() * Math.min(storageBytes, bytesUploaded * 0.35 + 50_000_000),
        );
        storageBytes = Math.max(0, storageBytes + bytesUploaded - bytesDeleted);

        // Insert daily aggregate
        await db
          .insert(usageDaily)
          .values({
            organizationId: project.parentOrganizationId,
            projectId: project.id,
            environmentId: env.id,
            date: dateStr,
            uploadsStarted,
            uploadsCompleted,
            uploadsFailed,
            downloads,
            bytesUploaded,
            bytesDownloaded,
            storageBytes,
          })
          .onConflictDoNothing();

        // Insert some individual events for recent days (last 2 days only to avoid too much data)
        if (daysAgo <= 2) {
          const eventTypes = [
            ...Array(uploadsCompleted).fill("upload_completed"),
            ...Array(uploadsFailed).fill("upload_failed"),
            ...Array(Math.min(downloads, 20)).fill("download"),
          ] as const;

          for (const eventType of eventTypes) {
            const eventTime = new Date(date);
            eventTime.setHours(
              Math.floor(Math.random() * 24),
              Math.floor(Math.random() * 60),
              Math.floor(Math.random() * 60),
            );

            const bytes =
              eventType === "upload_completed"
                ? Math.floor(Math.random() * 50_000_000 + 100_000)
                : eventType === "download"
                  ? Math.floor(Math.random() * 20_000_000 + 100_000)
                  : null;

            await db.insert(usageEvents).values({
              organizationId: project.parentOrganizationId,
              projectId: project.id,
              environmentId: env.id,
              eventType,
              bytes,
              createdAt: eventTime,
            });
          }
        }

        console.log(
          `    ${dateStr}: ${uploadsCompleted} uploads, ${downloads} downloads`,
        );
      }
    }
  }

  console.log("\nDone seeding analytics data!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error seeding data:", err);
    process.exit(1);
  });
