# App Store metadata — drafts

Companion to `app-store-readiness.md`. Everything here is copy-paste
material for App Store Connect once the developer account exists.

## App name strategy (avoiding trademark/naming pitfalls)

Not legal advice — but the practical, low-risk pattern:

**Personal name + plainly descriptive words.** "Jay's Scale Practice"
is about as safe as app naming gets: descriptive terms ("piano",
"scale", "practice") aren't protectable by anyone individually, your
own name is yours to use, and the combination doesn't evoke any famous
mark. Trademark rights are also class-specific — "JSP" the acronym
collides with JavaServer Pages in *software developer* mindshare, but
that's a different goods/services class from a piano-education app;
the real problems with bare "JSP" are App Store ones, not legal ones:
3-letter names are almost certainly taken (ASC requires exact-name
uniqueness), it reads as generic (Guideline 2.3.7), and it's
unsearchable.

**Split the two names.** The ASC *App Name* (what's searchable, must
be unique, ≤30 chars) and the on-device *display name* under the icon
(`CFBundleDisplayName`, no uniqueness rule) are independent. Keep the
tidy **JSP** under the icon; use the descriptive name in the store.

**Knock-out screening before committing** (15 minutes, no lawyers):
1. App Store search for the exact name + close variants — check the
   Music/Education categories for anything confusingly similar.
2. Plain web search for the phrase.
3. Exact-phrase search at USPTO (tmsearch.uspto.gov) and UK IPO /
   EUIPO if relevant, classes 9 (software), 41 (education),
   42 (SaaS). Looking only for live identical/near-identical marks.
4. If all quiet — proceed. A descriptive personal-name title that
   passes this screen carries minimal practical risk.

**Avoid in the name**: third-party music brands (Yamaha, Roland,
Casio, Steinway, ABRSM, Trinity, Suzuki…), Apple platform names
("iPad"/"iOS" — say it in the description instead), superlatives,
and pricing words.

**Reserve early**: the name is only locked when the app record is
created in ASC — do that as soon as the developer account is live.

### Candidates (ASC App Name, ≤30 chars)
1. **Jay's Scale Practice** (20) — primary
2. JSP: Piano Scale Practice (25) — keeps the acronym discoverable
3. Jay's Piano Scales (18) — fallback

### Subtitle candidates (≤30 chars)
- "Piano scale trainer with MIDI" (29)
- "Real-time piano scale coach" (27)

## Description (draft)

Master your scales — with real feedback.

Jay's Scale Practice (JSP) turns your iPad into a piano scale coach.
Connect a USB MIDI keyboard and the app listens to every note: it
prompts the next key and fingering, catches wrong notes the moment
they happen, and scores each run for precision, rhythm and hand
synchronisation.

No keyboard handy? Practice anywhere by tapping the on-screen keys.

FEATURES
- 48 scales: 12 keys × Major, Natural, Harmonic and Melodic Minor
- Printed grand-staff score with live note highlighting and fingering
- Left hand, right hand, or both hands together
- Free play, or Timed mode with metronome and early/late feedback
- Once, Loop, or Cycle through every key (random or circle of fifths)
- Completion stats: score, precision, mistakes, sync, rhythm
- Automatic keyboard range calibration — from 25-key to 88-key
- Works completely offline. No account, no ads, no data collection.

WORKS WITH
- Any class-compliant USB MIDI keyboard (via the iPad's USB-C port)
- Or the built-in on-screen keyboard — no hardware required

## Keywords (≤100 chars)

`piano,scales,practice,midi,keyboard,music,theory,fingering,metronome,trainer,lessons`

(84 chars. Don't repeat the app name — ASC indexes it automatically.)

## App Review notes (draft)

> Jay's Scale Practice is a piano scale trainer. No account, sign-in,
> or demo credentials are required.
>
> TESTING WITHOUT HARDWARE (recommended): the app is fully functional
> with no accessories. From launch, tap the highlighted keys on the
> on-screen piano at the bottom of the screen — the lesson advances
> exactly as with a physical keyboard. Every feature (scale selection,
> hand modes, Timed mode with metronome, completion scoring,
> Loop/Cycle) can be exercised this way.
>
> TESTING WITH HARDWARE (optional): connect any class-compliant USB
> MIDI keyboard to the iPad's USB-C port, tap "Connect MIDI", and
> follow the one-time two-press range calibration (lowest key, then
> highest).
>
> Demo video: [LINK]
>
> TECHNICAL NOTE: the app hosts its UI from an embedded local web
> server bound to 127.0.0.1 (loopback only). It makes no external
> network connections and collects no user data.

## Demo video shot list (~60–90 s)

1. Cold launch → "tap the keys on screen" hint → tap through the
   first bars of C major, include one wrong tap to show feedback.
2. Plug in the USB MIDI keyboard → Connect MIDI → two-press
   calibration.
3. Play C major hands-together to completion → completion stats line.
4. Switch to Timed mode → metronome, early/on-time/late colours.
5. Cycle mode auto-advancing to the next key.

## Still needed (blocked on developer account)

- Privacy policy URL (required even with no data collection; a static
  one-pager is enough — can be drafted on request)
- Support URL
- iPad screenshots, 13" class (2048×2732 / 2064×2752), landscape
- Age rating questionnaire (expect 4+), category: Music (primary),
  Education (secondary)
- Record the demo video and fill in [LINK] above
