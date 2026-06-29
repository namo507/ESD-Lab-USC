import type { TourTrack } from "@/data/helpContent";

export const NANO_TOUR_EVENT = "nano:start-tour";

export interface NanoTourEventDetail {
  track: TourTrack;
}

export function startNanoTour(track: TourTrack): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<NanoTourEventDetail>(NANO_TOUR_EVENT, { detail: { track } }));
}
