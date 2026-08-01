import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({
    base: './src/content/blog',
    pattern: '**/*.{md,mdx}',
  }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().min(1).max(240),
        publishedAt: z.coerce.date(),
        updatedAt: z.coerce.date().optional(),
        topics: z
          .array(z.string().trim().min(1).max(40))
          .min(1)
          .transform((topics) => [
            ...new Map(
              topics.map((topic) => [topic.toLocaleLowerCase(), topic]),
            ).values(),
          ]),
        cover: image().optional(),
        coverAlt: z.string().trim().min(1).max(180).optional(),
        canonical: z.url().optional(),
      })
      .strict()
      .refine((data) => !data.cover || Boolean(data.coverAlt), {
        message: 'coverAlt is required when cover is set',
        path: ['coverAlt'],
      })
      .refine((data) => !data.updatedAt || data.updatedAt >= data.publishedAt, {
        message: 'updatedAt cannot be earlier than publishedAt',
        path: ['updatedAt'],
      }),
});

export const collections = { blog };
