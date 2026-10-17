/**
 * The morning email (AUTO-208, Part 8): one screen on what the blog engine
 * did overnight. PURE: a day's run documents in, subject / text / html out.
 * The route (app/api/cron/blog-digest/route.ts) reads and sends; this
 * builds. No imports beyond the run log's types.
 *
 * ONE SCREEN. Per post: the title (a link to the draft in the Studio, or to
 * the live post when it was published), the topic, the shape, the words,
 * the product rows, the picture source, and any note (a shortened title, a
 * picture that fell back, a field left empty). Per failure: the stage and
 * the sentence. A morning with nothing written says so, and says why when
 * it can (the automation is paused; or no run reached a slot, which means
 * the firings never arrived). The footer: both switches as read NOW (the
 * digest reads them live too), the day's spend, and the image counter.
 *
 * Patrick's words, not ours: "draft", "published", "picture", "product
 * rows". No stage names he has not met in the guide.
 */
import type { RunLogDocument } from './run-log';

export interface DigestSwitches {
  paused: boolean;
  publishMode: 'draft' | 'publish';
}

export interface DigestSweepLine {
  /** What the weekly sweep found: a sentence, already in Patrick's words. */
  sentence: string;
}

export interface DigestInput {
  /** UTC day the runs belong to, YYYY-MM-DD. */
  day: string;
  runs: readonly RunLogDocument[];
  switches: DigestSwitches;
  /** The generated-image counter for the day, when it could be read. */
  imageCap: { used: number; cap: number } | null;
  /** The weekly sweep's report, on its day; null otherwise. */
  sweep: DigestSweepLine | null;
  /** https origin of the site, for links. */
  siteUrl: string;
  /** The Studio base path, e.g. /admin3773752. */
  studioPath: string;
  /** How many slots the schedule has (the expected number of posts). */
  slots: number;
}

export interface DigestEmail {
  subject: string;
  text: string;
  html: string;
}

const SHAPE_WORDS: Record<string, string> = {
  list: 'a numbered list',
  guide: "a buyer's guide",
  question: 'a question answered',
  howto: 'a how-to',
  comparison: 'a comparison',
};

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function usd(n: number | undefined): string {
  return `USD ${(n ?? 0).toFixed(2)}`;
}

/** The link to a post: the live page when published, else the draft in the Studio. */
export function postLink(run: RunLogDocument, siteUrl: string, studioPath: string): string {
  const origin = siteUrl.replace(/\/+$/, '');
  if (run.status === 'published' && run.slug) return `${origin}/blog/${run.slug}`;
  if (run.documentId) return `${origin}${studioPath}/intent/edit/id=${encodeURIComponent(run.documentId)};type=blogPost`;
  return origin;
}

/** A friendly day: "Friday 17 October 2026". */
export function dayWords(day: string): string {
  const d = new Date(`${day}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** The verb for a finished run. */
function what(run: RunLogDocument): string {
  return run.status === 'published' ? 'Published' : 'Saved as a draft';
}

function slotWords(slot: string): string {
  if (slot === 'a') return 'the 10 pm slot';
  if (slot === 'b') return 'the 4 am slot';
  return `slot ${slot}`;
}

function pictureWords(run: RunLogDocument): string {
  switch (run.pictureSource) {
    case 'ai':
      return 'an AI picture made from its product photos';
    case 'library':
      return 'a picture from your header image library';
    case 'product':
      return "its first product's photo (a stand-in; you may want to replace it)";
    case 'none':
      return 'NO picture (upload one before publishing)';
    default:
      return 'picture unknown';
  }
}

/** Build the email. */
export function buildDigestEmail(input: DigestInput): DigestEmail {
  const finished = input.runs.filter((r) => r.status === 'written' || r.status === 'published');
  const failed = input.runs.filter((r) => r.status === 'failed');
  const stuck = input.runs.filter((r) => r.status === 'claimed' || r.status === 'running');
  const spend = input.runs.reduce((s, r) => s + (r.cost?.totalUsd ?? 0), 0);
  const published = finished.filter((r) => r.status === 'published').length;
  const drafts = finished.length - published;

  const headline =
    finished.length === 0
      ? 'Blog engine: nothing was written last night'
      : `Blog engine: ${finished.length} post${finished.length === 1 ? '' : 's'} ${published > 0 && drafts === 0 ? 'published' : published > 0 ? 'written (some published)' : 'drafted'} last night`;
  const subject = `${headline} (${dayWords(input.day)})`;

  const lines: string[] = [];
  const html: string[] = [];
  const add = (text: string, markup: string = esc(text)) => {
    lines.push(text);
    html.push(markup);
  };

  add(`${headline}.`, `<h2 style="margin:0 0 12px 0;color:#231F20;">${esc(headline)}.</h2>`);
  add(`${dayWords(input.day)}. The engine has ${input.slots} slots a night.`, `<p style="margin:0 0 16px 0;color:#666;">${esc(dayWords(input.day))}. The engine has ${input.slots} slots a night.</p>`);

  if (finished.length === 0 && failed.length === 0 && stuck.length === 0) {
    const why = input.switches.paused
      ? 'The automatic posts are PAUSED in Global Settings, so nothing ran. Switch "Pause the automatic blog posts" off to start them again.'
      : 'No run reached either slot. Vercel did not deliver the scheduled firings, or the site refused them. Ali: check the Vercel cron log for /api/cron/blog-automation.';
    add(why, `<p style="padding:12px 16px;background:#FFF4F4;border-left:4px solid #E11F1E;">${esc(why)}</p>`);
  }

  if (finished.length > 0) {
    html.push('<h3 style="margin:16px 0 8px 0;">Written</h3>');
    lines.push('', 'WRITTEN');
    for (const r of finished) {
      const link = postLink(r, input.siteUrl, input.studioPath);
      const rows = r.strips ? `${r.strips.rows} product row${r.strips.rows === 1 ? '' : 's'} (${r.strips.products} products)` : 'product rows unknown';
      const shape = SHAPE_WORDS[r.titleShape ?? ''] ?? r.titleShape ?? 'shape unknown';
      const topic = r.topic?.query ? `"${r.topic.query}"` : 'topic unknown';
      const head = `${what(r)}, ${slotWords(r.slot)}: ${r.title ?? '(no title)'}`;
      lines.push('', head, `   ${link}`, `   Topic ${topic}; ${shape}; ${r.words ?? '?'} words; ${rows}; picture: ${pictureWords(r)}.`);
      for (const n of r.notes ?? []) lines.push(`   Note: ${n}`);
      html.push(
        `<div style="margin:0 0 14px 0;padding:10px 12px;border:1px solid #E5E5E5;border-radius:6px;">`,
        `<div><strong>${esc(what(r))}, ${esc(slotWords(r.slot))}:</strong> <a href="${esc(link)}" style="color:#E11F1E;font-weight:bold;">${esc(r.title ?? '(no title)')}</a></div>`,
        `<div style="color:#444;margin-top:4px;">Topic ${esc(topic)}; ${esc(shape)}; ${r.words ?? '?'} words; ${esc(rows)}; picture: ${esc(pictureWords(r))}.</div>`,
        ...(r.notes ?? []).map((n) => `<div style="color:#8a6d00;margin-top:4px;">Note: ${esc(n)}</div>`),
        `</div>`,
      );
    }
  }

  if (failed.length > 0 || stuck.length > 0) {
    html.push('<h3 style="margin:16px 0 8px 0;color:#E11F1E;">Did not finish</h3>');
    lines.push('', 'DID NOT FINISH');
    for (const r of failed) {
      const stage =
        r.error?.stage === 'choose'
          ? 'choosing the topic'
          : r.error?.stage === 'generate'
            ? 'writing the post'
            : r.error?.stage === 'publish'
              ? 'publishing the post'
              : (r.error?.stage ?? r.stage);
      const left = r.draftId ? ` A complete draft was saved${r.title ? ` ("${r.title}")` : ''}; only the publish step failed.` : ' Nothing was saved.';
      const sentence = `${slotWords(r.slot)}, attempt ${r.attempts}: failed while ${stage}. ${r.error?.message ?? 'No message was recorded.'}${left}`;
      lines.push('', sentence);
      html.push(`<p style="padding:10px 12px;background:#FFF4F4;border-left:4px solid #E11F1E;margin:0 0 10px 0;">${esc(sentence)}</p>`);
    }
    for (const r of stuck) {
      const sentence = `${slotWords(r.slot)}: a run is marked ${r.status} and never finished. The next firing takes it over; if this repeats, Ali: check the Vercel log.`;
      lines.push('', sentence);
      html.push(`<p style="padding:10px 12px;background:#FFF4F4;border-left:4px solid #E11F1E;margin:0 0 10px 0;">${esc(sentence)}</p>`);
    }
  }

  if (input.sweep) {
    lines.push('', 'WEEKLY TIDY-UP', input.sweep.sentence);
    html.push('<h3 style="margin:16px 0 8px 0;">Weekly tidy-up</h3>', `<p>${esc(input.sweep.sentence)}</p>`);
  }

  const switchA = input.switches.paused ? 'PAUSED (nothing will be written until it is switched back on)' : 'running';
  const switchB = input.switches.publishMode === 'publish' ? 'publish straight away' : 'save as a draft for you to review';
  const cap = input.imageCap ? `${input.imageCap.used} of ${input.imageCap.cap} generated pictures used today` : 'the picture counter could not be read';
  const footer = [`Automatic posts: ${switchA}.`, `Each post: ${switchB}.`, `Spent last night: about ${usd(spend)} (estimated).`, `${cap}.`, 'Change either switch in the Studio under Global Settings > Blog Automation.'];
  lines.push('', ...footer);
  html.push(`<hr style="border:0;border-top:1px solid #E5E5E5;margin:18px 0;" /><p style="color:#666;font-size:13px;">${footer.map(esc).join('<br/>')}</p>`);

  return {
    subject,
    text: lines.join('\n'),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#231F20;max-width:640px;">${html.join('\n')}</div>`,
  };
}
