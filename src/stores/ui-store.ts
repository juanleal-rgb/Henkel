import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ActiveUpload {
  jobId: string;
  fileName: string;
  status: "uploading" | "processing" | "complete" | "error";
  progress: {
    stage: string;
    current: number;
    total: number;
    message: string;
  };
  result?: {
    total: number;
    batches: { created: number };
  };
  error?: string;
  startedAt: Date;
}

interface UIState {
  // Theme
  theme: "dark" | "light";
  toggleTheme: () => void;

  // Sidebar
  sidebarExpanded: boolean;
  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;

  // User status (for director availability)
  userStatus: "available" | "busy" | "away";
  setUserStatus: (status: "available" | "busy" | "away") => void;

  // Active call (when a call is transferred to the director)
  activeCallId: string | null;
  setActiveCall: (callId: string | null) => void;

  // Modals
  activeModal: string | null;
  modalData: Record<string, unknown> | null;
  openModal: (modalId: string, data?: Record<string, unknown>) => void;
  closeModal: () => void;
  openUploadModal: () => void;

  // Notifications
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, "id" | "timestamp">) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // Active uploads
  activeUploads: ActiveUpload[];
  addActiveUpload: (upload: Omit<ActiveUpload, "startedAt">) => void;
  updateActiveUpload: (jobId: string, updates: Partial<ActiveUpload>) => void;
  removeActiveUpload: (jobId: string) => void;
  clearCompletedUploads: () => void;
}

interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message?: string;
  timestamp: Date;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Theme
      theme: "dark",
      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === "dark" ? "light" : "dark",
        })),

      // Sidebar
      sidebarExpanded: false,
      toggleSidebar: () => set((state) => ({ sidebarExpanded: !state.sidebarExpanded })),
      setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),

      // User status
      userStatus: "available",
      setUserStatus: (status) => set({ userStatus: status }),

      // Active call
      activeCallId: null,
      setActiveCall: (callId) => set({ activeCallId: callId }),

      // Modals
      activeModal: null,
      modalData: null,
      openModal: (modalId, data) => set({ activeModal: modalId, modalData: data ?? null }),
      closeModal: () => set({ activeModal: null, modalData: null }),
      openUploadModal: () => set({ activeModal: "upload-pos", modalData: null }),

      // Notifications
      notifications: [],
      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            ...state.notifications,
            {
              ...notification,
              id: crypto.randomUUID(),
              timestamp: new Date(),
            },
          ],
        })),
      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),
      clearNotifications: () => set({ notifications: [] }),

      // Active uploads
      activeUploads: [],
      addActiveUpload: (upload) =>
        set((state) => ({
          activeUploads: [...state.activeUploads, { ...upload, startedAt: new Date() }],
        })),
      updateActiveUpload: (jobId, updates) =>
        set((state) => ({
          activeUploads: state.activeUploads.map((u) =>
            u.jobId === jobId ? { ...u, ...updates } : u
          ),
        })),
      removeActiveUpload: (jobId) =>
        set((state) => ({
          activeUploads: state.activeUploads.filter((u) => u.jobId !== jobId),
        })),
      clearCompletedUploads: () =>
        set((state) => ({
          activeUploads: state.activeUploads.filter(
            (u) => u.status !== "complete" && u.status !== "error"
          ),
        })),
    }),
    {
      name: "henkel-ui-storage",
      // Only persist active uploads that are still processing
      partialize: (state) => ({
        activeUploads: state.activeUploads.filter(
          (u) => u.status === "uploading" || u.status === "processing"
        ),
      }),
    }
  )
);
