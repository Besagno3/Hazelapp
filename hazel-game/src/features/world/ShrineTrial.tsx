import { useCallback, useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import QuestionCard from '../../components/QuestionCard';
import { CharacterPortrait } from '../../components/CharacterPortrait';
import { NPC_DEFS, npcSpriteId } from '../../content/npcs';
import { topicInfo } from '../../content/topics';
import {
  TRIAL_BATCH,
  TRIAL_CORRECT,
  fieldSpellFlag,
  fieldSpellTaughtBy,
  knowsFieldSpell,
  type FieldSpell,
} from '../../content/fieldSpells';
import { fetchQuestions } from '../../lib/questions';
import { errorMessage } from '../../lib/errors';
import { playerAge, skillLevelFor } from '../../lib/age';
import { XP_PER_CORRECT } from '../../lib/level';
import { pushLibrary } from '../../lib/save';
import { sfx } from '../../lib/audio';
import { useProfileStore } from '../../store/profileStore';
import { useSaveStore } from '../../store/saveStore';
import type { Question } from '../../types';

/**
 * A shrine keeper's trial (#75 item 9): answer `TRIAL_CORRECT` questions on
 * the shrine's topic to learn its field spell. A wrong answer just brings
 * another question (effort is never punished) and goes to the Library like
 * any miss. The spell is learned the moment the last right answer lands, so
 * leaving straight after can't lose it.
 */
export default function ShrineTrial({ npcId }: { npcId: string | null }) {
  const flags = useSaveStore((s) => s.save?.flags);
  const spell = fieldSpellTaughtBy(npcId);
  const [started, setStarted] = useState(false);
  // Remember a pass made here, so the "you learned it" screen stays up.
  const [learnedHere, setLearnedHere] = useState(false);
  const npc = npcId ? NPC_DEFS[npcId] : undefined;
  if (!spell || !npc || !flags) return null;
  const known = knowsFieldSpell(spell.id, flags);

  const portrait = (
    <div className="flex justify-center mb-2">
      <CharacterPortrait spriteId={npcSpriteId(npc)} emoji={npc.sprite} scale={2} className="text-5xl" />
    </div>
  );

  // Mid-trial the run stays up even once the spell is learned, so the last
  // answer's explanation can be read before "Learn" is pressed.
  if (learnedHere || (known && !started)) {
    return (
      <div className="text-center">
        {portrait}
        <h2 className="text-xl font-extrabold mb-1">
          {learnedHere ? `You learned ${spell.emoji} ${spell.name}!` : `${spell.emoji} ${spell.name} is yours`}
        </h2>
        <p className="text-sm text-white/80 mb-2">{spell.description}</p>
        <p className="text-sm text-emerald-300">{spell.howTo}</p>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="text-center">
        {portrait}
        <h2 className="text-xl font-extrabold mb-1">
          {npc.name}'s trial — {spell.emoji} {spell.name}
        </h2>
        <p className="text-sm text-white/80 mb-1">{spell.description}</p>
        <p className="text-sm text-white/80 mb-5">
          Answer {TRIAL_CORRECT} questions about {topicInfo(spell.topic).label.toLowerCase()} to learn it. A wrong
          answer? Just try another — no rush!
        </p>
        <button
          onClick={() => setStarted(true)}
          className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-6 py-3"
        >
          🕯️ Begin the trial
        </button>
      </div>
    );
  }

  return <TrialRun spell={spell} onLearned={() => setLearnedHere(true)} />;
}

/** The questions themselves: a batch at a time, until enough are right. */
function TrialRun({ spell, onLearned }: { spell: FieldSpell; onLearned: () => void }) {
  const profile = useProfileStore((s) => s.profile);
  const addXp = useProfileStore((s) => s.addXp);
  const update = useSaveStore((s) => s.update);
  const setFlag = useSaveStore((s) => s.setFlag);
  const spendHint = useSaveStore((s) => s.spendHint);
  const hints = useSaveStore((s) => s.save?.items.hint ?? 0);

  const age = playerAge(profile);
  const level = skillLevelFor(profile?.skillLevels ?? {}, spell.topic, age);
  const flavor = `a riddle from a shrine keeper teaching the ${spell.name} spell in a fantasy world`;

  const [right, setRight] = useState(0);
  const [index, setIndex] = useState(0);
  const [batch, setBatch] = useState(0);
  const [answered, setAnswered] = useState<boolean | null>(null);

  // Loading derives from a request/fetched key mismatch (no setState-in-effect).
  const requestKey = `${spell.id}|${level}|${batch}`;
  const [fetched, setFetched] = useState<{ key: string; questions: Question[]; error: string | null }>({
    key: '',
    questions: [],
    error: null,
  });
  const loading = fetched.key !== requestKey;
  const question = loading ? null : (fetched.questions[index] ?? null);
  const error = loading ? null : fetched.error;

  useEffect(() => {
    let active = true;
    fetchQuestions(spell.topic, age, level, TRIAL_BATCH, flavor)
      .then((qs) => {
        if (!active) return;
        setFetched({ key: requestKey, questions: qs, error: qs.length === 0 ? 'No questions arrived — try again.' : null });
      })
      .catch((e) => active && setFetched({ key: requestKey, questions: [], error: errorMessage(e) }));
    return () => {
      active = false;
    };
  }, [requestKey, spell.topic, age, level, flavor]);

  const onAnswered = useCallback(
    (correct: boolean, picked: number) => {
      setAnswered(correct);
      if (!question) return;
      if (!correct) {
        update((s) => ({ ...s, library: pushLibrary(s.library, [{ question, picked }]) }));
        return;
      }
      void addXp(XP_PER_CORRECT);
      const now = right + 1;
      setRight(now);
      if (now >= TRIAL_CORRECT) {
        setFlag(fieldSpellFlag(spell.id));
        sfx('levelup');
        confetti({ particleCount: 140, spread: 90, origin: { y: 0.5 } });
      }
    },
    [addXp, question, right, setFlag, spell.id, update],
  );

  function next() {
    if (right >= TRIAL_CORRECT) {
      onLearned();
      return;
    }
    setAnswered(null);
    if (index + 1 < fetched.questions.length) {
      setIndex(index + 1);
    } else {
      setIndex(0);
      setBatch((b) => b + 1);
    }
  }

  const passed = right >= TRIAL_CORRECT;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-extrabold">
          {spell.emoji} The trial of {spell.name}
        </h2>
        <span className="text-lg tracking-wider" role="img" aria-label={`${right} of ${TRIAL_CORRECT} right`}>
          {Array.from({ length: TRIAL_CORRECT }, (_, i) => (
            <span key={i} className={i < right ? 'text-amber-300' : 'text-white/25'}>
              ✦
            </span>
          ))}
        </span>
      </div>

      {loading && <p className="text-white/90 bg-white/10 rounded-xl px-6 py-4 text-center">Thinking of a good one… 🤔</p>}

      {error && (
        <div className="bg-white/10 rounded-xl p-4 text-center">
          <p className="text-sm text-white/80 mb-3">{error}</p>
          <button
            onClick={() => setBatch((b) => b + 1)}
            className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-lg px-4 py-2 text-sm"
          >
            Try again
          </button>
        </div>
      )}

      {question && (
        <QuestionCard
          key={`${batch}:${index}`}
          question={question}
          hints={hints}
          onUseHint={spendHint}
          onAnswered={onAnswered}
          continueLabel={
            passed
              ? `✨ Learn ${spell.name}!`
              : answered
                ? `✦ ${right} of ${TRIAL_CORRECT} — next question`
                : 'Try another one'
          }
          onContinue={next}
        />
      )}
    </div>
  );
}
