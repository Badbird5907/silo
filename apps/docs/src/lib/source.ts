import { Nextjs } from '@/components/next-logo';
import { TanStack } from '@/components/tanstack-logo';
import { React as ReactIcon } from "@/components/react-logo";
import { docs } from 'collections/server';
import { loader } from 'fumadocs-core/source';
import { icons } from 'lucide-react';
import { createElement } from 'react';
import { GitHubIcon } from '@/components/github-icon';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  icon(icon) {
    if (!icon) return;
    if (icon === "Nextjs") return createElement(Nextjs)
    if (icon === "TanStack") return createElement(TanStack)
    if (icon === "React") return createElement(ReactIcon)
    if (icon === "Github") return createElement(GitHubIcon)
    if (icon in icons) return createElement(icons[icon as keyof typeof icons])
  }
});