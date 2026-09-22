<script lang="ts">
  // Story 2.2 -- CompletionCelebration: the bundled Completion Feedback
  // moment (FR7, UX-DR7) fired on every *successful* Mark Complete write --
  // never on Mark Incomplete, never on a failed write (`WorkoutDetail` only
  // ever mounts this after `setCompleted` both succeeds and actually flips
  // completion on). Single-shot: mounted once, plays its checkmark +
  // monochrome-confetti animation (or the static reduced-motion variant),
  // fires the haptic pulse and a short synthesized tone as mount side
  // effects, then calls `onSettled` once so the caller unmounts it -- this
  // component carries no dismiss control of its own (UX-DR7: "plays once,
  // settles automatically, no dismiss action").
  //
  // No external audio asset and no animation library (this story's Never
  // section / Design Notes) -- a few Web Audio API oscillator notes and a
  // hand-built CSS/SVG checkmark+particle burst, matching every prior
  // story's zero-new-runtime-dependency pattern.
  import { tick } from 'svelte';

  let { onSettled }: { onSettled: () => void } = $props();

  // Read once at mount -- this component is single-shot and short-lived, so
  // a mid-playback OS setting change isn't a case worth reacting to
  // reactively (mirrors this app's other one-time environment reads, e.g.
  // App.svelte's `todayIso`).
  const prefersReducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  // Confetti particles -- purely decorative. Generated once per mount so the
  // scatter is randomized but stable for this single playback (no re-roll
  // mid-animation). Monochrome by design (DESIGN.md Do's and Don'ts:
  // `{colors.accent-celebration}` is reserved for this animation and nothing
  // else) -- every particle shares the same color, only angle/distance/delay
  // vary.
  const PARTICLE_COUNT = 10;
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    angle: Math.round((360 / PARTICLE_COUNT) * i + (Math.random() * 20 - 10)),
    distance: Math.round(30 + Math.random() * 18),
    delay: Math.round(Math.random() * 90),
  }));

  // How long this component stays mounted before calling `onSettled` --
  // shorter under reduced motion since there's no confetti/checkmark-draw
  // animation to wait out, only the static checkmark's own brief hold.
  const SETTLE_MS = prefersReducedMotion ? 700 : 1400;

  // The aria-live announcement text -- deliberately starts empty and is
  // populated slightly after this component (and its always-present
  // aria-live span below) mounts, rather than being inserted already
  // populated in the same DOM commit as the celebration container. Some
  // assistive tech only announces a *change* inside an already-present live
  // region and can miss content that arrives together with the region
  // itself, so the span exists empty first and the text change is deferred
  // past that initial mount via `tick()`.
  let announcement = $state('');

  $effect(() => {
    // Haptic pulse -- feature-detected before use (this story's Boundaries):
    // most desktop browsers and iOS Safari have no Vibration API at all, and
    // calling an absent `navigator.vibrate` would throw.
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(40);
    }

    // Short synthesized tone (2 notes) via the Web Audio API -- no asset
    // file, works fully offline. Triggered synchronously inside this mount
    // effect, which itself only ever runs as a direct result of the Mark
    // Complete click handler mounting this component within the same user
    // gesture (this story's Boundaries), so no browser autoplay restriction
    // applies. Wrapped in try/catch: an unusual/older browser without
    // `AudioContext`, or one that blocks it for some other reason, must not
    // block the haptic pulse above or the settle timer below.
    // Captured here (rather than only local to the try block) so the
    // effect's cleanup below can reach them: an unmount that happens very
    // shortly after mount (e.g. a very quick dialog close) must be able to
    // stop the oscillators, close the context immediately, and cancel the
    // deferred `ctx.close()` timeout below so it can't also fire afterward.
    let audioCtx: AudioContext | null = null;
    let audioCloseTimer: ReturnType<typeof setTimeout> | null = null;
    const oscillators: OscillatorNode[] = [];

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        audioCtx = ctx;
        const notes = [660, 880];
        const noteDuration = 0.12;
        notes.forEach((frequency, index) => {
          const oscillator = ctx.createOscillator();
          oscillators.push(oscillator);
          const gain = ctx.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.value = frequency;
          const startTime = ctx.currentTime + index * noteDuration;
          // Quick attack/decay envelope rather than a hard on/off -- avoids
          // an audible click at each note's start/end.
          gain.gain.setValueAtTime(0.0001, startTime);
          gain.gain.exponentialRampToValueAtTime(0.2, startTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, startTime + noteDuration);
          oscillator.connect(gain);
          gain.connect(ctx.destination);
          oscillator.start(startTime);
          oscillator.stop(startTime + noteDuration);
        });
        // This component is single-shot -- close the context shortly after
        // the notes finish rather than leaving it open for the rest of the
        // page's life. If the component unmounts before this fires, the
        // cleanup below cancels this timer and closes the context itself.
        audioCloseTimer = setTimeout(
          () => {
            ctx.close().catch(() => {
              // Non-fatal -- the tone already played.
            });
          },
          (notes.length * noteDuration + 0.2) * 1000,
        );
      }
    } catch {
      // Non-fatal: the haptic pulse and visual celebration stand on their
      // own even if sound can't play here.
    }

    // Deferred past this mount (via `tick()`, a microtask) so the aria-live
    // span above has already existed, empty, for at least one DOM commit
    // before its text changes -- see the `announcement` declaration above.
    tick().then(() => {
      announcement = 'Workout marked complete';
    });

    const timer = setTimeout(onSettled, SETTLE_MS);
    return () => {
      clearTimeout(timer);
      if (audioCloseTimer !== null) {
        clearTimeout(audioCloseTimer);
      }
      if (audioCtx !== null) {
        for (const oscillator of oscillators) {
          try {
            oscillator.stop();
          } catch {
            // Already stopped/ended -- non-fatal.
          }
        }
        audioCtx.close().catch(() => {
          // Non-fatal -- unmounting anyway.
        });
      }
    };
  });
</script>

<!-- Decorative -- the aria-live text below is the only channel this
     component uses to reach a screen reader (UX-DR7's announcement
     requirement). -->
<div class="celebration" aria-hidden="true">
  <svg class="checkmark" class:static-variant={prefersReducedMotion} viewBox="0 0 52 52">
    <circle class="checkmark-circle" cx="26" cy="26" r="23" />
    <path class="checkmark-check" d="M15 27l7.5 7.5L37 18" />
  </svg>
  {#if !prefersReducedMotion}
    <div class="confetti">
      {#each particles as particle (particle.id)}
        <span
          class="particle"
          style={`--angle: ${particle.angle}deg; --distance: ${particle.distance}px; --delay: ${particle.delay}ms;`}
        ></span>
      {/each}
    </div>
  {/if}
</div>
<span class="visually-hidden" aria-live="polite">{announcement}</span>

<style>
  .celebration {
    position: fixed;
    top: 30%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 30; /* above WorkoutDetail's scrim (z-index: 20) */
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .checkmark {
    width: 4.5rem;
    height: 4.5rem;
    overflow: visible;
  }

  .checkmark-circle {
    fill: none;
    stroke: var(--accent-celebration);
    stroke-width: 3;
  }

  .checkmark-check {
    fill: none;
    stroke: var(--accent-celebration);
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* Animated (default) variant: the circle and check both draw themselves
     in via a stroke-dash reveal, the check following the circle. */
  .checkmark:not(.static-variant) .checkmark-circle {
    stroke-dasharray: 145;
    stroke-dashoffset: 145;
    animation: draw-circle 0.4s ease-out forwards;
  }

  .checkmark:not(.static-variant) .checkmark-check {
    stroke-dasharray: 32;
    stroke-dashoffset: 32;
    animation: draw-check 0.3s ease-out 0.35s forwards;
  }

  /* Static reduced-motion variant (UX-DR7 / this story's Boundaries): no
     morph, no confetti -- both shapes render at their fully-drawn end state
     immediately, with no animation at all. */
  .checkmark.static-variant .checkmark-circle,
  .checkmark.static-variant .checkmark-check {
    stroke-dasharray: none;
    stroke-dashoffset: 0;
  }

  @keyframes draw-circle {
    to {
      stroke-dashoffset: 0;
    }
  }

  @keyframes draw-check {
    to {
      stroke-dashoffset: 0;
    }
  }

  .confetti {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
  }

  .particle {
    position: absolute;
    top: 0;
    left: 0;
    width: 0.3125rem;
    height: 0.3125rem;
    margin: -0.15625rem;
    border-radius: var(--radius-xs);
    background: var(--accent-celebration);
    opacity: 0;
    transform: rotate(var(--angle)) translateY(0);
    animation: confetti-burst 0.7s ease-out var(--delay) forwards;
  }

  @keyframes confetti-burst {
    0% {
      opacity: 1;
      transform: rotate(var(--angle)) translateY(0) scale(1);
    }
    100% {
      opacity: 0;
      transform: rotate(var(--angle)) translateY(calc(-1 * var(--distance))) scale(0.6);
    }
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: none;
  }
</style>
