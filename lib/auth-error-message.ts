export function authErrorDescription(
  error: string | undefined,
  options: { vendastaConfigured: boolean }
): string {
  if (error === "AccessDenied") {
    return "This Vendasta identity is not authorized for vPeople.";
  }
  if (error === "Configuration") {
    if (!options.vendastaConfigured) {
      return "Vendasta SSO is not configured in this environment.";
    }
    return "Sign-in configuration error, contact an admin";
  }
  return "There was a problem signing you in. Please try again.";
}
