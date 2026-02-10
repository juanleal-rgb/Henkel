/** @type {import('next').NextConfig} */
const nextConfig = {
  // Note: standalone output disabled due to Next.js bug with route groups
  // https://github.com/vercel/next.js/issues/58136
  // Railway deploys work fine without standalone mode
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: [
        {
          loader: "@svgr/webpack",
          options: {
            ref: true,
            svgoConfig: {
              plugins: [
                {
                  name: "preset-default",
                  params: {
                    overrides: {
                      removeViewBox: false,
                      mergePaths: false,
                      collapseGroups: false,
                    },
                  },
                },
              ],
            },
          },
        },
      ],
    });
    return config;
  },
};

export default nextConfig;
