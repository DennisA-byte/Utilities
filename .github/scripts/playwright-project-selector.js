const projects = [
  { project: "chromium", browser: "chromium" },
  { project: "chrome", browser: "chrome" },
  { project: "edge", browser: "msedge" },
  { project: "firefox", browser: "firefox" },
  { project: "webkit", browser: "webkit" },
];

const editPermissions = new Set(["admin", "write"]);
const protectedPaths = [
  /^\.github\/workflows\//,
  /^\.github\/scripts\//,
  /^src\//,
  /^tests\//,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^playwright\.config\./,
];

function isDocumentationPath(path) {
  return path === "README.md" || /^docs\/.+\.mdx?$/.test(path);
}

function permissionFromAssociation(association) {
  if (association === "OWNER") return "admin";
  if (association === "COLLABORATOR") return "write";
  return "unknown";
}

function isMajorDiff(files, changedLines) {
  return changedLines > 100 || files.some((file) => (
    file.status !== "modified"
    || protectedPaths.some((pattern) => pattern.test(file.path))
    || !isDocumentationPath(file.path)
  ));
}

function selectProjects({ eventName, dispatchBrowsers = {}, files = [], changedLines = 0, collaboratorPermission = "unknown" }) {
  if (eventName === "schedule") {
    return { projects, reason: "Weekly full-browser run" };
  }

  if (eventName === "workflow_dispatch") {
    const selected = projects.filter(({ project }) => dispatchBrowsers[project] === true);
    return selected.length
      ? { projects: selected, reason: "Selected in manual dispatch" }
      : { projects: [projects[0]], reason: "Chromium fallback: select at least one browser" };
  }

  const majorDiff = isMajorDiff(files, changedLines);
  if (eventName === "pull_request") {
    if (!majorDiff && editPermissions.has(collaboratorPermission)) {
      return { projects: [projects[0]], reason: "Small change from a repository owner or collaborator" };
    }
    return { projects, reason: majorDiff ? "Major or sensitive-path change" : "Contributor permission is not confirmed" };
  }

  if (eventName === "push") {
    return majorDiff
      ? { projects, reason: "Major or sensitive-path change" }
      : { projects: [projects[0]], reason: "Small change" };
  }

  return { projects: [projects[0]], reason: "Default Chromium smoke run" };
}

module.exports = { permissionFromAssociation, projects, selectProjects };
