/**
 * The list of well known brands the header picture is screened against
 * (AUTO-220). DATA ONLY; the matching rules are in brand-screen.ts.
 *
 * WHERE IT COMES FROM. Written by hand for AUTO-220 (2026-11-14), from three
 * sources: (1) every real brand the image tests actually met on a supplier
 * photo or a generated picture (CHECK-openai-image-api, CHECK-image-brief-26,
 * AUTO-209 Part 6 and AUTO-212 Part 4: Delta, Sprint, Virgin Mobile, Wal-Mart,
 * Bud Light, U.S. Cellular, Wells Fargo, Sun Life, Sentara, WebTrends,
 * Swarovski, AdvoCare, Dunlop, Duluth Trading and the rest); (2) the national
 * and global names a reader would recognise at a glance, by sector: retail,
 * food and drink, cars and fuel, banks and insurers, airlines and travel,
 * phones and technology, clothing and consumer goods, media, sport, the
 * largest universities' cheers, and public bodies; (3) the product brands the
 * catalogue itself sells (Nike, Stanley, Bic), which count as a hit only when
 * the picture's own products are NOT that brand (brand-screen.ts allows a
 * product its own maker's name).
 *
 * WHO MAINTAINS IT. Whoever maintains the code: it is one line per name, in
 * this file, in all three repos. When Patrick sees a brand on a picture that
 * got through, the fix is to add the name here. It is not in Sanity on
 * purpose: a list he had to keep up himself would be a job, not a guard.
 *
 * WHAT IT CANNOT DO. It is a list. A regional bank, a hospital, a school or
 * a local firm that is not on it passes, and so does any logo with no
 * readable name that the reader does not recognise. It reduces the problem;
 * it does not end it (CLAUDE.md AUTO-220 has the measured numbers).
 *
 * TWO KINDS OF ENTRY:
 *   a plain name     matches anywhere in a piece of text, as whole words
 *                    ("Wells Fargo Home Mortgage" is a hit for Wells Fargo);
 *   "=name"          a name that is also an ordinary word or a surname
 *                    (Delta, Apple, Target, Chase, Ford): matches only when
 *                    it is the WHOLE text ("DELTA" on a pen is a hit, "Delta
 *                    Plumbing Supply" is not).
 */
export const KNOWN_BRANDS: readonly string[] = [
  // -- met in the image tests -----------------------------------------------
  '=Delta', 'Delta Air Lines', 'Delta Dental', '=Sprint', 'Virgin Mobile', '=Virgin', 'Walmart', 'Bud Light', 'US Cellular',
  'Wells Fargo', 'Sun Life', 'Sentara', 'WebTrends', 'Swarovski', 'AdvoCare', 'Dunlop', 'Duluth Trading', '=Duluth', "=Dunham's", '=Dunham',
  'Liberty Media', 'MidSouth Bank', 'Unity Bank and Trust', 'Great Lakes Cheese', 'Milwaukee Journal Sentinel', 'Swamp Head Brewery', 'WeylChem',
  'U Brands', 'Go Gators', 'Florida Gators',

  // -- phones, internet and technology ----------------------------------------
  '=Apple', 'iPhone', 'iPad', 'MacBook', 'Microsoft', 'Google', 'Gmail', 'YouTube', 'Facebook', 'Instagram', 'WhatsApp', '=Meta', 'TikTok', 'Snapchat',
  'LinkedIn', 'Twitter', 'Pinterest', 'Reddit', '=Amazon', 'Amazon Prime', 'Netflix', 'Spotify', 'Hulu', 'PayPal', 'Venmo', 'eBay', 'Etsy',
  'Airbnb', 'Uber', 'Lyft', 'DoorDash', 'Grubhub', 'Instacart', 'Salesforce', '=Adobe', '=Intel', 'Nvidia', 'Qualcomm', '=Cisco', '=IBM', '=HP',
  'Hewlett Packard', '=Dell', 'Lenovo', 'Samsung', 'Sony', 'Panasonic', 'Toshiba', 'Huawei', 'Motorola', 'Nokia', '=LG', 'Verizon', 'AT&T', '=ATT',
  'T-Mobile', 'Comcast', 'Xfinity', '=Spectrum', '=Cox', 'CenturyLink', 'Dish Network', 'DirecTV', 'Boost Mobile', 'Cricket Wireless', 'MetroPCS',
  '=Oracle', '=SAP', 'Tesla', 'SpaceX', 'Yahoo', '=Zoom', 'Dropbox', 'Xbox', 'PlayStation', 'Nintendo', 'GoPro', 'Fitbit', 'Garmin', 'Bose', '=JBL',
  'Beats by Dre', 'Skullcandy', 'Anker', 'Belkin', 'Logitech', '=Canon', '=Nikon', 'Kodak', 'Xerox', 'Epson', '=Brother', '=Android',

  // -- shops ----------------------------------------------------------------------
  '=Target', 'Costco', 'Kroger', 'Walgreens', '=CVS', 'CVS Pharmacy', 'Home Depot', "=Lowe's", 'Best Buy', "=Macy's", 'Nordstrom', "=Kohl's", 'JCPenney',
  '=Sears', 'Kmart', 'IKEA', 'Wayfair', 'Publix', 'Safeway', 'Albertsons', '=Aldi', 'Lidl', "Trader Joe's", 'Whole Foods', "Sam's Club", 'Dollar General',
  'Dollar Tree', 'Family Dollar', 'Big Lots', 'TJ Maxx', '=Marshalls', 'Old Navy', '=Gap', 'Banana Republic', '=H&M', '=Zara', 'Uniqlo', 'Forever 21',
  "Victoria's Secret", 'Bath & Body Works', 'PetSmart', 'Petco', 'AutoZone', "O'Reilly Auto Parts", 'Advance Auto Parts', 'NAPA Auto Parts', 'Pep Boys',
  '=Staples', 'Office Depot', 'OfficeMax', 'Hobby Lobby', 'Barnes & Noble', 'GameStop', 'Foot Locker', "Dick's Sporting Goods", 'Bass Pro Shops',
  "=Cabela's", '=REI', 'Tractor Supply', 'Ace Hardware', 'True Value', 'Menards', 'Harbor Freight', 'Sherwin-Williams', 'Benjamin Moore', '7-Eleven',
  'Circle K', '=Wawa', 'Sheetz', 'QuikTrip', 'RaceTrac', "Buc-ee's",

  // -- food and drink -----------------------------------------------------------
  'Coca-Cola', '=Coke', 'Pepsi', 'PepsiCo', 'Mountain Dew', 'Dr Pepper', '=Sprite', 'Fanta', 'Gatorade', 'Powerade', 'Red Bull', 'Monster Energy',
  'Starbucks', "Dunkin'", 'Dunkin Donuts', "McDonald's", 'Burger King', "=Wendy's", 'Taco Bell', '=KFC', '=Subway', 'Chick-fil-A', '=Chipotle', 'Chipotle Mexican Grill', "=Domino's", "Domino's Pizza",
  'Pizza Hut', "Papa John's", 'Little Caesars', 'Popeyes', "=Arby's", 'Dairy Queen', 'Panera', 'Olive Garden', "Applebee's", "=Chili's", 'IHOP', "=Denny's",
  'Waffle House', 'Cracker Barrel', 'Outback Steakhouse', 'Red Lobster', 'Buffalo Wild Wings', 'Hooters', 'Krispy Kreme', 'Baskin-Robbins',
  "Ben & Jerry's", 'Haagen-Dazs', 'Nestle', "=Hershey's", '=Hershey', "M&M's", 'Snickers', "=Reese's", 'Kit Kat', 'Oreo', 'Nabisco', '=Kraft', 'Heinz',
  "=Kellogg's", 'General Mills', 'Cheerios', 'Frito-Lay', 'Doritos', 'Pringles', "=Campbell's", "Campbell's Soup", 'Oscar Mayer', 'Budweiser', 'Miller Lite', 'Coors Light',
  '=Coors', '=Corona', 'Heineken', 'Guinness', 'Michelob', 'Anheuser-Busch', "Jack Daniel's", 'Jim Beam', 'Johnnie Walker', 'Smirnoff', 'Bacardi',
  'Absolut', 'Grey Goose', 'Jose Cuervo', 'White Claw',

  // -- cars, fuel and machines ---------------------------------------------------
  '=Ford', 'Chevrolet', '=Chevy', '=GMC', 'General Motors', 'Toyota', 'Honda', 'Nissan', 'Hyundai', '=Kia', 'Subaru', 'Mazda', 'Volkswagen', '=BMW',
  'Mercedes-Benz', '=Mercedes', '=Audi', 'Lexus', 'Acura', 'Cadillac', 'Buick', '=Jeep', '=Dodge', 'Chrysler', 'Volvo', 'Porsche', 'Ferrari',
  'Lamborghini', 'Harley-Davidson', 'Yamaha', 'Kawasaki', 'Goodyear', 'Michelin', 'Firestone', 'Bridgestone', 'Pirelli', 'John Deere', '=Caterpillar',
  'Kubota', 'U-Haul', 'Penske', '=Hertz', 'Enterprise Rent-A-Car', '=Avis', 'CarMax', 'Carvana', 'Jiffy Lube', 'Valvoline', 'Pennzoil', '=Mobil',
  'Exxon', 'ExxonMobil', '=Chevron', '=Shell', '=BP', 'Texaco', 'Citgo', 'Sunoco', 'Phillips 66', 'Conoco', 'Valero',

  // -- banks, cards and insurers -------------------------------------------------
  'Bank of America', '=Chase', 'JPMorgan', 'Citibank', '=Citi', 'Capital One', 'American Express', '=Amex', '=Visa', 'Mastercard',
  '=Discover', 'Goldman Sachs', 'Morgan Stanley', 'Charles Schwab', '=Fidelity', '=Vanguard', 'Edward Jones', 'Merrill Lynch', 'US Bank', 'PNC Bank',
  '=PNC', 'Truist', 'Regions Bank', 'TD Bank', 'Fifth Third', 'Huntington Bank', 'KeyBank', 'SunTrust', 'Navy Federal', '=USAA', 'State Farm',
  'Allstate', 'Geico', '=Progressive', 'Liberty Mutual', '=Nationwide', 'Farmers Insurance', 'Aflac', 'MetLife', 'Prudential', 'New York Life',
  'Northwestern Mutual', 'MassMutual', 'Blue Cross', 'Blue Shield', 'BlueCross BlueShield', 'Aetna', 'Cigna', 'Humana', 'UnitedHealthcare',
  'Kaiser Permanente', 'H&R Block', 'TurboTax', 'QuickBooks', 'Intuit', 'Western Union', 'MoneyGram', 'Zelle', 'Cash App',
  '=Robinhood', 'Coinbase',

  // -- airlines, travel, post and hotels -----------------------------------------
  'American Airlines', 'United Airlines', 'Southwest Airlines', 'JetBlue', 'Alaska Airlines', 'Spirit Airlines', 'Frontier Airlines', 'British Airways',
  'Lufthansa', '=Emirates', 'Air France', 'FedEx', '=UPS', '=USPS', '=DHL', 'Marriott', '=Hilton', 'Hilton Hotels', 'Hyatt', 'Holiday Inn', 'Best Western', 'Hampton Inn',
  'Sheraton', 'Westin', 'Ritz-Carlton', '=Four Seasons', 'Four Seasons Hotels', 'Motel 6', 'Disney', 'Disneyland', 'Universal Studios', 'SeaWorld', 'Six Flags',
  'Carnival Cruise', 'Royal Caribbean', 'Norwegian Cruise', 'Expedia', 'Tripadvisor', 'Amtrak', '=Greyhound',

  // -- clothing, sport and things people carry ------------------------------------
  'Nike', 'Adidas', 'Under Armour', '=Puma', 'Reebok', 'New Balance', '=Converse', '=Vans', 'Skechers', 'Asics', '=Fila', '=Champion', 'North Face',
  'Patagonia', 'Columbia Sportswear', 'Carhartt', "=Levi's", 'Wrangler', 'Ralph Lauren', 'Tommy Hilfiger', 'Calvin Klein', 'Gucci', 'Prada',
  'Louis Vuitton', '=Chanel', 'Burberry', 'Versace', 'Armani', '=Coach', 'Michael Kors', 'Kate Spade', 'Tiffany & Co', 'Rolex', 'Cartier', 'Ray-Ban',
  '=Oakley', 'Yeti', '=Stanley', 'Hydro Flask', 'Contigo', 'CamelBak', '=Thermos', 'Tervis', 'Rubbermaid', 'Tupperware', '=Igloo', '=Coleman', 'Zippo',
  '=Bic', 'Sharpie', 'Post-it', 'Crayola', 'Paper Mate', '=Pilot', '=Parker', 'Montblanc', 'Moleskine', '=3M', 'Duracell', 'Energizer',
  'Black & Decker', 'DeWalt', '=Craftsman', 'Makita', '=Bosch', 'Ryobi', 'Husqvarna', 'Stihl', 'KitchenAid', 'Whirlpool', 'Maytag', '=GE',
  'General Electric', 'Frigidaire', 'Dyson', 'Keurig', 'Nespresso', 'Vitamix', 'Cuisinart', 'Colgate', '=Crest', 'Oral-B', 'Listerine', 'Gillette',
  '=Dove', 'Olay', 'Pantene', "L'Oreal", 'Maybelline', 'Revlon', 'CoverGirl', 'Neutrogena', 'Johnson & Johnson', 'Band-Aid', 'Tylenol', 'Advil',
  '=Bayer', 'Pfizer', 'Moderna', 'Merck', 'Rite Aid', 'Procter & Gamble', 'Unilever', 'Clorox', 'Lysol', '=Tide', 'Febreze', 'Kleenex', 'Huggies',
  'Pampers', 'Lego', 'Mattel', 'Hasbro', 'Barbie', 'Hot Wheels', 'Fisher-Price', '=Wilson', 'Spalding', 'Rawlings', 'Titleist', 'Callaway',
  'TaylorMade', 'Louisville Slugger', 'Peloton', 'Planet Fitness', 'LA Fitness', "Gold's Gym", 'Anytime Fitness', 'Orangetheory', 'CrossFit', 'YMCA',
  'Weight Watchers', 'Herbalife', 'Amway', 'Mary Kay', 'Koozie', '=New Era', '=Richardson', '=Port Authority', 'Gildan', 'Hanes', 'Jerzees',
  'Eddie Bauer', 'Cutter & Buck', 'OGIO', 'Samsonite', 'Leatherman', 'Maglite', 'Victorinox', 'Swiss Army', 'Nalgene', '=Pelican', 'RTIC',

  // -- media, leagues and events ----------------------------------------------------
  '=NFL', '=NBA', '=MLB', '=NHL', 'NCAA', 'NASCAR', 'PGA Tour', '=PGA', 'FIFA', '=UFC', '=WWE', 'ESPN', 'Fox News', '=CNN', '=NBC', '=CBS', '=HBO',
  'Warner Bros', '=Marvel', 'Star Wars', 'Pixar', 'DreamWorks', 'Nickelodeon', 'Cartoon Network', 'Pokemon', 'Minecraft', 'Fortnite', 'Super Bowl',
  'Olympic Games', '=Olympics', 'World Series', 'March Madness', 'Kentucky Derby', 'New York Times', 'Wall Street Journal', 'USA Today',
  'Washington Post', '=Forbes',

  // -- the largest universities and their cheers ------------------------------------
  'Roll Tide', 'Crimson Tide', 'War Eagle', "Hook 'em Horns", 'Texas Longhorns', 'Go Dawgs', 'Georgia Bulldogs', 'Geaux Tigers', 'LSU Tigers',
  '=Ohio State', 'Ohio State University', 'Ohio State Buckeyes', '=Buckeyes', 'Michigan Wolverines', 'Fighting Irish', '=Notre Dame', 'University of Notre Dame', 'Penn State', 'Nittany Lions', 'Boiler Up', "Gig 'em Aggies",
  'Boomer Sooner', 'Florida State University', 'Florida State Seminoles', 'Go Noles', 'Clemson Tigers', 'Tar Heels', 'Duke Blue Devils', 'Duke University', 'Harvard', '=Yale', 'Stanford',
  '=Princeton', '=MIT', '=UCLA', 'USC Trojans', 'University of Florida', 'University of Alabama', 'University of Texas', 'University of Michigan',

  // -- public bodies, charities and health systems -----------------------------------
  'US Army', 'US Navy', 'US Air Force', 'US Marine Corps', '=FBI', '=CIA', 'NASA', '=IRS', 'Red Cross', 'Salvation Army', 'United Way',
  'Habitat for Humanity', 'Boy Scouts of America', 'Girl Scouts', '=AARP', '=NRA', 'UNICEF', "St. Jude Children's", 'Make-A-Wish', 'Susan G. Komen',
  'March of Dimes', 'Special Olympics', 'Rotary International', 'Mayo Clinic', 'Cleveland Clinic', 'Johns Hopkins', 'HCA Healthcare', 'AdventHealth',
];
