/**
 * Seed the footer / legal static pages as section-based `page` docs (M5-506).
 *
 *   tsx scripts/seed/seed-static-pages.ts             # write docs
 *   tsx scripts/seed/seed-static-pages.ts --dry-run   # print, no write
 *
 * These are Perfect Imprints' OWN pages, so the copy here is reproduced from the
 * live perfectimprints.com pages (Patrick's content). Sample Policy and Privacy
 * & Security are verbatim; Shipping, Returns, About, and Core Values are faithful
 * to the source (lightly condensed by the extraction step). Terms of Service is
 * seeded as a DRAFT only — generic ToS boilerplate should be replaced with the
 * exact legal text before publishing.
 *
 * Slugs match the top-level routes in app/<slug>/page.tsx and the footer:
 *   about · contact · sample-policy · shipping-policy ·
 *   returns · privacy-security · company-core-values · terms
 *
 * Slugs mirror the live perfectimprints.com URLs exactly (M5-506 follow-up) so
 * existing SEO equity / inbound links are preserved — shipping is /shipping-policy
 * (not /us-international-shipping), returns is /returns, terms is /terms.
 *
 * Requires SANITY_API_TOKEN with write scope. Idempotent (createOrReplace).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_ROOT = resolve(__dirname, '../..');

function loadDotEnvLocal(): void {
  const envPath = resolve(PROJECT_ROOT, '.env.local');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
loadDotEnvLocal();

function buildClient(): SanityClient {
  const projectId =
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
  const dataset =
    process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production';
  const token = process.env.SANITY_API_TOKEN;
  if (!projectId) throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID is required.');
  if (!DRY_RUN && !token) throw new Error('SANITY_API_TOKEN (write scope) is required.');
  return createClient({ projectId, dataset, apiVersion: '2024-10-01', useCdn: false, token });
}

// --- portable text + section builders (deterministic keys) ------------------
interface SectionSeed {
  _type: string;
  _key: string;
  hidden: boolean;
  [k: string]: unknown;
}
interface PageSeed {
  _id: string;
  _type: 'page';
  /** Seed as a draft (drafts.<id>) so Patrick reviews + publishes in Studio. */
  draft?: boolean;
  title: string;
  slug: { _type: 'slug'; current: string };
  seo: { _type: 'seo'; metaTitle: string; metaDescription: string };
  sections: SectionSeed[];
}

let _n = 0;
const key = () => `k${++_n}`;
const span = (text: string) => ({ _type: 'span', _key: key(), text, marks: [] as string[] });
const para = (text: string) => ({
  _type: 'block',
  _key: key(),
  style: 'normal',
  markDefs: [],
  children: [span(text)],
});
const bullet = (text: string) => ({
  _type: 'block',
  _key: key(),
  style: 'normal',
  listItem: 'bullet',
  level: 1,
  markDefs: [],
  children: [span(text)],
});

type Block = ReturnType<typeof para>;

const heroBanner = (heading: string, subheading: string) => ({
  _type: 'heroBanner',
  _key: key(),
  heading,
  subheading,
  overlayText: true,
  hidden: false,
});
const richText = (heading: string | undefined, body: Block[]) => ({
  _type: 'richText',
  _key: key(),
  ...(heading ? { heading } : {}),
  body,
  hidden: false,
});
const ctaBlock = (
  heading: string,
  subheading: string,
  buttons: { label: string; href: string }[],
) => ({
  _type: 'ctaBlock',
  _key: key(),
  heading,
  subheading,
  buttons: buttons.map((b) => ({ _key: key(), label: b.label, href: b.href })),
  hidden: false,
});

const CONTACT_CTA = { label: 'Contact Us', href: '/contact' };

// --- the pages --------------------------------------------------------------
function buildPages(): PageSeed[] {
  return [
    // ----- About -----------------------------------------------------------
    {
      _id: 'page-about',
      _type: 'page',
      title: 'About Perfect Imprints',
      slug: { _type: 'slug', current: 'about' },
      seo: {
        _type: 'seo',
        metaTitle: 'About Perfect Imprints — Promotional Products Distributor',
        metaDescription:
          'Perfect Imprints is a family-run promotional products distributor delivering creative, quality branded products with an effortless experience for every client.',
      },
      sections: [
        heroBanner(
          'About Perfect Imprints',
          'A promotional products distributor with the culture of a family.',
        ),
        richText('Our Story', [
          para(
            'Perfect Imprints has a culture of family. We have a team experienced enough to handle large accounts, while keeping the feel of a family-like environment.',
          ),
          para(
            "Our founder's journey took him from helping revive people as a paramedic to helping people revive their businesses. Our beginnings as a business with family ideals continue to this day in the way we treat our employees and our clients.",
          ),
        ]),
        richText('Our Mission', [
          para(
            'Deliver creative solutions and quality products while ensuring an effortless experience for our clients.',
          ),
        ]),
        richText('Our Vision', [
          para(
            'To continually improve our delivery of high-quality service with creativity, while striving to keep the process as simple as possible, saving valuable time for our clients.',
          ),
        ]),
        ctaBlock(
          "Let's work together",
          'Tell us about your project and our team will help you find the perfect promotional products.',
          [CONTACT_CTA],
        ),
      ],
    },

    // ----- Contact ---------------------------------------------------------
    // The lead form is rendered by the route (app/contact/page.tsx); these
    // sections supply the editable intro + contact details shown above it.
    {
      _id: 'page-contact',
      _type: 'page',
      title: 'Contact Us',
      slug: { _type: 'slug', current: 'contact' },
      seo: {
        _type: 'seo',
        metaTitle: 'Contact Perfect Imprints | 800-773-9472',
        metaDescription:
          "Contact Perfect Imprints for custom promotional products. Call 800-773-9472, email cs@perfectimprints.com, or send us a message and we'll respond fast.",
      },
      sections: [
        heroBanner('Contact Us', "We're here to help you find the perfect promotional products."),
        richText('Get in Touch', [
          para(
            'Have a question or ready to start a project? Reach out and a member of our team will help you find the right products, branding, and pricing.',
          ),
        ]),
        richText('Contact Information', [
          bullet('Phone: 800-773-9472'),
          bullet('Email: cs@perfectimprints.com'),
          bullet('Address: 913 Beal Pkwy NW, Ste A153, Fort Walton Beach, FL 32547'),
          bullet('Hours: Monday–Friday, 8:00 am – 5:00 pm CST'),
        ]),
      ],
    },

    // ----- Sample Policy (verbatim prose; ordering steps adapted to the new
    // site, which funnels sample requests through Contact instead of a cart) --
    {
      _id: 'page-sample-policy',
      _type: 'page',
      title: 'Sample Policy',
      slug: { _type: 'slug', current: 'sample-policy' },
      seo: {
        _type: 'seo',
        metaTitle: 'Order Promotional Product Samples | Perfect Imprints',
        metaDescription:
          'Sample policies vary by factory and product. Most samples ship in 2-3 business days. Contact Perfect Imprints for sample pricing and pre-production samples.',
      },
      sections: [
        heroBanner('Sample Policy & Instructions', 'How sampling works at Perfect Imprints.'),
        richText(undefined, [
          para(
            'We are a promotional products distributor for thousands of factories all across the United States along with a few reputable international manufacturers. Because we deal with so many different factories and so many different product brands and price points, the sample policy varies greatly between factories and products. Most products do incur a charge plus a small shipping charge. Most samples are shipped with a random logo printed on them. If you are wanting a preproduction sample with your logo, please contact us for pricing — setup charges, run charges, product charge, and shipping charge will apply.',
          ),
          para(
            'Samples typically ship within 2-3 business days. If a rush is needed, please indicate your in-hands date needed. Rush fees may be added with your consent.',
          ),
        ]),
        richText('How to Request a Sample', [
          para(
            "To request a sample, contact our team with the product you're interested in, the color, and the quantity, and we'll provide sample pricing and availability. Call 800-773-9472 or send us a message through our Contact page.",
          ),
        ]),
      ],
    },

    // ----- U.S. & International Shipping ------------------------------------
    {
      _id: 'page-shipping-policy',
      _type: 'page',
      title: 'U.S. & International Shipping',
      slug: { _type: 'slug', current: 'shipping-policy' },
      seo: {
        _type: 'seo',
        metaTitle: 'U.S. & International Shipping | Perfect Imprints',
        metaDescription:
          'Perfect Imprints ships nationwide via UPS and FedEx and worldwide via UPS, FedEx, and USPS, including Canada and APO/FPO. Contact us for international options.',
      },
      sections: [
        heroBanner(
          'U.S. & International Shipping',
          'Fast, reliable delivery across the U.S. and around the world.',
        ),
        richText('Domestic Shipping', [
          para(
            'We ship using national carriers such as UPS and FedEx, with UPS as our primary method. Available shipping options include Ground, 3-Day, 2nd Day, and Next Day delivery. Some factories restrict shipping to specific carriers. While we cannot guarantee the reliability of any shipping method, we will coordinate with the carrier on your behalf if any problems occur.',
          ),
        ]),
        richText('Shipping to Canada', [
          para(
            'We ship to Canada via UPS or FedEx. Customers are responsible for any duties and taxes assigned through customs.',
          ),
        ]),
        richText('APO / FPO Shipping', [
          para(
            'We can ship to APO and FPO addresses through USPS, including AA (Armed Forces Americas), AE (Armed Forces Europe), and AP (Armed Forces Pacific) designations.',
          ),
        ]),
        richText('International Shipping', [
          para(
            'We ship to most countries via UPS, FedEx, or USPS, and offer significant discounts for international shipping — USPS is often the most economical option. For international orders, please contact us by email or live chat so we can find the best option for you.',
          ),
        ]),
      ],
    },

    // ----- Returns & Refunds -----------------------------------------------
    {
      _id: 'page-returns',
      _type: 'page',
      title: 'Returns & Refunds',
      slug: { _type: 'slug', current: 'returns' },
      seo: {
        _type: 'seo',
        metaTitle: 'Returns & Refunds | Perfect Imprints',
        metaDescription:
          'Perfect Imprints accepts returns on misprinted or poor-quality custom items and provides a free e-proof on every order. Review our return and cancellation policy.',
      },
      sections: [
        heroBanner('Return and Refund Policy', 'Our commitment to getting your order right.'),
        richText('When Items Can Be Returned', [
          para(
            'Custom printed promotional items can be returned if they are misprinted, if the imprint quality is poor, or if your order did not ship in time for a confirmed event date. We provide a free e-proof for every single order so you can approve exactly how your imprint will look before we produce it — it is your responsibility to check this before you approve your proof.',
          ),
        ]),
        richText('When Items Cannot Be Returned', [
          para(
            'Returns are not accepted for small imprint sizes (proofs are sent at actual size), general dissatisfaction with the product quality itself, minor imprint color variations (unless a custom PMS match was requested), typos that were missed during proof approval, or cancelled events. We cannot be responsible for cancelled events.',
          ),
        ]),
        richText('Blank Products', [
          para(
            'Return policies on blank items vary by manufacturer, and most blank returns are subject to restocking fees unless the item is defective. Beach balls are not able to be returned unless defective.',
          ),
        ]),
        richText('Cancellations', [
          para(
            'Orders cancelled after design work has begun incur a minimum 3% cancellation fee plus any art fees for work already completed. Please contact customer service before returning any item; unauthorized returns may incur additional shipping charges.',
          ),
        ]),
        richText(undefined, [
          para('Our return rate is less than 0.02%, and we ship 99.7% of all orders on time.'),
        ]),
      ],
    },

    // ----- Privacy & Security (verbatim) -----------------------------------
    {
      _id: 'page-privacy-security',
      _type: 'page',
      title: 'Privacy & Security',
      slug: { _type: 'slug', current: 'privacy-security' },
      seo: {
        _type: 'seo',
        metaTitle: 'Privacy & Security | Perfect Imprints',
        metaDescription:
          'Read the Perfect Imprints privacy policy: how we collect, use, and protect your personal information, our security measures, cookies, and SMS opt-out.',
      },
      sections: [
        heroBanner('Privacy & Security', 'How Perfect Imprints protects your information.'),
        richText(undefined, [
          para(
            'Perfect Imprints, LLC knows that you are concerned with how we handle your personal information; therefore, we are highly sensitive to the privacy interests of our consumers and believe that the protection of those interests is one of its most significant responsibilities. In acknowledgment of its obligations, we have adopted the following Privacy Policy applicable to information about consumers that it acquires in the course of its business.',
          ),
        ]),
        richText('Acquisition of Information', [
          para(
            'We do not acquire any more information about consumers than is required by law or is otherwise necessary to provide a high level of service efficiently and securely.',
          ),
          para(
            'We do collect contact information such as address, phone number, and email addresses in order to process your orders efficiently. We do store that information in our system for future communications of your orders. Under no circumstances do we disclose your personal information, such as name, address, phone number, email address, or payment information to third parties.',
          ),
          para(
            'You will receive some automated emails regarding your orders such as order acknowledgements, product proofs, and shipping status. These emails are automatically generated in response to your order and do not require any opting out.',
          ),
          para(
            'We do send out occasional newsletters with money savings opportunities and educational information about promotional products marketing. At any time, you can opt out of any email communication from your My Account Page and we will respect your privacy. We hate spam as much as you do; therefore, we will not spam you.',
          ),
        ]),
        richText('Security Measures', [
          para(
            'We make access to privacy-sensitive information subject to rigorous procedural and technological controls, consistent with legal requirements and the demands of customer service.',
          ),
          para(
            'Our website is safe and secure by the highest standards available with a 2048-bit Extended Validation SSL certificate which encrypts any information sent from our secure pages. Our company had to go through rigorous validation in order to acquire this security measure. Transactions on our website are backed by a $250,000 warranty against fraudulent activity on the part of any failure of the SSL certificate.',
          ),
        ]),
        richText('Disclosure to Third Parties', [
          para(
            'We will provide individually-identifiable information about consumers to third parties only if we are compelled to do so by order of a duly-empowered governmental authority, we have the express permission of the consumer, or it is necessary to process transactions and provide our services. We do not sell personal information such as email addresses, phone numbers, etc. to third parties.',
          ),
        ]),
        richText('Our Employees and Privacy', [
          para(
            'We train all of our employees about the importance of privacy. We give access to information about consumers only to those employees who require it to perform their jobs.',
          ),
        ]),
        richText('Privacy and Our Business Partners', [
          para(
            'When we make our technology or services available to business partners, we will not share with them any more consumer information than is necessary, and we will make every reasonable effort to assure, by contract or otherwise, that they use our technology and services in a manner that is consistent with this Privacy Policy.',
          ),
        ]),
        richText('Text Messaging (SMS)', [
          para(
            'By opting into any text messaging program, you expressly consent to receive text messages (SMS) to your mobile number. Text messages may include account alerts, marketing communications, responses to inquiries, special offers, order updates, and appointment reminders.',
          ),
          para(
            'If at any time you wish to stop receiving SMS messages from us, simply reply to the text with "STOP." You may receive an SMS message confirming your opt out.',
          ),
          para(
            'Please be aware that message and data rates may apply to any SMS messages sent or received. The rates are determined by your carrier and the specifics of your mobile plan.',
          ),
          para(
            'If you have any questions or need assistance regarding our SMS communications, please email us at cs@perfectimprints.com or call at 800-773-9472.',
          ),
        ]),
        richText('Cookies', [
          para(
            'Perfectimprints.com does use cookies, which are identifiers that we transfer to your temporary files on your hard drive through your web browser in order to recognize your visits and provide a more personalized experience.',
          ),
          para(
            "Our website will store cookies on your machine, and third parties such as Google may display related ads on websites across the internet. The ads displayed are based upon the type of product that you viewed on our website. You can opt out of Google's use of cookies by visiting Google's Ads Settings. Alternatively, you can opt out of a third-party vendor's use of cookies by visiting the Network Advertising Initiative opt-out page. If you have questions about this privacy policy, please feel free to contact us using any of the channels listed below.",
          ),
        ]),
      ],
    },

    // ----- Company Core Values ---------------------------------------------
    {
      _id: 'page-company-core-values',
      _type: 'page',
      title: 'Company Core Values',
      slug: { _type: 'slug', current: 'company-core-values' },
      seo: {
        _type: 'seo',
        metaTitle: 'Company Core Values | Perfect Imprints',
        metaDescription:
          "Perfect Imprints' core values — creativity, integrity, excellence, collaboration, and service — guide how we work with every client. Read our mission and vision.",
      },
      sections: [
        heroBanner(
          'Company Core Values',
          'The values that define who we are and how we do business.',
        ),
        richText(undefined, [
          para(
            'At Perfect Imprints, we wholly believe in our core values. These core values define who we are, and thus affect how we conduct business.',
          ),
        ]),
        richText('Our Core Values', [
          bullet('Approach challenges with creativity.'),
          bullet('Continuously learn and educate.'),
          bullet('Exemplify integrity and transparency.'),
          bullet('Persistently strive for excellence.'),
          bullet('Collaborate respectfully and frequently.'),
          bullet('Value diversity and respect differences.'),
          bullet('Regularly evolve and improve productivity.'),
          bullet('Authentically serve others.'),
        ]),
        richText('Our Mission', [
          para(
            'Deliver creative solutions and quality products while ensuring an effortless experience for our clients.',
          ),
        ]),
        richText('Our Vision', [
          para(
            'To continually improve our delivery of high-quality service with creativity, while striving to keep the process as simple as possible, saving valuable time for our clients.',
          ),
        ]),
      ],
    },

    // ----- Terms of Service (DRAFT — replace with exact legal text) ---------
    {
      _id: 'page-terms',
      _type: 'page',
      draft: true,
      title: 'Terms of Service',
      slug: { _type: 'slug', current: 'terms' },
      seo: {
        _type: 'seo',
        metaTitle: 'Terms of Service | Perfect Imprints',
        metaDescription:
          'The terms governing your use of perfectimprints.com — intellectual property, prohibited activities, disclaimers, dispute resolution, and governing law.',
      },
      sections: [
        heroBanner('Terms of Service', 'The terms governing your use of perfectimprints.com.'),
        richText(undefined, [
          para(
            'These Terms of Service govern your access to and use of perfectimprints.com, operated by Perfect Imprints from Fort Walton Beach, Florida. By using the site you agree to these terms. Last updated July 23, 2025.',
          ),
        ]),
        richText('Intellectual Property Rights', [
          para(
            'Unless otherwise indicated, the site and all of its content — including source code, databases, software, designs, text, and graphics — are owned by or licensed to Perfect Imprints. You are granted a limited, non-exclusive, non-transferable license to access the site for your personal, non-commercial use only.',
          ),
        ]),
        richText('User Representations', [
          para(
            'By using the site you represent that you are at least 18 years old, that any registration information you submit is accurate and current, and that you will comply with all applicable laws and these terms.',
          ),
        ]),
        richText('Prohibited Activities', [
          para(
            'You may not systematically scrape or harvest data from the site, use automated tools to access it, harass other users, infringe intellectual property rights, attempt to gain unauthorized access, or use the platform for any competitive or unlawful purpose.',
          ),
        ]),
        richText('Disclaimers & Limitation of Liability', [
          para(
            'The site and services are provided on an "AS-IS" and "AS-AVAILABLE" basis. Perfect Imprints disclaims all warranties and is not liable for service interruptions, errors, data loss, or third-party content accessed through the site.',
          ),
        ]),
        richText('Dispute Resolution & Governing Law', [
          para(
            'Disputes are first addressed through 30 days of informal negotiation and then resolved by binding arbitration under the rules of the American Arbitration Association in Okaloosa County, Florida. These terms are governed by the laws of the State of Florida.',
          ),
        ]),
        richText('Contact', [
          para('Questions about these terms can be directed to cs@perfectimprints.com or 850-200-4020.'),
        ]),
      ],
    },
  ];
}

async function main(): Promise<void> {
  const pages = buildPages();
  console.log(`Seeding ${pages.length} footer/static pages:`);
  for (const p of pages) {
    const state = p.draft ? 'DRAFT' : 'published';
    console.log(`  • ${p.title}  (/${p.slug.current})  [${p.sections.length} sections, ${state}]`);
  }
  console.log(`\nMode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE'}`);
  if (DRY_RUN) return;

  const client = buildClient();
  for (const p of pages) {
    const { draft, ...doc } = p;
    const payload = { ...doc, _id: draft ? `drafts.${doc._id}` : doc._id };
    await client.createOrReplace(payload);
    console.log(`  wrote ${payload._id}`);
  }
  console.log('\nDone. Publish each page in Studio (Terms of Service is a draft — replace the');
  console.log('boilerplate with your exact legal text first).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
