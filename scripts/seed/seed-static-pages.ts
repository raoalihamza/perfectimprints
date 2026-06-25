/**
 * Seed the footer / legal static pages as section-based `page` docs (M5-506).
 *
 *   tsx scripts/seed/seed-static-pages.ts             # write docs
 *   tsx scripts/seed/seed-static-pages.ts --dry-run   # print, no write
 *
 * These are Perfect Imprints' OWN pages, so the copy here is reproduced FULL and
 * VERBATIM from the live perfectimprints.com pages (Patrick's content). The
 * earlier pass left Shipping/Returns/About/Core-Values "lightly condensed" by the
 * extraction step and Terms as boilerplate; this pass refilled every policy page
 * verbatim from PI's own site (live + Wayback archive of the same slugs):
 *   - Terms of Service        — full verbatim "Terms & Conditions" (PUBLISHED)
 *   - U.S. & International Shipping — verbatim (Canada / APO-FPO / International / General Policies)
 *   - Returns & Refunds       — verbatim (full numbered criteria, blank-product rules, 3% fee)
 *   - Company Core Values     — verbatim (8 values + Mission/Vision statements)
 *   - Sample Policy / Privacy — already verbatim, retained (spot-checked)
 *   - About                   — live page is Cloudflare-blocked; the only archived
 *                               version is a near-empty template (just the
 *                               "culture of family" paragraph). Kept that verified
 *                               line + PI's own Mission/Vision and DROPPED the
 *                               unverifiable founder/paramedic story. FLAGGED for
 *                               Patrick to paste current About copy.
 *
 * Source typos are preserved verbatim where they appear in PI's legal copy
 * (e.g. "insignifanct", "the sue of its catalog"); a stray editor note in the
 * Disputes clause ("[This clause can be made more specific ...]") is also kept
 * verbatim. Flag these to Patrick — do not silently rewrite his legal text.
 *
 * Slugs match the top-level routes in app/<slug>/page.tsx and the footer, and
 * mirror the live perfectimprints.com URLs exactly (M5-506 follow-up) so existing
 * SEO equity / inbound links are preserved (no redirects):
 *   about · contact · sample-policy · shipping-policy ·
 *   returns · privacy-security · company-core-values · terms
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
type Block = Record<string, unknown>;
type Seg = { text: string; bold?: boolean; href?: string };

const span = (text: string) => ({ _type: 'span', _key: key(), text, marks: [] as string[] });
const strong = (text: string) => ({ _type: 'span', _key: key(), text, marks: ['strong'] });

/** Generic block from inline segments — each segment may be bold and/or a link. */
function blockFrom(
  segments: Seg[],
  opts: { listItem?: 'bullet' | 'number'; level?: number; style?: string } = {},
): Block {
  const markDefs: Array<Record<string, unknown>> = [];
  const children = segments.map((seg) => {
    const marks: string[] = [];
    if (seg.href) {
      const lk = `l${++_n}`;
      markDefs.push({ _type: 'link', _key: lk, href: seg.href });
      marks.push(lk);
    }
    if (seg.bold) marks.push('strong');
    return { _type: 'span', _key: key(), text: seg.text, marks };
  });
  const b: Block = { _type: 'block', _key: key(), style: opts.style || 'normal', markDefs, children };
  if (opts.listItem) {
    b.listItem = opts.listItem;
    b.level = opts.level ?? 1;
  }
  return b;
}

const para = (text: string): Block => ({
  _type: 'block',
  _key: key(),
  style: 'normal',
  markDefs: [],
  children: [span(text)],
});
const boldPara = (text: string): Block => ({
  _type: 'block',
  _key: key(),
  style: 'normal',
  markDefs: [],
  children: [strong(text)],
});
const bullet = (text: string): Block => ({
  _type: 'block',
  _key: key(),
  style: 'normal',
  listItem: 'bullet',
  level: 1,
  markDefs: [],
  children: [span(text)],
});
/** A paragraph built from inline segments (bold/link mix). */
const richPara = (segments: Seg[]): Block => blockFrom(segments);
/** A numbered list item built from inline segments (bold lead-in + body). */
const numItem = (segments: Seg[]): Block => blockFrom(segments, { listItem: 'number' });

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
    // NOTE: the live /about is Cloudflare-blocked and the only Wayback snapshot
    // (Jan 2025) is a near-empty template — only the "culture of family" line is
    // real PI content; the rest of that archived page is lorem-ipsum placeholder.
    // We keep the verified line + PI's own Mission/Vision (from the Core Values
    // page) and DROP the prior unverifiable founder/paramedic story. FLAGGED:
    // Patrick should paste the current About copy if the live page now has more.
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
        richText(undefined, [
          para(
            'Perfect Imprints has a culture of family. Our team is experienced enough to handle large accounts, while keeping the feel of a family-like environment.',
          ),
        ]),
        richText('Mission Statement', [
          para(
            'Deliver creative solutions and quality products while ensuring an effortless experience for our clients.',
          ),
        ]),
        richText('Vision Statement', [
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

    // ----- U.S. & International Shipping (verbatim from PI's shipping-policy) -
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
          'U.S. and International Shipping',
          'Fast, reliable delivery across the U.S. and around the world.',
        ),
        richText('Shipping to Canada', [
          para(
            'We do ship to Canada by UPS or FedEx. You will be responsible for duties and taxes assigned through customs.',
          ),
        ]),
        richText('Shipping to APO/FPO', [
          para(
            'We can ship to APO and FPO boxes through the United States Postal Service (USPS). Select the appropriate state relative to your duty station:',
          ),
          para(
            'AA - Armed Forces (the) Americas AE - Armed Forces Europe AP - Armed Forces Pacific',
          ),
        ]),
        richText('International Shipping', [
          richPara([
            {
              text: 'We will ship to nearly any other country by UPS, FedEx, or USPS. We do receive significant discounts for International shipping, which we will pass on to you; however, USPS often is the most economical option. For orders outside the U.S., U.S. Territories, or Canada, ',
            },
            { text: 'Contact Us', href: '/contact' },
            { text: ' by email or Live Chat with us to place your order.' },
          ]),
        ]),
        richText('General Policies', [
          para(
            'Perfect Imprints ships our products using national carriers such as UPS and FedEx. Our primary shipping method is UPS, which allows us the best discount on shipping with which we pass on to our clients. We have also found that UPS is the most reliable delivery method for those critical deadlines. We can offer shipping by Ground, 3-DAY, 2nd DAY, and NEXT DAY methods. Select the most appropriate method during checkout to ensure arrival by your event date.',
          ),
          para(
            'Promotional products from Perfect Imprints ship from thousands of factories around the United States and Canada. We can not guarantee the reliability of any shipping method since we do not control any of the carriers. All that Perfect Imprints can do is to ship on time by the most appropriate shipping method to meet your event date. Should a problem arise, we can take care of coordinating with UPS or FedEx and oversee the proper delivery of your promotional items .',
          ),
          para(
            'In some instances, specific factories only allow shipping by UPS or by FedEx. In these cases, we have no choice but to ship by the specified carrier.',
          ),
        ]),
      ],
    },

    // ----- Returns & Refunds (verbatim from PI's Return and Refund Policy) ---
    {
      _id: 'page-returns',
      _type: 'page',
      title: 'Returns & Refunds',
      slug: { _type: 'slug', current: 'returns' },
      seo: {
        _type: 'seo',
        metaTitle: 'Return Policy | Easy Returns & Replacements | Perfect Imprints',
        metaDescription:
          'Perfect Imprints accepts returns on misprinted or poor-quality custom items and provides a free e-proof on every order. Review our return and cancellation policy.',
      },
      sections: [
        heroBanner('Return and Refund Policy', 'Our commitment to getting your order right.'),
        richText(undefined, [
          boldPara(
            'Custom printed promotional items can be returned if they meet one of the following criteria:',
          ),
          numItem([
            { text: 'They are misprinted', bold: true },
            {
              text: ' - Perfect Imprints provides a free e-proof for every single order of custom printed promotional products that we sell. We email an actual size, proof of your item so that you can inspect how the final print will be. With this proof, we ask that you check the overall size to make sure you are happy with the print area (we max out all layouts unless otherwise instructed), the layout of the design, and spelling. It is your responsibility to check this BEFORE you approve your proof. We do require proof approval BEFORE any order is submitted for production. If you approve the proof and the final imprint is not the same, then you may be eligible for a return or a reprint. Call BEFORE making any returns, since unauthorized returns will not be accepted and it will incur additional shipping charges for you.',
            },
          ]),
          numItem([
            { text: 'The imprint quality is poor', bold: true },
            {
              text: ' - With bulk printing of promotional items, it is common for a very small percentage of the items to have minor flaws that are not considered poor quality. However, if you receive your items and feel like the imprint quality should have been better, contact us and we will gladly work with you on a reprint of those items or a refund of the flawed items.',
            },
          ]),
          numItem([
            { text: 'Your order did not ship in time', bold: true },
            {
              text: " - If you let us know your event date before ordering, we will guarantee that we ship in time. We can not be held responsible if UPS or any other carrier does not deliver in the expected delivery time frame. If we do NOT ship by the required ship date to normal shipping time to get to your location, we will accept a return. For example, if your event date is on a Friday morning, we will check the UPS transit time to your location. If UPS time is 3 days, then we will ship by the Monday before your event to allow 3 business days so that your package will arrive on Thursday. If UPS delays due to any reason, we will file a claim on your behalf with UPS. UPS or any other shipping carrier can't be held responsible for inclement weather, natural or man-made disasters, or other uncontrollable means that may cause delay.",
            },
          ]),
        ]),
        richText(undefined, [
          boldPara(
            'The following criteria represent reasons that items can NOT be returned:',
          ),
          numItem([
            { text: 'Small imprint size', bold: true },
            {
              text: " - We send all proofs at actual size (with a few exceptions for large format printing) and we expect that you will print the proof at 100% size to view the final imprint size. We are always up front about the maximum imprint size for each product and we can't be held responsible if you don't read the imprint area or fully inspect the proof.",
            },
          ]),
          numItem([
            { text: 'You are not happy with the quality of the item', bold: true },
            {
              text: ' - We encourage you to buy a sample of any item that you will be purchasing in bulk, particularly if you have never ordered that exact item from us in the past. We do try to only sell quality items; however, with promotional items, there are many "cheap" giveaways that many people want to give away in mass. If high-quality is a must, then please request a sample or speak to one of our customer service reps before ordering to inquire about the product quality. Product pricing typically matches the level of quality of an item For example, if you buy a 30 cent ink pen, don\'t expect to receive a premium executive pen.',
            },
          ]),
          numItem([
            { text: 'Imprint color is a few shades different than expected', bold: true },
            {
              text: ' - Unless you are requesting an exact PMS color match, which is an extra cost, than your items will be printed with standard ink colors for that factory. The product color can affect the imprint color. For example, printing light colors on dark colors will cause the darker product color to show through the imprint and darken the imprint color. The only sure way to get an exact color match is to print a specific PMS color on a white product. If your imprint color is critical, then request a custom PMS color match.',
            },
          ]),
          numItem([
            { text: 'You missed a typo on your proof', bold: true },
            {
              text: ' - We send you an exact copy of the final print to avoid this situation. We expect that you will take the time to carefully check each proof for accuracy. Even if we created the typo when we laid out your proof, you are ultimately responsible for proofing it for accuracy.',
            },
          ]),
          numItem([
            { text: 'Your event was canceled before you used the products', bold: true },
            {
              text: ' - Yes, we have heard this excuse before. We can not be responsible for cancelled events.',
            },
          ]),
        ]),
        richText('Blank Product Returns', [
          numItem([
            {
              text: "The return policy for blank products vary from product to product. This is because we have products from over 100 different promotional product factories on our site. If you feel you may have to return the products for some reason, please find out in advance if the products are returnable. Some factories allow returns with a small restocking fee, while other factories don't allow blank returns.",
            },
          ]),
          numItem([
            {
              text: 'Generally, all returns of blank products will incur a restocking fee to cover the man-hours required in shipping and receiving the products.',
            },
          ]),
          numItem([{ text: 'If the products are defective or damaged, claims can be made.' }]),
          numItem([
            {
              text: 'We encourage the purchase of a sample if you are trying to match company colors or if you are unfamiliar with the quality of the product.',
            },
          ]),
        ]),
        richText(undefined, [
          richPara([
            { text: 'Beach Balls', href: '/cat/beach-balls-inflatables', bold: true },
            {
              text: ' are not able to be returned (unless defective). Please ensure you order the correct quantity since returns are NOT allowed by our beach balls factory.',
            },
          ]),
          para(
            'Overall, our return rate is less than 0.02%. We ship 99.7% of all orders on time and have very few complaints.',
          ),
          boldPara(
            "There will be a minimum of a 3% fee for orders refunded due to no fault of ours. For example, if you place your order online and we find out the order can't be filled due to lack of inventory, you will not be charged the 3% fee. However, if you place your order and our designers and staff work up a proof and order acknowledgment for you, then you decide to change plans and cancel the order, there will be a 3% cancellation fee, plus an art fee for the time spent preparing artwork. The 3% fee is to cover the credit card fees associated with charging and refunding your card. Typical orders take about 30 minutes of time, sometimes by multiple people, depending on the quality of your artwork submitted. If you paid an attorney to draft a letter for a legal issue, then decided to not send it, the attorney would not refund your money, because he/she spent time researching your legal issue and drafting the letter. The promotional products industry works the same way.",
          ),
          richPara([
            { text: 'To request a return, ' },
            { text: 'Contact Us', href: '/contact' },
            { text: ' to begin the process.' },
          ]),
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
            'You will receive some automated emails regarding your orders such as order acknowledgements, product proofs, and shipping status. These emails are automatically generated in response your order and do not require any opting out.',
          ),
          para(
            'We do send out occasional newsletters with money savings opportunities and education information about promotional products marketing. At any time, you can opt out of any email communication from your My Account Page and we will respect your privacy. We hate spam as much as you do; therefore, we will not spam you.',
          ),
        ]),
        richText('Security Measures', [
          para(
            'We make access to privacy-sensitive information subject to rigorous procedural and technological controls, consistent with legal requirements and the demands of customer service.',
          ),
          para(
            'Our website is safe & secure by the highest standards available with a 2048-bit Extended Validation SSL certificate which encrypts any information sent from our secure pages. Our company had to go through rigorous validation in order to acquire this security measure. Transactions on our website are backed by a $250,000 warranty against fraudulent activity on the part of any failure of the SSL certificate.',
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
          para(
            'Privacy and Our Business Partners. When we make our technology or services available to business partners, we will not share with them any more consumer information than is necessary, and we will make every reasonable effort to assure, by contract or otherwise, that they use our technology and services in a manner that is consistent with this Privacy Policy.',
          ),
        ]),
        richText('Program Description', [
          para(
            'By opting into any High Level text messaging program, you expressly consent to receive text messages (SMS) to your mobile number. High Level text messages may include: account alerts, marketing communications, responses to inquiries, special offers, order updates and appointment reminders.',
          ),
        ]),
        richText('Opting Out', [
          para(
            'If at any time you wish to stop receiving SMS messages from us, simply reply to the text with "STOP." You may receive an SMS message confirming your opt out.',
          ),
        ]),
        richText('Message and Data Rates', [
          para(
            'Please be aware that message and data rates may apply to any SMS messages sent or received. The rates are determined by your carrier and the specifics of your mobile plan.',
          ),
        ]),
        richText('Support', [
          para(
            'If you have any questions or need assistance regarding our SMS communications, please email us at cs@perfectimprints.com or call at 800-773-9472.',
          ),
        ]),
        richText('Cookies', [
          para(
            'Perfectimprints.com does use cookies which are identifiers that we transfer to your temporary files on your hard drive through your web browser in order to recognize your visits and provide a more personalized experience.',
          ),
        ]),
        richText('Questions', [
          para(
            "Our website will store cookies on your machine and third parties, such as Google, may display related ads on website across the internet. The ads displayed are based upon the type of product that you viewed on our website. You can opt out of Google's use of cookies by visiting Google's Ads Settings. Alternatively, you can point your visitors to opt out of a third-party vendor's use of cookies by visiting the Network Advertising Initiative opt-out page. If you have questions about this privacy policy, please feel free to contact us using any of the channels listed below.",
          ),
        ]),
      ],
    },

    // ----- Company Core Values (verbatim) ----------------------------------
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
            "At Perfect Imprints, we wholly believe in our core values. These core values define who we are, and thus affect how we conduct business. We only hire and retain employees who embrace and live by our company's core values.",
          ),
          bullet('Approach challenges with creativity.'),
          bullet('Continuously learn and educate.'),
          bullet('Exemplify integrity and transparency.'),
          bullet('Persistently strive for excellence.'),
          bullet('Collaborate respectfully and frequently.'),
          bullet('Value diversity and respect differences.'),
          bullet('Regularly evolve and improve productivity.'),
          bullet('Authentically serve others.'),
        ]),
        richText('Mission Statement', [
          para(
            'Deliver creative solutions and quality products while ensuring an effortless experience for our clients.',
          ),
        ]),
        richText('Vision Statement', [
          para(
            'To continually improve our delivery of high-quality service with creativity, while striving to keep the process as simple as possible, saving valuable time for our clients.',
          ),
        ]),
      ],
    },

    // ----- Terms of Service (PUBLISHED — full verbatim "Terms & Conditions") -
    // Source: live perfectimprints.com/terms (+ Wayback archive of the same
    // slug for heading structure). 6 real headings (H1 + 5 H2); the remaining
    // sub-titles were inline run-ins on the source, promoted here to their own
    // editable richText sections. Source typos preserved verbatim.
    {
      _id: 'page-terms',
      _type: 'page',
      title: 'Terms of Service',
      slug: { _type: 'slug', current: 'terms' },
      seo: {
        _type: 'seo',
        metaTitle: 'Promotional Products Purchase Terms | Perfect Imprints',
        metaDescription:
          'The Perfect Imprints terms and conditions — payment options, pricing, cancellations, overruns, disclaimers, dispute resolution, governing law, and production times.',
      },
      sections: [
        heroBanner(
          'Terms & Conditions',
          'The policies, terms, and conditions that govern your use of perfectimprints.com.',
        ),
        richText(undefined, [
          para(
            'Your use of the perfectimprints.com web site (the "Site") is governed by the policies, terms, and conditions set forth below. Please read the following information carefully. By using this Site or submitting an order for products or services, you indicate your acceptance of, and agreement to be bound by, the terms and conditions set forth below. If you do not agree to these terms and conditions, please do not use this Site and please do not submit any orders for products or services. These terms and conditions may be changed by Perfect Imprints in the future. It is your responsibility as a user to periodically return to this page to review the terms and conditions for amendments. The amended terms shall take effect automatically the day they are posted on the site. Your continued use of the Perfectimprints.com web site following any amendments will constitute agreement to such amendments.',
          ),
        ]),
        richText('Flexible Payment Options for Promotional Products at Perfect Imprints', [
          para(
            'We accept VISA, MasterCard, American Express, PayPal, personal checks, business checks, money orders, cashiers checks, wire transfers, ACH, and purchase orders (only from government and public schools). Please contact an account rep if you want to pay by any means other than credit card or PayPal. We will not charge your credit card until the order is approved. Credit card orders shipped to a location other than your billing address may require additional verification. All prices on the Perfectimprints.com site are quoted in USD and all orders must be transacted in the same. International customers must pay by wire transfer until a working business relationship has been established, then credit card or PayPal may be used.',
          ),
        ]),
        richText('Prices & Availability', [
          para(
            'Because of the fast-moving nature of our industry, prices and availability are subject to change without notice. We try our best to ensure all pricing is accurate, however, occasionally there may be an error. We will honor the pricing for any insignifanct differences, however, we reserve the right to inform you of the pricing difference should it be significant. If a product is not in stock when you place your order (for example, not yet available or sold out), we will do our best to let you know and to let you know when we anticipate the product will be available. Anticipated delivery dates are dependent upon vendor supplies and other factors and are subject to change. We will also suggest alternative options that are similar in price and quality.',
          ),
        ]),
        richText('Cancellations and Alterations to Existing Orders', [
          para(
            'Once a proof has been created by our art department, cancellations will be charged a $30 service fee which may include, but are not limited to, art charges and order entry prep time.',
          ),
          para(
            "If an order is canceled after you have approved the proof and order, cancellation charges will be based upon the stage of production for your order. If screens are already produced, you will be charged for the screen or die charges along with the $30 service fee from our art department. Often, items are printed a few days in advance and left to air dry (depending on the printing technique). If your items are already printed, your order can't be canceled.",
          ),
          para(
            'We know that changes may occur, and will work with you to come to a resolution which is in the best interest of both parties. The best way to avoid cancellation fees is to be 100% confident that you want to move forward with your order. Please make your selections carefully and thoughtfully.',
          ),
        ]),
        richText('Overrun and Underrun', [
          para(
            "In certain instances you may receive an overage or a shortage on your order. Due to manufacturing quality and production standards there will be overruns and occasionally underruns. Perfectimprints.com will do everything possible to reduce this occurrence. The industry standard on most products is + or - 10%. For instance, if you order 1000 pens, you could potentially receive between 900 and 1100 pens. Exceptions to the above are paper and plastic bags. which may vary up to 25%. We reserve the right to bill your credit card only for the actual quantity shipped. If less items ship than ordered, we will refund the difference. If more items ship, we typically don't charge, but it is our discretion whether or not we do.",
          ),
        ]),
        richText('Typographic, Photographic & Technical Errors', [
          para(
            'Although we do our best to achieve 100% accuracy, occasionally errors & inaccuracies do occur. Should you encounter an error or inaccuracy, please inform us so it can be corrected. Products & packaging depicted may differ from stock available at time of shipment. We reserve the right to substitute equivalent items.',
          ),
        ]),
        richText('Warranty Disclaimer and Limitations on Liability', [
          para(
            "Perfectimprints.com passes through to its customers all manufacturers warranties and guarantees that are provided for the products it sells. Perfectimprints.com makes no additional or independent warranties. To the full extent permissible by applicable law, Perfectimprints.com disclaims all warranties, express or implied, including but not limited to implied warranties of merchantability and fitness for a particular purpose. Perfectimprints.com shall under no circumstances be liable for special, incidental, consequential (including lost profits or opportunities) or punitive damages, even if it has been advised of the possibility of such damages. The maximum liability of Perfectimprints.com for all damages shall be limited to an amount not to exceed the purchase price of the product. Likewise, Perfectimprints.com will not be liable for any damages of any kind arising from the sue of its catalog or web site, including but not limited to direct, indirect, incidental, punitive and consequential damages. Perfectimprints.com makes no warranty as to the performance of any merchandise sold. We are not responsible for system downtime, lost data, etc. This disclaimer by Perfectimprints.com in no way affects the terms of any applicable manufacturers' warranties or guarantees. Certain state laws do not allow limitations on implied warranties or the exclusion or limitation of certain damages. If these laws apply to you, some or all of the above disclaimers, exclusions or limitations may not apply to you, and you might have additional rights and remedies that vary from state to state.",
          ),
        ]),
        richText('Site Disclaimer and Limitation of Liability', [
          para(
            'This site, including any content or information contained within it or any site-related service, or any product or service licensed or purchased through the site, is provided on an "as is" basis without warranties of any kind, either express or implied, including, but not limited to, warranties of title or non infringement or implied warranties of merchantability or fitness for a particular purpose, other than those warranties which are implied by and incapable of exclusion, restriction or modification under the laws applicable to this agreement. You acknowledge that any warranty that is provided in connection with any of the products or services described herein is provided solely by the owner, advertiser, manufacturer or supplier of that product and/or service, and not by Perfect Imprints. Perfect Imprints does not warrant that your access to the site and/or related services will be uninterrupted or error-free, that defects will be corrected, or that this site or the server that makes it available is free of viruses or other harmful components. Perfect Imprints does not warrant or make any representations regarding the use or the results of the use of any product purchased in terms of its compatibility, correctness, accuracy, reliability or otherwise. You assume total responsibility and risk for your use of this site and site-related services.',
          ),
          para(
            'You agree that, except as provided under the Perfect Imprints return policy, Perfect Imprints and its directors, officers, employees, agents, sponsors, consultants or other representatives ("service providers") shall not be responsible or liable for any direct, indirect, incidental, consequential, special, exemplary, punitive or other damages (including without limitation loss of profits, loss or corruption of data, loss of goodwill. work stoppage, computer failure or malfunction, or interruption of business) under any contract, negligence, strict liability or other theory arising out of or relating in any way to the site, site-related services, or any products or services offered, sold or displayed on Perfectimprints.com site. If the foregoing limitation is held to be unenforceable, the maximum liability of Perfect Imprints and its service providers to you shall not exceed the amount of fees paid by you for the products or services you have ordered through the site. Some jurisdictions do not allow the limitation or exclusion of liability for certain damages, so the above limitations and exclusions may not apply to you to the extent such jurisdiction\'s law is applicable to this agreement.',
          ),
        ]),
        richText('Disputes', [
          para(
            "Any claims against Perfect Imprints relating in any way to your purchases from Perfect Imprints shall be submitted to confidential arbitration in Shalimar, FL. Arbitration under this agreement shall be conducted under the rules then prevailing of the American Arbitration Association. The arbitrator's award shall be binding and may be entered as a judgment in any court of competent jurisdiction. To the fullest extent permitted by applicable law, no arbitration under this Agreement shall be joined to an arbitration involving any other party subject to this Agreement, whether through class arbitration proceedings or otherwise. In any such arbitration, the parties shall be responsible for their own costs, expenses and attorney's fees. [This clause can be made more specific concerning the method and manner of dispute resolution.] In the event that this arbitration provision is unenforceable, any litigation regarding this agreement or any transaction between the customer and Perfect Imprints shall be brought in the state or federal courts located in Okaloosa County, FL, and the customer hereby agrees and submits to such jurisdiction and venue as exclusive and proper.",
          ),
        ]),
        richText('Governing Law', [
          para(
            'Transactions between you and Perfect Imprints, and any disputes arising between you and Perfect Imprints related to any interaction between you and Perfect Imprints, including but not limited to claims relating to the content of its catalogs and Web site, shall be governed by and construed in accordance with the laws of the State of Florida without regard to the laws regarding conflicts of law. If any provision of this agreement shall be unlawful, void or for any reason unenforceable, then that provision shall be deemed severable from this agreement and shall not affect the validity and enforceability of any remaining provisions.',
          ),
        ]),
        richText('Title - Risk of Loss', [
          para(
            'Title to items being purchased passes from Perfect Imprints to purchaser at the time of shipping. Customer takes on full liability for safety and validity of delivery address given to us at the time of purchase. Perfect Imprints will not incur any forwarding costs on shipments. Perfect Imprints shall not be responsible for damages or delays resulting from Acts of God, war, riot, seizure, terrorist activities, embargo or other acts or events outside of the reasonable control of Perfect Imprints.',
          ),
        ]),
        richText('Additional Information', [
          para(
            "Perfect Imprints' policies are subject to change without notice. We do our best to ship all orders as rapidly and accurately as possible; however, Perfect Imprints is not liable for late or delayed shipments or system failures. Title to items being purchased passes from Perfect Imprints to purchaser at the time of shipping. If you purchase items for export, you must obtain from the Federal government certain export documentation. All trademarks and registered trademarks are used to benefit of their respective owners. If any provision of this agreement shall be unlawful, void, or for any reason unenforceable, then that provision shall be deemed severable from this agreement and shall not affect the validity and enforceability of any remaining provisions. This agreement constitutes the entire agreement between the parties relating to the subject matter herein and cannot be modified except in a written agreement signed by both parties. Any heading, caption, or paragraph title contained in this Agreement is inserted only as a matter of convenience and in no way defines or explains any paragraph or provision hereof. Perfect Imprints reserves the right to refuse any order that may transmit any offensive, harmful, unlawful, threatening, libelous, defamatory, obscene, abusive, hateful, inflammatory, discriminatory, pornographic or profane material or any material that could constitute or encourage conduct that would be considered a criminal offense, give rise to civil liability, or would otherwise violate the law.",
          ),
        ]),
        richText('Trademarks', [
          para(
            "Perfect Imprints and the Perfect Imprints Logo are service marks of Perfect Imprints, LLC in the United States and other countries. Perfect Imprints' service marks may not be used in connection with any product or service that is not provided by Perfect Imprints, in any manner that is likely to cause confusion among customers, or in any manner that disparages or discredits Perfect Imprints, LLC.",
          ),
          para(
            'All other trademarks and registered trademarks displayed on the site are the trademarks of their respective owners, and are not intended to imply any endorsement or affiliation between Perfect Imprints and these companies.',
          ),
          para(
            'All trademarks and registered trademarks are used to benefit, and without intent to infringe on, the mark holder. The Perfect Imprints logo is a registered trademark of Perfect Imprints, LLC.',
          ),
          richPara([
            {
              text: 'Perfect Imprints reserves the right to use completed proofs or completed products in marketing materials that may be distributed across several channels, include social-media profiles, blogs, ads, brochures and more. These marketing materials are designed to positively promote both the Perfect Imprints brand and the customer\'s brand. Customers reserve the right to request that their completed proofs, completed products or brand names are not included in these marketing materials. This request may be made via ',
            },
            { text: 'email', href: '/contact' },
            {
              text: ", phone or in person. The lack of any such request – in addition to acceptance of the terms of service - indicates to Perfect Imprints that the customer has given Perfect Imprints permission to use the customer's art, products or name in marketing materials that promote both the Perfect Imprints brand and the customer's brand.",
            },
          ]),
        ]),
        richText('Making Purchases', [
          para(
            'If you wish to license or make purchases of products or services described on the Site, you will be asked to supply certain information, including but not limited to credit card or other payment information. You agree that all information that you provide to Perfectimprints.com will be accurate, complete and current. You agree to pay all charges incurred by authorized users of your account and credit card or other payment mechanism at the prices in effect when such charges are incurred. You will also be responsible for paying any applicable duties and/or taxes, shipping, handling, and processing charges relating to your purchases.',
          ),
        ]),
        richText('Pricing and Typographical Errors', [
          para(
            'Due to the fast pace of the computer and consumer products industries, all prices are subject to change without notice. We make every effort to provide you the most accurate, up-to-the-minute information. Despite our best efforts, a small number of the items on our web site may be mis-priced.',
          ),
          para(
            'In the event a product is listed at an incorrect price due to typographical, photographic, or technical error or error in pricing information received from our suppliers, Perfectimprints.com shall have the right to refuse or cancel any orders placed for product listed at the incorrect price.',
          ),
          para(
            "If an item's correct price is lower than our stated price, we will charge the lower amount and ship you the item.",
          ),
          para(
            'If an item\'s correct price is higher than our stated price, we will notify you of the price error and you will have the option of continuing or order cancellation. While we make every attempt to verify prices before charging your credit card, Perfect Imprints shall have the right to refuse or cancel any orders placed on mis-priced product whether or not the order has been confirmed and your credit card charged. If your credit card has already been charged for the purchase and your order is canceled, Perfect Imprints shall immediately issue a credit to your credit card account in the amount of the incorrect price. We believe that day-in, day-out, our pricing is very fair in regards to our competition and the world class service we provide. Combined with our product assortment, product availability and service level, we believe that we offer a compelling shopping experience. With that in mind, we do not "match" competitor\'s pricing, offer price protection, or provide "quantity quotes."',
          ),
        ]),
        richText('Order Acceptance Policy', [
          para(
            'The advertisement of any product on this site does not constitute an offer to sell. Your order or your receipt of an electronic or other form of order confirmation does not signify our acceptance of your order, nor does it constitute confirmation of our offer to sell. Perfect Imprints reserves the right at any time after receipt of your order to accept or decline your order. Perfect Imprints reserves the right at any time after receipt of your order, without prior notice to you, to supply less than the quantity you ordered of any item in accordance with our order limitation policy. Perfect Imprints will accept files with PMS colors in EPS files. PMS Colors are matched as closely as possible based on the PMS colors. Exact color matching is not guaranteed. All orders placed must obtain pre-approval with an acceptable method of payment, as established by our credit department. We may require additional verifications or information before accepting any order.',
          ),
        ]),
        richText('Suppliers', [
          para(
            "All new products and services available for order through the Site are distributed on behalf of third-party suppliers (\"Suppliers\"), unless otherwise indicated, and are sold with the Supplier's limited warranty. The warranty periods and service varies by Supplier and product. The full text of any such warranty is available, free of charge, upon written request addressed to Perfect Imprints, Attn: Manufacturer's Warranty Request. Certain optional extra protection may be available at additional cost. Except for the Perfect Imprints Return Policy, all of your rights and remedies with respect to your order, purchase, possession, and use of the products and services and all maintenance, update, warranty, liability, and any other obligations related to the products and services, if any, shall be governed by the applicable policies and procedures of the Suppliers.",
          ),
        ]),
        richText('Governing Law', [
          para(
            'Transactions between you and Perfect Imprints shall be governed by and construed in accordance with the laws of the State of Florida, without regard to the laws regarding conflicts of law. Any litigation regarding this agreement or any transaction between customer and Perfect Imprints shall be brought in the state or federal courts located in Okaloosa County, FL and the customer hereby agrees and submits to such jurisdiction and venue as proper.',
          ),
        ]),
        richText('Force Majeure', [
          para(
            'Force majeure means unusual, unpredictable and unavoidable events that are outside of the organizers control, and that prevents the contract to be fulfilled. Circumstances that the organizer could not, within reasonable means, have foreseen and therefore could not have avoided or overcome. Including, but not restricted to, war, threat of war, riot, civilian insubordination or strike, authority measure, act of terrorism, nature, industrial catastrophe, fire, severe weather conditions, flood, closed airports, technical issues, maintenance issues or unforeseen changes made by airlines, such as time table changes, interruption in IT-infrastructure (including but not restricted access to our web site). During these conditions the organizer is free from liability or other consequences.',
          ),
        ]),
        richText('Returns & Exchanges', [
          richPara([
            {
              text: 'Returns and exchanges are not allowed for decorated goods unless the product is defective or a printing error is our fault. Returns are not allowed if you approved a proof with a mistake in it. See our full ',
            },
            { text: 'Return Policy', href: '/returns' },
            { text: '.' },
          ]),
        ]),
        richText('Production Times', [
          richPara([
            {
              text: "All production times listing on the website are average production times and not guarantees. If you have a firm in-hands date by which you need your products, that must be disclosed at the beginning of the order process to our customer service team can ensure timely delivery. If we can't deliver in time or we don't feel comfortable guaranteeing that date, someone from our team will contact you to inform you of that. Rush production is available for many of our products, so please ",
            },
            { text: 'contact us', href: '/contact' },
            { text: ' if rush production is needed. Additional charges will often apply for rush production.' },
          ]),
        ]),
      ],
    },
  ];
}

/**
 * Stale draft / old-slug docs to remove so Studio + the published perspective
 * stay clean (esp. Terms: the live `client` uses perspective:'published', so a
 * dangling `drafts.page-terms` would otherwise linger as "unpublished changes").
 */
const CLEANUP_IDS = [
  'drafts.page-terms',
  'drafts.page-terms-of-service',
  'page-terms-of-service',
  'drafts.page-us-international-shipping',
  'page-us-international-shipping',
  'drafts.page-returns-refunds',
  'page-returns-refunds',
];

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

  console.log('\nCleaning up stale draft / old-slug docs:');
  for (const id of CLEANUP_IDS) {
    try {
      await client.delete(id);
      console.log(`  deleted ${id}`);
    } catch {
      // not found / already gone — ignore
    }
  }

  console.log('\nDone. Terms of Service is now PUBLISHED at /terms (full verbatim content).');
  console.log('FLAG: /about could not be retrieved live (Cloudflare); confirm/paste current About copy in Studio.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
