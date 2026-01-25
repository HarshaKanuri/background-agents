"use client";

interface Participant {
  userId: string;
  name: string;
  avatar?: string;
  status: "active" | "idle" | "away";
}

interface ParticipantsSectionProps {
  participants: Participant[];
}

export function ParticipantsSection({ participants }: ParticipantsSectionProps) {
  if (participants.length === 0) return null;

  const count = participants.length;
  const label = count === 1 ? "prompt engineer" : "prompt engineers";

  return (
    <div className="flex items-center gap-2">
      {/* Avatar stack */}
      <div className="flex -space-x-2">
        {participants.slice(0, 4).map((participant) => (
          <div key={participant.userId} className="relative" title={participant.name}>
            {participant.avatar ? (
              <img
                src={participant.avatar}
                alt={participant.name}
                className="w-6 h-6 rounded-full border-2 border-white dark:border-gray-900 object-cover"
              />
            ) : (
              <div className="w-6 h-6 rounded-full border-2 border-white dark:border-gray-900 bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs font-medium text-gray-700 dark:text-gray-200">
                {participant.name.charAt(0).toUpperCase()}
              </div>
            )}
            {/* Status indicator */}
            {participant.status === "active" && (
              <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full border border-white dark:border-gray-900" />
            )}
          </div>
        ))}
      </div>
      {/* Count label */}
      <span className="text-sm text-gray-600 dark:text-gray-400">
        {count} {label}
      </span>
    </div>
  );
}
