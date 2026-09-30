// Publishable client configuration. Authorization is enforced by database RLS.
// Never put a secret/service-role key in this file or in EXPO_PUBLIC variables.
export const publicService = {
  // Enable these only after custom SMTP and public confirmation/recovery delivery are verified.
  publicEmailRegistration: false,
  publicEmailDelivery: false,
  url: "https://mzjmhvwixptrmnaalijt.supabase.co",
  publishableKey: "sb_publishable_2VdI5dJfra_mpBySCEODgw_rix4Y2fM",
};
