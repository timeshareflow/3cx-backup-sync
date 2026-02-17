import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { MessageList } from "@/components/chat/MessageList";
import { Navigation } from "@/components/layout/Navigation";
import { LoadingScreen } from "@/components/ui/Spinner";
import { Download, Users, Calendar, MessageSquare } from "lucide-react";
import { formatFullDate } from "@/lib/utils/date";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ highlight?: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("conversation_name, participants(external_name)")
    .eq("id", id)
    .single();

  const title = conversation?.conversation_name ||
    conversation?.participants?.map((p: { external_name: string | null }) => p.external_name).join(", ") ||
    "Conversation";

  return {
    title: `${title} - 3CX BackupWiz`,
  };
}

export default async function ConversationPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { highlight: highlightMessageId } = await searchParams;
  const supabase = createAdminClient();

  const { data: conversation, error } = await supabase
    .from("conversations")
    .select(`
      *,
      participants (*)
    `)
    .eq("id", id)
    .single();

  if (error || !conversation) {
    notFound();
  }

  const participantNames = conversation.participants
    .map((p: { external_name: string | null; external_id: string | null }) =>
      p.external_name || p.external_id || "Unknown"
    )
    .join(", ");

  const title = conversation.conversation_name || participantNames || "Conversation";

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <Navigation
        breadcrumbs={[
          { label: "Conversations", href: "/conversations" },
          { label: title },
        ]}
      />

      {/* Conversation Header */}
      <div className="bg-white rounded-lg shadow mb-4 p-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{title}</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {conversation.participant_count} participants
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="h-4 w-4" />
                {conversation.message_count.toLocaleString()} messages
              </span>
              {conversation.first_message_at && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {formatFullDate(conversation.first_message_at)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`/api/export?conversation_id=${id}&format=json`}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              Export
            </a>
          </div>
        </div>

        {/* Participants */}
        <div className="mt-4 flex flex-wrap gap-2">
          {conversation.participants.map((p: {
            id: string;
            external_name: string | null;
            external_id: string | null;
            participant_type: string;
          }) => (
            <span
              key={p.id}
              className="inline-flex items-center px-2 py-1 rounded-full text-sm bg-gray-100 text-gray-700"
            >
              {p.external_name || p.external_id}
              {p.external_id && p.external_name && (
                <span className="text-gray-400 ml-1">({p.external_id})</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-lg shadow overflow-hidden">
        <Suspense fallback={<LoadingScreen message="Loading messages..." />}>
          <MessageList conversationId={id} loadAll={true} highlightMessageId={highlightMessageId} />
        </Suspense>
      </div>
    </div>
  );
}
