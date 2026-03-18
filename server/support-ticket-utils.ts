export function resolveEffectiveVirtFusionUserId(
  sessionVirtFusionUserId: number | null | undefined,
  walletVirtFusionUserId: number | null | undefined,
): number | null {
  if (typeof sessionVirtFusionUserId === "number" && Number.isInteger(sessionVirtFusionUserId) && sessionVirtFusionUserId > 0) {
    return sessionVirtFusionUserId;
  }

  if (typeof walletVirtFusionUserId === "number" && Number.isInteger(walletVirtFusionUserId) && walletVirtFusionUserId > 0) {
    return walletVirtFusionUserId;
  }

  return null;
}

export function validatePublicContactSubmission(input: {
  name?: unknown;
  email?: unknown;
  category?: unknown;
  title?: unknown;
  message?: unknown;
}):
  | {
      ok: true;
      value: {
        category: "sales" | "abuse";
        cleanEmail: string;
        cleanTitle: string;
        cleanMessage: string;
        resolvedName: string | null;
      };
    }
  | {
      ok: false;
      error: string;
    } {
  const category = input.category;
  if (category !== "sales" && category !== "abuse") {
    return { ok: false, error: "Invalid category. Only sales and abuse enquiries accepted here." };
  }

  const cleanEmail = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
    return { ok: false, error: "A valid email address is required." };
  }

  const cleanTitle = typeof input.title === "string" ? input.title.trim() : "";
  if (cleanTitle.length < 2) {
    return { ok: false, error: "Subject must be at least 2 characters." };
  }
  if (cleanTitle.length > 200) {
    return { ok: false, error: "Subject must be 200 characters or less." };
  }

  const cleanMessage = typeof input.message === "string" ? input.message.trim() : "";
  if (cleanMessage.length < 20) {
    return { ok: false, error: "Message must be at least 20 characters." };
  }
  if (cleanMessage.length > 5000) {
    return { ok: false, error: "Message must be 5000 characters or less." };
  }

  const resolvedName = input.name ? String(input.name).trim().slice(0, 100) || null : null;

  return {
    ok: true,
    value: {
      category,
      cleanEmail,
      cleanTitle,
      cleanMessage,
      resolvedName,
    },
  };
}
