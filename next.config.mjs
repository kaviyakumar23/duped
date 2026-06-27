/** @type {import('next').NextConfig} */
const nextConfig = {
  // The AWS SDK + DSQL connector are server-only native-ish deps; keep them external
  // to the server bundle so Next doesn't try to bundle pg / signer internals.
  serverExternalPackages: [
    "pg",
    "@aws/aurora-dsql-node-postgres-connector",
    "@aws-sdk/dsql-signer",
  ],
};

export default nextConfig;
