/**
 * Video embed parsing (M5-507). Pure, zero-dependency so it is safe to import
 * from the build-time index, server components, and client components alike.
 *
 * Patrick adds a video by pasting a link (embed, never an upload). This module
 * turns that single pasted URL into an iframe `src` + the correct aspect ratio,
 * auto-detecting the provider — there is no provider dropdown in the Studio.
 *
 * Extends the `classifyEmbedSrc` logic from `scripts/migrations/import-blogs.ts`
 * (which only needed YouTube + Vimeo) to also cover YouTube Shorts, Instagram,
 * and Facebook.
 *
 * Reliability: YouTube/Shorts and Vimeo embed cleanly. Instagram and Facebook
 * are best-effort — their embeds depend on the post's privacy settings and their
 * own embed endpoints, which can fail. We still allow them; editors should set a
 * custom thumbnail for those and test each one.
 */

export type VideoProvider = 'youtube' | 'vimeo' | 'instagram' | 'facebook' | 'iframe';

/** `9:16` = vertical (Shorts / reels); `16:9` = standard landscape. */
export type VideoAspect = '16:9' | '9:16';

export interface VideoEmbed {
  provider: VideoProvider;
  /** Ready-to-use iframe `src`. */
  embedSrc: string;
  aspect: VideoAspect;
  /** Provider-native id when we could extract one (used for thumbnails). */
  videoId?: string;
}

interface YouTubeMatch {
  id: string;
  /** Shorts render vertical (9:16); everything else is 16:9. */
  isShort: boolean;
}

/**
 * Extract a YouTube video id from watch / youtu.be / embed / Shorts URLs.
 * Returns null for non-YouTube links. Ids stop at the first non-id character so
 * trailing query params (`?t=`, `?feature=`) are ignored.
 */
function matchYouTube(url: string): YouTubeMatch | null {
  const shorts = url.match(/youtube\.com\/shorts\/([\w-]+)/);
  if (shorts) return { id: shorts[1], isShort: true };

  const embed = url.match(/youtube\.com\/embed\/([\w-]+)/);
  if (embed) return { id: embed[1], isShort: false };

  if (/youtube\.com/.test(url)) {
    const watch = url.match(/[?&]v=([\w-]+)/);
    if (watch) return { id: watch[1], isShort: false };
  }

  const short = url.match(/youtu\.be\/([\w-]+)/);
  if (short) return { id: short[1], isShort: false };

  return null;
}

/** Numeric Vimeo id from `vimeo.com/<id>` or `player.vimeo.com/video/<id>`. */
function matchVimeo(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

interface InstagramMatch {
  /** `reel` or `p` (or `tv`) — preserved in the embed path. */
  kind: 'reel' | 'p' | 'tv';
  id: string;
}

/** Instagram reel/post/tv id. `/reels/` normalizes to `reel`. */
function matchInstagram(url: string): InstagramMatch | null {
  const m = url.match(/instagram\.com\/(reels?|p|tv)\/([\w-]+)/);
  if (!m) return null;
  const raw = m[1];
  const kind = raw === 'reels' || raw === 'reel' ? 'reel' : (raw as 'p' | 'tv');
  return { kind, id: m[2] };
}

function isFacebook(url: string): boolean {
  return /facebook\.com/.test(url) || /fb\.watch/.test(url);
}

/**
 * Parse a pasted video URL into an iframe source + aspect ratio. Unrecognized
 * links fall through to a best-effort raw iframe (`provider: 'iframe'`) so an
 * already-embed URL still works.
 */
export function parseVideoEmbed(url: string): VideoEmbed {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return { provider: 'iframe', embedSrc: '', aspect: '16:9' };

  const yt = matchYouTube(trimmed);
  if (yt) {
    return {
      provider: 'youtube',
      embedSrc: `https://www.youtube.com/embed/${yt.id}`,
      aspect: yt.isShort ? '9:16' : '16:9',
      videoId: yt.id,
    };
  }

  const vimeoId = matchVimeo(trimmed);
  if (vimeoId) {
    return {
      provider: 'vimeo',
      embedSrc: `https://player.vimeo.com/video/${vimeoId}`,
      aspect: '16:9',
      videoId: vimeoId,
    };
  }

  const ig = matchInstagram(trimmed);
  if (ig) {
    return {
      provider: 'instagram',
      embedSrc: `https://www.instagram.com/${ig.kind}/${ig.id}/embed`,
      // Reels are vertical; standard posts are usually square/portrait — 9:16
      // gives both enough room without cropping.
      aspect: '9:16',
      videoId: ig.id,
    };
  }

  if (isFacebook(trimmed)) {
    return {
      provider: 'facebook',
      embedSrc: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(
        trimmed,
      )}&show_text=false`,
      // Facebook reels are vertical; regular videos/watch links are landscape.
      aspect: /\/reel\//.test(trimmed) ? '9:16' : '16:9',
    };
  }

  // Unknown host — assume it is already an embeddable URL and iframe it as-is.
  return { provider: 'iframe', embedSrc: trimmed, aspect: '16:9' };
}

/**
 * Card/share thumbnail derived from the URL alone (no API). Only YouTube exposes
 * a reliable public thumbnail; everything else returns null and the caller falls
 * back to a custom thumbnail or a placeholder.
 */
export function videoThumbnailUrl(url: string): string | null {
  const yt = matchYouTube((url ?? '').trim());
  if (yt) return `https://img.youtube.com/vi/${yt.id}/hqdefault.jpg`;
  return null;
}
