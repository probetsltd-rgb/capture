"use client";

import { useEffect, useState } from "react";
import type { FacebookSdk } from "@/types/facebook-sdk";

declare global {
  interface Window {
    FB?: FacebookSdk;
  }
}

// Facebook Login for Business (OUTSTANDINGS.md "Channel roadmap confirmed
// 2026-09-08"). Simpler than ConnectWhatsAppButton's flow: Page connect
// needs no out-of-band postMessage metadata (WhatsApp's waba_id/
// phone_number_id equivalent) — the FB.login callback's code alone is
// enough for the backend to derive everything else (User token -> Page
// list -> Page token), so there's no two-channel-arriving-in-either-order
// reconciliation to do here.
export function ConnectFacebookButton({ appId, configId }: { appId: string; configId: string }) {
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (window.FB) {
      setSdkReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.onload = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v25.0" });
      setSdkReady(true);
    };
    document.body.appendChild(script);
  }, [appId]);

  function startLogin() {
    if (!window.FB) return;
    setStatus("connecting");
    setMessage(null);
    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setStatus("error");
          setMessage("Facebook connection was cancelled.");
          return;
        }
        fetch("/api/channels/facebook/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        })
          .then((res) => res.json())
          .then((result: { ok: boolean; message: string }) => {
            setMessage(result.message);
            if (result.ok) {
              window.location.reload();
            } else {
              setStatus("error");
            }
          })
          .catch(() => {
            setStatus("error");
            setMessage("Could not complete Facebook connection.");
          });
      },
      { config_id: configId, response_type: "code", override_default_response_type: true },
    );
  }

  return (
    <div style={{ margin: "0.5rem 0" }}>
      <button className="btn btn--primary" disabled={!sdkReady || status === "connecting"} onClick={startLogin}>
        {status === "connecting" ? "Connecting…" : "Connect Facebook"}
      </button>
      {message && <p className="meta">{message}</p>}
    </div>
  );
}
