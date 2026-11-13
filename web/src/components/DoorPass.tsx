import { useEffect, useState } from "react";
import { motion } from "motion/react";
import QRCode from "qrcode";
import { api } from "../lib/api";
import { Button } from "./ui";

// Full-screen ticket QR for the door. The code is fetched fresh and replaced every
// 45 seconds, so a screenshot stops working within a minute.
export function DoorPass({ eventId, name, onClose }: { eventId: string; name: string; onClose: () => void }) {
  const [img, setImg] = useState("");
  const [error, setError] = useState("");
  const [left, setLeft] = useState(0);

  useEffect(() => {
    let stop = false;
    let expires = 0;
    async function refresh() {
      try {
        const pass = await api.ticketPass(eventId);
        expires = new Date(pass.expiresAt).getTime();
        const url = await QRCode.toDataURL(pass.code, { margin: 1, width: 520, errorCorrectionLevel: "M" });
        if (!stop) {
          setImg(url);
          setError("");
        }
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "Couldn't load your ticket code");
      }
    }
    void refresh();
    const swap = setInterval(refresh, 45_000);
    const count = setInterval(() => setLeft(Math.max(0, Math.round((expires - Date.now()) / 1000))), 1000);
    return () => {
      stop = true;
      clearInterval(swap);
      clearInterval(count);
    };
  }, [eventId]);

  return (
    <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section
        className="sheet stack"
        role="dialog"
        aria-label={`Door code for ${name}`}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        style={{ alignItems: "center", textAlign: "center", gap: 12 }}
      >
        <h2>{name}</h2>
        <p className="muted">Show this at the door. Turn your screen brightness up.</p>
        <div style={{ width: "min(78vw, 300px)", aspectRatio: "1", border: "3px solid #000", borderRadius: 22, background: "#fff", display: "grid", placeItems: "center", overflow: "hidden" }}>
          {img ? <img src={img} alt="Ticket QR code" style={{ width: "92%", height: "92%" }} /> : <p className="muted">{error || "Loading"}</p>}
        </div>
        {img && <p style={{ fontWeight: 800 }}>{left > 0 ? `New code in ${left}s. Screenshots won't work.` : "Refreshing"}</p>}
        <Button variant="ghost" block onClick={onClose}>
          Done
        </Button>
      </motion.section>
    </motion.div>
  );
}
