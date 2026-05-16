// TODO: Typed query results — expanded as GROQ queries are added in /lib/sanity/queries/.

export interface SanityImage {
  _type: 'image';
  asset: { _ref: string; _type: 'reference' };
  alt?: string;
}

export interface SanitySlug {
  _type: 'slug';
  current: string;
}

export interface SanityRef {
  _ref: string;
  _type: 'reference';
}

export interface SeoFields {
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: SanityImage;
}

export interface LinkObject {
  label: string;
  href: string;
  external?: boolean;
}

export interface FooterColumn {
  heading: string;
  links: LinkObject[];
}
