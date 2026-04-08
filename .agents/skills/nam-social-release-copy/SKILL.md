---
name: nam-social-release-copy
description: Draft succinct user-facing release announcements and social media posts from repo changes, changelog entries, and prior announcement context. Use when Codex needs to write short launch copy, update posts, release blurbs, or community announcements that summarize what changed since the last announced version while preserving an established voice.
---

# Social Release Copy

## Overview

Use this skill to turn repo release history into short, post-ready announcement copy. Prefer plain language, compact structure, and real feature deltas over hype.

## Workflow

1. Read the relevant release context before drafting.
   Check `CHANGELOG.md`, `README.md`, and any user-provided prior announcement copy or screenshots.
2. Compare the current release against the last announced version named by the user.
   Focus on what actually changed since that prior public post, not just the latest patch.
3. Pick the two to four highest-signal updates.
   Favor new capabilities, notable workflow improvements, and meaningful contributor credit.
4. Draft four variants the user can post with minimal editing.
   Keep the meaning aligned across variants, but vary length and structure.
5. Treat the recap as a delta from the last announced version.
   Do not restate baseline app features unless they were materially upgraded in that release window.

## Voice Rules

- Write like an informed builder talking to users, not a marketer.
- Keep the tone direct, positive, and grounded.
- Prefer short paragraphs and tight bullets over long promo copy.
- Default to the original NAM-BOT announcement shape when the user wants continuity:
  a short intro, one compact framing paragraph, then a bullet-pointed recap of the main updates.
- Avoid filler like `excited`, `thrilled`, `game changer`, or `next level` unless the user explicitly wants that style.
- For NAM-BOT release announcements, keep the robot emoji before the repo link unless the user asks to remove it.
- Default to no hashtags unless the user asks for them.
- Mention contributor names when their work is a meaningful part of the release.
- Do not overclaim support levels. If macOS is stable but unsigned, say that plainly instead of implying notarization.

## NAM-BOT Specific Guidance

- Treat the repo as a desktop frontend for local Neural Amp Modeler training.
- Reuse the project's plainspoken framing: easier setup, clearer diagnostics, queueing, presets, and live logs.
- If the delta includes platform work, call out the practical user impact:
  Mac users now have packaged builds, better Conda detection, and platform-aware setup guidance.
- If macOS is included, mention Alex by name when the thread or release context identifies him as the contributor.
- Do not imply signed or notarized macOS builds unless the repo or user explicitly confirms that.

## Output Format

Produce exactly these sections unless the user asks for a different format:

### 1. Main Post

- Around 100 to 160 words.
- Best fit for Facebook, Discord, forum posts, or a GitHub release blurb.
- Default structure: intro sentence, one short paragraph, then 3 to 5 bullets.
- Bullets should describe release-to-release changes, not evergreen product capabilities.

### 2. Short Post

- Around 50 to 90 words.
- Keep it concise but still mention the main release delta.
- Use bullets when they help clarity and still fit the length.

### 3. Micro Post

- One compact paragraph.
- Best fit for tighter social surfaces.

### 4. One-Liner

- One sentence.
- Use as a lead-in, cross-post teaser, or release headline.

## Closing Rule

- End every finished post variant with the repo link when the post is meant to be user-facing.
- For NAM-BOT social posts, use this closing format unless the user asks otherwise:
  `🤖 https://github.com/daveotero/NAM-BOT`

## Content Priorities

When choosing what to mention, prefer this order:

1. New platform availability or major capability additions.
2. Improvements that make setup or training materially easier.
3. Quality-of-life workflow changes users will feel quickly.
4. Contributor credit.

Do not list every change. Summarize the release like a person would.
When using bullets, make each bullet represent a meaningful user-facing improvement rather than a low-level implementation detail.
Exclude stable baseline features like queueing, presets, logs, or diagnostics unless the release window meaningfully changed them.

## Accuracy Checks

- Anchor claims to actual repo changes.
- If comparing from an older announced version, include important deltas from every intervening release, not just the latest tag.
- If the release contains prerelease or preview-only support, say that plainly.
- If the user names a prior post as the tone reference, preserve its structure and restraint rather than rewriting into a different brand voice.
