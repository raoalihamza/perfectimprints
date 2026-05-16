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
    ];
  },
};

export default nextConfig;
