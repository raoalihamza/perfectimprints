/**
 * The Studio half of "a replaced generated header goes" (AUTO-207). The blog
 * buttons patch the draft in the browser, so the picture they take OFF the
 * post is removed from here too, through the one guarded rule in
 * lib/blog-automation/discard-header-image.ts: only a picture this module
 * generated, and only once NO document (drafts included: the client reads in
 * the raw perspective) references it. An image Patrick uploaded is never
 * touched, and a picture the published post still shows is kept.
 *
 * Fire and forget: the button's dialog never waits for it and never fails
 * because of it; what happened is a console line in the Studio.
 */
import { useMemo } from 'react';
import { useClient } from 'sanity';
import {
  discardGeneratedHeaderImage,
  discardReplacedHeaderImage,
  type AssetDiscardClient,
  type DiscardResult,
} from '../../lib/blog-automation/discard-header-image';

export interface HeaderAssetDiscard {
  /** A generated picture the button has just taken off the post: removed once the draft no longer points at it. */
  afterReplace: (assetRef: unknown) => void;
  /** A generated picture the button made and then did not use (the image changed during the wait): removed at once. */
  unused: (assetRef: unknown) => void;
}

function report(what: string, result: DiscardResult) {
  if (result.deleted === true) console.info(`[header image] removed the ${what} picture ${result.assetId}`);
  else if (result.reason !== 'not-an-asset') console.info(`[header image] kept the ${what} picture ${result.assetId} (${result.reason}${result.detail ? `: ${result.detail}` : ''})`);
}

export function useHeaderAssetDiscard(): HeaderAssetDiscard {
  const client = useClient({ apiVersion: '2024-10-01' });
  return useMemo(() => {
    const raw = client.withConfig({ perspective: 'raw', useCdn: false }) as unknown as AssetDiscardClient;
    return {
      afterReplace: (assetRef) => {
        void discardReplacedHeaderImage(raw, assetRef).then((r) => report('replaced', r));
      },
      unused: (assetRef) => {
        void discardGeneratedHeaderImage(raw, assetRef).then((r) => report('unused', r));
      },
    };
  }, [client]);
}
