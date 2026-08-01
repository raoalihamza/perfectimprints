import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'imgsirv.geiger.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.sanity.io',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    optimizePackageImports: ['sanity', '@sanity/client', '@sanity/image-url'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        // Private customer quotes (Q-140). The page already emits
        // `robots: index/follow false` in its metadata; this is the same
        // instruction at the HTTP level, so a crawler that fetches the URL
        // without parsing the HTML still gets it. Deliberately a DIFFERENT
        // header key from the site-wide block above, so nothing is emitted
        // twice and the global Referrer-Policy is not shadowed here (the
        // quote page tightens that to no-referrer via its own page metadata,
        // which overrides the header for that document).
        //
        // robots.txt is deliberately NOT used for this - see the note in
        // app/robots.ts.
        source: '/quote/:token*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
    ];
  },

  //    PART 2: Vercel domain settings (tumhe khud karna hai)
  //   Code- level redirect zaruri hai but Vercel pe bhi same redirect set karna chahiye.Reason: Vercel domain level pe redirect zyada fast hota hai (network edge pe handle hota hai before request hits Next.js), aur backup ke taur pe kaam karta hai.
  //     Steps:

  // Vercel project → Settings → Domains
  // Tumhare paas eventually dono domains add hone chahiye:

  // www.perfectimprints.com(primary)
  // perfectimprints.com(redirect)



  // Production launch ke time yeh karna hai(abhi dev.use kar rahe ho to skip karo, sirf yaad rakho):

  // www.perfectimprints.com add karo as primary domain.Vercel pucchega "Redirect to" — yahan "No redirect" select karna(kyunki yeh khud primary hai)
  // perfectimprints.com add karo(apex).Vercel automatically pucchega:

  // "Redirect to which domain?"

  // Yahan dropdown se www.perfectimprints.com select karo, aur 301(Permanent) chuno.
  // Vercel automatically yeh setup kar dega aur DNS instructions dikhayega apex ke liye, jo Cloudflare mein jaisey CNAME hi add karna hota hai(ya A record if CNAME flattening na ho).
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'perfectimprints.com',
          },
        ],
        destination: 'https://www.perfectimprints.com/:path*',
        permanent: true,
      },
      // Canonicalize /cat/<slug>/page/1 -> /cat/<slug>. Page 1 has no /page/N suffix.
      {
        source: '/cat/:path*/page/1',
        destination: '/cat/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
