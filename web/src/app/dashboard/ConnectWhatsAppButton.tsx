"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    FB?: {
      init: (params: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        params: {
          config_id: string;
          response_type: "code";
          override_default_response_type: true;
          extras: { setup: Record<string, never> };
        },
      ) => void;
    };
  }
}

// Embedded Signup (DEP-1 cleared 2026-09-08) — unlike Instagram's plain
// redirect-based OAuth (a single <Link> to connect/route.ts), WhatsApp's
// flow runs inside a Facebook-hosted popup via the JS SDK and hands back
// its result two different ways that can arrive in either order: a
// `window.postMessage` carrying `waba_id`/`phone_number_id` (from the
// popup, before it closes) and an `FB.login` callback carrying a
// ~30-second-lived `code` (after it closes). Both are required before the
// backend exchange can happen, so they're held in state and only posted
// once both have arrived — confirmed against Meta's current Embedded
// Signup docs during this build, not assumed from a generic OAuth shape.
export function ConnectWhatsAppButton({ appId, configId }: { appId: string; configId: string }) {
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState<"idle" | "waiting" | "connecting" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const signupData = useRef<{ wabaId?: string; phoneNumberId?: string }>({});
  const code = useRef<string | undefined>(undefined);

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

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Meta's own documented origin for Embedded Signup postMessage events.
      if (event.origin !== "https://www.facebook.com") return;
      let data: { type?: string; event?: string; data?: { waba_id?: string; phone_number_id?: string } };
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;

      if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
        signupData.current = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id };
        maybeSubmit();
      } else if (data.event === "CANCEL") {
        setStatus("error");
        setMessage("WhatsApp connection was cancelled.");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function maybeSubmit() {
    if (!code.current || !signupData.current.wabaId || !signupData.current.phoneNumberId) {
      setStatus("waiting");
      return;
    }
    setStatus("connecting");
    fetch("/api/channels/whatsapp/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code.current,
        wabaId: signupData.current.wabaId,
        phoneNumberId: signupData.current.phoneNumberId,
      }),
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
        setMessage("Could not complete WhatsApp connection.");
      });
  }

  function startSignup() {
    if (!window.FB) return;
    setStatus("waiting");
    setMessage(null);
    code.current = undefined;
    signupData.current = {};
    window.FB.login(
      (response) => {
        code.current = response.authResponse?.code;
        maybeSubmit();
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {} },
      },
    );
  }

  return (
    <div style={{ margin: "0.5rem 0" }}>
      <button className="btn btn--primary" disabled={!sdkReady || status === "connecting"} onClick={startSignup}>
        {status === "connecting" ? "Connecting…" : status === "waiting" ? "Waiting for Meta…" : "Connect WhatsApp"}
      </button>
      {message && <p className="meta">{message}</p>}
    </div>
  );
}
