export interface CapacityPr {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  state: string;
  isDraft: boolean;
  author: string;
  authorIsBot: boolean;
  labels: string[];
  assignees: string[];
  files: string[];
  reviews: { author: string; state: string; submittedAt: string }[];
  comments: { author: string; createdAt: string }[];
  lastCommitAt: string | null;
  /** login → ISO time of the most recent assignment of that login */
  assignedAt: Record<string, string>;
}

export type SlotStatus =
  'waiting-on-you' | 'waiting-on-author' | 'talking-not-moving' | 'approved' | 'parked';

export function isActive(status: SlotStatus): boolean {
  return status !== 'parked';
}

const t = (s: string | null | undefined) => (s ? new Date(s).getTime() : 0);
const DAY = 86_400_000;

export function classifyInProgress(
  pr: CapacityPr,
  user: string,
  now: Date,
  staleDays: number,
): { status: SlotStatus; reason: string } {
  if (pr.isDraft) return { status: 'parked', reason: 'draft' };
  const me = user.toLowerCase();
  const author = pr.author.toLowerCase();
  const lc = (x: string) => x.toLowerCase();

  const myReviews = pr.reviews.filter((r) => lc(r.author) === me && r.submittedAt);
  const myTimes = [
    ...myReviews.map((r) => t(r.submittedAt)),
    ...pr.comments.filter((c) => lc(c.author) === me).map((c) => t(c.createdAt)),
  ];
  if (myTimes.length === 0) return { status: 'waiting-on-you', reason: 'not reviewed yet' };

  const lastMine = Math.max(...myTimes);
  const lastPush = t(pr.lastCommitAt);
  const authorTalk = [
    ...pr.comments.filter((c) => lc(c.author) === author).map((c) => t(c.createdAt)),
    ...pr.reviews.filter((r) => lc(r.author) === author).map((r) => t(r.submittedAt)),
  ].filter((x) => x > lastMine);
  const sinceMine = Math.floor((now.getTime() - lastMine) / DAY);

  const lastReview = [...myReviews].sort((a, b) => t(a.submittedAt) - t(b.submittedAt)).at(-1);
  if (
    lastReview?.state === 'APPROVED' &&
    t(lastReview.submittedAt) === lastMine &&
    lastPush <= lastMine
  ) {
    return { status: 'approved', reason: 'approved, awaiting merge' };
  }
  if (lastPush > lastMine) return { status: 'waiting-on-you', reason: 'author pushed' };
  if (authorTalk.length > 0) {
    return sinceMine >= staleDays
      ? {
          status: 'talking-not-moving',
          reason: `author commenting, no push in ${sinceMine}d`,
        }
      : { status: 'waiting-on-you', reason: 'author replied' };
  }
  return sinceMine >= staleDays
    ? { status: 'parked', reason: `author silent ${sinceMine}d` }
    : {
        status: 'waiting-on-author',
        reason: `${sinceMine}d since your feedback`,
      };
}
