"use client";

import { useState } from "react";
import { Copy, MessageSquare } from "lucide-react";

/**
 * Copies the tokenized owner link / a ready-to-send reminder for the shop
 * owner. The link and message are built server-side (the HMAC never reaches
 * the browser until the admin copies it).
 */
export function OwnerLinkButtons({ link, reminder }: { link: string; reminder: string }) {
  const [copied, setCopied] = useState<"link" | "msg" | null>(null);

  const copy = async (value: string, which: "link" | "msg") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn" type="button" onClick={() => void copy(link, "link")}>
        <Copy size={13} /> {copied === "link" ? "Copied — send it to the shop" : "Copy owner link"}
      </button>
      <button className="btn" type="button" onClick={() => void copy(reminder, "msg")}>
        <MessageSquare size={13} /> {copied === "msg" ? "Copied!" : "Copy payment reminder"}
      </button>
    </div>
  );
}
