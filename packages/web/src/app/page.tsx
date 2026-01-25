"use client";

import { useRouter } from "next/navigation";
import { SidebarLayout, useSidebarContext } from "@/components/sidebar-layout";

export default function Home() {
  const router = useRouter();

  return (
    <SidebarLayout>
      <HomeContent onNewSession={() => router.push("/session/new")} />
    </SidebarLayout>
  );
}

function HomeContent({ onNewSession }: { onNewSession: () => void }) {
  const { isOpen, toggle } = useSidebarContext();

  return (
    <div className="h-full flex flex-col">
      {/* Header with toggle when sidebar is closed */}
      {!isOpen && (
        <header className="border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div className="px-4 py-3">
            <button
              onClick={toggle}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              title="Open sidebar"
            >
              <SidebarToggleIcon />
            </button>
          </div>
        </header>
      )}

      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-xl text-center">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Welcome to Open-Inspect
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Select a session from the sidebar or create a new one to get started.
          </p>
          <button
            onClick={onNewSession}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition"
          >
            <PlusIcon />
            New Session
          </button>
        </div>
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function SidebarToggleIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}
