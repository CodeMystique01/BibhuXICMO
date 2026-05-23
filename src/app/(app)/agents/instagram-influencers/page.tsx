/**
 * The sidebar label "Insta Influencers" historically pointed here
 * (a coming-soon stub). The real Instagram agent now lives at
 * `/agents/instagram`. Re-export so both URLs serve the live agent —
 * keeps every existing link, action item, and bookmark working.
 */
export {
  default,
  metadata,
  maxDuration,
} from "../instagram/page";
