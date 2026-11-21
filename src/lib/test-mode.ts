/** Only for automated tests: pretend mailboxes and WhatsApp sends that never leave the machine. Never set in production. */
export const testMode = () => process.env.PORTAL_TEST_MODE === "1";
