'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Shared selection state for the /products/<slug> configurator (P2-CP
 * configurator): ONE source of truth for { colorName, size, decoration,
 * quantity } consumed by BOTH the gallery (left column — swatch clicks) and the
 * purchase panel (right column — selectors + live estimate), so choosing a
 * color anywhere updates the gallery images AND is captured for the quote.
 *
 * STATIC-RENDER CONTRACT: the provider's initial state is derived
 * deterministically from props (first option of each list, the minimum
 * quantity) — no URL/window/random reads — so the server prerender and the
 * first client render are identical, and everything rendered inside the
 * provider (including SERVER children passed through as `children`) stays in
 * the prerendered HTML.
 */

export interface ProductSelection {
  colorName: string | null;
  size: string | null;
  decoration: string | null;
  quantity: number;
}

interface ProductSelectionContextValue extends ProductSelection {
  setColorName: (colorName: string | null) => void;
  setSize: (size: string | null) => void;
  setDecoration: (decoration: string | null) => void;
  setQuantity: (quantity: number) => void;
}

const ProductSelectionContext = createContext<ProductSelectionContextValue | null>(null);

interface ProductSelectionProviderProps {
  /** Color names in gallery order ('' entries are ignored). */
  colors: string[];
  sizes: string[];
  decorations: string[];
  /** Default quantity — the lowest pricing tier's minQty (or 1). */
  initialQuantity: number;
  children: ReactNode;
}

export function ProductSelectionProvider({
  colors,
  sizes,
  decorations,
  initialQuantity,
  children,
}: ProductSelectionProviderProps) {
  // Defaults: first option of every multi-option property (Geiger-style).
  const [colorName, setColorName] = useState<string | null>(
    colors.find((c) => c.trim()) ?? null,
  );
  const [size, setSize] = useState<string | null>(sizes.find((s) => s.trim()) ?? null);
  const [decoration, setDecoration] = useState<string | null>(
    decorations.find((d) => d.trim()) ?? null,
  );
  const [quantity, setQuantity] = useState<number>(initialQuantity);

  const value = useMemo(
    () => ({
      colorName,
      size,
      decoration,
      quantity,
      setColorName,
      setSize,
      setDecoration,
      setQuantity,
    }),
    [colorName, size, decoration, quantity],
  );

  return (
    <ProductSelectionContext.Provider value={value}>{children}</ProductSelectionContext.Provider>
  );
}

/** Throws outside the provider — every consumer lives on the product page. */
export function useProductSelection(): ProductSelectionContextValue {
  const ctx = useContext(ProductSelectionContext);
  if (!ctx) {
    throw new Error('useProductSelection must be used inside <ProductSelectionProvider>.');
  }
  return ctx;
}
