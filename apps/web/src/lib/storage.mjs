export const STORAGE_KEY = "bench.web.workspace.v1";
export const EMPTY_WORKSPACE = {
  circuits: [],
  completed: [],
  quizzes: {},
  bookmarks: [],
  learning: {},
};

export function loadWorkspace(storage) {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY));
    if (!value || !Array.isArray(value.circuits)) return { ...EMPTY_WORKSPACE };
    return {
      circuits: value.circuits.filter(
        (d) =>
          d?.schema === 1 && Array.isArray(d.parts) && Array.isArray(d.wires),
      ),
      completed: Array.isArray(value.completed)
        ? value.completed.filter((id) => typeof id === "string")
        : [],
      quizzes:
        value.quizzes && typeof value.quizzes === "object" ? value.quizzes : {},
      bookmarks: Array.isArray(value.bookmarks)
        ? value.bookmarks.filter((id) => typeof id === "string")
        : [],
      learning:
        value.learning &&
        typeof value.learning === "object" &&
        !Array.isArray(value.learning)
          ? value.learning
          : {},
    };
  } catch {
    return { ...EMPTY_WORKSPACE };
  }
}

export function saveWorkspace(storage, workspace) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    return null;
  } catch {
    return "Your browser could not save this workspace. Export your circuit to keep a copy.";
  }
}

export function downloadFile(name, contents, type = "application/json") {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
