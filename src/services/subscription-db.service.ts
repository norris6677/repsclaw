/**
 * Subscription Database Service
 * Re-exports Markdown-based implementation (previously SQLite)
 * All data is now stored as Markdown files in ~/.repsclaw/
 */

export {
  MarkdownSubscriptionDatabase,
  subscriptionDB,
  ISubscriptionDatabase,
  HospitalSubscriptionDB,
} from './subscription-db.markdown';
