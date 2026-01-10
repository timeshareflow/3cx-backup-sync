import { Suspense } from "react";
import { SearchPageContent } from "./SearchPageContent";
import { LoadingScreen } from "@/components/ui/Spinner";

export const metadata = {
  title: "Search - 3CX BackupWiz",
};

export default function SearchPage() {
  return (
    <Suspense fallback={<LoadingScreen message="Loading search..." />}>
      <SearchPageContent />
    </Suspense>
  );
}
