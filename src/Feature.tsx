import { useEffect, useMemo, useState } from "react";
import {
  createClockSync,
  useEventLog,
  useNamedPeer,
  useRotatingTurn,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };

type Line = {
  id: string;
  peerId: string;
  text: string;
  ts: number;
  slotId: number;
};

const MAX_CHARS = 120;
const SLOT_MS = 30_000;

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="story-screen">
        <h1>storyworm</h1>
        <p className="story-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const { name, setName, nameOf } = useNamedPeer(config, room);
  const log = useEventLog<Line>(room, "story");
  const clock = useMemo(() => createClockSync(room.provider), [room]);
  useEffect(() => () => clock.destroy(), [clock]);
  const turn = useRotatingTurn(room, clock, { slotMs: SLOT_MS, order: "shuffle" });
  const [draft, setDraft] = useState("");

  const alreadyWrote = log.events.some((l) => l.peerId === room.peerId && l.slotId === turn.slotId);
  const authorName = turn.currentPeerId
    ? (nameOf(turn.currentPeerId) ?? `peer-${turn.currentPeerId.slice(0, 6)}`)
    : "…";
  const sLeft = Math.ceil(turn.msToNextTurn / 1000);
  const trimmed = draft.trim();
  const canSend = turn.isMyTurn && trimmed.length > 0 && !alreadyWrote && name.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    const line: Line = {
      id: Math.random().toString(36).slice(2, 12),
      peerId: room.peerId,
      text: trimmed.slice(0, MAX_CHARS),
      ts: Date.now(),
      slotId: turn.slotId,
    };
    log.push(line);
    setDraft("");
  };

  return (
    <div className="story-screen">
      <header className="story-header">
        <h1>storyworm</h1>
        <p className="story-status">
          one shared sentence every 30s · {turn.order.length || 1}{" "}
          {turn.order.length === 1 ? "writer" : "writers"} · {log.size} lines
        </p>
      </header>

      <input
        className="story-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="your name"
        maxLength={48}
        aria-label="your name"
      />

      <div className={`story-author-banner${turn.isMyTurn ? " is-me" : ""}`} aria-live="polite">
        {turn.isMyTurn
          ? `your turn — write a sentence (${sLeft}s)`
          : `${authorName} is writing… ${sLeft}s`}
      </div>

      <div className="story-progress" aria-hidden="true">
        <div className="story-progress-fill" style={{ opacity: 0.4 + turn.progress * 0.6 }} />
      </div>

      <div className="story-compose">
        <input
          className="story-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSend) submit();
          }}
          placeholder={turn.isMyTurn ? "add one sentence…" : "wait for your turn"}
          maxLength={MAX_CHARS}
          disabled={!turn.isMyTurn}
          aria-label="your sentence"
        />
        <button
          type="button"
          className="story-submit"
          onClick={submit}
          disabled={!canSend}
          aria-label="send line"
        >
          send
        </button>
      </div>

      <p className="story-text">
        {log.events.map((l) => (
          <span key={l.id} className="story-line" data-line-id={l.id}>
            {l.text}{" "}
          </span>
        ))}
      </p>

      <footer className="story-footer">
        {log.size} lines · {room.peerCount + 1} peer{room.peerCount === 0 ? "" : "s"}
      </footer>
    </div>
  );
}
