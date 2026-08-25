import { expect, test, type Page } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("current author's sentence syncs to other peer", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await expect(a.locator(".story-status")).toContainText("2 writers", { timeout: 15_000 });
    await expect(b.locator(".story-status")).toContainText("2 writers", { timeout: 15_000 });

    const aIsMine =
      (await a.locator(".story-banner.is-me, .story-author-banner.is-me").count()) > 0;
    const author = aIsMine ? a : b;
    const other = aIsMine ? b : a;

    await author.locator(".story-input").fill("Once upon a peer.");
    await author.getByRole("button", { name: "send line", exact: true }).click();
    await expect(other.locator(".story-text")).toContainText("Once upon a peer.");
  } finally {
    await cleanup();
  }
});

async function authorSnapshot(p: Page): Promise<{ slot: string | null; author: string | null }> {
  return p.locator(".story-screen").evaluate((screen) => ({
    slot: screen.getAttribute("data-slot"),
    author: screen.getAttribute("data-author-peer"),
  }));
}

test("exactly one author per slot agreed on BOTH screens, sentence propagates both ways, and authorship ROTATES freshly", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(45_000);
  // 1s slots (the clamp floor) so ~16 slots fit inside the test budget. 16 slots
  // is wider than the old sticky run (one peer authored for ~10 consecutive
  // slots), so the transition count below cleanly separates buggy from fixed.
  const { a, b, cleanup } = await openTwoPeers(browser, (baseURL ?? "") + "?slot=1000", {
    storagePrefix,
  });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await expect(a.locator(".story-status")).toContainText("2 writers", { timeout: 15_000 });
    await expect(b.locator(".story-status")).toContainText("2 writers", { timeout: 15_000 });

    // --- Sentence propagation: whoever is the author right now writes a line;
    // it must appear in the SHARED story on the OTHER screen. ---
    const aIsAuthor = (await a.locator(".story-author-banner.is-me").count()) > 0;
    const author = aIsAuthor ? a : b;
    const other = aIsAuthor ? b : a;
    const sentence = "Once upon a mesh.";
    await author.locator(".story-input").fill(sentence);
    await author.getByRole("button", { name: "send line", exact: true }).click();
    await expect(other.locator(".story-text")).toContainText(sentence);
    // ...and it stays a single SHARED log — both screens render the same line.
    await expect(author.locator(".story-text")).toContainText(sentence);

    // --- Authorship: exactly one author per slot, agreed across screens, and
    // it rotates. The author is keyed on the CRDT peerId (collision-proof,
    // unlike the display name). ---
    const SLOTS = 16;
    const authorBySlot: string[] = [];
    let agreedSamples = 0;
    let lastSlot: string | null = null;
    const deadline = Date.now() + 30_000;
    while (authorBySlot.length < SLOTS && Date.now() < deadline) {
      const [aSnapshot, bSnapshot] = await Promise.all([authorSnapshot(a), authorSnapshot(b)]);
      const { slot: sa, author: fa } = aSnapshot;
      const { slot: sb, author: fb } = bSnapshot;
      // Load-bearing assertion #1: WHEN both screens are on the same slot
      // ordinal, they MUST show the SAME single author — the author is a pure
      // function of (mesh slot, roster, shuffle seed), all shared, so it can
      // never differ per peer. (We skip the sub-second boundary window where the
      // two independent countdown timers briefly read different slots; that's
      // render lag, not a determinism break.)
      if (sa != null && sa === sb && fa) {
        expect(fb).toBe(fa);
        agreedSamples++;
        if (sa !== lastSlot) {
          authorBySlot.push(fa);
          lastSlot = sa;
        }
      }
      await a.waitForTimeout(200);
    }

    expect(agreedSamples).toBeGreaterThan(0);
    expect(authorBySlot.length).toBeGreaterThanOrEqual(SLOTS);

    // Load-bearing assertion #2: authorship is genuinely FAIR + FRESH. Both
    // peers must each author at least once across the window...
    const distinct = new Set(authorBySlot);
    expect(distinct.size).toBeGreaterThanOrEqual(2);

    // ...and it must change frequently — NOT the sticky ~10-slot run the default
    // reshuffleEvery:1 produced (one peer authors for ~10 consecutive slots → at
    // most ~2 transitions across these 16 slots). With the per-pass reshuffle a
    // 2-peer rotation transitions on most slot boundaries (~10 across 16 slots),
    // so a ≥5 floor cleanly rejects the bug.
    let transitions = 0;
    for (let i = 1; i < authorBySlot.length; i++) {
      if (authorBySlot[i] !== authorBySlot[i - 1]) transitions++;
    }
    expect(transitions).toBeGreaterThanOrEqual(5);
  } finally {
    await cleanup();
  }
});
