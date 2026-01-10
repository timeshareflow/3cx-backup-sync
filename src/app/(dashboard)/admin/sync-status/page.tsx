import { SyncStatusCard } from "@/components/admin/SyncStatusCard";
import { SyncLogTable } from "@/components/admin/SyncLogTable";
import { StatsOverview } from "@/components/admin/StatsOverview";

export const metadata = {
  title: "Sync Status - 3CX BackupWiz",
};

export default function SyncStatusPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sync Status</h1>
        <p className="text-gray-600">Monitor the sync service and view history</p>
      </div>

      <StatsOverview />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SyncStatusCard />
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Sync Configuration
          </h2>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-gray-500">Sync Interval</dt>
              <dd className="font-medium">60 seconds</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Batch Size</dt>
              <dd className="font-medium">100 messages</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Media Sync</dt>
              <dd className="font-medium text-green-600">Enabled</dd>
            </div>
          </dl>
        </div>
      </div>

      <SyncLogTable />
    </div>
  );
}
