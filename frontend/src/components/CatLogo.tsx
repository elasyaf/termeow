import React from "react";

interface CatLogoProps {
  size?: number;
}

export const CatLogo: React.FC<CatLogoProps> = ({ size = 28 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Termeow cat logo"
  >
    {/* Cat ears + head */}
    <path
      d="M12 24L16 8L28 18H36L48 8L52 24C55 29 56 35 54 42C51 51 42 56 32 56C22 56 13 51 10 42C8 35 9 29 12 24Z"
      fill="#1E293B"
      stroke="#38BDF8"
      strokeWidth="3"
      strokeLinejoin="round"
    />
    {/* Inner ears */}
    <path d="M17 14L23 19L16 22Z" fill="#F472B6" />
    <path d="M47 14L41 19L48 22Z" fill="#F472B6" />
    {/* Terminal prompt eyes: > _ */}
    <path
      d="M20 31L26 35L20 39"
      stroke="#38BDF8"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line
      x1="37"
      y1="39"
      x2="45"
      y2="39"
      stroke="#34D399"
      strokeWidth="3"
      strokeLinecap="round"
    />
    {/* Nose & mouth */}
    <path d="M30 43H34L32 46Z" fill="#F472B6" />
    <path
      d="M28 48C30 50 34 50 36 48"
      stroke="#94A3B8"
      strokeWidth="2"
      strokeLinecap="round"
    />
    {/* Whiskers */}
    <line x1="6" y1="36" x2="14" y2="38" stroke="#64748B" strokeWidth="2" strokeLinecap="round" />
    <line x1="6" y1="42" x2="14" y2="42" stroke="#64748B" strokeWidth="2" strokeLinecap="round" />
    <line x1="58" y1="36" x2="50" y2="38" stroke="#64748B" strokeWidth="2" strokeLinecap="round" />
    <line x1="58" y1="42" x2="50" y2="42" stroke="#64748B" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
