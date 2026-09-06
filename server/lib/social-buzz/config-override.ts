// In-process overrides so an operator can halt posting or change the daily
// cap without a redeploy. Env vars still win as the default on restart.
// Shared between routes/social-buzz.ts (which sets these from the admin
// portal) and lib/social-buzz/poller.ts (which must actually obey them —
// poller.ts previously read process.env.SOCIAL_BUZZ_KILL_SWITCH directly,
// so toggling the admin kill switch never stopped the scheduled tick().

let _killSwitchOverride: boolean | null = null;
let _dailyCapOverride: number | null = null;

export function killSwitchActive(): boolean {
  if (_killSwitchOverride !== null) return _killSwitchOverride;
  return process.env.SOCIAL_BUZZ_KILL_SWITCH === "true";
}

export function setKillSwitch(enabled: boolean): void {
  _killSwitchOverride = enabled;
}

export function dailyCap(): number {
  if (_dailyCapOverride !== null) return _dailyCapOverride;
  return Number(process.env.SOCIAL_BUZZ_MAX_POSTS_PER_DAY) || 3;
}

export function setDailyCap(cap: number): void {
  _dailyCapOverride = cap;
}
