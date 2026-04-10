"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => void signOut({ callbackUrl: "/victory-gt/prices" })}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-sm font-bold text-gray-700 transition-colors hover:border-[#e31837] hover:text-[#e31837] sm:h-10 sm:w-10"
      aria-label="התנתקות"
      title="התנתקות"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M14 7L19 12L14 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M19 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M11 5H6C4.89543 5 4 5.89543 4 7V17C4 18.1046 4.89543 19 6 19H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}
