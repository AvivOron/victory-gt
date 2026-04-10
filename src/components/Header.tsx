import type { Branch } from "@/lib/db";
import SignInButton from "@/components/SignInButton";
import SignOutButton from "@/components/SignOutButton";

interface Props {
  branch: Branch | null;
  lastUpdated: string | null;
  isAuthenticated: boolean;
}

export default function Header({ branch, lastUpdated, isAuthenticated }: Props) {
  const city = branch?.city || "גני תקווה";
  const address = branch?.address || "רחוב הכרמל 20, גני תקווה";

  const updatedStr = lastUpdated
    ? new Date(lastUpdated).toLocaleString("he-IL", {
        timeZone: "Asia/Jerusalem",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-[#e31837] text-xl font-black text-white shadow-sm">
            V
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight text-[#171717] sm:text-3xl">
              ויקטורי {city} מחירון ומבצעים
            </h1>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500">
              <span>{address}</span>
              {updatedStr && <span>עודכן: {updatedStr}</span>}
            </p>
          </div>
          <div className="hidden rounded-lg border border-gray-200 bg-[#f7f8fa] px-4 py-3 text-left text-xs text-gray-500 sm:block" dir="ltr">
            מאגר שקיפות המחירים
            <br />
            רשות ההגנה לצרכן
          </div>
          {isAuthenticated ? <SignOutButton /> : <SignInButton />}
        </div>
      </div>
    </header>
  );
}
