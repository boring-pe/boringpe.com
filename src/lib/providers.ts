/** Which sign-in methods are switched on. A method appears only when its keys are set. */
export function providerFlags() {
  return {
    google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    linkedin: Boolean(process.env.AUTH_LINKEDIN_ID && process.env.AUTH_LINKEDIN_SECRET),
    email: Boolean(process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM),
  };
}
