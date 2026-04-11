import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrCreateCurrentHousehold, getSessionUser, joinHouseholdByInviteCode } from "@/lib/households";

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = getSessionUser(session);

  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const household = await getOrCreateCurrentHousehold(user);
  return Response.json({ household });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const user = getSessionUser(session);

  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { inviteCode?: unknown } | null;
  const inviteCode = typeof body?.inviteCode === "string" ? body.inviteCode : "";

  try {
    const household = await joinHouseholdByInviteCode(user, inviteCode);
    return Response.json({ household });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to join household" },
      { status: 400 }
    );
  }
}
