export interface Auth0IdentityClient {
  getUserById(userId: string): Promise<{
    email?: string;
    name?: string;
  } | null>;
}

export interface VirtFusionUserIdentity {
  email: string;
  name: string;
}

function getDefaultName(email: string): string {
  return email.split("@")[0] || "user";
}

export async function resolveVirtFusionUserIdentity(
  auth0UserId: string,
  auth0Client: Auth0IdentityClient,
): Promise<VirtFusionUserIdentity> {
  const auth0User = await auth0Client.getUserById(auth0UserId);

  if (!auth0User?.email) {
    throw new Error("Unable to resolve a valid email address for this Auth0 user");
  }

  return {
    email: auth0User.email,
    name: auth0User.name?.trim() || getDefaultName(auth0User.email),
  };
}
