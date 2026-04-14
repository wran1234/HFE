import { Check } from "lucide-react";
import { RoomId, ROOM_NAMES } from "../lib/types";

interface RoomProgressBarProps {
  sequence: RoomId[];
  currentRoom: RoomId;
  completedRooms: RoomId[];
}

const ROOM_ICONS: Record<RoomId, string> = {
  entryway: "🚪",
  living_room: "🛋️",
  bedroom: "🛏️",
  bathroom: "🚿",
  kitchen: "🍳",
  stairs: "🪜",
  exterior_entry: "🌿",
};

export default function RoomProgressBar({
  sequence,
  currentRoom,
  completedRooms,
}: RoomProgressBarProps) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {sequence.map((roomId, index) => {
        const isCompleted = completedRooms.includes(roomId);
        const isCurrent = roomId === currentRoom;
        const isPending = !isCompleted && !isCurrent;

        return (
          <div key={roomId} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all ${
                  isCompleted
                    ? "bg-green-600 text-white"
                    : isCurrent
                    ? "bg-brand-600 text-white ring-2 ring-brand-400 ring-offset-2 ring-offset-slate-950"
                    : "bg-slate-800 text-slate-600"
                }`}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  ROOM_ICONS[roomId]
                )}
              </div>
              <span
                className={`text-[9px] font-medium max-w-[56px] text-center leading-tight ${
                  isCurrent
                    ? "text-brand-300"
                    : isCompleted
                    ? "text-green-500"
                    : "text-slate-600"
                }`}
              >
                {ROOM_NAMES[roomId].split(" ")[0]}
              </span>
            </div>

            {index < sequence.length - 1 && (
              <div
                className={`h-0.5 w-6 mx-1 mb-4 rounded-full transition-colors ${
                  isCompleted ? "bg-green-600" : "bg-slate-800"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
