import { Metadata } from "next";
import { AnalyticsDashboard } from "./AnalyticsDashboard";

export const metadata: Metadata = {
  title: "Analytics - 3CX BackupWiz",
  description: "Call analytics and statistics",
};

export default function AnalyticsPage() {
  return <AnalyticsDashboard />;
}
