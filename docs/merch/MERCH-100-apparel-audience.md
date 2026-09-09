# MERCH-100: age group and gender for the apparel product pages

Prepared 2026-09-09 from the 158 published `productPage` documents, read-only. **Nothing here has been written to Sanity.** These are suggested values, classified from each product's title; Ali confirms them and either applies them with the script below or edits the two dropdowns by hand in Studio (Details section: Age group, Gender).

Google's values (sources read 2026-09-09): age_group `newborn`, `infant`, `toddler`, `kids`, `adult` (https://support.google.com/merchants/answer/6324463); gender `male`, `female`, `unisex` (https://support.google.com/merchants/answer/6324479). Youth sizes fall in Google's `kids` band (5 to 13 years).

**Total apparel: 82.** The remaining 76 published products (ornaments, bags, pens, matchbooks, lighters, thundersticks, glow sticks, pepper spray, mugs, tokens, flags, boxes, footballs, water bottles, Post-it cubes) are not apparel; Google does not ask for either attribute on them, so they stay blank and are not listed here.

## Recommendation: run the script rather than 82 hand edits

`pnpm set-product-audience` (dry run by default, writes nothing; `--commit` to apply) reads this list from `data/seed/product-audience-merch-100.json`, sets each product's `ageGroup` and `gender` **only where the field is still empty** (a value Patrick has since typed in Studio is never overwritten), patches the draft as well when one exists so a later Publish cannot undo it, and prints exactly what it did. 82 dropdown edits by hand invite a missed product or a mis-click that nobody can see afterwards; the script is idempotent and re-runnable.

### Kids, unisex (4)

| Slug | Title |
| --- | --- |
| `childrens-bulk-plush-red-santa-hats` | Children's Blank Plush Red Santa Hats |
| `childrens-embroidered-plush-red-santa-hats` | Children's Embroidered Plush Red Santa Hats |
| `youth-birdseye-mesh-performance-sublimated-tank-tops` | Youth 160 GSM Birdseye Mesh Performance Sublimated Tank Tops |
| `youth-birdseye-performance-dye-sublimated-short-sleeve-t-shirt` | Youth 160 GSM Birdseye Mesh Performance Sublimation Short Sleeve T-shirt |

### Adult, male (4)

| Slug | Title |
| --- | --- |
| `men-birdseye-mesh-performance-sublimated-tank-tops` | Men's 160 GSM Birdseye Mesh Performance Sublimated Tank Tops |
| `mens-birdseye-performance-dye-sublimated-short-sleeve-t-shirt` | Men's 160 GSM Birdseye Mesh Performance Sublimation Short Sleeve T-shirt |
| `mens-dye-sublimated-birdseye-mesh-performance-corporate-polo-shirts` | Men's Dye Sublimated Birdseye Mesh Performance Corporate Polo shirts |
| `mens-poly-interlock-performance-sublimation-short-sleeve-t-shirt` | Men's 150 GSM Poly Interlock Performance Sublimation Short Sleeve T-shirt |

### Adult, female (3)

| Slug | Title |
| --- | --- |
| `womens-birdseye-mesh-performance-sublimated-tank-tops` | Women's 160 GSM Birdseye Mesh Performance Sublimated Tank Tops |
| `womens-birdseye-performance-dye-sublimated-short-sleeve-t-shirt` | Women's 160 GSM Birdseye Mesh Performance Sublimation Short Sleeve T-shirt |
| `womens-dye-sublimated-birdseye-mesh-performance-corporate-polo-shirts` | Women's Dye Sublimated Birdseye Mesh Performance Corporate Polo shirts |

### Adult, unisex (71)

| Slug | Title |
| --- | --- |
| `asheville-nc-local-city-custom-socks` | Asheville NC Local City Custom Socks |
| `atlanta-ga-local-city-custom-socks` | Atlanta GA Local City Custom Socks |
| `austin-tx-local-city-custom-socks` | Austin TX Local City Custom Socks |
| `below-the-calf-sublimated-full-color-crew-socks` | Below the calf sublimated full color crew socks |
| `blank-bulk-blue-felt-santa-hats` | Blank Bulk Blue Felt Santa Hats |
| `blank-bulk-purple-felt-santa-hats` | Blank Bulk Purple Felt Santa Hats |
| `blank-green-felt-santa-hats` | Blank Green Felt Santa Hats |
| `blank-light-up-santa-cowboy-hats` | Blank Light-Up Santa Cowboy Hats |
| `blank-red-felt-santa-hats` | Blank Red Felt Santa Hats |
| `blank-santa-cowboy-hats` | Blank Santa Cowboy Hats |
| `bozeman-mt-local-city-custom-socks` | Bozeman MT Local City Custom Socks |
| `bulk-gold-santa-hats` | Blank Gold Santa Hats |
| `bulk-green-plush-santa-hats` | Blank Green Plush Santa Hats |
| `bulk-happy-holidays-led-knit-hats` | Bulk Happy Holidays LED Knit Hats |
| `bulk-leopard-print-santa-hats` | Blank Leopard Print Santa Hats |
| `bulk-light-up-santa-hats` | Bulk Light Up Santa Hats |
| `bulk-light-up-spring-tree-santa-hats` | Bulk Light Up Spring Tree Santa Hats |
| `bulk-pink-plush-santa-hats` | Blank Pink Plush Santa Hats |
| `bulk-plaid-santa-hats` | Blank Plaid Santa Hats |
| `bulk-plush-blue-santa-hats` | Blank Plush Blue Santa Hats |
| `bulk-plush-purple-santa-hats` | Blank Plush Purple Santa Hats |
| `bulk-plush-red-santa-hats` | Blank Plush Red Santa Hats |
| `bulk-santa-hats-with-bells` | Blank Santa Hats With Bells |
| `bulk-zebra-print-santa-hats` | Blank Zebra Print Santa Hats |
| `canada-local-custom-socks` | Canada Local Custom Socks |
| `charlotte-nc-local-city-custom-socks` | Charlotte NC Local City Custom Socks |
| `chicago-il-local-city-custom-socks` | Chicago IL Local City Custom Socks |
| `cleveland-oh-local-city-custom-socks` | Cleveland, OH Local City Custom Socks |
| `colorado-springs-co-local-city-custom-socks` | Colorado Springs, CO Local City Custom Socks |
| `custom-embroidered-green-plush-santa-hats` | Custom Embroidered Green Plush Santa Hats |
| `custom-embroidered-leopard-print-santa-hats` | Custom Embroidered Leopard Print Santa Hats |
| `custom-embroidered-plaid-santa-hats` | Custom Embroidered Plaid Santa Hats |
| `custom-embroidered-plush-blue-santa-hats` | Custom Embroidered Plush Blue Santa Hats |
| `custom-embroidered-plush-pink-santa-hats` | Custom Embroidered Plush Pink Santa Hats |
| `custom-embroidered-plush-purple-santa-hats` | Custom Embroidered Plush Purple Santa Hats |
| `custom-embroidered-plush-red-santa-hats` | Custom Embroidered Plush Red Santa Hats |
| `custom-embroidered-zebra-print-santa-hats` | Custom Embroidered Zebra Print Santa Hats |
| `custom-printed-blue-felt-santa-hats` | Custom Printed Blue Felt Santa Hats |
| `custom-printed-green-felt-santa-hats` | Custom Printed Green Felt Santa Hats |
| `custom-printed-light-up-santa-cowboy-hats` | Custom Printed Light-Up Santa Cowboy Hats |
| `custom-printed-purple-felt-santa-hats` | Custom Printed Purple Felt Santa Hats |
| `custom-printed-red-felt-santa-hats` | Custom Printed Red Felt Santa Hats |
| `custom-printed-santa-cowboy-hats` | Custom Printed Santa Cowboy Hats |
| `dauphin-island-al-local-city-custom-socks` | Dauphin Island, AL Local City Custom Socks |
| `dayton-oh-local-city-custom-socks` | Dayton OH Local City Custom Socks |
| `daytona-fl-local-city-custom-socks` | Daytona FL Local City Custom Socks |
| `denver-co-local-city-custom-socks` | Denver, CO Local City Custom Socks |
| `dillsboro-nc-local-city-custom-socks` | Dillsboro NC Local City Custom Socks |
| `embroidered-gold-santa-hats` | Embroidered Gold Santa Hats |
| `fort-worth-tx-local-city-custom-socks` | Fort Worth TX Local City Custom Socks |
| `goleta-ca-local-city-custom-socks` | Goleta CA Local City Custom Socks |
| `indiana-local-custom-socks` | Indiana Local Custom Socks |
| `las-vegas-nv-local-city-custom-socks` | Las Vegas NV Local City Custom Socks |
| `low-cut-sublimated-full-color-crew-socks` | Low Cut Sublimated Full Color Crew Socks |
| `miami-fl-local-city-custom-socks` | Miami, FL Local City Custom Socks |
| `montgomery-al-local-city-custom-socks` | Montgomery AL Local City Custom Socks |
| `nashville-tn-local-city-custom-socks` | Nashville TN Local City Custom Socks |
| `naughty-and-nice-santa-hats-sets` | Set of Naughty and Nice Santa Hats |
| `new-york-city-ny-local-city-custom-socks` | New York City, NY Local City Custom Socks |
| `parowan-ut-local-city-custom-socks` | Parowan UT Local City Custom Socks |
| `santa-barbara-ca-local-city-custom-socks` | Santa Barbara, CA Local City Custom Socks |
| `santa-cruz-ca-local-city-custom-socks` | Santa Cruz, CA Local City Custom Socks |
| `santa-monica-ca-local-city-custom-socks` | Santa Monica CA Local City Custom Socks |
| `sarasota-fl-local-city-custom-socks` | Sarasota, FL Local City Custom Socks |
| `spring-tx-local-city-custom-socks` | Spring, TX Local City Custom Socks |
| `statesboro-ga-local-city-custom-socks` | Statesboro GA Local City Custom Socks |
| `stowe-vt-local-city-custom-socks` | Stowe VT Local City Custom Socks |
| `sylva-nc-local-city-custom-socks` | Sylva NC Local City Custom Socks |
| `tampa-fl-local-city-custom-socks` | Tampa, FL Local City Custom Socks |
| `traverse-city-mi-local-city-custom-socks` | Traverse City MI Local City Custom Socks |
| `tulsa-ok-local-city-custom-socks` | Tulsa OK Local City Custom Socks |
