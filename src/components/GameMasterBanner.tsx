import { SHOW_GM_BANNER_HEADERS } from '../config/gameMasterUi';
import { GM_PLACEHOLDER_LOCATION } from '../utils/gmLocations';

const ACTS: Record<string, string> = {
  EXPOSITION: 'I', RISING_ACTION: 'II', CLIMAX: 'III', FALLING_ACTION: 'IV', RESOLUTION: 'V',
};

interface GameMasterBannerProps {
  location?: string;
  act?: string | null;
  chapter?: number | null;
  enabled?: boolean;
}

export default function GameMasterBanner({ location, act, chapter, enabled = SHOW_GM_BANNER_HEADERS }: GameMasterBannerProps) {
  if (!enabled) return null;
  const candidate = location?.trim();
  const place = candidate && candidate !== GM_PLACEHOLDER_LOCATION && !/^(unknown|unknown location|n\/a|none|null|undefined)$/i.test(candidate) ? candidate : undefined;
  const actLabel = act ? ACTS[act] : undefined;
  if (!place && !actLabel) return null;
  const chapterLabel = chapter != null && Number.isInteger(chapter) && chapter > 0 ? ` · Ch. ${chapter}` : '';

  return <section className="px-3 pt-2 shrink-0" aria-label="Adventure status">
    <div className="retro-status-strip retro-status-strip-floating mx-auto max-w-4xl">
      <dl className="flex flex-wrap items-end justify-between gap-4">
        {place && <div><dt className="text-[10px] uppercase tracking-[0.2em] text-brand-text-muted">Location</dt><dd className="text-lg font-light text-brand-text-primary">{place}</dd></div>}
        {actLabel && <div><dt className="text-[10px] uppercase tracking-[0.2em] text-brand-text-muted">Act</dt><dd className="text-lg font-light text-brand-text-primary">{actLabel}{chapterLabel}</dd></div>}
      </dl>
    </div>
  </section>;
}
