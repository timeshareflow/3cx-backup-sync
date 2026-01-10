import { Suspense } from "react";
import { ConversationList } from "@/components/chat/ConversationList";
import { LoadingScreen } from "@/components/ui/Spinner";
import { MessageSquare } from "lucide-react";

export const metadata = {
  title: "Conversations - 3CX BackupWiz",
};

export default function ConversationsPage() {
  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl shadow-lg shadow-teal-500/25">
          <MessageSquare className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Conversations</h1>
          <p className="text-slate-500 mt-1">Browse archived chat conversations</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200">
        <Suspense fallback={<LoadingScreen message="Loading conversations..." />}>
          <ConversationList />
        </Suspense>
      </div>
    </div>
  );
}
