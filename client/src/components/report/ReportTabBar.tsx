import { Star } from "lucide-react";

export type TabId =
  | "overview"
  | "dashboard"
  | "rooms"
  | "shopping"
  | "contractor"
  | "action"
  | "services"
  | "care"
  | "prevention"
  | "premium";

interface ReportTabBarProps {
  tabs: { id: TabId; label: string }[];
  activeTab: TabId;
  onChange: (id: TabId) => void;
}

export default function ReportTabBar({ tabs, activeTab, onChange }: ReportTabBarProps) {
  return (
    <div className="flex gap-1 bg-warm-100 p-1 rounded-xl border border-warm-200 mb-6 overflow-x-auto no-print scrollbar-none">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`shrink-0 py-2 px-3 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
            activeTab === tab.id
              ? "bg-white text-warm-900 shadow"
              : "text-warm-500 hover:text-warm-700"
          }`}
        >
          {tab.label}
          {tab.id === "premium" && (
            <Star className="w-2.5 h-2.5 inline ml-1 text-amber-500" />
          )}
        </button>
      ))}
    </div>
  );
}
