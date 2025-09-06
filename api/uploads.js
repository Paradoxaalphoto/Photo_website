import { put, list } from "@vercel/blob";
const PREFIX = "uploads/";
export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const l = await list({ prefix: PREFIX, limit: 20 });
      const items = [];
      for (const b of l.blobs || []) {
        const r = await fetch(b.url);
        const entry = await r.json().catch(() => null);
        if (entry) items.push(entry);
      }
      res.status(200).json({ ok: true, uploads: items });
    } else if (req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      const entry = { id: "scan_" + Date.now(), time: new Date().toISOString(), filename: body.filename || "user_upload.jpg", metrics: body.metrics || {} };
      const key = `${PREFIX}${entry.id}.json`;
      await put(key, JSON.stringify(entry, null, 2), { addRandomSuffix: false, access: "public", contentType: "application/json" });
      res.status(201).json({ ok: true, entry });
    } else { res.status(405).json({ ok: false, error: "Method not allowed" }); }
  } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
}