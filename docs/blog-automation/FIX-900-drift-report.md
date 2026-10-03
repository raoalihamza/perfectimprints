# FIX-900: product drift on the topic-generated drafts, before and after

Measured 2026-10-03 against the production repo's data (8,200 products, the 2026-09-22 rebuild) and the live published dataset (site-wide hidden SKUs ["519423","506342 10B","506414","514537 10A","514536 10A","512700 90A"]). Read-only: no document was written, no AI route was called.

## Findings

1. **The drift has two classes, and the dial reaches one.** At the old floor (one shared word for every source) the full-catalog top-up matched on one incidental word: "sunscreen sticks" took two hockey sticks and a lint stick, "sunscreen bottles" took wine bottle bags, "rabbit-style corkscrews" took infant Rabbit Skins bodysuits, "wine openers with flashlights" took jar openers, "liquid measuring cups" took a liquid highlighter. The shipped dial (A: the catalog top-up needs min(2, the phrase's significant words), the category branch keeps 1) removes all of these. On the five drafts, 9 wrong strips are dropped or corrected and 1 correct strip is lost (the waiter's corkscrews, whose product names share one word each with the idea).
2. **The second class is category resolution, and no dial fixes it.** `resolveCategoryForKeywords` picks the root category sharing the most words with the idea and breaks ties on the shorter slug: "collapsible can coolers" resolves to `coolers` (hard coolers), "neoprene bottle sleeves" to `arm-sleeves` (then laptop sleeves from the catalog on neoprene + sleeve), "custom sunscreen in golf" to `golf`, "measuring spoon sets" to `poker-sets` (notebook sets), "photo frame ornaments" to `photo-frames`. The category branch at floor 1 then fills the strip from that root. Seven of the five drafts' 45 strips are this class, all four drifting koozie strips among them, and they are unchanged.
3. **Variant D (min(2, words) on every source) was measured and rejected.** It fixes "collapsible can coolers" (Collapsible KOOZIE Can Coolers) and "measuring spoon sets" (measuring spoons), but it kills the correct koozie strips, whose products share only the word koozie with "embroidered koozies", "zip-up koozies" and "sublimated koozies", and it sends "leather koozies" to leather padfolios. Over the sample it halves the strips (72 to 37) and the topic-related products (109 to 55).
4. **Cost of the shipped dial over the 72 reproduced list strips:** 72 to 59 strips kept, 284 to 231 products, phrase-complete products 70 to 71, topic-related 109 to 96. About one strip in five and one product in five, most of them wrong ones.
5. **Answer to "does a generated post now reliably carry products that match its topic?": no, not yet.** The one-incidental-word class is gone; the category-resolution class remains and needs the matcher change AUTO-200 called the deeper half (gate every idea's category and products by the post's own topic words, or make the resolver require the idea's head noun). That is a separate ticket.

## How to read this

"Before" is the strip as STORED in Sanity, exactly what the route wrote on 2026-09-28/29. The route never stores the model's `productType` (the phrase it matched products for), so each strip's input was reconstructed by inverse search: every candidate phrase from the idea heading (contiguous phrases, subsets of its significant words, words the stored products share) was run through the REAL matcher with the OLD dials and the same used-SKU replay the route performs, and the ones reproducing the stored SKUs in order are the possible inputs. Where several reproduce, the one with the most significant words is used (the prompt asks for a 2 to 4 word item), and the alternatives are listed. "After" runs that same input through the real matcher with the new dials, replaying used SKUs from its own strips. A strip whose input could not be reconstructed is shown as stored and is not counted.

Dials: **old** = relevance floor 1 for every source (what produced the stored strips); **A** = the floor the route now uses: the category branch keeps 1, the full-catalog top-up needs min(2, the phrase's significant words); **D** = min(2, words) for every source, measured to show why the category branch was left at 1.

## The five drafts

### 9 Custom Wine Openers for Business Gifting and Branded Giveaways

`drafts.66e80162-6227-42d0-9c22-f80defaae8e3` | topic: custom wine openers | strips 9, inputs reconstructed 4

**Idea 1: Classic Waiter's Corkscrew for Restaurant and Hospitality Clients**  
input: `waiter corkscrew for restaurant`; resolved root category: `diner-restaurant-mugs`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 526155 Waiters's Wine Opener | (no strip) | (no strip) |
| 2 | 523903 Double Hinged Wine Key Corkscrew |  |  |
| 3 | 515345 43A The Contemporary Corkscrew And Wine Stopper |  |  |

**Idea 2: Electric Wine Openers for Executive Client Gifts**  
input: the stored block holds no products (emptied by hand, not a matcher output)

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | (empty) | (stays as stored) | (stays as stored) |

**Idea 3: Wine Opener Multi-Tools for Trade Show Giveaways**  
input: `opener multi tools for`; resolved root category: `multi-function-tools`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 521049 Hammer Multi-Tool | 521049 Hammer Multi-Tool | 521049 Hammer Multi-Tool |
| 2 | 510203 Chipper Multi-Tool | 510203 Chipper Multi-Tool | 510203 Chipper Multi-Tool |
| 3 | 516086 Gripper Multi-Tool | 516086 Gripper Multi-Tool | 516086 Gripper Multi-Tool |
| 4 | 521775 Cocktail Multi Tool | 521775 Cocktail Multi Tool | 521775 Cocktail Multi Tool |

**Idea 4: Personalized Wine Openers with Wooden Handles for Employee Appreciation**  
input: NOT reconstructed

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 526769 Stir Silicone Spatula W/ Wooden Handle | (stays as stored) | (stays as stored) |
| 2 | 501303 Letter Opener |  |  |
| 3 | 509898 1AS Wine Gift Set |  |  |
| 4 | 521452 Wooden Nickel |  |  |

**Idea 5: Wine Opener Keychains for Client Giveaways and Direct Mail**  
input: NOT reconstructed

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 501794 Hand Jar Opener | (stays as stored) | (stays as stored) |
| 2 | 511305 Oval Jar Opener |  |  |
| 3 | 528555 Keeper Keychain |  |  |
| 4 | 501793 Heart Jar Opener |  |  |

**Idea 6: Rabbit-Style Corkscrews for Corporate Gift Sets**  
input: `rabbit corkscrews` (2 reproducing inputs; also `rabbit`); no root category resolved (catalog only)

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 529077 Infant Rabbit Skins Baby Rib Bodysuit | (no strip) | (no strip) |
| 2 | 524038 Rabbit Skins Toddler Fine Jersey T-Shirt |  |  |
| 3 | 528295 Comfort Pals™ Heat Therapy Cozy Pads- Rabbit |  |  |

**Idea 7: Wine Opener and Stopper Sets for Real Estate and Hospitality Giveaways**  
input: NOT reconstructed

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 526459 Wood Wine Stopper | (stays as stored) | (stays as stored) |
| 2 | 519631 Metal Wine Stopper |  |  |
| 3 | 518186 43A Vacuum Wine Stopper |  |  |
| 4 | 526758 4 Piece Bamboo Wine Tool Set |  |  |

**Idea 8: Custom Wine Openers with Flashlights for Outdoor and Safety Programs**  
input: `openers flashlights outdoor`; resolved root category: `outdoor`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 501796 House Jar Opener | (no strip) | (no strip) |
| 2 | 524056 Piggy Jar Opener |  |  |
| 3 | 528540 Astro Flashlight |  |  |
| 4 | 501795 Circle Jar Opener |  |  |

**Idea 9: Luxury Boxed Wine Opener Sets for Executive and Board Gifts**  
input: NOT reconstructed

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 523165 Executive Wine Collectors Set | (stays as stored) | (stays as stored) |
| 2 | 522098 Napa Stemless Wine Tumbler Set |  |  |
| 3 | 529175 Wine & Cheese Accessories 4-pc. Set |  |  |
| 4 | 527338 Bamboo Coaster Set with Bottle Opener |  |  |

### 9 Promotional Ornaments for Bulk Business Gifting and Branded Giveaways

`drafts.833b6796-df41-4d0d-adde-a44bbb724236` | topic: promotional ornaments | strips 9, inputs reconstructed 8

**Idea 1: Custom Logo Ornaments for Client Appreciation**  
input: NOT reconstructed

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 525279 Ceramic Ornament | (stays as stored) | (stays as stored) |
| 2 | 504613 Flat Shatterproof Ornament |  |  |
| 3 | 519584 Shatter Resistant Flat Star Ornament |  |  |
| 4 | 519593 Shatter Resistant Flat Round Ornament |  |  |

**Idea 2: Laser-Engraved Wood Ornaments for Employee Recognition**  
input: `engraved wood ornaments for`; resolved root category: `ornaments`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 520835 Wood Ornament | 520835 Wood Ornament | 520835 Wood Ornament |
| 2 | 526849 Wood Ornament - 3"W x 3"H | 526849 Wood Ornament - 3"W x 3"H | 526849 Wood Ornament - 3"W x 3"H |
| 3 | 527634 Layered Wood Ornament: Tree | 527634 Layered Wood Ornament: Tree | 527634 Layered Wood Ornament: Tree |
| 4 | 526850 Custom Laser Cut Wood Ornament | 526850 Custom Laser Cut Wood Ornament | 526850 Custom Laser Cut Wood Ornament |

**Idea 3: Photo Frame Ornaments for Trade Show Giveaways**  
input: `photo frame ornaments for`; resolved root category: `photo-frames`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 512312 Sunglasses Photo Frame | 512312 Sunglasses Photo Frame | 512312 Sunglasses Photo Frame |
| 2 | 528212 Pixi 10.1" Wifi Photo Frame | 528212 Pixi 10.1" Wifi Photo Frame | 528212 Pixi 10.1" Wifi Photo Frame |
| 3 | 516843 4" X 6" The Curve Photo Frame | 516843 4" X 6" The Curve Photo Frame | 516843 4" X 6" The Curve Photo Frame |
| 4 | 524549 Silver Glitter Acrylic Desktop Photo Frame | 524549 Silver Glitter Acrylic Desktop Photo Frame | 524549 Silver Glitter Acrylic Desktop Photo Frame |

**Idea 4: Custom Snow Globe Ornaments for Holiday Client Gifts**  
input: `custom snow globe ornaments`; resolved root category: `ornaments`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 512371 03W Magnetic Snow Globe Ornament | 512371 03W Magnetic Snow Globe Ornament | 512371 03W Magnetic Snow Globe Ornament |
| 2 | custom-912d478d-02d7-4ab5-9f33-6e43ea441cd2 [Product Page 912d478d] | custom-912d478d-02d7-4ab5-9f33-6e43ea441cd2 Snow Globe Custom Christmas Ornaments | custom-912d478d-02d7-4ab5-9f33-6e43ea441cd2 Snow Globe Custom Christmas Ornaments |
| 3 | 526847 Slate Ornament | 526847 Slate Ornament |  |
| 4 | 526848 Metal Ornament | 526848 Metal Ornament |  |

**Idea 5: Branded Metal Ornaments for Safety Milestone Programs**  
input: `branded metal ornaments for`; resolved root category: `ornaments`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 527828 Wooden Ornament | 527828 Wooden Ornament | (no strip) |
| 2 | 521921 Stocking Ornament | 521921 Stocking Ornament |  |
| 3 | 527782 Confetti Ornament | 527782 Confetti Ornament |  |
| 4 | 526456 Blossom Kit Ornament | 526456 Blossom Kit Ornament |  |

**Idea 6: Acrylic Ornaments for Company Store and Onboarding Kits**  
input: `acrylic ornaments for company`; resolved root category: `ornaments`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 526903 Acrylic Holiday Ornament | 526903 Acrylic Holiday Ornament | 526903 Acrylic Holiday Ornament |
| 2 | 528706 Intrepid Acrylic Ornament | 528706 Intrepid Acrylic Ornament | 528706 Intrepid Acrylic Ornament |
| 3 | custom-ce92a84a-8231-466e-8966-c6bfd81eef15 [Product Page ce92a84a] | custom-ce92a84a-8231-466e-8966-c6bfd81eef15 Custom Shape Acrylic Holiday Ornaments - up to 6 sq. inches | custom-ce92a84a-8231-466e-8966-c6bfd81eef15 Custom Shape Acrylic Holiday Ornaments - up to 6 sq. inches |
| 4 | custom-ec313f6a-8fc7-4b02-95f4-197213197c43 [Product Page ec313f6a] | custom-ec313f6a-8fc7-4b02-95f4-197213197c43 Custom Shape Acrylic Holiday Ornaments - up to 9 sq. inches | custom-ec313f6a-8fc7-4b02-95f4-197213197c43 Custom Shape Acrylic Holiday Ornaments - up to 9 sq. inches |

**Idea 7: Personalized Ornaments for Client Gift Sets**  
input: `personalized ornaments for client`; resolved root category: `ornaments`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 528863 Slate Round Ornament | 528863 Slate Round Ornament | (no strip) |
| 2 | 526845 Holiday Glitz Ornament | 526845 Holiday Glitz Ornament |  |
| 3 | 527638 Holiday Charm Ornament | 527638 Holiday Charm Ornament |  |
| 4 | 525278 Hammered Glass Ornament | 525278 Hammered Glass Ornament |  |

**Idea 8: Wholesale Ornament Sets for Employee Appreciation Kits**  
input: `wholesale ornament sets for`; resolved root category: `ornaments`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 527670 Beveled Glass Ornaments | 527670 Beveled Glass Ornaments | (no strip) |
| 2 | 508193 91A Oval Jade Glass Ornament | 508193 91A Oval Jade Glass Ornament |  |
| 3 | 526846 Hand Blown Glass Ornament | 526846 Hand Blown Glass Ornament |  |
| 4 | 528864 Mirror Ornament - Hexagon | 528864 Mirror Ornament - Hexagon |  |

**Idea 9: Custom Gift Ornaments for Nonprofit and Fundraising Events**  
input: `custom gift ornaments for`; resolved root category: `ornaments`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 506005 Shatter Resistant Ornament | 506005 Shatter Resistant Ornament | (no strip) |
| 2 | 525277 Mini Campfire Mug Ornament | 525277 Mini Campfire Mug Ornament |  |
| 3 | 528850 Chrome Round Disk Ornament | 528850 Chrome Round Disk Ornament |  |
| 4 | 507272 3" Hand Blown Glass Ornament | 507272 3" Hand Blown Glass Ornament |  |

### 9 Custom Sunscreen Giveaway Ideas for Trade Shows and Outdoor Teams

`drafts.923a7aff-baa0-4172-9ecf-d7caf97bf4b3` | topic: custom sunscreen | strips 9, inputs reconstructed 9

**Idea 1: SPF Lip Balm with Custom Label**  
input: `spf lip balm with`; resolved root category: `lip-balm`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 509402 Chap Ice® SPF 15 Lip Balm | 509402 Chap Ice® SPF 15 Lip Balm | 509402 Chap Ice® SPF 15 Lip Balm |
| 2 | 506825 90A SPF 15 Lip Balm in White Tube | 506825 90A SPF 15 Lip Balm in White Tube | 506825 90A SPF 15 Lip Balm in White Tube |
| 3 | 513294 01A SPF 15 Lip Balm in Black Tube | 513294 01A SPF 15 Lip Balm in Black Tube | 513294 01A SPF 15 Lip Balm in Black Tube |
| 4 | 527510 Value SPF 15 Broad Spectrum Lip Balm | 527510 Value SPF 15 Broad Spectrum Lip Balm | 527510 Value SPF 15 Broad Spectrum Lip Balm |

**Idea 2: Custom Sunscreen Packets for Direct Mail**  
input: `custom sunscreen packets for`; resolved root category: `sunscreen`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 517052 90A 4Oz Sunscreen Spray | 517052 90A 4Oz Sunscreen Spray | (no strip) |
| 2 | 517053 90A 8Oz Sunscreen Spray | 517053 90A 8Oz Sunscreen Spray |  |
| 3 | 517051 90A 2 Oz Sunscreen Spray | 517051 90A 2 Oz Sunscreen Spray |  |
| 4 | 512277 90A .5 oz SPF 30 Sunscreen | 512277 90A .5 oz SPF 30 Sunscreen |  |

**Idea 3: Logo Sunscreen Tubes for Employee Wellness Kits**  
input: `logo sunscreen tubes for`; resolved root category: `sunscreen`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 523569 1.9 oz Duo Bottle SPF 30 Sunscreen + SPF 15 Lip Balm in Black Tube + Carabiner | 523569 1.9 oz Duo Bottle SPF 30 Sunscreen + SPF 15 Lip Balm in Black Tube + Carabiner | (no strip) |
| 2 | 517019 90A 1 Oz Squeeze Pouch Sunscreen | 517019 90A 1 Oz Squeeze Pouch Sunscreen |  |
| 3 | 508598 SPF 30 Sunscreen in Jumbo Sunstick | 508598 SPF 30 Sunscreen in Jumbo Sunstick |  |
| 4 | 523657 SPF 50+ All Natural Sunscreen Stick | 523657 SPF 50+ All Natural Sunscreen Stick |  |

**Idea 4: Branded Sunscreen Spray for Golf and Outdoor Events**  
input: `branded sunscreen spray for`; resolved root category: `sunscreen`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 512336 90A 1 oz SPF 30 Sunscreen with Carabiner | 512336 90A 1 oz SPF 30 Sunscreen with Carabiner | 517052 90A 4Oz Sunscreen Spray |
| 2 | 513293 90E 1 oz SPF 30 Sunscreen in Clear Round Bottle | 513293 90E 1 oz SPF 30 Sunscreen in Clear Round Bottle | 517053 90A 8Oz Sunscreen Spray |
| 3 | 526335 SPF 30 Mineral Sunscreen Tottle w/Carabiner 1.5 fl oz | 526335 SPF 30 Mineral Sunscreen Tottle w/Carabiner 1.5 fl oz | 517051 90A 2 Oz Sunscreen Spray |
| 4 | 507398 1.9 oz SPF 30 Sunscreen in Clear Bottle with Carabiner | 507398 1.9 oz SPF 30 Sunscreen in Clear Bottle with Carabiner |  |

**Idea 5: Custom Sunscreen Sticks for Active Giveaways**  
input: `custom sunscreen sticks for`; resolved root category: `sunscreen`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 526334 Tropical SPF 30 Broad Spectrum Sunscreen Tottle 1.5 fl oz w/Carabiner | (no strip) | (no strip) |
| 2 | 516736 Lint Stick |  |  |
| 3 | 515942 90A Hockey Stick |  |  |
| 4 | 515943 90A Goalie Stick |  |  |

**Idea 6: Promotional Sunscreen Bottles for Safety Programs**  
input: `promotional sunscreen bottles for`; resolved root category: `sunscreen`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 523217 Bottle Bag | (no strip) | 513293 90E 1 oz SPF 30 Sunscreen in Clear Round Bottle |
| 2 | 506542 1-Bottle Wine Bag |  | 507398 1.9 oz SPF 30 Sunscreen in Clear Bottle with Carabiner |
| 3 | 506782 91A 8 oz Water Bottle |  | 523569 1.9 oz Duo Bottle SPF 30 Sunscreen + SPF 15 Lip Balm in Black Tube + Carabiner |
| 4 | 505124 4-Bottle Wine Tote |  |  |

**Idea 7: Logo Sunscreen in Beach and Pool Kits**  
input: `beach and pool kits`; resolved root category: `ppe-kits`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 525624 Sun Bum® Beach Bum Kit | (no strip) | (no strip) |
| 2 | 526773 Pro Kit |  |  |
| 3 | 526803 Pupil Kit |  |  |
| 4 | 517590 90A Pet Id Kit |  |  |

**Idea 8: Branded Sunscreen with Carabiner for Hiking and Travel**  
input: `branded sunscreen with carabiner`; resolved root category: `sunscreen`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 503279 SPF 15 Lip Balm in White Tube with Hook Cap and Carabiner | 526334 Tropical SPF 30 Broad Spectrum Sunscreen Tottle 1.5 fl oz w/Carabiner | 512336 90A 1 oz SPF 30 Sunscreen with Carabiner |
| 2 | 508958 Carabiner | 503279 SPF 15 Lip Balm in White Tube with Hook Cap and Carabiner | 526335 SPF 30 Mineral Sunscreen Tottle w/Carabiner 1.5 fl oz |
| 3 | 519904 Carabiner Tool |  | 526334 Tropical SPF 30 Broad Spectrum Sunscreen Tottle 1.5 fl oz w/Carabiner |
| 4 | 517505 Dog Bone Carabiner |  |  |

**Idea 9: Custom Sunscreen in Golf Tournament Player Packs**  
input: `custom sunscreen in golf`; resolved root category: `golf`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 524030 Golf Buddy | 524030 Golf Buddy | (no strip) |
| 2 | 524637 Gold Golf Kit | 524637 Gold Golf Kit |  |
| 3 | 510804 Golf Ball Caddy | 510804 Golf Ball Caddy |  |
| 4 | 510325 Golf/Sports Towel | 510325 Golf/Sports Towel |  |

### 9 Promotional Measuring Cups: Creative Giveaway Ideas for Bulk Buyers

`drafts.81770c4a-8a1c-4b99-9e0f-8a82f48a3114` | topic: promotional measuring cups | strips 9, inputs reconstructed 7

**Idea 1: Kitchen Conversion Chart Cups for Cooking Demos**  
input: `cups measuring`; resolved root category: `measuring-cups`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 506415 91A Cook's Choice One-Cup Measuring Cup | 506415 91A Cook's Choice One-Cup Measuring Cup | 506415 91A Cook's Choice One-Cup Measuring Cup |
| 2 | 510810 Cook's Choice Two-Cup Measuring Cup | 510810 Cook's Choice Two-Cup Measuring Cup | 510810 Cook's Choice Two-Cup Measuring Cup |
| 3 | 506623 Measuring Spoon Set | 506623 Measuring Spoon Set |  |
| 4 | 520670 7-Piece Measuring Set | 520670 7-Piece Measuring Set |  |

**Idea 2: Collapsible Silicone Cups for Trade Show Swag**  
input: `collapsible silicone cups measuring` (64 reproducing inputs; also `collapsible silicone trade measuring`, `collapsible silicone show measuring`, `collapsible silicone swag measuring`); resolved root category: `measuring-cups`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 520898 4 Way Measuring Spoon | 520898 4 Way Measuring Spoon | 521770 Collapsible Silicone Pet Bowl |
| 2 | 512406 Sliding Measuring Spoon | 512406 Sliding Measuring Spoon | 524868 18 oz Zigoo Silicone Collapsible Bottle |
| 3 | 525325 Wooden Measuring Spoons | 525325 Wooden Measuring Spoons | 528200 Collapsible Silicone Pet Food Scoop & Bag Clip |
| 4 | 510535 Swivel-It Measuring Spoon | 510535 Swivel-It Measuring Spoon | 525280 18 oz Zigoo Silicone Collapsible Bottle - Tie Dye |

**Idea 3: Stainless Steel Cups for Employee Appreciation Gifts**  
input: `stainless steel cups measuring`; resolved root category: `measuring-cups`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 526410 4-Pc. Stainless Steel Measuring Spoons | 526410 4-Pc. Stainless Steel Measuring Spoons | 526410 4-Pc. Stainless Steel Measuring Spoons |
| 2 | 514929 Adjustable Measuring Spoon | 514929 Adjustable Measuring Spoon | 518263 The 16 oz Stainless Steel Cup |
| 3 | 529116 Kitchi Magnetic Measuring Spoon Set | 529116 Kitchi Magnetic Measuring Spoon Set | 529112 28 oz NAYAD® Crusade Stainless Steel Double-Wall Bottle with Hidden Cup |
| 4 | 518263 The 16 oz Stainless Steel Cup | 518263 The 16 oz Stainless Steel Cup | 521736 Stainless Steel Straw |

**Idea 4: Safety-Themed Cups for Workplace Safety Programs**  
input: NOT reconstructed

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 507978 Safety Tee | (stays as stored) | (stays as stored) |
| 2 | 528917 Safety Duck |  |  |
| 3 | 512197 16 oz Uno Cup |  |  |
| 4 | 514916 16B Party Cup Set |  |  |

**Idea 5: Branded Cups for Client Gift Sets with Gourmet Mixes**  
input: NOT reconstructed

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 529811 10 oz Olla Vacuum Coffee Cup with Ceramic Liner | (stays as stored) | (stays as stored) |
| 2 | 511322 15 oz Keen Cup |  |  |
| 3 | 525279 Ceramic Ornament |  |  |
| 4 | 501417 24 oz Stadium Cup |  |  |

**Idea 6: Adjustable Measuring Cups for Health and Wellness Fairs**  
input: `adjustable measuring cups for`; resolved root category: `measuring-cups`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 511521 17 oz Stadium Cup | (no strip) | (no strip) |
| 2 | 511035 24 oz Carnival Cup |  |  |
| 3 | 512203 10 oz Frost Flex Cup |  |  |
| 4 | 527500 16 oz Steel Chill Cup |  |  |

**Idea 7: Measuring Spoon Sets for Cooking Classes and Workshops**  
input: `measuring spoon sets for`; resolved root category: `poker-sets`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 519824 Mercury Notebook Set | 519824 Mercury Notebook Set | 506623 Measuring Spoon Set |
| 2 | 505922 Color Wave Notebook Set | 505922 Color Wave Notebook Set | 529116 Kitchi Magnetic Measuring Spoon Set |
| 3 | 519416 Chester Journal Book Set | 519416 Chester Journal Book Set | 520670 7-Piece Measuring Set |
| 4 | 521897 Mason Stationary Gift Set | 521897 Mason Stationary Gift Set | 520898 4 Way Measuring Spoon |

**Idea 8: Liquid Measuring Cups for Coffee Shops and Cafes**  
input: `liquid measuring cups for`; resolved root category: `measuring-cups`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 506095 Liquid Highlighter | (no strip) | (no strip) |
| 2 | 528177 16 oz Chill Party Cup |  |  |
| 3 | 501020 16 oz - The Party Cup® |  |  |
| 4 | 502385 12 oz Mood Stadium Cup |  |  |

**Idea 9: Novelty Measuring Cups for Social Media Contests**  
input: `measuring shaped`; resolved root category: `measuring-cups`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 503324 90A Bone-Shaped Pen | (no strip) | (no strip) |
| 2 | 504251 Shaped Emery Board |  |  |
| 3 | 515531 22B Wrap Shaped Pencil |  |  |
| 4 | 516970 Fish Shaped Pencil |  |  |

### 9 Custom Koozie Ideas for Trade Shows, Employee Gifts, and Client Appreciation

`drafts.994d296d-22e1-46de-ac76-c7bd58a2e951` | topic: custom koozies | strips 9, inputs reconstructed 9

**Idea 1: Collapsible Can Coolers for Trade Show Giveaways**  
input: `collapsible can coolers for`; resolved root category: `coolers`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 516104 Collapsible 2-In-1 Trunk Organizer/Cooler | 516104 Collapsible 2-In-1 Trunk Organizer/Cooler | 516104 Collapsible 2-In-1 Trunk Organizer/Cooler |
| 2 | 515039 Cooler Caddy Jr | 515039 Cooler Caddy Jr | 505524 Collapsible KOOZIE® Can Cooler |
| 3 | 519984 Hard Top Cooler | 519984 Hard Top Cooler | 505971 Collapsible KOOZIE® Bottle Cooler |
| 4 | 527613 Backpack Cooler | 527613 Backpack Cooler | 526431 Koozie® Collapsible Slim Can Cooler |

**Idea 2: Neoprene Bottle Sleeves for Employee Appreciation**  
input: `neoprene bottle sleeves for`; resolved root category: `arm-sleeves`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 501369 Reversible Neoprene Laptop Sleeve | 501369 Reversible Neoprene Laptop Sleeve | 501369 Reversible Neoprene Laptop Sleeve |
| 2 | 527301 Full Color 15" Recycled Neoprene Laptop Sleeve | 527301 Full Color 15" Recycled Neoprene Laptop Sleeve | 527301 Full Color 15" Recycled Neoprene Laptop Sleeve |
| 3 | 528140 Travlr Laptop Sleeve | 528140 Travlr Laptop Sleeve | 521036 1 oz Sanitizer in Trapezoid Bottle w/ Sleeve |
| 4 | 512720 01A Laptop Brief- Neoprene | 512720 01A Laptop Brief- Neoprene | 528973 Full Color Neoprene Lip Balm Sleeve Pocket Keychain |

**Idea 3: Foam Can Coolers for Client Thank-You Gifts**  
input: `foam can coolers for`; resolved root category: `coolers`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 524326 Jumbo Cooler Tote | 524326 Jumbo Cooler Tote | (no strip) |
| 2 | 519413 Newport Cooler Bag | 519413 Newport Cooler Bag |  |
| 3 | 527618 Otaria Cooler Tote | 527618 Otaria Cooler Tote |  |
| 4 | 521734 Hybrid 2-in-1 Cooler | 521734 Hybrid 2-in-1 Cooler |  |

**Idea 4: Stainless Steel Can Coolers for Safety Program Rewards**  
input: `stainless steel can coolers`; resolved root category: `coolers`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 517874 Coleman® 54-Quart Classic Steel Belted Cooler | 517874 Coleman® 54-Quart Classic Steel Belted Cooler | 517874 Coleman® 54-Quart Classic Steel Belted Cooler |
| 2 | 514187 Ice River Seat Cooler | 514187 Ice River Seat Cooler | 521736 Stainless Steel Straw |
| 3 | 522007 Northwoods Cooler Bag | 522007 Northwoods Cooler Bag | 524371 Stainless Steel Pet Bowl |
| 4 | 526420 Igloo® Terrain Cooler | 526420 Igloo® Terrain Cooler | 526664 Stainless Steel Fire Pit |

**Idea 5: Embroidered Koozies for Company Stores**  
input: `embroidered koozies for company`; resolved root category: `koozies`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 525289 KOOZIE® Duo Can Cooler | 525289 KOOZIE® Duo Can Cooler | (no strip) |
| 2 | 526430 Koozie® Slim Can Cooler | 526430 Koozie® Slim Can Cooler |  |
| 3 | 528148 Koozie® Cork Can Cooler | 528148 Koozie® Cork Can Cooler |  |
| 4 | 522889 KOOZIE® Woody Can Cooler | 522889 KOOZIE® Woody Can Cooler |  |

**Idea 6: Full-Color Sublimated Koozies for Real Estate Open Houses**  
input: `sublimated koozies for real`; resolved root category: `koozies`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 507754 Original KOOZIE® Can Cooler | 507754 Original KOOZIE® Can Cooler | (no strip) |
| 2 | 522881 KOOZIE® Magnetic Can Cooler | 522881 KOOZIE® Magnetic Can Cooler |  |
| 3 | 510098 Zip-Up Bottle KOOZIE® Cooler | 510098 Zip-Up Bottle KOOZIE® Cooler |  |
| 4 | 510517 Britepix™ KOOZIE® Can Cooler | 510517 Britepix™ KOOZIE® Can Cooler |  |

**Idea 7: Bottle Opener Koozies for Brewery and Restaurant Promotions**  
input: `bottle opener koozies for`; resolved root category: `bottle-openers`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 520190 Bottle Opener KOOZIE® Can Cooler | 520190 Bottle Opener KOOZIE® Can Cooler | 520190 Bottle Opener KOOZIE® Can Cooler |
| 2 | 512224 Bottle Opener Key Light | 512224 Bottle Opener Key Light | 512224 Bottle Opener Key Light |
| 3 | 514864 Pub Vinyl Bottle Opener | 514864 Pub Vinyl Bottle Opener | 514864 Pub Vinyl Bottle Opener |
| 4 | 509541 Open Sesame Bottle Opener | 509541 Open Sesame Bottle Opener | 509541 Open Sesame Bottle Opener |

**Idea 8: Zip-Up Koozies for Golf Tournaments and Corporate Outings**  
input: `zip up koozies for`; resolved root category: `koozies`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 505524 Collapsible KOOZIE® Can Cooler | 505524 Collapsible KOOZIE® Can Cooler | (no strip) |
| 2 | 526429 Koozie® Magnetic Slim Can Cooler | 526429 Koozie® Magnetic Slim Can Cooler |  |
| 3 | 505971 Collapsible KOOZIE® Bottle Cooler | 505971 Collapsible KOOZIE® Bottle Cooler |  |
| 4 | 529164 Koozie® britePix® Slim Can Cooler | 529164 Koozie® britePix® Slim Can Cooler |  |

**Idea 9: Leather Koozies for Executive Client Gifts**  
input: `leather koozies for executive`; resolved root category: `koozies`

| | before (stored) | after, A (shipped) | D (measured only) |
| --- | --- | --- | --- |
| 1 | 522888 KOOZIE® Glow-in-the-Dark Can Cooler | 522888 KOOZIE® Glow-in-the-Dark Can Cooler | 507751 Executive Vintage Leather Writing Pad |
| 2 | 524419 13 oz KOOZIE® Triple Vacuum Tumbler | 524419 13 oz KOOZIE® Triple Vacuum Tumbler | 510853 Deluxe Executive Vintage Leather Padfolio |
| 3 | 526431 Koozie® Collapsible Slim Can Cooler | 526431 Koozie® Collapsible Slim Can Cooler |  |
| 4 | 529400 Koozie® britePix® Jersey Can Cooler | 529400 Koozie® britePix® Jersey Can Cooler |  |

Across the five: 45 strips, 37 with a reconstructed input, 2 of those with more than one reproducing input.

## Cost of tightening, over every reproduced list strip in the sample

The sample is every AI-generated list post with product strips (14 drafts and the published AI posts, 105 list strips), of which the inputs of the strips below could be reconstructed. "Phrase-complete" = the product shares every significant word of its idea's phrase; "topic-related" = it shares at least one significant word with the post's topic. Both are mechanical proxies, not a judgement of fit.

| dials | strips kept | strips skipped | products shown | phrase-complete | topic-related |
| --- | --- | --- | --- | --- | --- |
| old: floor 1 everywhere | 72 | 0 | 284 | 70 | 109 |
| A: category 1, catalog min(2, tokens) | 59 | 13 | 231 | 71 | 96 |
| D: every source min(2, tokens) | 37 | 35 | 134 | 82 | 55 |

## Reproduction, by post

| post | template | strips | inputs reconstructed |
| --- | --- | --- | --- |
| Custom Tumblers vs. Water Bottles: Which Is Better for Employee Gifts? | single | 1 | 1 |
| 7 Ways to Use Custom Printed Mood Pencils to Promote Your Organization | single | 1 | 0 |
| Custom Pepper Spray: The Complete Buyer’s Guide for Businesses | single | 1 | 0 |
| 9 Best Retro-Style Promotional Products for Events and Giveaways | list | 9 | 8 |
| The Best Brands for Promotional Water Bottles | single | 1 | 1 |
| Custom Sublimated Tank Tops for 5K, 10K, Half Marathon, and Marathon Races | single | 1 | 0 |
| 10 Custom Richardson Trucker Hats: The Complete Buying Guide | list | 11 | 3 |
| 9 Creative Test Giveaway Ideas for Your Next Event | list | 9 | 9 |
| 9 Custom Wine Openers for Business Gifting and Branded Giveaways | list | 9 | 4 |
| 9 Promotional Ornaments for Bulk Business Gifting and Branded Giveaways | list | 9 | 8 |
| 9 Custom Sunscreen Giveaway Ideas for Trade Shows and Outdoor Teams | list | 9 | 9 |
| 9 Promotional Measuring Cups: Creative Giveaway Ideas for Bulk Buyers | list | 9 | 7 |
| 9 Custom Koozie Ideas for Trade Shows, Employee Gifts, and Client Appreciation | list | 9 | 9 |
| 12 Employee Appreciation Gift Ideas for Every Budget | list | 12 | 9 |
| Liven Up Your Event With Custom Balloons | single | 1 | 0 |
| 4 Creative Ways to Use Custom Thundersticks at Your Next Event | single | 1 | 0 |
| Custom U Brands Pens for Business Giveaways | single | 1 | 0 |
| Buying Guide for Custom Sublimated Apparel | list | 4 | 0 |
| Custom Pepper Spray for Delivery Drivers and Mobile Employees | single | 1 | 0 |
| Custom Socks with Local Landmarks for Business Promotion | single | 1 | 0 |
| Custom Reflective Trick or Treat Bags for Halloween Safety | single | 1 | 0 |
| Why Fewer, Better Promotional Products Deliver Better ROI | list | 1 | 0 |
| Top 5 Favorite Promotional Christmas Ornaments That Ship Quickly | list | 5 | 1 |
| Church Christmas Ornaments: A Youth Group Fundraiser | single | 1 | 0 |
| 3 Creative Uses for Custom Christmas Stocking Ornaments | single | 1 | 0 |
| 7 Custom Stress Relievers That Aren’t the Same Old Stress Ball | list | 1 | 0 |
| 9 Ways Businesses Use Custom Printed Sunglasses for Promotions and Safety | list | 8 | 5 |
