// Shared shape for Meta's JS SDK (connect.facebook.net/en_US/sdk.js),
// used by both ConnectWhatsAppButton.tsx and ConnectFacebookButton.tsx.
// A plain module (not an ambient .d.ts) exporting one type, imported by
// each consumer's own `declare global { interface Window { FB?: FacebookSdk } }`
// — TypeScript requires every such augmentation of the same interface to
// be structurally identical, and importing the same named type from one
// place is what guarantees that, rather than two files drifting into
// separately-typed but incompatible shapes. (An ambient, import-free
// `declare global` in its own standalone .d.ts was tried first and did not
// reliably merge across files under this project's tsconfig — this
// explicit-import form is the more standard, always-working pattern.)
export type FacebookSdk = {
  init: (params: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
  login: (
    callback: (response: { authResponse?: { code?: string } }) => void,
    params: {
      config_id: string;
      response_type: "code";
      override_default_response_type: true;
      extras?: { setup: Record<string, never> };
    },
  ) => void;
};
