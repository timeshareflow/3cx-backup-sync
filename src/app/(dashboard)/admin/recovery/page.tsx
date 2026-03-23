import { RecoveryImportCard } from "@/components/admin/RecoveryImportCard";

export const metadata = {
  title: "Message Recovery - 3CX BackupWiz",
};

export default function RecoveryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Message Recovery</h1>
        <p className="text-slate-600">
          Import chat messages recovered from employee browser caches
        </p>
      </div>
      <RecoveryImportCard />
    </div>
  );
}
