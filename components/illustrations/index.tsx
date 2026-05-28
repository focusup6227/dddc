// Hand-drawn-feeling inline SVG illustrations. All use currentColor so they
// inherit the surrounding text color — apply via a `text-*` class on a parent.

import type { SVGProps } from "react";

const baseProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function PawIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps} {...props}>
      <ellipse cx="6.5" cy="11" rx="1.8" ry="2.3" fill="currentColor" stroke="none" />
      <ellipse cx="17.5" cy="11" rx="1.8" ry="2.3" fill="currentColor" stroke="none" />
      <ellipse cx="9" cy="6" rx="1.5" ry="2" fill="currentColor" stroke="none" />
      <ellipse cx="15" cy="6" rx="1.5" ry="2" fill="currentColor" stroke="none" />
      <path
        d="M12 13c-3 0-5 2-5 4.5 0 1.4 1 2.5 2.5 2.5h5C16 20 17 18.9 17 17.5 17 15 15 13 12 13z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

// Sleeping dog curled up — for "no bookings" / quiet day states.
export function SleepingDog(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 160 110" {...baseProps} {...props}>
      {/* Floor shadow */}
      <ellipse cx="80" cy="100" rx="55" ry="4" fill="currentColor" opacity="0.08" stroke="none" />
      {/* Body curled */}
      <path d="M40 78 C 30 50, 60 30, 90 35 C 120 40, 135 70, 120 88 C 105 100, 60 100, 40 88 Z" fill="currentColor" opacity="0.1" />
      <path d="M40 78 C 30 50, 60 30, 90 35 C 120 40, 135 70, 120 88 C 105 100, 60 100, 40 88 Z" />
      {/* Head tucked */}
      <path d="M44 78 C 38 62, 48 52, 62 56 C 72 59, 76 70, 70 80" />
      {/* Ear flopped */}
      <path d="M52 56 C 48 50, 50 44, 56 44 C 62 44, 62 52, 58 56" />
      {/* Eye closed */}
      <path d="M55 70 C 57 72, 60 72, 62 70" />
      {/* Nose */}
      <circle cx="48" cy="74" r="1.2" fill="currentColor" stroke="none" />
      {/* Tail */}
      <path d="M120 80 C 130 78, 132 70, 126 66" />
      {/* Zzz */}
      <path d="M95 30 L 102 30 L 95 38 L 102 38" />
      <path d="M108 22 L 113 22 L 108 28 L 113 28" />
    </svg>
  );
}

// Empty dog house — for "no dogs yet"
export function DogHouse(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 160 130" {...baseProps} {...props}>
      <ellipse cx="80" cy="120" rx="60" ry="4" fill="currentColor" opacity="0.08" stroke="none" />
      {/* House */}
      <path d="M40 70 L 80 35 L 120 70 L 120 115 L 40 115 Z" fill="currentColor" opacity="0.08" />
      <path d="M40 70 L 80 35 L 120 70 L 120 115 L 40 115 Z" />
      {/* Doorway */}
      <path d="M65 115 L 65 85 C 65 75, 95 75, 95 85 L 95 115" />
      {/* Roof line */}
      <path d="M30 75 L 80 32 L 130 75" />
      {/* Name plate */}
      <rect x="68" y="55" width="24" height="10" rx="2" />
      <path d="M73 60 L 87 60" />
    </svg>
  );
}

// Tennis ball — playful spot illustration
export function TennisBall(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" {...baseProps} {...props}>
      <circle cx="32" cy="32" r="22" fill="#fde68a" opacity="0.5" stroke="currentColor" />
      <path d="M14 28 C 24 24, 40 24, 50 28" stroke="currentColor" />
      <path d="M14 38 C 24 42, 40 42, 50 38" stroke="currentColor" />
    </svg>
  );
}

// Calendar with leash — for "no upcoming bookings"
export function EmptyCalendar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 160 130" {...baseProps} {...props}>
      <ellipse cx="80" cy="120" rx="55" ry="4" fill="currentColor" opacity="0.08" stroke="none" />
      <rect x="35" y="30" width="90" height="80" rx="8" fill="currentColor" opacity="0.06" />
      <rect x="35" y="30" width="90" height="80" rx="8" />
      <path d="M35 50 L 125 50" />
      <path d="M55 22 L 55 38" />
      <path d="M105 22 L 105 38" />
      {/* Sparse dots */}
      <circle cx="58" cy="68" r="2" fill="currentColor" stroke="none" />
      <circle cx="80" cy="78" r="2" fill="currentColor" stroke="none" />
      <circle cx="100" cy="68" r="2" fill="currentColor" stroke="none" />
      <circle cx="70" cy="92" r="2" fill="currentColor" stroke="none" />
      {/* Floating paw */}
      <g transform="translate(115 80) rotate(20)">
        <ellipse cx="0" cy="4" rx="2.2" ry="2.8" fill="currentColor" stroke="none" />
        <ellipse cx="-4" cy="-1" rx="1.4" ry="1.8" fill="currentColor" stroke="none" />
        <ellipse cx="4" cy="-1" rx="1.4" ry="1.8" fill="currentColor" stroke="none" />
        <ellipse cx="-5" cy="5" rx="1.4" ry="1.8" fill="currentColor" stroke="none" />
        <ellipse cx="5" cy="5" rx="1.4" ry="1.8" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

// Shield with paw — for "no incidents" / safety
export function ShieldPaw(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 120 130" {...baseProps} {...props}>
      <path d="M60 10 L 105 25 L 105 70 C 105 95, 85 115, 60 122 C 35 115, 15 95, 15 70 L 15 25 Z" fill="currentColor" opacity="0.08" />
      <path d="M60 10 L 105 25 L 105 70 C 105 95, 85 115, 60 122 C 35 115, 15 95, 15 70 L 15 25 Z" />
      <g transform="translate(60 65)">
        <ellipse cx="-10" cy="0" rx="3.5" ry="4.5" fill="currentColor" stroke="none" />
        <ellipse cx="10" cy="0" rx="3.5" ry="4.5" fill="currentColor" stroke="none" />
        <ellipse cx="-5" cy="-10" rx="2.8" ry="3.5" fill="currentColor" stroke="none" />
        <ellipse cx="5" cy="-10" rx="2.8" ry="3.5" fill="currentColor" stroke="none" />
        <path d="M0 4 C -6 4, -10 8, -10 13 C -10 17, -7 20, -3 20 L 3 20 C 7 20, 10 17, 10 13 C 10 8, 6 4, 0 4 Z" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

// Heart with paw — referrals empty state
export function HeartPaw(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 140 120" {...baseProps} {...props}>
      <path
        d="M70 100 C 30 75, 15 55, 25 35 C 33 20, 55 20, 70 38 C 85 20, 107 20, 115 35 C 125 55, 110 75, 70 100 Z"
        fill="currentColor"
        opacity="0.1"
      />
      <path d="M70 100 C 30 75, 15 55, 25 35 C 33 20, 55 20, 70 38 C 85 20, 107 20, 115 35 C 125 55, 110 75, 70 100 Z" />
      <g transform="translate(70 58)">
        <ellipse cx="-8" cy="0" rx="3" ry="4" fill="currentColor" stroke="none" />
        <ellipse cx="8" cy="0" rx="3" ry="4" fill="currentColor" stroke="none" />
        <ellipse cx="-4" cy="-8" rx="2.4" ry="3" fill="currentColor" stroke="none" />
        <ellipse cx="4" cy="-8" rx="2.4" ry="3" fill="currentColor" stroke="none" />
        <path d="M0 4 C -5 4, -8 7, -8 11 C -8 14, -6 16, -3 16 L 3 16 C 6 16, 8 14, 8 11 C 8 7, 5 4, 0 4 Z" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

// Mascot — friendly puppy face for headers/landing
export function MascotFace(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 120 110" {...baseProps} {...props}>
      {/* Ears */}
      <path
        d="M28 30 C 22 18, 30 8, 42 14 L 38 36 Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M92 30 C 98 18, 90 8, 78 14 L 82 36 Z"
        fill="currentColor"
        stroke="none"
      />
      {/* Head */}
      <circle cx="60" cy="55" r="35" fill="white" stroke="currentColor" />
      {/* Spots */}
      <ellipse cx="46" cy="42" rx="8" ry="7" fill="currentColor" opacity="0.18" stroke="none" />
      {/* Eyes */}
      <circle cx="48" cy="52" r="2.5" fill="#1a1815" stroke="none" />
      <circle cx="72" cy="52" r="2.5" fill="#1a1815" stroke="none" />
      <circle cx="48.5" cy="51" r="0.8" fill="white" stroke="none" />
      <circle cx="72.5" cy="51" r="0.8" fill="white" stroke="none" />
      {/* Nose */}
      <path d="M55 62 L 65 62 L 60 68 Z" fill="#1a1815" stroke="none" />
      {/* Mouth */}
      <path d="M60 68 L 60 73" stroke="#1a1815" strokeWidth="1.4" />
      <path d="M60 73 C 56 75, 52 74, 50 71" stroke="#1a1815" strokeWidth="1.4" />
      <path d="M60 73 C 64 75, 68 74, 70 71" stroke="#1a1815" strokeWidth="1.4" />
      {/* Tongue */}
      <path d="M58 74 C 58 78, 62 78, 62 74" fill="#fb7185" stroke="none" />
    </svg>
  );
}
