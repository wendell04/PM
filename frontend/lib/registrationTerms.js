// Built-in default Registration Terms - the clauses someone accepts when creating an account.
//
// These were literal JSX inside RegisterForm, which caused two problems: the owner could not change a
// word without a deploy, and nothing recorded WHICH wording a given customer had agreed to. Moving
// them here gives one shared source: the sign-up form falls back to this when the shop has saved
// nothing, and the Settings editor pre-loads it so the clauses are visible and editable instead of
// living invisibly in code.
//
// Kept deliberately separate from the CUSTOM ORDER terms. They are accepted at a different moment, by
// a different audience, and cover different ground - merging them would force every visitor to read
// production and refund clauses before they have bought anything.
export const DEFAULT_REGISTRATION_TERMS = [
  {
    title: 'Acceptance of Terms',
    body: 'By creating an account with Personalize Me Prints, you agree to comply with and be bound by these Terms and Conditions. If you do not agree with any part of these terms, please do not use our services.',
  },
  {
    title: 'Account Registration',
    body: 'You must provide accurate and complete information when registering for an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.',
  },
  {
    title: 'Product Quality',
    body: 'We strive to provide high-quality custom printing services. All products are subject to quality inspection before shipment. We are not responsible for damages caused by improper use or handling of printed products.',
  },
  {
    title: 'Intellectual Property',
    body: 'You warrant that any designs or content you upload for printing do not infringe upon any third-party rights. You grant us a non-exclusive license to use your designs solely for the purpose of fulfilling your order.',
  },
  {
    title: 'Payment and Pricing',
    body: 'All prices are subject to change without notice. Payment is required before production begins. We reserve the right to refuse any order for any reason.',
  },
  {
    title: 'Shipping and Delivery',
    body: 'Delivery times are estimates and not guaranteed. We are not responsible for delays caused by shipping carriers or customs processing.',
  },
  {
    title: 'Returns and Refunds',
    body: 'Due to the custom nature of our products, all sales are final. We will only accept returns or provide refunds for products that are damaged or significantly different from the approved proof. Full cancellation and refund rules for a specific order are set out in the Custom Order Terms you accept at checkout.',
  },
  {
    title: 'Limitation of Liability',
    body: 'Personalize Me Prints shall not be liable for any indirect, incidental, or consequential damages arising from the use of our products or services.',
  },
  // The clause the shop had nowhere: what happens to someone's data when they leave. Written now
  // because the code already behaves this way, and a policy that describes real behaviour is the
  // only kind worth having.
  {
    title: 'Deleting your account',
    body: 'You can delete your account yourself once you have no order in progress and no outstanding balance. Your personal details are removed. Your past orders are kept, because a completed sale is a financial record we are required by law to retain, and your name stays on those records as part of them. Your email address, phone number and saved addresses are deleted, so we can no longer contact you. This follows the Data Privacy Act of 2012 (RA 10173), which allows us to keep records another law requires us to keep.',
  },
  {
    title: 'Changes to Terms',
    body: 'We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting on our website. Your continued use of our services after any changes constitutes acceptance of the new terms. The version you accepted is recorded on your account and is not changed by any later edit.',
  },
];
