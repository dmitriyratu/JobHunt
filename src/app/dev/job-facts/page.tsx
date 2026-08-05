import { notFound } from "next/navigation";
import JobFactsDemo from "./JobFactsDemo";

/**
 * Shut in production for the same reason the showcase route is: it is a
 * developer surface holding invented postings, and nobody visiting the app has
 * any use for it.
 */
export default function JobFactsDemoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <JobFactsDemo />;
}
