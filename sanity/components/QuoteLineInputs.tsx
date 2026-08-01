/**
 * Studio inputs for the four quote LINE types (Q-130 - the quote builder).
 *
 * Q-110 shipped the line data model, but building a real quote meant typing the
 * product name, the image, the description and every number by hand on every
 * line. These inputs fill in everything that can be known, and then get out of
 * the way.
 *
 *   - `QuoteGeigerLineInput`     - pick a SKU, and the name, image and
 *     description fill themselves in from the Geiger catalog. The catalog's
 *     price range and minimum quantity are shown as REFERENCE FIGURES beside
 *     the cost field, never written into it (Geiger publishes a range, never a
 *     real cost - Q-000), so unit cost and setup are always Patrick's entry.
 *   - `QuoteOwnProductLineInput` - reference one of Patrick's own Product
 *     Pages, then click "Pull details from this product" to copy its name,
 *     image, description, the unit cost for THIS line's quantity, and the setup
 *     charge for the chosen decoration method.
 *   - `QuoteSimpleLineInput`     - custom items and charge lines: nothing to
 *     look up, so this only adds the line total.
 *
 * Every one of them shows that line's own total, computed through the shared
 * `quoteLineTotal` so a line, the totals box, and the future customer page /
 * PDF can never disagree.
 *
 * TWO RULES THAT MUST NOT BE RELAXED
 *
 * 1. SNAPSHOT, NEVER A LIVE LOOKUP. Everything pulled is COPIED into the
 *    quote's own fields at the moment Patrick asks for it, and is frozen there.
 *    No surface re-reads a price from the referenced product at render time. A
 *    quote must show the same numbers next week even if the product is edited
 *    afterwards (proven by Q-111: "product setupCharge 100 -> 999, quote line
 *    unchanged"). The reads below exist to FILL fields, never to display a
 *    live price in place of a stored one.
 * 2. NEVER OVERWRITE WHAT PATRICK TYPED. Automatic fills touch blank fields
 *    only, and they re-check the field is STILL blank at the moment the network
 *    reply lands (a slow reply must not clobber something typed while it was in
 *    flight). Anything that would replace an existing value happens only behind
 *    an explicit button plus an inline confirm that names the fields.
 *
 * Studio-only: plain React + the `sanity` form API (no @sanity/ui), matching
 * ProductPicker / CategoryPicker / QuoteInputs. Every lib import is a pure,
 * dependency-free module - no fs, no `server-only`, and deliberately NOT the
 * multi-megabyte catalog file (that is what /api/products/resolve is for).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  set,
  useClient,
  type ObjectInputProps,
  type FormPatch,
} from 'sanity';
import { formatUsd, quoteLineTotal } from '../../lib/quotes/quote-totals';
import {
  buildGeigerLineGuidance,
  buildGeigerLinePrefill,
  buildOwnProductPrefill,
  isBlank,
  type GeigerLineGuidance,
  type GeigerResolvePayload,
  type OwnProductPrefill,
} from '../../lib/quotes/quote-prefill';
import { decorationLabel } from '../../lib/products/quote-estimate';
import { portableTextToPlain } from '../../lib/portable-text/to-plain';

const API_VERSION = '2024-10-01';

// ---------------------------------------------------------------------------
// Shared presentation
// ---------------------------------------------------------------------------
const panel: React.CSSProperties = {
  border: '1px solid var(--card-border-color, #ced2d9)',
  borderRadius: 4,
  padding: 10,
  marginBottom: 12,
  background: 'var(--card-bg-color, #fff)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const muted: React.CSSProperties = { fontSize: 12, color: 'var(--card-muted-fg-color, #6e7683)' };
const strongLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600 };
const errorText: React.CSSProperties = { fontSize: 12, color: '#b91c1c' };
const warnText: React.CSSProperties = { fontSize: 12, color: '#92400e' };
const okText: React.CSSProperties = { fontSize: 12, color: '#16a34a' };
const monoNum: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

function smallButton(disabled = false): React.CSSProperties {
  return {
    alignSelf: 'flex-start',
    font: 'inherit',
    fontSize: 12,
    padding: '4px 10px',
    cursor: disabled ? 'default' : 'pointer',
  };
}

/** The per-line total, through the same module the totals box uses. */
function LineTotalRow({ value }: { value: unknown }) {
  const total = quoteLineTotal(value);
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        borderTop: '1px solid var(--card-border-color, #e4e8ed)',
        marginTop: 12,
        paddingTop: 8,
      }}
    >
      <span style={strongLabel}>Line total</span>
      <span style={{ ...monoNum, fontWeight: 700, fontSize: 15 }}>{formatUsd(total)}</span>
    </div>
  );
}

/**
 * One field an auto-fill wants to write. `next` is the value to write; a plan
 * entry is dropped entirely when there is nothing knowable to write.
 */
interface FieldPlan {
  path: string;
  label: string;
  next: string | number;
}

function toPatches(plan: FieldPlan[]): FormPatch[] {
  return plan.map((f) => set(f.next, [f.path]));
}

/**
 * Split a plan into the fields that are safe to write automatically (still
 * blank) and the ones that already hold a value (never written without an
 * explicit confirm). `current` must be read at APPLY time, not at request time.
 */
function splitPlan(
  plan: FieldPlan[],
  current: Record<string, unknown>,
): { blank: FieldPlan[]; occupied: FieldPlan[] } {
  const blank: FieldPlan[] = [];
  const occupied: FieldPlan[] = [];
  for (const field of plan) {
    if (isBlank(current[field.path])) blank.push(field);
    else occupied.push(field);
  }
  return { blank, occupied };
}

/** The inline "this would replace X and Y" confirm. Never a silent overwrite. */
function ConfirmReplace({
  fields,
  onConfirm,
  onCancel,
}: {
  fields: FieldPlan[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ ...warnText, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span>
        This would replace what you already entered for{' '}
        <strong>{fields.map((f) => f.label).join(', ')}</strong>. Your quantity, shipping and notes
        are never touched.
      </span>
      <span style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onConfirm} style={smallButton()}>
          Replace
        </button>
        <button type="button" onClick={onCancel} style={smallButton()}>
          Keep what I entered
        </button>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom item + charge lines: nothing to look up, just the line total.
// ---------------------------------------------------------------------------
export function QuoteSimpleLineInput(props: ObjectInputProps) {
  return (
    <div>
      {props.renderDefault(props)}
      <LineTotalRow value={props.value} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Geiger catalog line
// ---------------------------------------------------------------------------
type GeigerState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'found'; payload: GeigerResolvePayload; guidance: GeigerLineGuidance }
  | { kind: 'missing'; sku: string }
  | { kind: 'error' };

export function QuoteGeigerLineInput(props: ObjectInputProps) {
  const { onChange } = props;
  const value = (props.value ?? {}) as Record<string, unknown>;
  const sku = typeof value.sku === 'string' ? value.sku.trim() : '';

  const [state, setState] = useState<GeigerState>({ kind: 'idle' });
  const [pending, setPending] = useState<FieldPlan[] | null>(null);
  const [filled, setFilled] = useState<string[]>([]);

  // The CURRENT line, read at apply time so a slow reply can never overwrite
  // something typed while it was in flight.
  const valueRef = useRef(value);
  valueRef.current = value;
  // The SKU whose auto-fill has already run, so re-renders do not refill (and
  // do not fight Patrick if he clears a field on purpose).
  const autoFilledFor = useRef<string | null>(null);
  // Held in a ref rather than listed as an effect dependency: the form
  // machinery is free to hand back a new `onChange` identity on any render,
  // and depending on it would restart the debounce and re-fetch on every
  // keystroke elsewhere in the line.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!sku) {
      setState({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products/resolve?sku=${encodeURIComponent(sku)}`);
        const payload = (await res.json()) as GeigerResolvePayload;
        if (cancelled) return;
        if (!payload.found) {
          setState({ kind: 'missing', sku });
          return;
        }
        setState({ kind: 'found', payload, guidance: buildGeigerLineGuidance(payload) });

        // Fill blanks only, and only once per SKU.
        if (autoFilledFor.current === sku) return;
        autoFilledFor.current = sku;
        const prefill = buildGeigerLinePrefill(payload);
        const plan: FieldPlan[] = [];
        if (prefill.displayName) {
          plan.push({ path: 'displayName', label: 'display name', next: prefill.displayName });
        }
        if (prefill.imageUrl) plan.push({ path: 'imageUrl', label: 'image', next: prefill.imageUrl });
        if (prefill.description) {
          plan.push({ path: 'description', label: 'description', next: prefill.description });
        }
        const { blank } = splitPlan(plan, valueRef.current);
        if (blank.length > 0) {
          onChangeRef.current(toPatches(blank));
          setFilled(blank.map((f) => f.label));
        } else {
          setFilled([]);
        }
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sku]);

  /** Deliberate refresh: re-copies the catalog's name, image and description. */
  const refresh = useCallback(() => {
    if (state.kind !== 'found') return;
    const prefill = buildGeigerLinePrefill(state.payload);
    const plan: FieldPlan[] = [];
    if (prefill.displayName) {
      plan.push({ path: 'displayName', label: 'display name', next: prefill.displayName });
    }
    if (prefill.imageUrl) plan.push({ path: 'imageUrl', label: 'image', next: prefill.imageUrl });
    if (prefill.description) {
      plan.push({ path: 'description', label: 'description', next: prefill.description });
    }
    const { blank, occupied } = splitPlan(plan, valueRef.current);
    if (blank.length > 0) onChange(toPatches(blank));
    if (occupied.length > 0) {
      setPending(occupied);
    } else {
      setPending(null);
      setFilled(blank.map((f) => f.label));
    }
  }, [state, onChange]);

  const confirmReplace = useCallback(() => {
    if (!pending) return;
    onChange(toPatches(pending));
    setFilled(pending.map((f) => f.label));
    setPending(null);
  }, [pending, onChange]);

  const guidance = state.kind === 'found' ? state.guidance : null;

  return (
    <div>
      <div style={panel}>
        <span style={strongLabel}>From the Geiger catalog</span>

        {state.kind === 'idle' && (
          <span style={muted}>
            Pick a product below and its name, image and description fill in automatically.
          </span>
        )}
        {state.kind === 'loading' && <span style={muted}>Looking this product up...</span>}
        {state.kind === 'missing' && (
          <span style={errorText}>
            No catalog product found for SKU &ldquo;{state.sku}&rdquo;. You can still fill this line
            in by hand.
          </span>
        )}
        {state.kind === 'error' && (
          <span style={errorText}>
            Could not reach the product catalog. You can still fill this line in by hand, or try the
            Refresh button. (If you are running the standalone Studio, open the Studio at the app
            URL instead.)
          </span>
        )}

        {guidance && (
          <>
            {filled.length > 0 && <span style={okText}>Filled in: {filled.join(', ')}.</span>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {guidance.brand && (
                <span style={muted}>
                  Brand: <strong>{guidance.brand}</strong>
                </span>
              )}
              {guidance.lowPrice !== null && (
                <span style={muted}>
                  Catalog price range:{' '}
                  <strong style={monoNum}>
                    {formatUsd(guidance.lowPrice)}
                    {guidance.highPrice !== null && guidance.highPrice !== guidance.lowPrice
                      ? ` to ${formatUsd(guidance.highPrice)}`
                      : ''}
                  </strong>
                </span>
              )}
              {guidance.minQty !== null && (
                <span style={muted}>
                  Catalog minimum quantity: <strong>{guidance.minQty}</strong>
                </span>
              )}
            </div>
            <span style={warnText}>
              Those figures are a guide only, to help you decide what to charge. Geiger publishes a
              price range, not a cost, so the unit cost and setup charge below are always yours to
              enter.
            </span>
            {pending ? (
              <ConfirmReplace
                fields={pending}
                onConfirm={confirmReplace}
                onCancel={() => setPending(null)}
              />
            ) : (
              <button type="button" onClick={refresh} style={smallButton()}>
                Refresh name, image and description
              </button>
            )}
          </>
        )}
      </div>

      {props.renderDefault(props)}
      <LineTotalRow value={props.value} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Own Product Page line
// ---------------------------------------------------------------------------
interface OwnProductDoc {
  _id: string;
  title?: string | null;
  imageUrl?: string | null;
  description?: unknown;
  minQty?: number;
  setupCharge?: number;
  pricingTiers?: { minQty?: number; price?: number }[];
  decorationMethods?: (string | { method?: string; upcharge?: number; setupCharge?: number })[];
}

const OWN_PRODUCT_QUERY = `*[_id in [$id, $draftId]]{
  _id,
  title,
  minQty,
  setupCharge,
  pricingTiers,
  decorationMethods,
  description,
  "imageUrl": coalesce(colorVariants[0].images[0].asset->url, defaultImages[0].asset->url)
}`;

type OwnState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; doc: OwnProductDoc; isDraftOnly: boolean }
  | { kind: 'missing' }
  | { kind: 'error' };

export function QuoteOwnProductLineInput(props: ObjectInputProps) {
  const { onChange } = props;
  const value = (props.value ?? {}) as Record<string, unknown>;
  const productRef =
    typeof (value.product as { _ref?: string } | undefined)?._ref === 'string'
      ? ((value.product as { _ref: string })._ref as string)
      : '';
  const quantity = value.quantity;
  const decorationMethod = typeof value.decorationMethod === 'string' ? value.decorationMethod : '';

  const client = useClient({ apiVersion: API_VERSION });
  const [state, setState] = useState<OwnState>({ kind: 'idle' });
  const [pending, setPending] = useState<FieldPlan[] | null>(null);
  const [filled, setFilled] = useState<string[]>([]);

  const valueRef = useRef(value);
  valueRef.current = value;
  // Kept in a ref for the same reason as the Geiger line: this effect calls
  // setState, so anything unstable in its dependency list would loop.
  const clientRef = useRef(client);
  clientRef.current = client;

  // Read-only load so the panel can show the tiers, the minimum and the
  // decoration methods. It WRITES NOTHING - only the button below writes.
  useEffect(() => {
    if (!productRef) {
      setState({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const published = productRef.replace(/^drafts\./, '');
        const rows = await clientRef.current.fetch<OwnProductDoc[]>(OWN_PRODUCT_QUERY, {
          id: published,
          draftId: `drafts.${published}`,
        });
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        // Prefer the PUBLISHED product: a quote is a commercial document, so it
        // should copy what is actually live, not an unpublished edit.
        const live = list.find((d) => d._id === published);
        const draft = list.find((d) => d._id !== published);
        const doc = live ?? draft;
        if (!doc) {
          setState({ kind: 'missing' });
          return;
        }
        setState({ kind: 'ready', doc, isDraftOnly: !live });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productRef]);

  const prefill: OwnProductPrefill | null = useMemo(() => {
    if (state.kind !== 'ready') return null;
    return buildOwnProductPrefill(
      {
        title: state.doc.title,
        imageUrl: state.doc.imageUrl,
        descriptionPlain: portableTextToPlain(state.doc.description),
        pricingTiers: state.doc.pricingTiers,
        minQty: state.doc.minQty,
        setupCharge: state.doc.setupCharge,
        decorationMethods: state.doc.decorationMethods,
      },
      { quantity, decorationMethod },
    );
  }, [state, quantity, decorationMethod]);

  const buildPlan = useCallback((p: OwnProductPrefill): FieldPlan[] => {
    const plan: FieldPlan[] = [];
    if (p.displayName) plan.push({ path: 'displayName', label: 'display name', next: p.displayName });
    if (p.imageUrl) plan.push({ path: 'imageUrl', label: 'image', next: p.imageUrl });
    if (p.description) plan.push({ path: 'description', label: 'description', next: p.description });
    if (p.unitCost !== null) plan.push({ path: 'unitCost', label: 'unit cost', next: p.unitCost });
    if (p.setupCharge !== null) {
      plan.push({ path: 'setupCharge', label: 'setup charge', next: p.setupCharge });
    }
    return plan;
  }, []);

  /** The explicit pull. Blanks fill straight away; anything already entered asks first. */
  const pull = useCallback(() => {
    if (!prefill) return;
    const { blank, occupied } = splitPlan(buildPlan(prefill), valueRef.current);
    if (blank.length > 0) onChange(toPatches(blank));
    if (occupied.length > 0) {
      setPending(occupied);
      setFilled(blank.map((f) => f.label));
    } else {
      setPending(null);
      setFilled(blank.map((f) => f.label));
    }
  }, [prefill, buildPlan, onChange]);

  const confirmReplace = useCallback(() => {
    if (!pending) return;
    onChange(toPatches(pending));
    setFilled((prev) => [...prev, ...pending.map((f) => f.label)]);
    setPending(null);
  }, [pending, onChange]);

  const chooseDecoration = useCallback(
    (method: string) => {
      onChange([set(method, ['decorationMethod'])]);
    },
    [onChange],
  );

  return (
    <div>
      <div style={panel}>
        <span style={strongLabel}>From this Product Page</span>

        {state.kind === 'idle' && (
          <span style={muted}>
            Choose one of your Product Pages below, then pull its details in here.
          </span>
        )}
        {state.kind === 'loading' && <span style={muted}>Loading this product...</span>}
        {state.kind === 'missing' && (
          <span style={errorText}>
            That product could not be loaded. It may have been deleted. You can still fill this line
            in by hand.
          </span>
        )}
        {state.kind === 'error' && (
          <span style={errorText}>
            Could not load this product right now. You can still fill this line in by hand, or try
            again in a moment.
          </span>
        )}

        {state.kind === 'ready' && prefill && (
          <>
            {state.isDraftOnly && (
              <span style={warnText}>
                This product has not been published yet, so these details come from the draft.
                Publish the product if you want the customer to be able to see it.
              </span>
            )}

            {prefill.decorations.length > 0 && !decorationMethod && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={muted}>
                  This product has decoration methods. Pick one and the right setup charge is used:
                </span>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {prefill.decorations.map((d) => (
                    <button
                      key={d.method}
                      type="button"
                      onClick={() => chooseDecoration(d.method)}
                      style={smallButton()}
                    >
                      {decorationLabel(d)}
                    </button>
                  ))}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {prefill.unitCost !== null && (
                <span style={muted}>
                  Unit cost for{' '}
                  <strong>{prefill.quantityUsed?.toLocaleString('en-US') ?? '?'}</strong>:{' '}
                  <strong style={monoNum}>{formatUsd(prefill.unitCost)}</strong>
                  {prefill.decorationUpcharge > 0 && prefill.tierPrice !== null ? (
                    <>
                      {' '}
                      ({formatUsd(prefill.tierPrice)} tier price plus{' '}
                      {formatUsd(prefill.decorationUpcharge)} decoration)
                    </>
                  ) : null}
                </span>
              )}
              {prefill.tierMinQty !== null && (
                <span style={muted}>
                  Priced from the <strong>{prefill.tierMinQty}+</strong> tier
                </span>
              )}
              {prefill.setupCharge !== null && (
                <span style={muted}>
                  Setup charge: <strong style={monoNum}>{formatUsd(prefill.setupCharge)}</strong>
                </span>
              )}
              {prefill.minQty !== null && (
                <span style={muted}>
                  Product minimum: <strong>{prefill.minQty}</strong>
                </span>
              )}
            </div>

            {prefill.warnings.map((w) => (
              <span key={w} style={warnText}>
                {w}
              </span>
            ))}

            {filled.length > 0 && <span style={okText}>Filled in: {filled.join(', ')}.</span>}

            {pending ? (
              <ConfirmReplace
                fields={pending}
                onConfirm={confirmReplace}
                onCancel={() => setPending(null)}
              />
            ) : (
              <button type="button" onClick={pull} style={smallButton()}>
                Pull details from this product
              </button>
            )}

            <span style={muted}>
              Pulled prices are copied onto this quote and frozen. Editing the product later never
              changes a quote you have already built.
            </span>
          </>
        )}
      </div>

      {props.renderDefault(props)}
      <LineTotalRow value={props.value} />
    </div>
  );
}
