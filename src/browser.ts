import type { GitHubItem } from './github.js';
import chalk from 'chalk';

export interface OpenResult {
  opened: number;
  capped: boolean;
  total: number;
}

const BATCH_SIZE = 10;
const AUTO_OPEN_THRESHOLD = 15;
const CAP_THRESHOLD = 50;
const CAP_LIMIT = 25;
const BATCH_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function openItems(
  items: GitHubItem[],
  opts: { openAll?: boolean; dryRun?: boolean } = {},
): Promise<OpenResult> {
  const total = items.length;

  if (total === 0) {
    return { opened: 0, capped: false, total: 0 };
  }

  let toOpen = items;
  let capped = false;

  if (!opts.openAll && total > CAP_THRESHOLD) {
    console.log(
      chalk.yellow(
        `Found ${total} items — opening the first ${CAP_LIMIT} (security + newest). Use --open-all to override.`,
      ),
    );
    toOpen = items.slice(0, CAP_LIMIT);
    capped = true;
  } else if (total > AUTO_OPEN_THRESHOLD) {
    console.log(chalk.blue(`Found ${total} items — opening all in batches of ${BATCH_SIZE}.`));
  }

  if (!opts.dryRun) {
    const openModule = await import('open');
    for (let i = 0; i < toOpen.length; i += BATCH_SIZE) {
      const batch = toOpen.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((item) => openModule.default(item.url)));
      if (i + BATCH_SIZE < toOpen.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }
  }

  return { opened: toOpen.length, capped, total };
}
