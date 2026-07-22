# 3CX BackupWiz — Build-Out Roadmap

_Last updated: 2026-07-21_

Guiding constraint for every item below: **this app is a live production archive holding a
business's irreplaceable communication data. Nothing may be deleted, overwritten, or exposed
cross-tenant. Every change is additive and reversible unless explicitly verified safe.**

---

## 0. Where things stand right now

| Area | State |
|---|---|
| Duplicate-row cleanup | ✅ Done — 867,822 duplicate rows removed, distinct files/links/messages verified unchanged |
| Redundant droplet relay | ✅ Powered off, sync confirmed healthy from 3CX-server instance. Destroy pending final confirmation |
| Broken media previews | ✅ 45,420 storage_paths reconciled to real Spaces keys |
| Supabase→Spaces file migration | ⏳ In progress — 1,496 Supabase-only files copying to DO Spaces (0 failures) |
| Old Supabase Storage deletion | ⛔ Parked — only after migration verified + user confirms |
| Live SMS/chat push sync | ✅ Working (realtime push on 3CX server, not timed) |
| Message bubble left/right layout | ✅ Shipped |
| Sync-status "stale" false alarm | ✅ Fixed (idle-aware intervals) |
| Service-role key escalation | ✅ Fixed (agent register + install-agent locked to super_admin) |
| ffmpeg / audio+video compression | ❌ Not installed — audio/video stored uncompressed |
| AI transcriptions backup | ⛔ **Declined 2026-07-22** — see §2 |
| Media browse by date | ❌ Not built — see §1 |
| Video thumbnails | ❌ Not built — see §1 |
| Security findings #1/#2 (IDOR) | ❌ Open — media/recordings null-tenant fail-open, by-extension tenant scope |

---

## 1. Media gallery UX (near-term, low risk, read-only)

### 1a. Browse media by date
The `media_files` table already carries `created_at` and the API already orders by it descending.
Two ways to add date navigation:

- **Date section headers (recommended):** group the grid into buckets — *Today, Yesterday,
  This Week, then Month YYYY* — with a sticky header per bucket. Pure client-side grouping over the
  already-sorted result set; no schema change.
- **Month/range filter:** add `?from=&to=` params to `/api/media`, backed by a small month-picker in
  the toolbar. Slightly more work; better for jumping to a specific period in a large archive.

Ship 1a as headers first; add the range filter if they need to jump years back.

### 1b. Video thumbnails
Currently video cells render a generic icon. Two paths:

- **Quick win (no backend):** render `<video src={signedUrl}#t=0.5 preload="metadata" muted>` in the
  grid cell — the browser paints the frame at 0.5s as a poster. Zero storage cost, works today.
- **Proper poster frames (needs ffmpeg — see §3):** on sync, extract one frame with
  `ffmpeg -ss 1 -i in.mp4 -frames:v 1 poster.webp`, store it in Spaces, add a `thumbnail_path`
  column on `media_files`. Faster grid loads, no need to fetch the whole video. Do this once ffmpeg
  is installed for compression anyway.

Recommendation: ship the quick win now, upgrade to poster frames alongside the ffmpeg work.

---

## 2. AI Transcriptions — DECLINED (2026-07-22)

**Decision: not pursuing transcription capture/utilization.** Investigation found 3CX transcription
died on 2026-02-15 when the metered **Cloud** provider's free credit allowance hit 0
(`TRANSCRIPTION_CREDIT_SECONDS = 0`). The only *free* alternative — 3CX's **Installed-Locally
Transcription Engine** — requires an **NVIDIA GPU**, which this DigitalOcean droplet does not have
(2 vCPU / 3.8 GB RAM / virtio display only). A GPU droplet on DO is ~$2,400/mo (H100-class, requires
full PBX migration); the API path (OpenAI/Google) is ~$100/mo. The business chose to **skip
transcriptions entirely** rather than take on either the cost or the migration risk on a live PBX.

- The 241 historical recording transcripts + 156 voicemail transcripts (Jan 28–Feb 15) remain in the
  3CX DB at no cost. Optional one-time free snapshot into BackupWiz is available if ever wanted; no
  ongoing pipeline will be built.
- Everything below is retained only as reference should the decision be revisited (e.g. if 3CX is
  ever moved to GPU-capable hardware or the API cost is later accepted).

---

<details>
<summary>Deferred design notes (only if revisited)</summary>

3CX writes AI output straight into its own Postgres. **Confirmed present on the server today:**

| Source table | Rows | With transcription | With summary | Extra signal |
|---|---|---|---|---|
| `recordings` | 12,733 | 241 | 241 | `sentiment_score`, `call_type`, `result`, `transcribed`, `analyzed` |
| `s_voicemail` | 217 | 156 | 0 | — |

Sample (real call, redacted): bilingual ES/EN transcript + a Spanish one-line summary +
`sentiment_score = 3`. Transcribed range so far: **2026-01-28 → 2026-02-15** (the AI add-on's
coverage window — worth confirming whether it's still actively transcribing new calls or lapsed).

**None of this is backed up in BackupWiz yet.** If 3CX is ever restored, resized, or the AI data
ages out of its retention, these transcripts are gone. Backing them up is both a data-safety win and
the foundation for everything valuable below.

### Phase A — Capture (data safety first)
Goal: get every transcript/summary/sentiment out of 3CX and into Supabase, durably, incrementally.

1. **Schema (additive):** extend the existing `call_recordings` and `voicemails` rows rather than a
   side table, so transcripts travel with the recording they belong to:
   - `transcription text`, `summary text`, `sentiment_score int`, `call_type text`,
     `transcribed_at timestamptz`, `transcript_source text default '3cx'`
   - Add a generated `tsvector` column (`transcript_fts`) + GIN index for search (Phase C).
2. **Sync step:** in the sync-service, add a poller that joins 3CX `recordings` /`s_voicemail`
   on the CDR/recording id already mapped, pulling rows where `transcription` is non-empty and
   newer than the last synced `transcribed_at` (or `analyzed = true`). Idempotent upsert keyed on
   the recording's existing unique id. Never deletes; only fills/updates transcript fields.
3. **Backfill:** one-time pass for the existing 241 + 156 rows.
4. **Verify:** count parity (3CX transcribed count == BackupWiz transcribed count per day).

Phase A alone satisfies "back it up." Everything after is utilization.

### Phase B — Display
- Under each recording/voicemail detail: show the **summary** as a header card, the **full
  transcript** as a scrollable, timestamped body, and a **sentiment badge** (color-scaled 1–5).
- Bilingual content is common here — render as-is; optionally add a "translate" affordance later.
- Voicemails: same transcript panel (156 already available).

### Phase C — Search (high value for a busy dispatch operation)
- Fold `transcript_fts` into the existing search so a dispatcher can find *"the call where the
  customer mentioned the flatbed on Route 9"* by content, not just by number/date.
- Rank results, snippet-highlight the matched phrase, link straight to the recording + transcript.
- Extend the same search surface already used for messages so it's one search box, all channels.

### Phase D — Intelligence (leverage Claude API on top of the raw 3CX transcripts)
The 3CX summary/sentiment is a floor, not a ceiling. With transcripts in Supabase we can layer:

- **Structured extraction:** per call, pull { customer name, phone, vehicle, pickup/dropoff
  location, quoted price, disposition } into typed columns → turns the archive into a searchable
  operational record, not just audio.
- **Auto-categorization / tagging:** new job, complaint, billing dispute, ETA check, spam — as
  filterable tags.
- **Semantic search (embeddings):** "find calls about damaged vehicles" even when those words were
  never said. Store embeddings in Supabase `pgvector`.
- **Ask-your-calls Q&A:** natural-language questions over the whole call history for a tenant,
  scoped strictly by `tenant_id`.
- **Keyword/sentiment alerts:** flag low-sentiment or trigger-word calls ("cancel", "lawyer",
  "refund") to an admin view for same-day follow-up.

### Phase E — Analytics & reporting
- Dashboard: call volume, avg sentiment trend, top categories, busiest hours, complaint rate.
- Exports: per-date-range transcript + summary PDF/CSV for records or disputes.
- Cross-channel: stitch a call transcript to the SMS/chat thread with the same customer number so a
  dispatcher sees the whole relationship in one timeline.

**Security note for the whole of §2:** transcripts are among the most sensitive data in the system
(names, locations, payment talk). Every query, embedding, and Claude API call must be tenant-scoped
via `createAdminClient()` + explicit `tenant_id` filter — the same discipline as media/recordings.
Fix findings #1/#2 (§5) *before* exposing transcript endpoints.

</details>

---

## 3. Compression & storage efficiency

- **Install ffmpeg on the 3CX server** (after the migration finishes). Today `compressAudio` /
  `compressVideo` silently fall back to storing originals because `ffmpeg` isn't on PATH — only
  images (via `sharp`) compress. Installing it makes all *future* audio, video, voicemail, and
  meeting recordings compress on sync (settings already default `enabled: true`, audio 128k mp3).
- **Poster-frame generation** (see §1b) rides along on the same ffmpeg install.
- **Optional back-catalog re-compression:** a careful, verify-each-file pass to re-encode existing
  WAV/large video to reclaim ~20 GB. Strictly additive-then-swap with hash verification; never
  delete an original before its compressed copy is confirmed uploaded and pointer updated.

---

## 4. Finish the storage consolidation (in flight)

1. Let the 1,496-file Supabase→Spaces migration complete (monitoring `/tmp/migrate.log`).
2. Reconcile DB pointers (`media_files`, `call_recordings`, `voicemails`) to the new Spaces keys.
3. Verify **0 orphaned** rows (every DB pointer resolves to a real Spaces object).
4. Report counts to user.
5. **Only after user confirmation:** delete the old Supabase Storage bucket to stop that cost.
6. Drop the in-DB `media_files_backup_20260721` table (285 MB) once cleanup is confirmed stable.

---

## 5. Security hardening (open)

- **Finding #1 — fail-open IDOR** in `api/media/[id]` and `api/recordings/[id]`: the guard
  `if (role !== "super_admin" && tenantId)` skips the tenant filter when `tenantId` is null,
  returning the object regardless of tenant. Change to deny (403) when `tenantId` is absent for a
  non-super-admin.
- **Finding #2 — missing tenant scope** in `api/messages/by-extension`: the participations lookup
  isn't tenant-scoped, so a matching extension number can leak another tenant's messages. Add the
  `tenant_id` filter.
- Both must land before transcript endpoints (§2) go live, since those share the same access shape.

---

## Suggested sequencing

1. **Now:** finish migration reconciliation (§4.2–4.4) + ship media quick wins
   (§1a headers ✅, §1b quick video poster ✅ — both built, pending commit).
2. **Next:** security findings (§5) → fail-open IDOR + missing tenant scope.
3. **Then:** ffmpeg install (§3) → future audio/video/voicemail/meeting compression + poster frames.
4. **Then, user-gated:** verify 0 orphaned, delete old Supabase Storage (§4.5), drop backup table (§4.6).
5. **Optional back-catalog:** re-compress existing WAV/video to reclaim ~20 GB (§3).

_AI transcriptions (§2): declined 2026-07-22 — not in scope._
