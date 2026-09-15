import React from "react";

export default function BrandMark({className = ""}) {
  return <svg className={`brand-mark ${className}`} viewBox="0 0 120 150" role="img" aria-label="DataFlow logo">
    <defs>
      <linearGradient id="brand-pink-purple" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f6a0ff" />
        <stop offset="0.48" stopColor="#b327ff" />
        <stop offset="1" stopColor="#5520ff" />
      </linearGradient>
    </defs>
    <path fill="url(#brand-pink-purple)" d="M28 20h35c27 0 42 14 42 35 0 19-12 32-29 39 17 4 26 14 26 29 0 18-14 28-36 28H39c-6 0-10-4-10-10v-13h35c10 0 16-3 16-10 0-6-6-9-17-9H29c-6 0-10-4-10-10V84h37c12 0 19-4 19-12 0-8-7-12-19-12H29c-6 0-10-4-10-10V30c0-6 4-10 9-10Z" />
    <path fill="#16082f" d="M69 39c13 5 22 13 25 24-5 5-11 8-18 10-4-9-11-15-22-19l-5-2 20-13Z" opacity=".94" />
  </svg>;
}
