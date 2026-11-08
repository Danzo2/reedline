import {
  defineToolcraft,
  imageExportModule,
  mediaSourceModule,
  timelineModule,
  videoExportModule,
} from "@/toolcraft/runtime";

import appDefaults from "./app-defaults.json" with { type: "json" };
import { appIdentity } from "./app-identity";
import { glassControlSections } from "./glass/glass-controls";

export const REEDED_GLASS_LOOP_SECONDS = 5;

export const appSchema = defineToolcraft({
  defaults: appDefaults,
  base: {
    canvas: {
      enabled: true,
      renderScale: true,
      sizing: { mode: "editable-output" },
      upload: true,
    },
    identity: appIdentity,
    panels: {
      controls: {
        sections: [...glassControlSections],
        title: "Reeded Glass",
      },
    },
    toolbar: {
      history: true,
      radar: true,
      theme: true,
      zoom: true,
    },
  },
  modules: [
    mediaSourceModule(),
    timelineModule({ defaultDurationSeconds: REEDED_GLASS_LOOP_SECONDS, mode: "playback" }),
    imageExportModule(),
    videoExportModule(),
  ],
});
