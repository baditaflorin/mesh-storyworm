import { expect, test } from "@playwright/test";
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
    await a.waitForTimeout(900);

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
