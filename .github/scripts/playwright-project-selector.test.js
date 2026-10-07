const assert = require("node:assert/strict");
const test = require("node:test");
const { projects, selectProjects } = require("./playwright-project-selector");

const allProjectNames = projects.map(({ project }) => project);
const names = (result) => result.projects.map(({ project }) => project);

test("manual dispatch runs the selected browsers", () => {
  assert.deepEqual(names(selectProjects({
    eventName: "workflow_dispatch",
    dispatchBrowsers: { chromium: true, firefox: true },
  })), ["chromium", "firefox"]);
});

test("manual dispatch falls back to Chromium when no browser is selected", () => {
  assert.deepEqual(names(selectProjects({ eventName: "workflow_dispatch" })), ["chromium"]);
});

test("weekly scheduled runs include every browser", () => {
  assert.deepEqual(names(selectProjects({ eventName: "schedule" })), allProjectNames);
});

test("small existing documentation changes on push use Chromium", () => {
  for (const path of ["README.md", "docs/testing.md"]) {
    assert.deepEqual(names(selectProjects({
      eventName: "push",
      files: [{ path, status: "modified" }],
      changedLines: 12,
    })), ["chromium"]);
  }
});

test("large documentation changes on push use every browser", () => {
  assert.deepEqual(names(selectProjects({
    eventName: "push",
    files: [{ path: "README.md", status: "modified" }],
    changedLines: 101,
  })), allProjectNames);
});

test("new files, source changes, and test changes on push use every browser", () => {
  for (const file of [
    { path: "script.js", status: "modified" },
    { path: "src/new-feature.js", status: "added" },
    { path: "src/index.html", status: "modified" },
    { path: "tests/homepage.spec.js", status: "modified" },
  ]) {
    assert.deepEqual(names(selectProjects({ eventName: "push", files: [file], changedLines: 1 })), allProjectNames);
  }
});

test("minor pull requests use Chromium only for confirmed edit-level collaborators", () => {
  for (const permission of ["write", "maintain", "admin"]) {
    assert.deepEqual(names(selectProjects({
      eventName: "pull_request",
      files: [{ path: "README.md", status: "modified" }],
      changedLines: 12,
      collaboratorPermission: permission,
    })), ["chromium"]);
  }
});

test("pull requests from unconfirmed or lower-permission authors use every browser", () => {
  for (const permission of ["unknown", "none", "read", "triage"]) {
    assert.deepEqual(names(selectProjects({
      eventName: "pull_request",
      files: [{ path: "README.md", status: "modified" }],
      changedLines: 12,
      collaboratorPermission: permission,
    })), allProjectNames);
  }
});

test("major pull requests use every browser even from collaborators", () => {
  for (const files of [
    [{ path: "script.js", status: "modified" }],
    [{ path: "src/new-file.js", status: "added" }],
    [{ path: "src/index.html", status: "modified" }],
    [{ path: "tests/backups.spec.js", status: "modified" }],
  ]) {
    assert.deepEqual(names(selectProjects({
      eventName: "pull_request",
      files,
      changedLines: 5,
      collaboratorPermission: "write",
    })), allProjectNames);
  }
});

test("unknown and ordinary events run the Chromium smoke test", () => {
  assert.deepEqual(names(selectProjects({ eventName: "issues" })), ["chromium"]);
});
