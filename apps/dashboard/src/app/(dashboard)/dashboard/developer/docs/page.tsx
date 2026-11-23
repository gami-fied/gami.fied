import { redirect } from 'next/navigation';

// The API docs moved to the website, which Developer Hub links to. Old bookmarks land there.
export default function ApiDocsPage() {
  redirect('/dashboard/developer');
}
