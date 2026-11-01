"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Check, AlertTriangle, X } from "lucide-react";
import {
  EMPTY_WORKSPACE,
  loadWorkspace,
  saveWorkspace,
} from "@web/lib/storage.mjs";

const Context = createContext(null);
export function WorkspaceProvider({ children }) {
  const [workspace, setWorkspace] = useState(EMPTY_WORKSPACE);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState(null);
  const [storageError, setStorageError] = useState(null);
  useEffect(() => {
    setWorkspace(loadWorkspace(localStorage));
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    setStorageError(saveWorkspace(localStorage, workspace));
  }, [workspace, ready]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const notify = useCallback(
    (message, error = false) => setToast({ message, error }),
    [],
  );
  const saveCircuit = useCallback((doc) => {
    setWorkspace((w) => ({
      ...w,
      circuits: [doc, ...w.circuits.filter((c) => c.id !== doc.id)].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
    }));
  }, []);
  const deleteCircuit = useCallback(
    (id) =>
      setWorkspace((w) => ({
        ...w,
        circuits: w.circuits.filter((c) => c.id !== id),
      })),
    [],
  );
  const completeLesson = useCallback(
    (id) =>
      setWorkspace((w) => ({
        ...w,
        completed: [...new Set([...w.completed, id])],
      })),
    [],
  );
  const saveQuiz = useCallback(
    (unit, score) =>
      setWorkspace((w) => ({
        ...w,
        quizzes: {
          ...w.quizzes,
          [unit]: Math.max(w.quizzes[unit] ?? 0, score),
        },
      })),
    [],
  );
  const toggleBookmark = useCallback(
    (id) =>
      setWorkspace((w) => ({
        ...w,
        bookmarks: w.bookmarks.includes(id)
          ? w.bookmarks.filter((b) => b !== id)
          : [...w.bookmarks, id],
      })),
    [],
  );
  const updateLearning = useCallback(
    (id, patch) =>
      setWorkspace((w) => ({
        ...w,
        learning: {
          ...w.learning,
          [id]: { ...(w.learning[id] ?? {}), ...patch },
        },
      })),
    [],
  );
  return (
    <Context.Provider
      value={{
        ...workspace,
        ready,
        storageError,
        saveCircuit,
        deleteCircuit,
        completeLesson,
        saveQuiz,
        toggleBookmark,
        updateLearning,
        notify,
      }}
    >
      {children}
      {storageError && (
        <div className="storage-warning" role="alert">
          <AlertTriangle size={17} />
          {storageError}
        </div>
      )}
      {toast && (
        <div className={`toast ${toast.error ? "error" : ""}`} role="status">
          {toast.error ? <AlertTriangle size={18} /> : <Check size={18} />}
          <span>{toast.message}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export const useWorkspace = () => useContext(Context);
