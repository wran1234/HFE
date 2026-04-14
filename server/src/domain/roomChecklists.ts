import { RoomType } from "./enums";

export const REQUIRED_ROOM_ORDER: RoomType[] = [
  "entryway",
  "living_room",
  "bedroom",
  "bathroom",
  "kitchen",
  "stairs",
  "exterior_entry",
];

export const ROOM_CHECKLISTS: Record<RoomType, string[]> = {
  entryway: [
    "door threshold visibility",
    "entry lighting",
    "mat or rug condition",
    "clear path through doorway",
  ],
  living_room: [
    "main walking path",
    "rugs and floor surfaces",
    "cord and clutter visibility",
    "lighting near seating path",
  ],
  bedroom: [
    "bedside path",
    "path to doorway",
    "night lighting",
    "floor clutter check",
  ],
  bathroom: [
    "floor visibility",
    "shower/tub area",
    "toilet area",
    "sink/vanity area",
    "threshold / entry lip",
    "lighting visibility",
  ],
  kitchen: [
    "main floor path",
    "sink area floor",
    "stove/working zone path",
    "lighting around counters",
  ],
  stairs: [
    "top landing",
    "step edge visibility",
    "handrail continuity",
    "bottom landing",
  ],
  exterior_entry: [
    "exterior steps",
    "outdoor handrail",
    "surface traction",
    "exterior lighting",
  ],
};
